import { SupportedPlatform, ExtractionOptions } from '../types';
import { browserCookieReader } from '../session/browserCookieReader';
import { sessionManager } from '../session/sessionManager';
import { automaticBrowserResolver, ResolvedBrowserCandidate } from '../session/automaticBrowserResolver';
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
   * Prioritizes automatic authenticated browser sessions (Brave -> Chrome -> Edge -> Firefox -> Opera -> Vivaldi)
   * followed by baseline web extraction, client rotation (iOS/Android/TV), and custom cookies.
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
    // User Explicit Overrides (If user provided explicit cookie options)
    // ----------------------------------------------------
    if (baseOptions?.cookiesPath) {
      ladder.push({
        id: 'tier0_user_cookies_file',
        tier: 0,
        name: 'Explicit Cookies File',
        description: `Uses user provided cookies: ${baseOptions.cookiesPath}`,
        cookiesPath: baseOptions.cookiesPath,
        playerClient: isYouTube ? 'web,web_embedded' : undefined,
      });
    }

    if (baseOptions?.browserCookies) {
      ladder.push({
        id: 'tier0_user_browser_cookies',
        tier: 0,
        name: 'Explicit Browser Session',
        description: `Uses user specified browser: ${baseOptions.browserCookies}`,
        browserCookie: baseOptions.browserCookies,
        playerClient: isYouTube ? 'web,web_embedded' : undefined,
      });
    }

    // Resolve available browser candidates (Brave -> Chrome -> Edge -> Firefox -> Opera -> Vivaldi)
    const browserResolution = automaticBrowserResolver.resolveBrowserSessions();
    const candidates = browserResolution.allCandidates;

    if (isYouTube) {
      // ----------------------------------------------------
      // TIER 1: Best Authenticated Browser Session (Brave -> Chrome -> Edge -> Firefox ...)
      // ----------------------------------------------------
      if (candidates.length > 0) {
        const best = candidates[0];
        const formattedArg = automaticBrowserResolver.formatCookiesFromBrowserArg(best);
        ladder.push({
          id: `tier1_auto_browser_${best.browser}`,
          tier: 1,
          name: `Automatic Browser Session (${best.displayName})`,
          description: `Seamless authentication from ${best.displayName} (${best.profileName || best.profileId})`,
          browserCookie: formattedArg,
          playerClient: 'web,web_embedded',
        });
      }

      // ----------------------------------------------------
      // TIER 2: Secondary / Alternative Browser Sessions
      // ----------------------------------------------------
      if (candidates.length > 1) {
        const addedArgs = new Set<string>();
        if (candidates.length > 0) {
          addedArgs.add(automaticBrowserResolver.formatCookiesFromBrowserArg(candidates[0]));
        }

        for (let i = 1; i < candidates.length; i++) {
          const cand = candidates[i];
          const formattedArg = automaticBrowserResolver.formatCookiesFromBrowserArg(cand);
          if (addedArgs.has(formattedArg)) continue;
          addedArgs.add(formattedArg);

          ladder.push({
            id: `tier2_fallback_browser_${cand.browser}_${cand.profileId}`,
            tier: 2,
            name: `Alternative Browser Session (${cand.displayName})`,
            description: `Fallback authentication from ${cand.displayName} (${cand.profileName || cand.profileId})`,
            browserCookie: formattedArg,
            playerClient: 'web,web_embedded',
          });
        }
      }

      // ----------------------------------------------------
      // TIER 3: Standard yt-dlp Web Extraction (Baseline)
      // ----------------------------------------------------
      ladder.push({
        id: 'tier3_youtube_web_embedded',
        tier: 3,
        name: 'Standard Web Extraction (yt-dlp core)',
        description: 'Default web player extraction with EJS solver',
        playerClient: 'web,web_embedded;skip=translated_subs',
      });

      // ----------------------------------------------------
      // TIER 4: Client Rotation & Mobile Bypasses
      // ----------------------------------------------------
      // 4a: iOS Client - widely known to bypass bot challenges without login
      ladder.push({
        id: 'tier4_youtube_ios',
        tier: 4,
        name: 'YouTube iOS Client Rotation',
        description: 'Bypasses web bot detection using iOS client API',
        playerClient: 'ios',
      });

      // 4b: Android Client
      ladder.push({
        id: 'tier4_youtube_android',
        tier: 4,
        name: 'YouTube Android Client Rotation',
        description: 'Bypasses restrictions using Android client API',
        playerClient: 'android,web',
      });

      // 4c: Mobile Web Client
      ladder.push({
        id: 'tier4_youtube_mweb',
        tier: 4,
        name: 'YouTube Mobile Web Client Rotation',
        description: 'Bypasses desktop rate limiting using mweb client',
        playerClient: 'mweb',
      });

      // 4d: TV Embedded Client
      ladder.push({
        id: 'tier4_youtube_tv_embedded',
        tier: 4,
        name: 'YouTube TV Embedded Client Rotation',
        description: 'Uses lightweight Smart TV client protocol',
        playerClient: 'tv_embedded,tv',
      });

      // 4e: Web Creator Client
      ladder.push({
        id: 'tier4_youtube_web_creator',
        tier: 4,
        name: 'YouTube Web Creator Client Rotation',
        description: 'Uses Studio/Creator client API',
        playerClient: 'web_creator',
      });
    } else if (isInstagram) {
      // ----------------------------------------------------
      // Instagram Strategies
      // ----------------------------------------------------
      if (candidates.length > 0) {
        const best = candidates[0];
        ladder.push({
          id: `tier1_instagram_browser_${best.browser}`,
          tier: 1,
          name: `Instagram Authenticated (${best.displayName})`,
          description: `Uses authenticated session from ${best.displayName}`,
          browserCookie: automaticBrowserResolver.formatCookiesFromBrowserArg(best),
        });
      }

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
        id: 'tier3_instagram_mobile_app',
        tier: 3,
        name: 'Instagram Mobile App Client',
        description: 'Simulates Instagram Android App client headers',
        userAgent: 'Instagram 319.0.0.38.109 Android (33/13; 420dpi; 1080x2400; Samsung; SM-G998B)',
        customHeaders: {
          'X-IG-App-ID': '936619743392459',
          Referer: 'https://www.instagram.com/',
        },
      });
    } else {
      // ----------------------------------------------------
      // Generic Platform Strategies
      // ----------------------------------------------------
      if (candidates.length > 0) {
        const best = candidates[0];
        ladder.push({
          id: `tier1_generic_browser_${best.browser}`,
          tier: 1,
          name: `Platform Authenticated (${best.displayName})`,
          description: `Uses session from ${best.displayName}`,
          browserCookie: automaticBrowserResolver.formatCookiesFromBrowserArg(best),
        });
      }

      ladder.push({
        id: 'tier2_generic',
        tier: 2,
        name: 'Standard Platform Engine',
        description: 'Default platform extraction',
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
        playerClient: isYouTube ? 'web,web_embedded' : undefined,
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
