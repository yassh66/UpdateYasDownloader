import { AbstractBaseMediaExtractor } from './baseExtractor';
import { isDirectBinaryFileUrl } from '../urlDetector';

export class GenericExtractor extends AbstractBaseMediaExtractor {
  readonly platform = 'generic_media' as const;
  readonly name = 'Generic Media Extractor (yt-dlp universal)';

  /**
   * Only handles media candidate URLs.
   * Direct binary files (.zip, .iso, .exe, .msi, etc.) are strictly excluded
   * so they are routed through the standard direct download engine.
   */
  canHandle(url: string): boolean {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;

    // Strict safety check: Never intercept direct downloadable binary archives/installers
    if (isDirectBinaryFileUrl(trimmed)) {
      return false;
    }

    return true;
  }
}

export const genericExtractor = new GenericExtractor();
