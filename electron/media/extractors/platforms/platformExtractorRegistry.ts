import { BaseMediaExtractor, ExtractionOptions, MediaInfo, SupportedPlatform } from '../../types';
import { youtubePlatformExtractor, YouTubePlatformExtractor } from './youtubePlatformExtractor';
import { tiktokPlatformExtractor, TikTokPlatformExtractor } from './tiktokPlatformExtractor';
import { instagramPlatformExtractor, InstagramPlatformExtractor } from './instagramPlatformExtractor';
import { facebookPlatformExtractor, FacebookPlatformExtractor } from './facebookPlatformExtractor';
import { twitterPlatformExtractor, TwitterPlatformExtractor } from './twitterPlatformExtractor';

export interface PlatformExtractor extends BaseMediaExtractor {
  readonly platform: SupportedPlatform;
  readonly name: string;
  readonly priority?: number;
  canHandle(url: string): boolean;
  extractInfo(url: string, options?: ExtractionOptions): Promise<MediaInfo>;
}

export class PlatformExtractorRegistry {
  private platformExtractors: PlatformExtractor[] = [];

  constructor() {
    // Register default platform extractors in priority order
    // Higher priority extractors are evaluated first
    this.register(youtubePlatformExtractor);   // priority 100
    this.register(tiktokPlatformExtractor);    // priority 90
    this.register(instagramPlatformExtractor); // priority 80
    this.register(facebookPlatformExtractor);  // priority 70
    this.register(twitterPlatformExtractor);   // priority 60
  }

  /**
   * Registers a platform extractor into the registry and sorts by priority descending.
   */
  public register(extractor: PlatformExtractor): void {
    // Remove if already exists with same name/platform to prevent duplicates
    this.platformExtractors = this.platformExtractors.filter(
      (e) => e.name !== extractor.name && e.platform !== extractor.platform
    );

    this.platformExtractors.push(extractor);
    this.sortByPriority();
  }

  /**
   * Unregisters a platform extractor by platform identifier.
   */
  public unregister(platform: SupportedPlatform): void {
    this.platformExtractors = this.platformExtractors.filter((e) => e.platform !== platform);
  }

  /**
   * Finds the appropriate platform extractor that can handle the target URL.
   * Returns null if no specialized platform extractor can handle it.
   */
  public getExtractorForUrl(url: string): PlatformExtractor | null {
    if (!url || typeof url !== 'string') return null;
    const trimmedUrl = url.trim();

    for (const extractor of this.platformExtractors) {
      if (extractor.canHandle(trimmedUrl)) {
        return extractor;
      }
    }
    return null;
  }

  /**
   * Checks if any registered platform extractor can handle the target URL.
   */
  public canHandle(url: string): boolean {
    return this.getExtractorForUrl(url) !== null;
  }

  /**
   * Returns all registered platform extractors.
   */
  public getAllExtractors(): PlatformExtractor[] {
    return [...this.platformExtractors];
  }

  /**
   * Returns the list of registered platforms.
   */
  public getRegisteredPlatforms(): SupportedPlatform[] {
    return this.platformExtractors.map((e) => e.platform);
  }

  /**
   * Sorts extractors by priority descending (default priority = 50).
   */
  private sortByPriority(): void {
    this.platformExtractors.sort((a, b) => {
      const pA = a.priority ?? 50;
      const pB = b.priority ?? 50;
      return pB - pA;
    });
  }
}

export const platformExtractorRegistry = new PlatformExtractorRegistry();
export { YouTubePlatformExtractor, youtubePlatformExtractor };
export { TikTokPlatformExtractor, tiktokPlatformExtractor };
export { InstagramPlatformExtractor, instagramPlatformExtractor };
export { FacebookPlatformExtractor, facebookPlatformExtractor };
export { TwitterPlatformExtractor, twitterPlatformExtractor };

