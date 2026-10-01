import { SupportedPlatform } from '../types';
import {
  BrowserInstallation,
  PlatformSessionConfig,
  SessionManagerConfig,
  SupportedBrowser,
} from './cookieProfiles';
import { browserCookieReader, BrowserCookieReader } from './browserCookieReader';
import {
  automaticBrowserResolver,
  AutomaticBrowserResolver,
  ResolvedBrowserCandidate,
  BrowserResolutionResult,
} from './automaticBrowserResolver';

export class SessionManager {
  private config: SessionManagerConfig = {
    globalEnabled: true, // Default to automatic browser session detection
    defaultBrowser: undefined,
    defaultProfileId: undefined,
    platformConfigs: {},
  };

  private cookieReader: BrowserCookieReader = browserCookieReader;
  private autoResolver: AutomaticBrowserResolver = automaticBrowserResolver;

  constructor(initialConfig?: Partial<SessionManagerConfig>) {
    if (initialConfig) {
      this.config = {
        ...this.config,
        ...initialConfig,
        platformConfigs: {
          ...this.config.platformConfigs,
          ...(initialConfig.platformConfigs || {}),
        },
      };
    }
  }

  /**
   * Returns current session configuration.
   */
  public getConfig(): SessionManagerConfig {
    return {
      ...this.config,
      platformConfigs: { ...this.config.platformConfigs },
    };
  }

  /**
   * Updates global session configuration.
   */
  public updateConfig(newConfig: Partial<SessionManagerConfig>): void {
    this.config = {
      ...this.config,
      ...newConfig,
      platformConfigs: {
        ...this.config.platformConfigs,
        ...(newConfig.platformConfigs || {}),
      },
    };
  }

  /**
   * Configures browser session behavior for a specific media platform.
   */
  public setPlatformSession(platform: SupportedPlatform, sessionConfig: PlatformSessionConfig): void {
    this.config.platformConfigs[platform] = { ...sessionConfig };
  }

  /**
   * Removes session configuration for a specific platform.
   */
  public removePlatformSession(platform: SupportedPlatform): void {
    delete this.config.platformConfigs[platform];
  }

  /**
   * Resolves the best candidate browser session using automatic intelligent discovery.
   */
  public resolveBestBrowserSession(): ResolvedBrowserCandidate | null {
    return this.autoResolver.resolveBrowserSessions().bestCandidate;
  }

  /**
   * Returns a complete list of valid browser session args in prioritized order.
   */
  public getPrioritizedBrowserSessions(): string[] {
    return this.autoResolver.getAllCookiesFromBrowserArgs();
  }

  /**
   * Resolves the yt-dlp `--cookies-from-browser` argument for a given platform.
   * Uses explicit user config if set; otherwise automatically selects the highest-confidence
   * installed browser session without requiring any user intervention.
   */
  public getYtDlpCookiesFromBrowserArg(platform?: SupportedPlatform): string | undefined {
    // 1. Check platform-specific explicit configuration first
    if (platform && this.config.platformConfigs[platform]) {
      const platformConfig = this.config.platformConfigs[platform]!;
      if (!platformConfig.enabled) {
        // Explicitly disabled for this platform
        return undefined;
      }
      if (platformConfig.browser && this.cookieReader.validateBrowserProfile(platformConfig.browser, platformConfig.profileId)) {
        if (platformConfig.profileId && platformConfig.profileId !== 'Default') {
          return `${platformConfig.browser}:${platformConfig.profileId}`;
        }
        return platformConfig.browser;
      }
    }

    // 2. Check explicit global default browser override if configured
    if (this.config.defaultBrowser && this.cookieReader.validateBrowserProfile(this.config.defaultBrowser, this.config.defaultProfileId)) {
      if (this.config.defaultProfileId && this.config.defaultProfileId !== 'Default') {
        return `${this.config.defaultBrowser}:${this.config.defaultProfileId}`;
      }
      return this.config.defaultBrowser;
    }

    // 3. Automatic intelligent browser resolver (Brave -> Chrome -> Edge -> Firefox -> Opera -> Vivaldi)
    if (this.config.globalEnabled) {
      return this.autoResolver.getBestCookiesFromBrowserArg();
    }

    return undefined;
  }

  /**
   * Injects `--cookies-from-browser` argument into a yt-dlp argument array if enabled.
   */
  public applySessionArgs(args: string[], platform?: SupportedPlatform): string[] {
    const sessionArg = this.getYtDlpCookiesFromBrowserArg(platform);
    if (!sessionArg) return [...args];

    const result = [...args];
    // Avoid duplicate cookies-from-browser arguments
    const existingIndex = result.indexOf('--cookies-from-browser');
    if (existingIndex !== -1) {
      result.splice(existingIndex, 2);
    }

    result.push('--cookies-from-browser', sessionArg);
    return result;
  }

  /**
   * Detects available browsers and profiles on the host system.
   */
  public detectAvailableBrowsers(): BrowserInstallation[] {
    return this.cookieReader.getInstalledBrowsers();
  }

  /**
   * Returns a diagnostic report of discovered browser sessions.
   */
  public getResolutionDiagnostics(): BrowserResolutionResult {
    return this.autoResolver.resolveBrowserSessions();
  }
}

export const sessionManager = new SessionManager();
