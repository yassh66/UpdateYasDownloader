import { AbstractBaseMediaExtractor } from '../baseExtractor';
import { isYouTubeUrl } from '../../urlDetector';
import { ExtractionOptions, MediaInfo } from '../../types';

export class YouTubePlatformExtractor extends AbstractBaseMediaExtractor {
  readonly platform = 'youtube' as const;
  readonly name = 'YouTube (yt-dlp core)';
  readonly priority = 100;

  canHandle(url: string): boolean {
    return isYouTubeUrl(url);
  }

  async extractInfo(url: string, options?: ExtractionOptions): Promise<MediaInfo> {
    return await super.extractInfo(url, options);
  }
}

export const youtubePlatformExtractor = new YouTubePlatformExtractor();
