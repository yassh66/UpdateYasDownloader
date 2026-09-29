import { AbstractBaseMediaExtractor } from '../baseExtractor';
import { isInstagramUrl } from '../../urlDetector';
import { ExtractionOptions, MediaInfo } from '../../types';

/**
 * Sanitizes Instagram URLs by removing tracking and session parameters
 * that can interfere with yt-dlp resolution.
 */
export function cleanInstagramUrl(rawUrl: string): string {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  try {
    const parsed = new URL(rawUrl.trim());
    const trackingParams = ['igsh', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'src', 'igshid'];
    for (const param of trackingParams) {
      parsed.searchParams.delete(param);
    }
    return parsed.toString();
  } catch {
    return rawUrl.trim();
  }
}

export class InstagramPlatformExtractor extends AbstractBaseMediaExtractor {
  readonly platform = 'instagram' as const;
  readonly name = 'Instagram Extractor';
  readonly priority = 80; // Prioritized below TikTok (90) and YouTube (100), above Generic (50)

  /**
   * Validates if the given URL is an Instagram post, reel, reels, TV, or video link.
   * Matches:
   * - https://www.instagram.com/reel/...
   * - https://www.instagram.com/p/...
   * - https://www.instagram.com/tv/...
   * - https://www.instagram.com/reels/...
   * - https://instagram.com/username/reel/...
   */
  canHandle(url: string): boolean {
    return isInstagramUrl(url);
  }

  /**
   * Builds custom arguments tailored for high Instagram reliability.
   */
  public override buildYtdlpArgs(url: string, options?: ExtractionOptions): string[] {
    const cleanedUrl = cleanInstagramUrl(url);
    const args = super.buildYtdlpArgs(cleanedUrl, options);
    
    // Ensure standard desktop Chrome User-Agent if none provided to bypass aggressive mobile scrapers detection
    if (!options?.customUserAgent && !args.includes('--user-agent')) {
      args.unshift('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    }
    
    return args;
  }

  /**
   * Extracts and normalizes metadata from Instagram using yt-dlp core with safe automatic retries.
   * Handles single videos, reels, IGTV, and multi-media / carousel posts.
   */
  async extractInfo(url: string, options?: ExtractionOptions): Promise<MediaInfo> {
    const cleanedUrl = cleanInstagramUrl(url);
    const maxAttempts = 2;
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const info = await super.extractInfo(cleanedUrl, options);

        // Provide friendly fallback if title is missing or default
        if (!info.title || info.title === 'Untitled Media') {
          if (info.uploader) {
            info.title = `Instagram Post by @${info.uploader}`;
            info.cleanFileName = `Instagram_${info.uploader}_${info.id || Date.now()}`;
          } else {
            info.title = `Instagram Media ${info.id || ''}`.trim();
            info.cleanFileName = `Instagram_${info.id || Date.now()}`;
          }
        }

        // Check if yt-dlp returned multiple entries (carousel post / album)
        const raw = info.rawMetadata;
        if (raw && Array.isArray(raw.entries) && raw.entries.length > 0) {
          const playlistItems = raw.entries.map((entry: any, index: number) => {
            return {
              id: String(entry.id || `${info.id}_${index + 1}`),
              title: entry.title || `${info.title} (Part ${index + 1})`,
              url: entry.webpage_url || entry.url || cleanedUrl,
              duration: typeof entry.duration === 'number' ? entry.duration : undefined,
              thumbnail: entry.thumbnail || (Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0 ? entry.thumbnails[entry.thumbnails.length - 1].url : undefined),
              uploader: entry.uploader || info.uploader,
            };
          });

          info.mediaType = 'playlist';
          info.playlist = {
            id: info.id,
            title: info.title,
            itemCount: raw.entries.length,
            items: playlistItems,
          };
        }

        return info;
      } catch (err: any) {
        lastError = err;
        const errMsg = (err.message || '').toLowerCase();
        // If the error indicates private media, login required, or URL not found, do not waste time retrying
        if (
          errMsg.includes('login') ||
          errMsg.includes('private') ||
          errMsg.includes('not found') ||
          errMsg.includes('does not exist')
        ) {
          break;
        }

        // If not the final attempt, wait briefly with backoff before retrying
        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    throw lastError || new Error(`Instagram extraction timed out or failed. Please check your connection, VPN, or login cookies.`);
  }
}

export const instagramPlatformExtractor = new InstagramPlatformExtractor();
