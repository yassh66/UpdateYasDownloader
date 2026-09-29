import { AbstractBaseMediaExtractor } from '../baseExtractor';
import { isTwitterUrl } from '../../urlDetector';
import { ExtractionOptions, MediaInfo } from '../../types';

export class TwitterPlatformExtractor extends AbstractBaseMediaExtractor {
  readonly platform = 'twitter' as const;
  readonly name = 'Twitter Extractor';
  readonly priority = 60; // Priority: YouTube (100) -> TikTok (90) -> Instagram (80) -> Facebook (70) -> Twitter/X (60) -> Generic (50)

  /**
   * Validates if the given URL is a Twitter/X video, clip, broadcast, or tweet link.
   * Matches:
   * - https://twitter.com/{user}/status/{id}
   * - https://x.com/{user}/status/{id}
   * - https://twitter.com/i/status/{id}
   * - https://x.com/i/status/{id}
   * - https://twitter.com/status/{id}
   * - https://x.com/status/{id}
   * - https://mobile.twitter.com/...
   * - https://mobile.x.com/...
   */
  canHandle(url: string): boolean {
    return isTwitterUrl(url);
  }

  /**
   * Extracts and normalizes metadata from Twitter/X using the yt-dlp core engine.
   * Handles single videos, quote tweets with video, retweets, and multi-clip media tweets.
   */
  async extractInfo(url: string, options?: ExtractionOptions): Promise<MediaInfo> {
    const info = await super.extractInfo(url, options);

    // Provide friendly fallback if title is missing or default
    if (!info.title || info.title === 'Untitled Media') {
      if (info.uploader) {
        info.title = `Tweet by @${info.uploader}`;
        info.cleanFileName = `Twitter_${info.uploader}_${info.id || Date.now()}`;
      } else {
        info.title = `Twitter Video ${info.id || ''}`.trim();
        info.cleanFileName = `Twitter_${info.id || Date.now()}`;
      }
    }

    // Check if yt-dlp returned multiple entries (e.g. multiple videos in one tweet)
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

export const twitterPlatformExtractor = new TwitterPlatformExtractor();
