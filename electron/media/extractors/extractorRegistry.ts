import { BaseMediaExtractor, ExtractionOptions, MediaInfo, SupportedPlatform } from '../types';
import { GenericExtractor, genericExtractor } from './genericExtractor';
import { detectMediaPlatform } from '../urlDetector';
import { platformExtractorRegistry, PlatformExtractorRegistry, PlatformExtractor } from './platforms/platformExtractorRegistry';

export class ExtractorRegistry {
  private platformRegistry: PlatformExtractorRegistry;
  private customExtractors: BaseMediaExtractor[] = [];
  private fallbackExtractor: BaseMediaExtractor;

  constructor(platformRegistry: PlatformExtractorRegistry = platformExtractorRegistry) {
    this.platformRegistry = platformRegistry;
    // Generic fallback for any other media site supported by yt-dlp
    this.fallbackExtractor = genericExtractor;
  }

  /**
   * Registers a new platform or custom extractor.
   */
  public register(extractor: BaseMediaExtractor | PlatformExtractor): void {
    if ('priority' in extractor && typeof extractor.priority === 'number') {
      this.platformRegistry.register(extractor as PlatformExtractor);
    } else {
      this.customExtractors.unshift(extractor);
    }
  }

  /**
   * Determines the optimal extractor for a given URL:
   * 1. Check custom dynamically registered extractors
   * 2. Query PlatformExtractorRegistry (YouTube, and future platforms)
   * 3. Fallback to GenericExtractor
   */
  public getExtractorForUrl(url: string): BaseMediaExtractor {
    if (!url || typeof url !== 'string') return this.fallbackExtractor;
    const trimmedUrl = url.trim();

    // 1. Custom extractors
    for (const ext of this.customExtractors) {
      if (ext.canHandle(trimmedUrl)) {
        return ext;
      }
    }

    // 2. Platform-specific extractors (Priority ordered)
    const platformExtractor = this.platformRegistry.getExtractorForUrl(trimmedUrl);
    if (platformExtractor) {
      return platformExtractor;
    }

    // 3. Fallback generic extractor
    return this.fallbackExtractor;
  }

  /**
   * Identifies the platform name for the target URL.
   */
  public detectPlatform(url: string): SupportedPlatform {
    const detection = detectMediaPlatform(url);
    if (detection.isMediaUrl) {
      return detection.platform;
    }
    return 'generic_media';
  }

  /**
   * Extracts media info using the optimal extractor.
   */
  public async extractInfo(url: string, options?: ExtractionOptions): Promise<MediaInfo> {
    const extractor = this.getExtractorForUrl(url);
    return await extractor.extractInfo(url, options);
  }

  /**
   * Access the underlying PlatformExtractorRegistry
   */
  public getPlatformRegistry(): PlatformExtractorRegistry {
    return this.platformRegistry;
  }
}

export const extractorRegistry = new ExtractorRegistry();
export { platformExtractorRegistry, PlatformExtractorRegistry };

