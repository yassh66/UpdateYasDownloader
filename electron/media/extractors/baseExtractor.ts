import path from 'path';
import {
  BaseMediaExtractor,
  ExtractionOptions,
  MediaChapter,
  MediaFormatOption,
  MediaInfo,
  MediaSubtitleOption,
  SupportedPlatform,
} from '../types';
import { binManager } from '../bin/binManager';
import { sessionManager } from '../session/sessionManager';

/**
 * Sanitizes titles for NTFS / FAT32 Windows filesystem restrictions.
 */
export function sanitizeWindowsFilename(title: string, fallback: string = 'media_download'): string {
  if (!title) return fallback;
  // Remove Windows invalid filename chars: < > : " / \ | ? *
  let sanitized = title.replace(/[<>:"/\\|?*]/g, '').trim();
  // Strip control characters
  sanitized = sanitized.replace(/[\x00-\x1f\x80-\x9f]/g, '');
  // Prevent Windows reserved filenames (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\..*)?$/i.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  // Trim trailing periods and spaces (Windows restriction)
  sanitized = sanitized.replace(/[. ]+$/, '');
  return sanitized.slice(0, 200) || fallback;
}

export function formatDurationSeconds(seconds?: number): string {
  if (!seconds || seconds <= 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export abstract class AbstractBaseMediaExtractor implements BaseMediaExtractor {
  abstract readonly platform: SupportedPlatform;
  abstract readonly name: string;

  abstract canHandle(url: string): boolean;

  /**
   * Calculates the optimal socket timeout in seconds based on platform characteristics.
   * - Instagram / Meta APIs require 30-35s due to API handshakes and CDN throttling.
   * - TikTok, Facebook, Twitter require 25-30s.
   * - YouTube uses 10s for fast parsing without stalling.
   */
  public getSocketTimeout(url?: string): number {
    if (this.platform === 'instagram' || (url && (url.includes('instagram.com') || url.includes('instagr.am')))) {
      return 35;
    }
    if (this.platform === 'tiktok' || (url && url.includes('tiktok.com'))) {
      return 25;
    }
    if (this.platform === 'facebook' || (url && (url.includes('facebook.com') || url.includes('fb.watch')))) {
      return 25;
    }
    if (this.platform === 'twitter' || (url && (url.includes('twitter.com') || url.includes('x.com')))) {
      return 25;
    }
    if (this.platform === 'youtube' || (url && (url.includes('youtube.com') || url.includes('youtu.be')))) {
      return 10;
    }
    return 20;
  }

  /**
   * Prepares execution arguments for yt-dlp child process.
   * Optimized for fast metadata and stream analysis by stripping unnecessary assets
   * (subtitles, thumbnails, comments) while preserving all format, bitrate, and size data.
   */
  public buildYtdlpArgs(url: string, options?: ExtractionOptions): string[] {
    const socketTimeout = options?.socketTimeout || this.getSocketTimeout(url);

    const args = [
      '--dump-single-json',
      '--no-warnings',
      '--no-check-certificates',
      '--socket-timeout', String(socketTimeout),
      '--no-write-subs',
      '--no-write-auto-subs',
      '--no-write-comments',
      '--no-write-thumbnail',
    ];

    if (this.platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
      args.push('--remote-components', 'ejs:github');
      const jsRuntime = binManager.getJsRuntime();
      if (jsRuntime.path) {
        args.push('--js-runtimes', `${jsRuntime.runtime}:${jsRuntime.path}`);
      } else {
        args.push('--js-runtimes', jsRuntime.runtime);
      }
      args.push('--extractor-args', 'youtube:player_client=web,web_embedded;skip=translated_subs');
    }

    if (options?.cookiesPath) {
      const resolvedCookies = path.isAbsolute(options.cookiesPath)
        ? options.cookiesPath
        : path.resolve(options.cookiesPath);
      args.push('--cookies', resolvedCookies);
    } else if (options?.browserCookies) {
      args.push('--cookies-from-browser', options.browserCookies);
    } else {
      // Check session manager for platform-specific or global browser session
      const sessionArg = sessionManager.getYtDlpCookiesFromBrowserArg(this.platform);
      if (sessionArg) {
        args.push('--cookies-from-browser', sessionArg);
      }
    }

    if (options?.proxyUrl) {
      args.push('--proxy', options.proxyUrl);
    }

    if (options?.customUserAgent) {
      args.push('--user-agent', options.customUserAgent);
    }

    if (options?.maxPlaylistItems && options.maxPlaylistItems > 0) {
      args.push('--playlist-end', String(options.maxPlaylistItems));
    } else {
      args.push('--no-playlist');
    }

    args.push(url);
    return args;
  }

  /**
   * Transforms raw yt-dlp JSON dump into normalized YAS MediaInfo.
   */
  public parseYtdlpDump(json: Record<string, any>, originalUrl: string, targetPlatform?: SupportedPlatform): MediaInfo {
    const title = json.title || 'Untitled Media';
    const cleanFileName = sanitizeWindowsFilename(title, 'media_download');
    const duration = typeof json.duration === 'number' ? json.duration : 0;

    const availableFormats: MediaFormatOption[] = [];
    const rawFormats = Array.isArray(json.formats) ? json.formats : [];

    for (const fmt of rawFormats) {
      const hasVideo = !!fmt.vcodec && fmt.vcodec !== 'none';
      const hasAudio = !!fmt.acodec && fmt.acodec !== 'none';

      if (!hasVideo && !hasAudio) continue;

      let resolution = fmt.resolution;
      if (!resolution && fmt.width && fmt.height) {
        resolution = `${fmt.width}x${fmt.height}`;
      } else if (!resolution && hasAudio && !hasVideo) {
        resolution = 'Audio only';
      }

      let qualityLabel = fmt.format_note || resolution || fmt.format_id;
      if (fmt.fps && fmt.fps > 30 && hasVideo) {
        qualityLabel = `${fmt.height || ''}p${fmt.fps}`;
      }

      const formatNote = String(fmt.format_note || '');
      const isPremium =
        formatNote.toLowerCase().includes('premium') ||
        String(fmt.format_id).startsWith('61') ||
        String(fmt.format_id).startsWith('62') ||
        fmt.availability === 'subscriber_only';

      // If video has no audio track, it is a DASH adaptive stream
      const isDashStream = hasVideo && !hasAudio;

      availableFormats.push({
        formatId: String(fmt.format_id),
        ext: fmt.ext || 'mp4',
        resolution,
        width: fmt.width,
        height: fmt.height,
        fps: fmt.fps,
        vcodec: fmt.vcodec !== 'none' ? fmt.vcodec : undefined,
        acodec: fmt.acodec !== 'none' ? fmt.acodec : undefined,
        filesize: fmt.filesize || undefined,
        filesizeApprox: fmt.filesize_approx || undefined,
        tbr: fmt.tbr || undefined,
        vbr: fmt.vbr || undefined,
        abr: fmt.abr || undefined,
        qualityLabel,
        formatNote,
        isPremium,
        hasDrm: !!fmt.has_drm,
        hasVideo,
        hasAudio,
        isDashStream,
        url: fmt.url,
        protocol: fmt.protocol,
        httpHeaders: fmt.http_headers,
      });
    }

    // Subtitles parsing
    const subtitles: MediaSubtitleOption[] = [];
    if (json.subtitles && typeof json.subtitles === 'object') {
      for (const [lang, subList] of Object.entries(json.subtitles)) {
        if (Array.isArray(subList) && subList.length > 0) {
          const firstSub = subList[0];
          subtitles.push({
            lang,
            name: firstSub.name || lang,
            ext: firstSub.ext || 'vtt',
            url: firstSub.url,
            isAutoGenerated: false,
          });
        }
      }
    }

    // Auto-captions parsing
    if (json.automatic_captions && typeof json.automatic_captions === 'object') {
      for (const [lang, subList] of Object.entries(json.automatic_captions)) {
        if (Array.isArray(subList) && subList.length > 0) {
          const firstSub = subList[0];
          subtitles.push({
            lang: `${lang}-auto`,
            name: `${firstSub.name || lang} (Auto)`,
            ext: firstSub.ext || 'vtt',
            url: firstSub.url,
            isAutoGenerated: true,
          });
        }
      }
    }

    // Chapters parsing
    const chapters: MediaChapter[] = [];
    if (Array.isArray(json.chapters)) {
      for (const chap of json.chapters) {
        chapters.push({
          title: chap.title || 'Chapter',
          startTime: chap.start_time || 0,
          endTime: chap.end_time || 0,
        });
      }
    }

    // Handle carousel or small multi-entry media post
    const entries: MediaInfo[] = [];
    if (Array.isArray(json.entries) && json.entries.length > 0 && json.entries.length <= 15) {
      for (const entry of json.entries) {
        if (entry && typeof entry === 'object') {
          entries.push(this.parseYtdlpDump(entry, entry.webpage_url || originalUrl, targetPlatform));
        }
      }
    }

    return {
      id: String(json.id || ''),
      originalUrl,
      platform: targetPlatform || this.platform,
      mediaType: json._type === 'playlist' ? 'playlist' : 'video',
      title,
      cleanFileName,
      description: json.description,
      uploader: json.uploader || json.channel,
      uploaderUrl: json.uploader_url || json.channel_url,
      duration,
      formattedDuration: formatDurationSeconds(duration),
      thumbnail: json.thumbnail || (Array.isArray(json.thumbnails) && json.thumbnails.length > 0 ? json.thumbnails[json.thumbnails.length - 1].url : undefined),
      availableFormats,
      subtitles: subtitles.length > 0 ? subtitles : undefined,
      chapters: chapters.length > 0 ? chapters : undefined,
      extractorName: this.name,
      extractedAt: Date.now(),
      rawMetadata: json,
    };
  }

  /**
   * Executes yt-dlp to extract full metadata.
   */
  async extractInfo(url: string, options?: ExtractionOptions): Promise<MediaInfo> {
    if (!this.canHandle(url)) {
      throw new Error(`${this.name} cannot handle URL: ${url}`);
    }

    const args = this.buildYtdlpArgs(url, options);

    // Development debug logging for arguments inspection
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
      console.log(`[BaseExtractor] Executing yt-dlp for platform: ${this.platform}`);
      console.log(`[BaseExtractor] Arguments:`, args);
    }

    const socketTimeout = options?.socketTimeout || this.getSocketTimeout(url);
    const childTimeoutMs = Math.max(50000, (socketTimeout + 20) * 1000);

    const t0 = Date.now();
    console.log(`[MediaAnalysis] START extraction for: ${url} (Platform: ${this.platform})`);

    try {
      console.log(`[MediaAnalysis] yt-dlp spawn with socketTimeout=${socketTimeout}s`);
      const result = await binManager.executeYtdlp(args, {
        timeoutMs: childTimeoutMs,
      });
      const ytDlpDuration = Date.now() - t0;
      console.log(`[MediaAnalysis] yt-dlp completed in: ${ytDlpDuration} ms (exitCode: ${result.exitCode})`);

      if (!result.stdout || !result.stdout.trim()) {
        throw new Error('yt-dlp returned an empty response for this URL.');
      }

      let parsedJson: Record<string, any>;
      const tJson = Date.now();
      try {
        parsedJson = JSON.parse(result.stdout.trim());
      } catch (jsonErr: any) {
        throw new Error(`Failed to parse yt-dlp metadata JSON: ${jsonErr.message}`);
      }
      console.log(`[MediaAnalysis] JSON parsed in: ${Date.now() - tJson} ms`);

      const tFormat = Date.now();
      const mediaInfo = this.parseYtdlpDump(parsedJson, url);
      console.log(`[MediaAnalysis] formats ready in: ${Date.now() - tFormat} ms (Found ${mediaInfo.availableFormats?.length || 0} formats)`);
      console.log(`[MediaAnalysis] TOTAL analysis completed in: ${Date.now() - t0} ms`);

      return mediaInfo;
    } catch (error: any) {
      let message = error.message || `Unknown error occurred during extraction with ${this.name}.`;
      const combinedErr = (message + ' ' + (error.stderr || '')).toLowerCase();

      if (
        combinedErr.includes('timed out') ||
        combinedErr.includes('curl: (28)') ||
        combinedErr.includes('connection timed out') ||
        combinedErr.includes('operation timed out')
      ) {
        if (this.platform === 'instagram' || url.includes('instagram.com')) {
          message = 'Instagram extraction timed out. Please check your connection, VPN, or login cookies.';
        } else if (this.platform === 'youtube' || url.includes('youtube.com')) {
          message = 'YouTube extraction timed out. Please check your connection or try again.';
        } else {
          message = `${this.name} extraction timed out. Please check your connection, VPN, or proxy.`;
        }
      } else if (
        combinedErr.includes('login required') ||
        combinedErr.includes('checkpoint_required') ||
        combinedErr.includes('login to view') ||
        combinedErr.includes('login with your instagram account')
      ) {
        if (this.platform === 'instagram' || url.includes('instagram.com')) {
          message = 'Instagram requires login to view this content. Please configure cookies.txt in Settings.';
        }
      }

      const enrichedError: any = new Error(message);
      enrichedError.platform = this.platform;
      enrichedError.originalUrl = url;
      enrichedError.rawError = error;
      throw enrichedError;
    }
  }
}
