import { SupportedPlatform } from '../types';
import {
  BrowserInstallation,
  PlatformSessionConfig,
  SessionManagerConfig,
  SupportedBrowser,
} from './cookieProfiles';
import { browserCookieReader, BrowserCookieReader } from './browserCookieReader';

export class SessionManager {
  private config: SessionManagerConfig = {
    globalEnabled: false,
    defaultBrowser: undefined,
    defaultProfileId: undefined,
    platformConfigs: {},
  };

  private cookieReader: BrowserCookieReader = browserCookieReader;

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
   * Resolves the yt-dlp `--cookies-from-browser` argument for a given platform.
   * Returns undefined if sessions are disabled or unavailable.
   *
   * Example return values:
   *  - 'chrome'
   *  - 'chrome:Profile 1'
   *  - 'edge:Default'
   *  - 'brave'
   */
  public getYtDlpCookiesFromBrowserArg(platform?: SupportedPlatform): string | undefined {
    let browser: SupportedBrowser | undefined;
    let profileId: string | undefined;

    // Check platform-specific configuration first
    if (platform && this.config.platformConfigs[platform]) {
      const platformConfig = this.config.platformConfigs[platform]!;
      if (platformConfig.enabled) {
        browser = platformConfig.browser;
        profileId = platformConfig.profileId;
      } else {
        // Explicitly disabled for this platform
        return undefined;
      }
    } else if (this.config.globalEnabled && this.config.defaultBrowser) {
      // Fallback to global setting if enabled
      browser = this.config.defaultBrowser;
      profileId = this.config.defaultProfileId;
    }

    if (!browser) return undefined;

    // Validate that browser is installed on host
    if (!this.cookieReader.validateBrowserProfile(browser, profileId)) {
      return undefined;
    }

    if (profileId && profileId !== 'Default') {
      return `${browser}:${profileId}`;
    }

    return browser;
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
}

export const sessionManager = new SessionManager();
