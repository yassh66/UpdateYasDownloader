import { SupportedPlatform, ExtractionOptions } from '../types';
import { browserCookieReader } from '../session/browserCookieReader';
import { sessionManager } from '../session/sessionManager';
import { NetscapeCookieExporter } from '../session/netscapeCookieExporter';
import { MediaDiagnosticsLogger } from '../diagnostics/mediaDiagnosticsLogger';
import { FailureClassifier, ClassifiedFailure, StrategyOutcome } from './failureClassifier';

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
    // TIER 1: Standard Modern Extraction (Baseline)
    // ----------------------------------------------------
    if (isYouTube) {
      ladder.push({
        id: 'tier1_youtube_web_embedded',
        tier: 1,
        name: 'Standard (Web/Web Embedded)',
        description: 'Default yt-dlp web player extraction with EJS solver',
        playerClient: 'web,web_embedded;skip=translated_subs',
        cookiesPath: baseOptions?.cookiesPath,
        browserCookie: baseOptions?.browserCookies,
      });
    } else if (isInstagram) {
      ladder.push({
        id: 'tier1_instagram_desktop',
        tier: 1,
        name: 'Standard Instagram Desktop',
        description: 'Clean desktop headers and tracking-stripped URL',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        customHeaders: {
          Referer: 'https://www.instagram.com/',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        cookiesPath: baseOptions?.cookiesPath,
        browserCookie: baseOptions?.browserCookies,
      });
    } else {
      ladder.push({
        id: 'tier1_generic',
        tier: 1,
        name: 'Standard Platform Engine',
        description: 'Default platform extraction',
        cookiesPath: baseOptions?.cookiesPath,
        browserCookie: baseOptions?.browserCookies,
      });
    }

    // ----------------------------------------------------
    // TIER 2: Platform Client Rotation / Mobile User-Agents
    // ----------------------------------------------------
    if (isYouTube) {
      // 2a: iOS Client - widely known to bypass bot checks without login
      ladder.push({
        id: 'tier2_youtube_ios',
        tier: 2,
        name: 'YouTube iOS Client Rotation',
        description: 'Bypasses web bot detection using iOS client API',
        playerClient: 'ios',
      });

      // 2b: Android Client
      ladder.push({
        id: 'tier2_youtube_android',
        tier: 2,
        name: 'YouTube Android Client Rotation',
        description: 'Bypasses restrictions using Android client API',
        playerClient: 'android,web',
      });

      // 2c: Mobile Web Client
      ladder.push({
        id: 'tier2_youtube_mweb',
        tier: 2,
        name: 'YouTube Mobile Web Client Rotation',
        description: 'Bypasses desktop rate limiting using mweb client',
        playerClient: 'mweb',
      });

      // 2d: TV Embedded Client
      ladder.push({
        id: 'tier2_youtube_tv_embedded',
        tier: 2,
        name: 'YouTube TV Embedded Client Rotation',
        description: 'Uses lightweight Smart TV client protocol',
        playerClient: 'tv_embedded,tv',
      });

      // 2e: Web Creator Client
      ladder.push({
        id: 'tier2_youtube_web_creator',
        tier: 2,
        name: 'YouTube Web Creator Client Rotation',
        description: 'Uses Studio/Creator client API',
        playerClient: 'web_creator',
      });
    } else if (isInstagram) {
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
    }

    // ----------------------------------------------------
    // TIER 3: Automatic Browser Cookies Discovery
    // ----------------------------------------------------
    const installedBrowsers = browserCookieReader.getInstalledBrowsers().filter((b) => b.isAvailable);
    const browserOrder = ['chrome', 'edge', 'firefox', 'brave', 'opera', 'vivaldi'];

    for (const bKey of browserOrder) {
      const match = installedBrowsers.find((b) => b.browser === bKey);
      if (match) {
        ladder.push({
          id: `tier3_browser_${bKey}`,
          tier: 3,
          name: `Browser Session (${match.displayName})`,
          description: `Automatically injects cookies from installed ${match.displayName}`,
          browserCookie: bKey,
          playerClient: isYouTube ? 'web,ios' : undefined,
        });
      }
    }

    // ----------------------------------------------------
    // TIER 4: Application / Session Cookies Export
    // ----------------------------------------------------
    const sessionCookieArg = sessionManager.getYtDlpCookiesFromBrowserArg(platform);
    if (sessionCookieArg && !ladder.some((s) => s.browserCookie === sessionCookieArg)) {
      ladder.push({
        id: 'tier4_configured_session',
        tier: 4,
        name: 'Application Session Profile',
        description: `Uses user configured session profile: ${sessionCookieArg}`,
        browserCookie: sessionCookieArg,
        playerClient: isYouTube ? 'web,ios' : undefined,
      });
    }

    // ----------------------------------------------------
    // TIER 5: Custom cookies.txt Auto-Detection
    // ----------------------------------------------------
    const autoDetectedCookies = NetscapeCookieExporter.findCustomCookiesFile();
    if (autoDetectedCookies && autoDetectedCookies !== baseOptions?.cookiesPath) {
      ladder.push({
        id: 'tier5_custom_cookies_file',
        tier: 5,
        name: 'Custom Netscape Cookies File',
        description: `Uses detected cookies.txt at "${autoDetectedCookies}"`,
        cookiesPath: autoDetectedCookies,
        playerClient: isYouTube ? 'web,ios' : undefined,
      });
    }

    return ladder;
  }

  /**
   * Classifies an error into a structured failure report.
   */
  public classifyFailure(errorMessage: string, stderr?: string): ClassifiedFailure {
    return FailureClassifier.classify(errorMessage, stderr);
  }

  /**
   * Determines if an error is retryable across strategies.
   */
  public isRecoverableError(errorMessage: string, stderr?: string): boolean {
    const classification = this.classifyFailure(errorMessage, stderr);
    return classification.isRetryable;
  }
}

export const extractionStrategyManager = new ExtractionStrategyManager();
export { FailureClassifier };
export type { ClassifiedFailure, StrategyOutcome };
