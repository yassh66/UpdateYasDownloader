import { spawn, execSync, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import { binManager } from '../bin/binManager';
import { ffmpegManager, FFmpegProgress } from '../postprocessor/ffmpegManager';
import { formatSelector, StandardQuality, TargetContainer } from '../format/formatSelector';
import { MediaInfo, MediaFormatOption, SupportedPlatform } from '../types';
import { sessionManager } from '../session/sessionManager';
import { detectMediaPlatform } from '../urlDetector';

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

export type MediaDownloadStage =
  | 'extracting'
  | 'downloading_video'
  | 'downloading_audio'
  | 'downloading_stream'
  | 'merging_streams'
  | 'converting_audio'
  | 'completed'
  | 'error'
  | 'cancelled';

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
  onProgress?: (event: MediaDownloadProgressEvent) => void;
  abortSignal?: AbortSignal;
  tempFilesTracker?: Set<string>;
}

export class UniversalMediaDownloader {
  /**
   * Universal method to download any media stream (YouTube, TikTok, IG, Twitter, Vimeo, etc.)
   * Automatically determines whether to:
   *  1. Extract and transcode Audio-Only (MP3)
   *  2. Download separated DASH/HLS streams and losslessly merge with FFmpeg
   *  3. Download unified progressive stream directly in a single pass
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
            console.log(`[UniversalMediaDownloader] Abort signal triggered for job ${jobId}. Forcefully killing active process tree.`);
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
            console.log(`[UniversalMediaDownloader] Resolved alternate temp stream location: ${actualPath}`);
            return actualPath;
          }
        } catch (e) {
          console.warn(`[UniversalMediaDownloader] Error scanning saveFolder for actual file:`, e);
        }
      }
      return preferredPath;
    };

    try {
      // Step 1: Format Resolution if not already provided
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

      // For Instagram, force direct progressive MP4 download (no DASH separate streams or FFmpeg merge)
      if (isInstagram && quality !== 'audio_only' && container !== 'mp3') {
        isDashMerge = false;
      }

      console.log(`[UniversalMediaDownloader] Starting download for job: ${jobId}`);
      console.log(`[UniversalMediaDownloader] Target Quality: ${quality}, Container: ${container}, DASH Merge: ${isDashMerge}`);

      // ==========================================
      // MODE A: Audio-Only Extraction (MP3)
      // ==========================================
      if (quality === 'audio_only' || container === 'mp3') {
        const finalAudioPath = path.join(saveFolder, `${cleanTitle}.mp3`);
        // Job-scoped temp audio filename
        const tempAudioBase = `${cleanTitle}.${jobId}.temp_audio`;
        const tempAudioPath = path.join(saveFolder, `${tempAudioBase}.m4a`);
        localTempFiles.add(tempAudioPath);

        reportProgress('downloading_audio', 0);

        const formatArg = this.buildResilientAudioFormatSelector(
          selectedAudio,
          options.mediaInfo?.availableFormats
        );
        console.log(`[UniversalMediaDownloader] [Mode A] Downloading Audio format selector: ${formatArg}`);

        await this.runYtDlpDownload(
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
          'Audio-Only (Mode A)'
        );

        if (abortSignal?.aborted) throw new Error('Download cancelled by user.');

        const actualTempAudio = resolveActualFilePath(tempAudioPath, tempAudioBase);
        localTempFiles.add(actualTempAudio);

        reportProgress('converting_audio', 95);

        // Convert downloaded audio stream to high-quality MP3 (320k)
        await ffmpegManager.extractAudio(actualTempAudio, finalAudioPath, {
          format: 'mp3',
          audioBitrate: '320k',
          onProgress: (p: FFmpegProgress) =>
            reportProgress('converting_audio', 95 + ((p.progressPercent || 0) * 0.05)),
          abortSignal,
        });

        // Cleanup job-scoped temporary audio file
        safeUnlink(actualTempAudio);
        safeUnlink(tempAudioPath);

        reportProgress('completed', 100, undefined, undefined, finalAudioPath);
        return finalAudioPath;
      }

      // ==========================================
      // MODE B: Separate DASH/HLS Streams + FFmpeg Merge
      // ==========================================
      if (isDashMerge && selectedVideo && selectedAudio) {
        const finalVideoPath = path.join(saveFolder, `${cleanTitle}.${container}`);
        
        // Job-scoped temp stream filenames
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

        // Sub-step B1: Download Video Stream with fallback chain
        reportProgress('downloading_video', 0);
        console.log(`[UniversalMediaDownloader] [Step B1] Downloading Video format selector: ${videoFormatSelector}`);
        
        await this.runYtDlpDownload(
          url,
          videoFormatSelector,
          tempVideoPath,
          options,
          detectedPlatform,
          (pct, spd, eta) => {
            // Weight: Video download is 0% -> 60% of total
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

        // Sub-step B2: Download Audio Stream with fallback chain
        reportProgress('downloading_audio', 60);
        console.log(`[UniversalMediaDownloader] [Step B2] Downloading Audio format selector: ${audioFormatSelector}`);

        await this.runYtDlpDownload(
          url,
          audioFormatSelector,
          tempAudioPath,
          options,
          detectedPlatform,
          (pct, spd, eta) => {
            // Weight: Audio download is 60% -> 85% of total
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
        console.log(`[UniversalMediaDownloader] [Step B3] Merging streams: "${actualTempVideo}" + "${actualTempAudio}" -> "${finalVideoPath}"`);

        await ffmpegManager.mergeVideoAudio(actualTempVideo, actualTempAudio, finalVideoPath, {
          format: container as any,
          audioCodec: selectedAudio?.acodec || selectedAudio?.ext,
          onProgress: (p: FFmpegProgress) => {
            const mergePct = 85 + (p.progressPercent || 0) * 0.15;
            reportProgress('merging_streams', mergePct);
          },
          abortSignal,
        });

        // Cleanup job-scoped temporary stream files
        safeUnlink(actualTempVideo);
        safeUnlink(actualTempAudio);
        safeUnlink(tempVideoPath);
        safeUnlink(tempAudioPath);

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

      console.log(`[UniversalMediaDownloader] [Mode C] Downloading stream format: ${formatArg} -> "${finalSinglePath}"`);

      await this.runYtDlpDownload(
        url,
        formatArg,
        finalSinglePath,
        options,
        detectedPlatform,
        (pct, spd, eta) => {
          reportProgress('downloading_stream', pct, spd, eta);
        },
        abortSignal,
        (proc) => {
          activeProcess = proc;
        },
        'Progressive Stream (Mode C)'
      );

      if (abortSignal?.aborted) throw new Error('Download cancelled by user.');

      reportProgress('completed', 100, undefined, undefined, finalSinglePath);
      return finalSinglePath;
    } catch (err: any) {
      if (!abortSignal?.aborted) {
        cleanupAllLocalTemps();
      }
      console.error(`[UniversalMediaDownloader] Job ${jobId} failed:`, err);
      reportProgress('error', 0, undefined, undefined, undefined, err.message || 'Download failed.');
      throw err;
    }
  }

  /**
   * Constructs a highly resilient yt-dlp format selector string for video stream.
   * Evaluates the selected format first, then all valid formats for the same target resolution,
   * followed by yt-dlp standard selector fallbacks.
   */
  public buildResilientVideoFormatSelector(
    selectedVideo?: MediaFormatOption,
    targetHeight: number = 1080,
    preferredExt: string = 'mp4',
    allFormats?: MediaFormatOption[]
  ): string {
    const formatCandidates: string[] = [];

    // 1. If a specific format was selected and is NOT a premium/broken format, put it first
    if (selectedVideo && !selectedVideo.isPremium && selectedVideo.formatId) {
      formatCandidates.push(selectedVideo.formatId);
    }

    // 2. Add other non-premium video formats matching the target height from extracted formats
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

    // 3. Known standard YouTube / platform format fallbacks for common resolutions (deduplicated)
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

    // 4. Add generic yt-dlp format expressions as ultimate safety net
    const ext = preferredExt === 'webm' ? 'webm' : preferredExt === 'mkv' ? 'mkv' : 'mp4';
    const genericFallbacks = [
      `bestvideo[height=${targetHeight}][ext=${ext}]`,
      `bestvideo[height=${targetHeight}]`,
      `bestvideo[height<=${targetHeight}][height>=${Math.max(360, targetHeight - 200)}][ext=${ext}]`,
      `bestvideo[height<=${targetHeight}][height>=${Math.max(360, targetHeight - 200)}]`,
      `bestvideo[height<=${targetHeight}]`,
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

    if (selectedAudio && !selectedAudio.isPremium && selectedAudio.formatId) {
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

    // Standard YouTube audio format IDs (140 = M4A 128k, 251 = Opus 160k, 250 = Opus 70k, 139 = M4A 48k)
    const standardAudioFallbacks = ['140', '251', '250', '249', '139'];
    for (const af of standardAudioFallbacks) {
      if (!formatCandidates.includes(af)) {
        formatCandidates.push(af);
      }
    }

    // Generic yt-dlp fallbacks
    const genericAudio = [
      'bestaudio[ext=m4a]',
      'bestaudio[ext=webm]',
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
      `bestvideo[height<=${targetHeight}][ext=${ext}]+bestaudio[ext=m4a]`,
      `bestvideo[height<=${targetHeight}]+bestaudio`,
      `best[height<=${targetHeight}][ext=${ext}]`,
      `best[height<=${targetHeight}]`,
      'bestvideo+bestaudio',
      'best'
    );

    return formatCandidates.join('/');
  }

  /**
   * Constructs complete execution arguments for yt-dlp download, ensuring session cookies,
   * proxy, ffmpeg-location, and timeouts are in sync with extraction.
   */
  public buildDownloadArgs(
    url: string,
    formatId: string,
    outputPath: string,
    options?: Partial<UniversalDownloadOptions>,
    platform?: SupportedPlatform
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

    if (platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      args.push('--remote-components', 'ejs:github');
      const jsRuntime = binManager.getJsRuntime();
      if (jsRuntime.path) {
        args.push('--js-runtimes', `${jsRuntime.runtime}:${jsRuntime.path}`);
      } else {
        args.push('--js-runtimes', jsRuntime.runtime);
      }
      args.push('--extractor-args', 'youtube:player_client=web,web_embedded');
    }

    // Inject FFmpeg location if available so yt-dlp can perform muxing/post-processing if needed
    const ffmpegPath = binManager.getFfmpegPath();
    if (ffmpegPath && fs.existsSync(ffmpegPath)) {
      const ffmpegDir = path.dirname(ffmpegPath);
      args.push('--ffmpeg-location', ffmpegDir);
    }

    // Session & Cookies Resolution (matching baseExtractor.ts)
    if (options?.cookiesPath) {
      const resolvedCookies = path.isAbsolute(options.cookiesPath)
        ? options.cookiesPath
        : path.resolve(options.cookiesPath);
      args.push('--cookies', resolvedCookies);
    } else if (options?.browserCookies) {
      args.push('--cookies-from-browser', options.browserCookies);
    } else {
      const sessionArg = sessionManager.getYtDlpCookiesFromBrowserArg(platform);
      if (sessionArg) {
        args.push('--cookies-from-browser', sessionArg);
      }
    }

    // Proxy support
    if (options?.proxyUrl) {
      args.push('--proxy', options.proxyUrl);
    }

    // Custom User-Agent
    if (options?.customUserAgent) {
      args.push('--user-agent', options.customUserAgent);
    }

    // Format & Output target
    args.push('-f', formatId);
    args.push('-o', outputPath);

    // Target URL
    args.push(url);

    return args;
  }

  /**
   * Parses stderr/stdout text to extract human-readable error explanations
   */
  private extractMeaningfulError(stderr: string, stdout: string, exitCode: number): string {
    const combined = `${stderr}\n${stdout}`;

    if (combined.includes('Sign in to confirm you’re not a bot') || combined.includes('bot confirmation') || combined.includes('Sign in to confirm your age')) {
      return 'YouTube requested verification. In Settings -> Browser Session, enable Chrome/Edge session cookies to bypass bot checks.';
    }
    if (combined.includes('HTTP Error 403') || combined.includes('403: Forbidden')) {
      return 'HTTP Error 403 Forbidden: YouTube stream chunk blocked. Providing browser cookies in Settings is required for this stream.';
    }
    if (combined.includes('HTTP Error 429') || combined.includes('Too Many Requests')) {
      return 'HTTP Error 429: Too Many Requests from this IP. Please wait a moment or configure a proxy.';
    }
    if (combined.includes('Video unavailable') || combined.includes('This video is not available')) {
      return 'Video is unavailable, private, or removed by the host.';
    }
    if (combined.includes('Requested format is not available')) {
      return 'The requested stream format is no longer available. Please re-analyze the URL and select a different resolution.';
    }
    if (combined.includes('ffmpeg') && (combined.includes('not found') || combined.includes('not recognized'))) {
      return 'FFmpeg binary was not found or failed to execute. Please verify bin/win-x64/ffmpeg.exe is present.';
    }

    // Find any explicit ERROR: line
    const errorLines = combined
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('ERROR:') || l.includes('Error:'));

    if (errorLines.length > 0) {
      return errorLines[0].replace(/^ERROR:\s*/, '');
    }

    const lastStderr = stderr.trim().split('\n').pop();
    if (lastStderr) {
      return lastStderr;
    }

    return `yt-dlp download failed with exit code ${exitCode}.`;
  }

  /**
   * Executes a yt-dlp stream download targeting a specific format ID and output path
   */
  private runYtDlpDownload(
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
    return new Promise((resolve, reject) => {
      const ytDlpPath = binManager.getYtdlpPath();
      const args = this.buildDownloadArgs(url, formatId, outputPath, options, platform);

      const spawnTime = Date.now();
      let firstByteReported = false;

      console.log(`[Download] yt-dlp spawned for ${stageLabel}: "${ytDlpPath}"`);
      console.log(`[Download] Download Arguments:`, args);

      const child = spawn(ytDlpPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
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
          console.log(`[Download] first progress/byte for ${stageLabel}: ${Date.now() - spawnTime} ms`);
        }

        // Parse real-time progress metrics from yt-dlp output
        // Example: [download]  45.2% of ~  24.50MiB at    3.25MiB/s ETA 00:04
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
        console.error(`[yt-dlp stderr] ${text.trim()}`);
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
            console.log(`[Download] completed ${stageLabel} in: ${totalDuration} ms (exit code 0)`);
            resolve();
          } else {
            const parsedError = this.extractMeaningfulError(stderrData, stdoutData, code || 1);
            console.error(`[UniversalMediaDownloader] yt-dlp failed (exit code ${code}):`, parsedError);
            console.error(`[UniversalMediaDownloader] Full stderr:\n${stderrData}`);
            reject(new Error(`yt-dlp error: ${parsedError}`));
          }
        }
      });
    });
  }
}

export const universalMediaDownloader = new UniversalMediaDownloader();

