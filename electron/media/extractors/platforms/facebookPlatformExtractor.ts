import { AbstractBaseMediaExtractor } from '../baseExtractor';
import { isFacebookUrl } from '../../urlDetector';
import { ExtractionOptions, MediaInfo } from '../../types';

export class FacebookPlatformExtractor extends AbstractBaseMediaExtractor {
  readonly platform = 'facebook' as const;
  readonly name = 'Facebook Extractor';
  readonly priority = 70; // Priority: YouTube (100) -> TikTok (90) -> Instagram (80) -> Facebook (70) -> Generic (50)

  /**
   * Validates if the given URL is a Facebook video, reel, watch, or shared clip.
   * Matches:
   * - https://www.facebook.com/watch/?v=...
   * - https://www.facebook.com/reel/...
   * - https://www.facebook.com/video.php?v=...
   * - https://www.facebook.com/{user}/videos/...
   * - https://www.facebook.com/story.php?...
   * - https://fb.watch/...
   * - https://m.facebook.com/...
   */
  canHandle(url: string): boolean {
    return isFacebookUrl(url);
  }

  /**
   * Extracts and normalizes metadata from Facebook using the yt-dlp core engine.
   * Handles Watch videos, Reels, User uploads, Page videos, and multi-video collections.
   */
  async extractInfo(url: string, options?: ExtractionOptions): Promise<MediaInfo> {
    const info = await super.extractInfo(url, options);

    // Provide friendly fallback if title is missing or default
    if (!info.title || info.title === 'Untitled Media') {
      if (info.uploader) {
        info.title = `Facebook Video by ${info.uploader}`;
        info.cleanFileName = `Facebook_${info.uploader}_${info.id || Date.now()}`;
      } else {
        info.title = `Facebook Video ${info.id || ''}`.trim();
        info.cleanFileName = `Facebook_${info.id || Date.now()}`;
      }
    }

    // Check if yt-dlp returned multiple entries (collection or playlist)
    const raw = info.rawMetadata;
    if (raw && Array.isArray(raw.entries) && raw.entries.length > 0) {
      const playlistItems = raw.entries.map((entry: any, index: number) => {
        return {
          id: String(entry.id || `${info.id}_${index + 1}`),
          title: entry.title || `${info.title} (Part ${index + 1})`,
          url: entry.webpage_url || entry.url || url,
          duration: typeof entry.duration === 'number' ? entry.duration : undefined,
          thumbnail:
            entry.thumbnail ||
            (Array.isArray(entry.thumbnails) && entry.thumbnails.length > 0
              ? entry.thumbnails[entry.thumbnails.length - 1].url
              : undefined),
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
  }
}

export const facebookPlatformExtractor = new FacebookPlatformExtractor();
