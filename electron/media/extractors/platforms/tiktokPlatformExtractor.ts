import { AbstractBaseMediaExtractor } from '../baseExtractor';
import { isTikTokUrl } from '../../urlDetector';
import { ExtractionOptions, MediaInfo } from '../../types';

export class TikTokPlatformExtractor extends AbstractBaseMediaExtractor {
  readonly platform = 'tiktok' as const;
  readonly name = 'TikTok Extractor';
  readonly priority = 90; // Prioritized below YouTube (100) and above Generic (50)

  /**
   * Validates if the given URL is a supported TikTok video, short, or VM link.
   * Matches:
   * - https://www.tiktok.com/@user/video/...
   * - https://www.tiktok.com/t/...
   * - https://vm.tiktok.com/...
   * - https://vt.tiktok.com/...
   * - https://m.tiktok.com/...
   */
  canHandle(url: string): boolean {
    return isTikTokUrl(url);
  }

  /**
   * Extracts normalized metadata from TikTok using the yt-dlp core engine.
   * Extracts title, creator/uploader, thumbnail, duration, format options,
   * audio & video track availability.
   */
  async extractInfo(url: string, options?: ExtractionOptions): Promise<MediaInfo> {
    const info = await super.extractInfo(url, options);

    // Provide friendly fallback if title is generic or creator handle is missing
    if (!info.title || info.title === 'Untitled Media') {
      if (info.uploader) {
        info.title = `TikTok Video by ${info.uploader}`;
        info.cleanFileName = `TikTok_${info.uploader}_${info.id || Date.now()}`;
      }
    }

    return info;
  }
}

export const tiktokPlatformExtractor = new TikTokPlatformExtractor();
