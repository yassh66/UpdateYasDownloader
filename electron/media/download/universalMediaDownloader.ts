import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { binManager } from '../bin/binManager';
import { ffmpegManager, FFmpegProgress } from '../postprocessor/ffmpegManager';
import { formatSelector, StandardQuality, TargetContainer } from '../format/formatSelector';
import { MediaInfo, MediaFormatOption, SupportedPlatform, MediaDownloadStage } from '../types';
export type { MediaDownloadStage };
import { sessionManager } from '../session/sessionManager';
import { detectMediaPlatform } from '../urlDetector';
import { extractionStrategyManager, RecoveryStrategy } from '../strategy/extractionStrategyManager';
import { MediaDiagnosticsLogger } from '../diagnostics/mediaDiagnosticsLogger';
import { getSavedCookiesSettings, validateCookiesFile } from '../session/cookieValidator';

/**
 * Safely and forcefully kills a child process and its sub-processes on Windows and POSIX.
 */
function terminateProcessTree(child: ChildProcess | null | undefined): void {
  if (!child || child.killed || !child.pid) return;
  const pid = child.pid;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {}
    }
  } else {
    try {
      child.kill('SIGKILL');
    } catch {}
  }
}

export interface MediaDownloadProgressEvent {
  jobId: string;
  url: string;
  stage: MediaDownloadStage;
  percent: number;
  speed?: string;
  eta?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  outputPath?: string;
  error?: string;
}

export interface UniversalDownloadOptions {
  jobId: string;
  url: string;
  title?: string;
  cleanFileName?: string;
  quality?: StandardQuality;
  container?: TargetContainer;
  saveFolder: string;
  mediaInfo?: MediaInfo;
  platform?: SupportedPlatform;
  cookiesPath?: string;
  browserCookies?: string;
  customUserAgent?: string;
  proxyUrl?: string;
  userDataDir?: string;
  onProgress?: (event: MediaDownloadProgressEvent) => void;
  abortSignal?: AbortSignal;
  tempFilesTracker?: Set<string>;
}

export class UniversalMediaDownloader {
  /**
   * Universal method to download any media stream (YouTube, TikTok, IG, Twitter, Vimeo, etc.)
   * Executes real download streams only (never --simulate or metadata-only), integrates
   * an automatic recovery ladder for anti-bot / 403 restrictions, and verifies
   * Zero Fake Completion with ffprobe and container inspection.
   */
  public async download(options: UniversalDownloadOptions): Promise<string> {
    const {
      jobId,
      url,
      saveFolder,
      quality = '1080p',
      container = quality === 'audio_only' ? 'mp3' : 'mp4',
      abortSignal,
      onProgress,
    } = options;

    let cleanTitle = options.cleanFileName || options.title?.replace(/[\\/:*?"<>|]/g, '_').trim() || `Media_${jobId}`;
    let selectedVideo: MediaFormatOption | undefined;
    let selectedAudio: MediaFormatOption | undefined;
    let isDashMerge = false;

    // Detect platform if not explicitly passed
    const detectedPlatform = options.platform || options.mediaInfo?.platform || detectMediaPlatform(url).platform;

    // Active child process reference for cancellation
    let activeProcess: ChildProcess | null = null;

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        if (activeProcess && !activeProcess.killed) {
          try {
            MediaDiagnosticsLogger.log('DOWNLOAD', 'info', `Abort signal triggered for job ${jobId}. Terminating process tree.`);
            terminateProcessTree(activeProcess);
          } catch (e) {
            console.warn(`[UniversalMediaDownloader] Error terminating active process tree:`, e);
          }
        }
      });
    }

    const reportProgress = (
      stage: MediaDownloadStage,
      percent: number,
      speed?: string,
      eta?: string,
      outputPath?: string,
      error?: string
    ) => {
      if (onProgress) {
        onProgress({
          jobId,
          url,
          stage,
          percent: Math.min(100, Math.max(0, percent)),
          speed,
          eta,
          outputPath,
          error,
        });
      }
    };

    const localTempFiles = options.tempFilesTracker || new Set<string>();

