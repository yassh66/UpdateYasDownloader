import { SupportedPlatform, ExtractionOptions } from '../types';
import { browserCookieReader } from '../session/browserCookieReader';
import { sessionManager } from '../session/sessionManager';
import { NetscapeCookieExporter } from '../session/netscapeCookieExporter';
import { MediaDiagnosticsLogger } from '../diagnostics/mediaDiagnosticsLogger';
import { FailureClassifier, ClassifiedFailure, StrategyOutcome } from './failureClassifier';
import { getSavedCookiesSettings, validateCookiesFile } from '../session/cookieValidator';

export interface RecoveryStrategy {
  id: string;
  tier: number;
  name: string;
  description: string;
  playerClient?: string;
  browserCookie?: string;
  cookiesPath?: string;
  customHeaders?: Record<string, string>;
  userAgent?: string;
  extraArgs?: string[];
}

export type FailureInjectionHook = (
  strategy: RecoveryStrategy,
  attemptIndex: number
) => { shouldFail: boolean; simulatedError?: string } | null;

export class ExtractionStrategyManager {
  private failureInjectionHook: FailureInjectionHook | null = null;

  /**
   * For development/testing: attaches a failure injection interceptor.
   */
  public setFailureInjectionHook(hook: FailureInjectionHook | null): void {
    this.failureInjectionHook = hook;
  }

  /**
   * Checks if failure injection hook requests a simulated failure for this strategy.
   */
  public checkFailureInjection(strategy: RecoveryStrategy, attemptIndex: number): { shouldFail: boolean; simulatedError?: string } | null {
    if (this.failureInjectionHook) {
      return this.failureInjectionHook(strategy, attemptIndex);
    }
    return null;
  }

