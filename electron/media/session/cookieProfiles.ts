import path from 'path';
import os from 'os';
import { SupportedPlatform } from '../types';

export type SupportedBrowser = 'chrome' | 'edge' | 'firefox' | 'brave' | 'opera' | 'vivaldi';

export interface BrowserProfileInfo {
  id: string; // e.g. 'Default', 'Profile 1'
  name: string; // User-friendly name e.g. 'Default', 'Work'
  browser: SupportedBrowser;
  userDataDir: string;
}

export interface BrowserInstallation {
  browser: SupportedBrowser;
  displayName: string;
  isAvailable: boolean;
  userDataPath: string;
  profiles: BrowserProfileInfo[];
}

export interface PlatformSessionConfig {
  enabled: boolean;
  browser: SupportedBrowser;
  profileId?: string; // e.g. 'Default', 'Profile 1'
}

export interface SessionManagerConfig {
  globalEnabled: boolean;
  defaultBrowser?: SupportedBrowser;
  defaultProfileId?: string;
  platformConfigs: Partial<Record<SupportedPlatform, PlatformSessionConfig>>;
}

/**
 * Resolves standard User Data directories across OS platforms for supported browsers.
 * Does NOT read or access cookie stores or credential databases.
 */
export function getStandardBrowserUserDataPaths(): Record<SupportedBrowser, string[]> {
  const homeDir = os.homedir();
  const platform = process.platform;

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    const appData = process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming');
    return {
      chrome: [path.join(localAppData, 'Google', 'Chrome', 'User Data')],
      edge: [path.join(localAppData, 'Microsoft', 'Edge', 'User Data')],
      firefox: [path.join(appData, 'Mozilla', 'Firefox', 'Profiles'), path.join(appData, 'Mozilla', 'Firefox')],
      brave: [path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')],
      opera: [path.join(appData, 'Opera Software', 'Opera Stable'), path.join(localAppData, 'Programs', 'Opera')],
      vivaldi: [path.join(localAppData, 'Vivaldi', 'User Data')],
    };
  }

  if (platform === 'darwin') {
    const appSupport = path.join(homeDir, 'Library', 'Application Support');
    return {
      chrome: [path.join(appSupport, 'Google', 'Chrome')],
      edge: [path.join(appSupport, 'Microsoft Edge')],
      firefox: [path.join(appSupport, 'Firefox', 'Profiles'), path.join(appSupport, 'Firefox')],
      brave: [path.join(appSupport, 'BraveSoftware', 'Brave-Browser')],
      opera: [path.join(appSupport, 'com.operasoftware.Opera')],
      vivaldi: [path.join(appSupport, 'Vivaldi')],
    };
  }

  // Linux and default POSIX
  const configDir = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
  return {
    chrome: [path.join(configDir, 'google-chrome'), path.join(configDir, 'chromium')],
    edge: [path.join(configDir, 'microsoft-edge')],
    firefox: [path.join(homeDir, '.mozilla', 'firefox')],
    brave: [path.join(configDir, 'BraveSoftware', 'Brave-Browser')],
    opera: [path.join(configDir, 'opera')],
    vivaldi: [path.join(configDir, 'vivaldi')],
  };
}