    const safeUnlink = (filePath: string) => {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        if (fs.existsSync(`${filePath}.part`)) fs.unlinkSync(`${filePath}.part`);
        if (fs.existsSync(`${filePath}.ytdl`)) fs.unlinkSync(`${filePath}.ytdl`);
      } catch (err) {
        console.warn(`[UniversalMediaDownloader] Could not delete temp file ${filePath}:`, err);
      }
      localTempFiles.delete(filePath);
    };

    const cleanupAllLocalTemps = () => {
      for (const f of Array.from(localTempFiles)) {
        safeUnlink(f);
      }
    };

    /**
     * Resolves physical file path if yt-dlp saved file with an alternate stream extension.
     */
    const resolveActualFilePath = (preferredPath: string, prefixMatch?: string): string => {
      if (fs.existsSync(preferredPath)) {
        return preferredPath;
      }
      if (prefixMatch && fs.existsSync(saveFolder)) {
        try {
          const files = fs.readdirSync(saveFolder);
          const matched = files.find((f) => f.startsWith(prefixMatch) && !f.endsWith('.part') && !f.endsWith('.ytdl'));
          if (matched) {
            const actualPath = path.join(saveFolder, matched);
            return actualPath;
          }
        } catch (e) {
          console.warn(`[UniversalMediaDownloader] Error scanning saveFolder for actual file:`, e);
        }
      }
      return preferredPath;
    };

    try {
      // Step 1: Format Resolution
      reportProgress('extracting', 0);
      if (options.mediaInfo) {
        const selection = formatSelector.selectBestQuality(options.mediaInfo, quality, container);
        selectedVideo = selection.videoTrack;
        selectedAudio = selection.audioTrack;
        isDashMerge = selection.isDashMergeRequired;
        cleanTitle = options.cleanFileName || selection.cleanFileName || cleanTitle;
      }

      const isInstagram =
        detectedPlatform === 'instagram' ||
        url.includes('instagram.com') ||
        url.includes('instagr.am');

      // For Instagram, force direct progressive MP4 download
      if (isInstagram && quality !== 'audio_only' && container !== 'mp3') {
        isDashMerge = false;
      }

      MediaDiagnosticsLogger.log('DOWNLOAD', 'info', `Starting download pipeline`, {
        jobId,
        platform: detectedPlatform,
        quality,
        container,
        isDashMerge,
      });

      // ==========================================
      // MODE A: Audio-Only Extraction (MP3)
      // ==========================================
      if (quality === 'audio_only' || container === 'mp3') {
        const finalAudioPath = path.join(saveFolder, `${cleanTitle}.mp3`);
        const tempAudioBase = `${cleanTitle}.${jobId}.temp_audio`;
        const tempAudioPath = path.join(saveFolder, `${tempAudioBase}.m4a`);
        localTempFiles.add(tempAudioPath);

        reportProgress('downloading_audio', 0);

        const formatArg = this.buildResilientAudioFormatSelector(
          selectedAudio,
          options.mediaInfo?.availableFormats
        );
        MediaDiagnosticsLogger.log('DOWNLOAD', 'info', `[Mode A: Audio-Only] Format selector: ${formatArg}`);

        await this.runYtDlpDownloadWithLadder(
          url,
          formatArg,
          tempAudioPath,
          options,
          detectedPlatform,
          (pct, spd, eta) => {
            reportProgress('downloading_audio', pct, spd, eta);
          },
          abortSignal,
          (proc) => {
            activeProcess = proc;
          },
          'Audio-Only Stream'
        );

        if (abortSignal?.aborted) throw new Error('Download cancelled by user.');

        const actualTempAudio = resolveActualFilePath(tempAudioPath, tempAudioBase);
        localTempFiles.add(actualTempAudio);

        reportProgress('converting_audio', 90);

        // Convert downloaded audio stream to high-quality MP3 (320k)
        await ffmpegManager.extractAudio(actualTempAudio, finalAudioPath, {
          format: 'mp3',
          audioBitrate: '320k',
          onProgress: (p: FFmpegProgress) =>
            reportProgress('converting_audio', 90 + ((p.progressPercent || 0) * 0.08)),
          abortSignal,
        });

        // Cleanup temporary audio stream
        safeUnlink(actualTempAudio);
        safeUnlink(tempAudioPath);

        // ZERO FAKE COMPLETION: Deep verification
        reportProgress('verifying', 99);
        const verification = await ffmpegManager.verifyMediaFile(finalAudioPath, 'audio');
        if (!verification.isValid) {
          safeUnlink(finalAudioPath);
          throw new Error(verification.error || 'Audio verification failed: output file is invalid or empty.');
        }

        reportProgress('completed', 100, undefined, undefined, finalAudioPath);
        return finalAudioPath;
      }

      // ==========================================
      // MODE B: Separate DASH/HLS Streams + FFmpeg Merge
      // ==========================================
      if (isDashMerge && selectedVideo && selectedAudio) {
        const finalVideoPath = path.join(saveFolder, `${cleanTitle}.${container}`);
        const tempVideoBase = `${cleanTitle}.${jobId}.temp_video`;
        const tempAudioBase = `${cleanTitle}.${jobId}.temp_audio`;
        const tempVideoPath = path.join(saveFolder, `${tempVideoBase}.${selectedVideo?.ext || 'mp4'}`);
        const tempAudioPath = path.join(saveFolder, `${tempAudioBase}.${selectedAudio?.ext || 'm4a'}`);

        localTempFiles.add(tempVideoPath);
        localTempFiles.add(tempAudioPath);

        const targetHeight =
          selectedVideo.height ||
          (quality === '2160p' ? 2160 : quality === '1440p' ? 1440 : quality === '1080p' ? 1080 : quality === '720p' ? 720 : quality === '480p' ? 480 : 360);

        const videoFormatSelector = this.buildResilientVideoFormatSelector(
          selectedVideo,
          targetHeight,
          container,
          options.mediaInfo?.availableFormats
        );

        // Sub-step B1: Download Video Stream with recovery ladder
        reportProgress('downloading_video', 0);
        MediaDiagnosticsLogger.log('DOWNLOAD', 'info', `[Step B1: Video Stream] Format selector: ${videoFormatSelector}`);

        await this.runYtDlpDownloadWithLadder(
          url,
          videoFormatSelector,
          tempVideoPath,
          options,
          detectedPlatform,
          (pct, spd, eta) => {
            const weightedPct = pct * 0.6;
            reportProgress('downloading_video', weightedPct, spd, eta);
          },
          abortSignal,
          (proc) => {
            activeProcess = proc;
          },
          'Video Stream (Step B1)'
        );

        if (abortSignal?.aborted) throw new Error('Download cancelled by user.');

        const actualTempVideo = resolveActualFilePath(tempVideoPath, tempVideoBase);
        localTempFiles.add(actualTempVideo);

        const audioFormatSelector = this.buildResilientAudioFormatSelector(
          selectedAudio,
          options.mediaInfo?.availableFormats
        );

        // Sub-step B2: Download Audio Stream with recovery ladder
        reportProgress('downloading_audio', 60);
        MediaDiagnosticsLogger.log('DOWNLOAD', 'info', `[Step B2: Audio Stream] Format selector: ${audioFormatSelector}`);

        await this.runYtDlpDownloadWithLadder(
          url,
          audioFormatSelector,
          tempAudioPath,
          options,
          detectedPlatform,
          (pct, spd, eta) => {
            const weightedPct = 60 + pct * 0.25;
            reportProgress('downloading_audio', weightedPct, spd, eta);
          },
          abortSignal,
          (proc) => {
            activeProcess = proc;
          },
          'Audio Stream (Step B2)'
        );

        if (abortSignal?.aborted) throw new Error('Download cancelled by user.');

        const actualTempAudio = resolveActualFilePath(tempAudioPath, tempAudioBase);
        localTempFiles.add(actualTempAudio);

        // Sub-step B3: FFmpeg Lossless Stream Copy & Merge
        reportProgress('merging_streams', 85);
        MediaDiagnosticsLogger.log('FFMPEG', 'info', `Merging streams: "${actualTempVideo}" + "${actualTempAudio}" -> "${finalVideoPath}"`);

        await ffmpegManager.mergeVideoAudio(actualTempVideo, actualTempAudio, finalVideoPath, {
          format: container as any,
          audioCodec: selectedAudio?.acodec || selectedAudio?.ext,
          onProgress: (p: FFmpegProgress) => {
            const mergePct = 85 + (p.progressPercent || 0) * 0.12;
            reportProgress('merging_streams', mergePct);
          },
          abortSignal,
        });

        // Cleanup temporary stream files
        safeUnlink(actualTempVideo);
        safeUnlink(actualTempAudio);
        safeUnlink(tempVideoPath);
        safeUnlink(tempAudioPath);

        // ZERO FAKE COMPLETION: Deep verification
        reportProgress('verifying', 98);
        const verification = await ffmpegManager.verifyMediaFile(finalVideoPath, 'video');
        if (!verification.isValid) {
          safeUnlink(finalVideoPath);
          throw new Error(verification.error || 'Video verification failed: output file is invalid or empty.');
        }

        reportProgress('completed', 100, undefined, undefined, finalVideoPath);
        return finalVideoPath;
      }

      // ==========================================
      // MODE C: Unified Progressive Stream Direct Download
      // ==========================================
      const finalSinglePath = path.join(saveFolder, `${cleanTitle}.${container}`);
      reportProgress('downloading_stream', 0);

      const targetHeight =
        selectedVideo?.height ||
        (quality === '2160p' ? 2160 : quality === '1440p' ? 1440 : quality === '1080p' ? 1080 : quality === '720p' ? 720 : quality === '480p' ? 480 : 360);

      const formatArg = isInstagram
        ? 'best[ext=mp4]/best'
        : this.buildResilientProgressiveFormatSelector(
            selectedVideo,
            targetHeight,
            container,
            options.mediaInfo?.availableFormats
          );

      MediaDiagnosticsLogger.log('DOWNLOAD', 'info', `[Mode C: Progressive] Format selector: ${formatArg}`);

      await this.runYtDlpDownloadWithLadder(
        url,
        formatArg,
        finalSinglePath,
        options,
        detectedPlatform,
        (pct, spd, eta) => {
          reportProgress('downloading_stream', pct * 0.95, spd, eta);
        },
        abortSignal,
        (proc) => {
          activeProcess = proc;
        },
        'Progressive Stream (Mode C)'
      );

      if (abortSignal?.aborted) throw new Error('Download cancelled by user.');

      // ZERO FAKE COMPLETION: Deep verification
      reportProgress('verifying', 98);
      const verification = await ffmpegManager.verifyMediaFile(finalSinglePath, 'video');
      if (!verification.isValid) {
        safeUnlink(finalSinglePath);
        throw new Error(verification.error || 'Media verification failed: output file is invalid or empty.');
      }

      reportProgress('completed', 100, undefined, undefined, finalSinglePath);
      return finalSinglePath;
    } catch (err: any) {
      if (!abortSignal?.aborted) {
        cleanupAllLocalTemps();
      }
      MediaDiagnosticsLogger.log('DOWNLOAD', 'error', `Job ${jobId} failed: ${err.message}`);
      reportProgress('error', 0, undefined, undefined, undefined, err.message || 'Download failed.');
      throw err;
    }
  }

  /**
   * Constructs a highly resilient yt-dlp format selector string for video stream.
   * Format selectors comply strictly with standard yt-dlp syntax and robust fallbacks:
   * e.g. 720p: bestvideo[height<=720]+bestaudio/best[height<=720]/bestvideo+bestaudio/best
   * e.g. 1080p: bestvideo[height<=1080]+bestaudio/best[height<=1080]/bestvideo+bestaudio/best
   * e.g. 4K: bestvideo[height<=2160]+bestaudio/best
   */
  public buildResilientVideoFormatSelector(
    selectedVideo?: MediaFormatOption,
    targetHeight: number = 1080,
    preferredExt: string = 'mp4',
    allFormats?: MediaFormatOption[]
  ): string {
    const formatCandidates: string[] = [];

    // 1. If a valid, non-premium extracted format ID exists, place it first
    if (selectedVideo && !selectedVideo.isPremium && !selectedVideo.hasDrm && selectedVideo.formatId) {
      formatCandidates.push(selectedVideo.formatId);
    }

    // 2. Add other matched format IDs from extracted format list
    if (allFormats && allFormats.length > 0) {
      const sameHeight = allFormats.filter(
        (f) => f.hasVideo && !f.isPremium && !f.hasDrm && (f.height === targetHeight || (f.height && Math.abs(f.height - targetHeight) <= 24))
      );
      for (const fmt of sameHeight) {
        if (!formatCandidates.includes(fmt.formatId)) {
          formatCandidates.push(fmt.formatId);
        }
      }
    }

    // 3. Known standard YouTube video format IDs
    const standardFallbacks: string[] = [];
    if (targetHeight >= 2160) {
      standardFallbacks.push('313', '315', '401', '571');
    } else if (targetHeight >= 1440) {
      standardFallbacks.push('271', '308', '400');
    } else if (targetHeight >= 1080) {
      standardFallbacks.push('137', '299', '248', '303', '399', '699');
    } else if (targetHeight >= 720) {
      standardFallbacks.push('136', '298', '247', '302', '398', '22');
    } else if (targetHeight >= 480) {
      standardFallbacks.push('135', '244', '397');
    } else if (targetHeight >= 360) {
      standardFallbacks.push('134', '243', '396', '18');
    }

    for (const sf of standardFallbacks) {
      if (!formatCandidates.includes(sf)) {
        formatCandidates.push(sf);
      }
    }

    // 4. Standard resilient yt-dlp selector expressions
    const ext = preferredExt === 'webm' ? 'webm' : preferredExt === 'mkv' ? 'mkv' : 'mp4';
    const genericFallbacks = [
      `bestvideo[height<=${targetHeight}][ext=${ext}]`,
      `bestvideo[height<=${targetHeight}]`,
      `bestvideo[height<=${targetHeight}]+bestaudio/best[height<=${targetHeight}]/bestvideo+bestaudio/best`,
      'bestvideo',
      'best',
    ];

    for (const gf of genericFallbacks) {
      if (!formatCandidates.includes(gf)) {
        formatCandidates.push(gf);
      }
    }

    return formatCandidates.join('/');
  }

  /**
   * Constructs a highly resilient yt-dlp format selector string for audio stream.
   */
  public buildResilientAudioFormatSelector(
    selectedAudio?: MediaFormatOption,
    allFormats?: MediaFormatOption[]
  ): string {
    const formatCandidates: string[] = [];

    if (selectedAudio && !selectedAudio.isPremium && !selectedAudio.hasDrm && selectedAudio.formatId) {
      formatCandidates.push(selectedAudio.formatId);
    }

    if (allFormats && allFormats.length > 0) {
      const audioOnly = allFormats.filter((f) => f.hasAudio && !f.hasVideo && !f.isPremium && !f.hasDrm);
      for (const fmt of audioOnly) {
        if (!formatCandidates.includes(fmt.formatId)) {
          formatCandidates.push(fmt.formatId);
        }
      }
    }

    // Standard audio format IDs: 140 (m4a 128k), 251 (opus 160k), 250 (opus 70k), 249 (opus 50k), 139 (m4a 48k)
    const standardAudioFallbacks = ['140', '251', '250', '249', '139'];
    for (const af of standardAudioFallbacks) {
      if (!formatCandidates.includes(af)) {
        formatCandidates.push(af);
      }
    }

    const genericAudio = [
      'bestaudio[ext=m4a]',
      'bestaudio[ext=webm]',
      'bestaudio/best',
      'bestaudio',
      'best',
    ];
    for (const ga of genericAudio) {
      if (!formatCandidates.includes(ga)) {
        formatCandidates.push(ga);
      }
    }

    return formatCandidates.join('/');
  }

  /**
   * Constructs a resilient progressive format selector string for single-pass downloads.
   */
  public buildResilientProgressiveFormatSelector(
    selectedVideo?: MediaFormatOption,
    targetHeight: number = 1080,
    preferredExt: string = 'mp4',
    allFormats?: MediaFormatOption[]
  ): string {
    const formatCandidates: string[] = [];

    if (selectedVideo && !selectedVideo.isPremium && selectedVideo.formatId) {
      formatCandidates.push(selectedVideo.formatId);
    }

    const ext = preferredExt === 'webm' ? 'webm' : preferredExt === 'mkv' ? 'mkv' : 'mp4';
    formatCandidates.push(
      `bestvideo[height<=${targetHeight}][ext=${ext}]+bestaudio[ext=m4a]/best[height<=${targetHeight}][ext=${ext}]`,
      `bestvideo[height<=${targetHeight}]+bestaudio/best[height<=${targetHeight}]/bestvideo+bestaudio/best`,
      `best[height<=${targetHeight}]`,
      'bestvideo+bestaudio/best',
      'best'
    );

    return formatCandidates.join('/');
  }

  /**
   * Constructs execution arguments for yt-dlp download, integrating strategy configurations.
   */
  public buildDownloadArgs(
    url: string,
    formatId: string,
    outputPath: string,
    options?: Partial<UniversalDownloadOptions>,
    platform?: SupportedPlatform,
    strategy?: RecoveryStrategy
  ): string[] {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--newline',
      '--socket-timeout', '30',
      '--retries', '10',
      '--fragment-retries', '10',
      '--skip-unavailable-fragments',
      '--extractor-retries', '5',
      '--file-access-retries', '5',
    ];

    const isYouTube = platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be');

    if (isYouTube) {
      args.push('--remote-components', 'ejs:github');
      const jsRuntime = binManager.getJsRuntime();
      if (jsRuntime.path) {
        args.push('--js-runtimes', `${jsRuntime.runtime}:${jsRuntime.path}`);
      } else {
        args.push('--js-runtimes', jsRuntime.runtime);
      }
      const playerClient = strategy?.playerClient || 'web,web_embedded';
      args.push('--extractor-args', `youtube:player_client=${playerClient}`);
    }

    // Inject FFmpeg location so yt-dlp can perform muxing / stream processing if needed
    const ffmpegPath = binManager.getFfmpegPath();
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      const ffmpegDir = path.dirname(ffmpegPath);
      args.push('--ffmpeg-location', ffmpegDir);
    }

    // Custom headers
    if (strategy?.customHeaders) {
      for (const [headerKey, headerVal] of Object.entries(strategy.customHeaders)) {
        args.push('--add-header', `${headerKey}:${headerVal}`);
      }
    }

    // User-Agent
    const userAgent = strategy?.userAgent || options?.customUserAgent;
    if (userAgent) {
      args.push('--user-agent', userAgent);
    }

    // Cookies resolution according to priority order:
    // Priority 1: User-configured cookies file
    // Rule: cookiesPath MUST ONLY be applied when enableCookiesAuth === true AND file exists AND validation succeeds
    const savedCookies = getSavedCookiesSettings(options?.userDataDir);
    let effectiveCookies: string | undefined;

    if (strategy?.cookiesPath) {
      const val = validateCookiesFile(strategy.cookiesPath);
      if (val.valid) {
        effectiveCookies = strategy.cookiesPath;
      }
    } else if (options?.cookiesPath) {
      const val = validateCookiesFile(options.cookiesPath);
      if (val.valid) {
        effectiveCookies = options.cookiesPath;
      }
    } else if (savedCookies.enabled && savedCookies.cookiesPath) {
      effectiveCookies = savedCookies.cookiesPath;
    }

    if (effectiveCookies) {
      const resolvedCookies = path.isAbsolute(effectiveCookies)
        ? effectiveCookies
        : path.resolve(effectiveCookies);
      args.push('--cookies', resolvedCookies);
    } else if (strategy?.browserCookie) {
      // Priority 3: Optional explicit user-selected browser session ONLY
      args.push('--cookies-from-browser', strategy.browserCookie);
    } else if (options?.browserCookies) {
      args.push('--cookies-from-browser', options.browserCookies);
    }
    // Never automatically inject --cookies-from-browser!

    // Proxy support
    if (options?.proxyUrl) {
      args.push('--proxy', options.proxyUrl);
    }

    // Format & Output target
    args.push('-f', formatId);
    args.push('-o', outputPath);

    // Target URL
    args.push(url);

    return args;
  }

  /**
   * Executes a yt-dlp stream download with the Automatic Strategy Recovery Ladder.
   * If a download stream encounters a bot check, 403, or client error, it moves
   * progressively through recovery tiers (client rotation, browser cookies, custom cookies)
   * to ensure maximum reliability.
   */
  private async runYtDlpDownloadWithLadder(
    url: string,
    formatId: string,
    outputPath: string,
    options?: Partial<UniversalDownloadOptions>,
    platform?: SupportedPlatform,
    onProgressUpdate?: (percent: number, speed?: string, eta?: string) => void,
    abortSignal?: AbortSignal,
    onProcessSpawned?: (proc: ChildProcess) => void,
    stageLabel: string = 'stream'
  ): Promise<void> {
    const strategies = extractionStrategyManager.getStrategyLadder(platform || 'generic_media', url, options as any);
    let lastError: any = null;

    for (let i = 0; i < strategies.length; i++) {
      const strat = strategies[i];
      const isLast = i === strategies.length - 1;

      MediaDiagnosticsLogger.logStrategyAttempt(strat.tier, strat.name, `Download ${stageLabel}`);

      // Support failure injection testing hook
      const injected = extractionStrategyManager.checkFailureInjection(strat, i);
      if (injected && injected.shouldFail) {
        const simErr: any = new Error(injected.simulatedError || 'Simulated download challenge failure');
        simErr.stderr = 'HTTP Error 403: Forbidden';
        lastError = simErr;
        MediaDiagnosticsLogger.logStrategyFailure(strat.tier, strat.name, simErr.message, !isLast);
        continue;
      }

      try {
        await this.runSingleYtDlpAttempt(
          url,
          formatId,
          outputPath,
          options,
          platform,
          strat,
          onProgressUpdate,
          abortSignal,
          onProcessSpawned,
          stageLabel
        );
        MediaDiagnosticsLogger.logStrategySuccess(strat.tier, strat.name, 0);
        return;
      } catch (err: any) {
        lastError = err;
        const errMsg = err.message || '';
        const stderr = err.stderr || '';

        if (abortSignal?.aborted || errMsg.includes('cancelled')) {
          throw err;
        }

        const classification = extractionStrategyManager.classifyFailure(errMsg, stderr);
        MediaDiagnosticsLogger.logStrategyFailure(strat.tier, strat.name, errMsg, !isLast && classification.isRetryable);

        if (!isLast && classification.isRetryable) {
          // Clean partial stream before retrying next strategy
          if (fs.existsSync(outputPath)) {
            try { fs.unlinkSync(outputPath); } catch {}
          }
          if (fs.existsSync(`${outputPath}.part`)) {
            try { fs.unlinkSync(`${outputPath}.part`); } catch {}
          }
          continue;
        }
        throw err;
      }
    }

    const isYt = platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be');
    const finalClassification = extractionStrategyManager.classifyFailure(lastError?.message || '', lastError?.stderr, isYt);
    let finalErrMsg = lastError?.message || `Download failed for ${stageLabel}.`;

    if (isYt && (
      finalClassification.category === 'BOT_CHALLENGE' ||
      finalClassification.category === 'AUTH_REQUIRED' ||
      finalClassification.requiresAuth ||
      String(lastError?.message || '').toLowerCase().includes('sign in') ||
      String(lastError?.stderr || '').toLowerCase().includes('sign in') ||
      String(lastError?.message || '').toLowerCase().includes('403') ||
      String(lastError?.stderr || '').toLowerCase().includes('403')
    )) {
      finalErrMsg = 'YouTube requires authentication. Add a cookies.txt file in Settings > YouTube Authentication.';
    }

    const finalErr: any = new Error(finalErrMsg);
    finalErr.rawError = lastError;
    throw finalErr;
  }

  /**
   * Executes a single yt-dlp child process execution.
   */
  private runSingleYtDlpAttempt(
    url: string,
    formatId: string,
    outputPath: string,
    options?: Partial<UniversalDownloadOptions>,
    platform?: SupportedPlatform,
    strategy?: RecoveryStrategy,
    onProgressUpdate?: (percent: number, speed?: string, eta?: string) => void,
    abortSignal?: AbortSignal,
    onProcessSpawned?: (proc: ChildProcess) => void,
    stageLabel: string = 'stream'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const ytDlpPath = binManager.getYtdlpPath();
      const args = this.buildDownloadArgs(url, formatId, outputPath, options, platform, strategy);

      const spawnTime = Date.now();
      let firstByteReported = false;

      const child = spawn(ytDlpPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      MediaDiagnosticsLogger.logCommand(ytDlpPath, args, child.pid);

      if (onProcessSpawned) onProcessSpawned(child);

      let stdoutData = '';
      let stderrData = '';
      let isSettled = false;

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => {
          if (!isSettled) {
            isSettled = true;
            terminateProcessTree(child);
            reject(new Error('Download process cancelled by user.'));
          }
        });
      }

      child.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        stdoutData += text;

        if (!firstByteReported) {
          firstByteReported = true;
          MediaDiagnosticsLogger.log('DOWNLOAD', 'info', `First progress byte received for ${stageLabel} in ${Date.now() - spawnTime}ms`);
        }

        // Parse real-time progress metrics from yt-dlp stdout
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('[download]')) {
            const match = trimmed.match(
              /\[download\]\s+(\d+\.?\d*)%\s+of\s+~?([0-9.]+\w+)\s+at\s+([0-9.]+\w+\/s)\s+ETA\s+(\d+:\d+)/
            );
            if (match && onProgressUpdate) {
              const percent = parseFloat(match[1]);
              const speed = match[3];
              const eta = match[4];
              onProgressUpdate(percent, speed, eta);
            } else {
              const simpleMatch = trimmed.match(/\[download\]\s+(\d+\.?\d*)%/);
              if (simpleMatch && onProgressUpdate) {
                const percent = parseFloat(simpleMatch[1]);
                onProgressUpdate(percent);
              }
            }
          }
        }
      });

      child.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        stderrData += text;
      });

      child.on('error', (err: any) => {
        if (!isSettled) {
          isSettled = true;
          if (err.code === 'ENOENT') {
            reject(new Error(`yt-dlp binary was not found at "${ytDlpPath}". Ensure yt-dlp is installed.`));
          } else {
            reject(new Error(`Failed to spawn yt-dlp process: ${err.message}`));
          }
        }
      });

      child.on('close', (code) => {
        if (!isSettled) {
          isSettled = true;
          if (abortSignal?.aborted) {
            return reject(new Error('Download cancelled by user.'));
          }
          if (code === 0) {
            const totalDuration = Date.now() - spawnTime;
            MediaDiagnosticsLogger.log('DOWNLOAD', 'info', `Download completed for ${stageLabel} in ${totalDuration}ms (exit code 0)`);
            resolve();
          } else {
            const errorLines = stderrData
              .split('\n')
              .map((l) => l.trim())
              .filter((l) => l.startsWith('ERROR:') || l.includes('Error:'));
            const errorMsg = errorLines[0] || stderrData.trim().split('\n').pop() || `yt-dlp exited with code ${code}`;

            const error: any = new Error(errorMsg);
            error.exitCode = code;
            error.stderr = stderrData;
            error.stdout = stdoutData;
            reject(error);
          }
        }
      });
    });
  }
}

export const universalMediaDownloader = new UniversalMediaDownloader();