  /**
   * Generates a progressive recovery ladder of strategies tailored to the target platform.
   */
  public getStrategyLadder(
    platform: SupportedPlatform,
    url: string,
    baseOptions?: ExtractionOptions
  ): RecoveryStrategy[] {
    const ladder: RecoveryStrategy[] = [];
    const isYouTube = platform === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be');
    const isInstagram = platform === 'instagram' || url.includes('instagram.com') || url.includes('instagr.am');

    // ----------------------------------------------------
    // PRIORITY 1: User-Configured cookies.txt Authentication
    // If the user configured a cookies file, use ONLY --cookies.
    // Do NOT add --cookies-from-browser. Do NOT start browser recovery.
    // ----------------------------------------------------
    const savedCookies = getSavedCookiesSettings(baseOptions?.userDataDir);
    let effectiveCookiesPath: string | undefined;

    if (baseOptions?.cookiesPath) {
      const val = validateCookiesFile(baseOptions.cookiesPath);
      if (val.valid) {
        effectiveCookiesPath = baseOptions.cookiesPath;
      }
    } else if (savedCookies.enabled && savedCookies.cookiesPath) {
      effectiveCookiesPath = savedCookies.cookiesPath;
    }

    if (effectiveCookiesPath) {
      ladder.push({
        id: 'tier1_user_cookies_standard',
        tier: 1,
        name: 'Configured Cookies Authentication (Standard)',
        description: `Uses user-configured cookies: ${effectiveCookiesPath}`,
        cookiesPath: effectiveCookiesPath,
        playerClient: isYouTube ? 'web,web_embedded;skip=translated_subs' : undefined,
      });

      if (isYouTube) {
        ladder.push({
          id: 'tier1_user_cookies_ios',
          tier: 1,
          name: 'Configured Cookies Authentication (iOS Client)',
          description: 'Uses user-configured cookies with iOS client protocol',
          cookiesPath: effectiveCookiesPath,
          playerClient: 'ios',
        });

        ladder.push({
          id: 'tier1_user_cookies_android',
          tier: 1,
          name: 'Configured Cookies Authentication (Android Client)',
          description: 'Uses user-configured cookies with Android client protocol',
          cookiesPath: effectiveCookiesPath,
          playerClient: 'android,web',
        });

        ladder.push({
          id: 'tier1_user_cookies_tv',
          tier: 1,
          name: 'Configured Cookies Authentication (TV Client)',
          description: 'Uses user-configured cookies with TV client protocol',
          cookiesPath: effectiveCookiesPath,
          playerClient: 'tv_embedded,tv',
        });
      }

      return ladder;
    }

    // ----------------------------------------------------
    // PRIORITY 3 (OPTIONAL): Explicit User-Selected Browser Session
    // ONLY used if the user explicitly chose a browser in settings/options.
    // Never automatically guessed or scanned.
    // ----------------------------------------------------
    if (baseOptions?.browserCookies) {
      ladder.push({
        id: 'tier0_user_browser_cookies',
        tier: 0,
        name: `User-Selected Browser Session (${baseOptions.browserCookies})`,
        description: `Uses explicit user-chosen browser: ${baseOptions.browserCookies}`,
        browserCookie: baseOptions.browserCookies,
        playerClient: isYouTube ? 'web,web_embedded;skip=translated_subs' : undefined,
      });
    }

    // ----------------------------------------------------
    // PRIORITY 2: Normal yt-dlp Extraction (Baseline)
    // No cookie file exists. Try standard player clients and mobile bypasses.
    // ----------------------------------------------------
    if (isYouTube) {
      // 2a: Standard yt-dlp Web Extraction (Baseline)
      ladder.push({
        id: 'tier2_youtube_web_embedded',
        tier: 2,
        name: 'Standard Web Extraction (yt-dlp core)',
        description: 'Default web player extraction with EJS solver',
        playerClient: 'web,web_embedded;skip=translated_subs',
      });

      // 2b: iOS Client Rotation - known to bypass bot challenges without cookies
      ladder.push({
        id: 'tier2_youtube_ios',
        tier: 2,
        name: 'YouTube iOS Client Rotation',
        description: 'Bypasses web bot detection using iOS client API',
        playerClient: 'ios',
      });

      // 2c: Android Client Rotation
      ladder.push({
        id: 'tier2_youtube_android',
        tier: 2,
        name: 'YouTube Android Client Rotation',
        description: 'Bypasses restrictions using Android client API',
        playerClient: 'android,web',
      });

      // 2d: Mobile Web Client Rotation
      ladder.push({
        id: 'tier2_youtube_mweb',
        tier: 2,
        name: 'YouTube Mobile Web Client Rotation',
        description: 'Bypasses desktop rate limiting using mweb client',
        playerClient: 'mweb',
      });

      // 2e: TV Embedded Client Rotation
      ladder.push({
        id: 'tier2_youtube_tv_embedded',
        tier: 2,
        name: 'YouTube TV Embedded Client Rotation',
        description: 'Uses lightweight Smart TV client protocol',
        playerClient: 'tv_embedded,tv',
      });

      // 2f: Web Creator Client Rotation
      ladder.push({
        id: 'tier2_youtube_web_creator',
        tier: 2,
        name: 'YouTube Web Creator Client Rotation',
        description: 'Uses Studio/Creator client API',
        playerClient: 'web_creator',
      });
    } else if (isInstagram) {
      ladder.push({
        id: 'tier2_instagram_desktop',
        tier: 2,
        name: 'Standard Instagram Desktop',
        description: 'Clean desktop headers and tracking-stripped URL',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        customHeaders: {
          Referer: 'https://www.instagram.com/',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      ladder.push({
        id: 'tier2_instagram_mobile_app',
        tier: 2,
        name: 'Instagram Mobile App Client',
        description: 'Simulates Instagram Android App client headers',
        userAgent: 'Instagram 319.0.0.38.109 Android (33/13; 420dpi; 1080x2400; Samsung; SM-G998B)',
        customHeaders: {
          'X-IG-App-ID': '936619743392459',
          Referer: 'https://www.instagram.com/',
        },
      });
    } else {
      ladder.push({
        id: 'tier2_generic',
        tier: 2,
        name: 'Standard Platform Engine',
        description: 'Default platform extraction',
      });
    }

    return ladder;
  }

  /**
   * Classifies an error into a structured failure report.
   */
  public classifyFailure(errorMessage: string, stderr?: string, isYouTubeContext?: boolean): ClassifiedFailure {
    return FailureClassifier.classify(errorMessage, stderr, isYouTubeContext);
  }

  /**
   * Determines if an error is retryable across strategies.
   */
  public isRecoverableError(errorMessage: string, stderr?: string, isYouTubeContext?: boolean): boolean {
    const classification = this.classifyFailure(errorMessage, stderr, isYouTubeContext);
    return classification.isRetryable;
  }
}

export const extractionStrategyManager = new ExtractionStrategyManager();
export { FailureClassifier };
export type { ClassifiedFailure, StrategyOutcome };
