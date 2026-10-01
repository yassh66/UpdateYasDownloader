import {
  BaseMediaExtractor,
  ExtractionOptions,
  MediaDetectionResult,
  MediaDownloadJob,
  MediaDownloadProgressEvent,
  MediaDownloadStage,
  MediaInfo,
  SupportedPlatform,
} from './types';
import { detectMediaPlatform, isYouTubeUrl, isTikTokUrl, isInstagramUrl, isFacebookUrl, isTwitterUrl } from './urlDetector';
import { YouTubeExtractor, youtubeExtractor } from './extractors/youtubeExtractor';
import { TikTokPlatformExtractor, tiktokPlatformExtractor } from './extractors/platforms/tiktokPlatformExtractor';
import { InstagramPlatformExtractor, instagramPlatformExtractor } from './extractors/platforms/instagramPlatformExtractor';
import { FacebookPlatformExtractor, facebookPlatformExtractor } from './extractors/platforms/facebookPlatformExtractor';
import { TwitterPlatformExtractor, twitterPlatformExtractor } from './extractors/platforms/twitterPlatformExtractor';
import { GenericExtractor, genericExtractor } from './extractors/genericExtractor';
import { extractorRegistry, ExtractorRegistry, platformExtractorRegistry, PlatformExtractorRegistry } from './extractors/extractorRegistry';
import { formatSelector, FormatSelector, StandardQuality, TargetContainer } from './format/formatSelector';
import { ffmpegManager, FFmpegManager } from './postprocessor/ffmpegManager';
import { binManager, BinManager } from './bin/binManager';
import {
  universalMediaDownloader,
  UniversalMediaDownloader,
  UniversalDownloadOptions,
} from './download/universalMediaDownloader';
import { youtubeDownloader, YouTubeDownloader, StartMediaDownloadOptions } from './download/youtubeDownloader';
import { mediaDownloadManager, MediaDownloadManager } from './download/mediaDownloadManager';
import { sessionManager, SessionManager } from './session/sessionManager';
import { mediaCleanupService, MediaCleanupService } from './cleanup/mediaCleanupService';
import { mediaHistoryStore, MediaHistoryStore } from './storage/mediaHistoryStore';
import { extractionStrategyManager, ExtractionStrategyManager } from './strategy/extractionStrategyManager';
import { MediaDiagnosticsLogger } from './diagnostics/mediaDiagnosticsLogger';

export class MediaEngine {
  public readonly registry: ExtractorRegistry = extractorRegistry;
  public readonly platformRegistry: PlatformExtractorRegistry = platformExtractorRegistry;
  public readonly formatSelector: FormatSelector = formatSelector;
  public readonly ffmpegManager: FFmpegManager = ffmpegManager;
  public readonly binManager: BinManager = binManager;
  public readonly downloader: UniversalMediaDownloader = universalMediaDownloader;
  public readonly universalDownloader: UniversalMediaDownloader = universalMediaDownloader;
  public readonly downloadManager: MediaDownloadManager = mediaDownloadManager;
  public readonly sessionManager: SessionManager = sessionManager;
  public readonly cleanupService: MediaCleanupService = mediaCleanupService;
  public readonly historyStore: MediaHistoryStore = mediaHistoryStore;
  public readonly strategyManager: ExtractionStrategyManager = extractionStrategyManager;
  public readonly diagnosticsLogger = MediaDiagnosticsLogger;

  /**
   * Registers a platform extractor into the Media Engine registry.
   */
  public registerExtractor(extractor: BaseMediaExtractor): void {
    this.registry.register(extractor);
  }

  /**
   * Returns the registered extractor for a given URL.
   */
  public getExtractorForUrl(url: string): BaseMediaExtractor {
    return this.registry.getExtractorForUrl(url);
  }

  /**
   * Evaluates input URL to check if it corresponds to a supported streaming/media service.
   */
  public detectUrl(url: string): MediaDetectionResult {
    return detectMediaPlatform(url);
  }

  /**
   * Checks if URL is supported for media extraction (specialized or generic media stream).
   */
  public isSupportedMedia(url: string): boolean {
    const result = this.detectUrl(url);
    return result.isMediaUrl;
  }

  /**
   * High-level entry point: routes extraction through the ExtractorRegistry.
   */
  public async extractMediaInfo(
    url: string,
    options?: ExtractionOptions
  ): Promise<MediaInfo> {
    const detection = this.detectUrl(url);

    if (!detection.isMediaUrl) {
      throw new Error(`URL is not a recognized media platform: ${url}`);
    }

    return await this.registry.extractInfo(detection.canonicalUrl || url, options);
  }

  /**
   * Direct accessor for YouTube extractor parsing helper (backwards compatibility).
   */
  public getYouTubeExtractor(): YouTubeExtractor {
    return youtubeExtractor;
  }

  /**
   * Direct accessor for TikTok extractor parsing helper.
   */
  public getTikTokExtractor(): TikTokPlatformExtractor {
    return tiktokPlatformExtractor;
  }

  /**
   * Direct accessor for Instagram extractor parsing helper.
   */
  public getInstagramExtractor(): InstagramPlatformExtractor {
    return instagramPlatformExtractor;
  }

  /**
   * Direct accessor for Facebook extractor parsing helper.
   */
  public getFacebookExtractor(): FacebookPlatformExtractor {
    return facebookPlatformExtractor;
  }

  /**
   * Direct accessor for Twitter/X extractor parsing helper.
   */
  public getTwitterExtractor(): TwitterPlatformExtractor {
    return twitterPlatformExtractor;
  }
}

// Export singleton instance for app-wide use
export const mediaEngine = new MediaEngine();
export {
  isYouTubeUrl,
  isTikTokUrl,
  isInstagramUrl,
  isFacebookUrl,
  isTwitterUrl,
  YouTubeExtractor,
  youtubeExtractor,
  TikTokPlatformExtractor,
  tiktokPlatformExtractor,
  InstagramPlatformExtractor,
  instagramPlatformExtractor,
  FacebookPlatformExtractor,
  facebookPlatformExtractor,
  TwitterPlatformExtractor,
  twitterPlatformExtractor,
  GenericExtractor,
  genericExtractor,
};




