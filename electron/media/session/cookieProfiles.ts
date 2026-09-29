import path from 'path';
import os from 'os';
import { SupportedPlatform } from '../types';

export type SupportedBrowser = 'chrome' | 'edge' | 'brave';

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
 * Resolves standard User Data directories across OS platforms for supported Chromium browsers.
 * Does NOT read or access cookie stores or credential databases.
 */
export function getStandardBrowserUserDataPaths(): Record<SupportedBrowser, string[]> {
  const homeDir = os.homedir();
  const platform = process.platform;

  if (platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    return {
      chrome: [path.join(localAppData, 'Google', 'Chrome', 'User Data')],
      edge: [path.join(localAppData, 'Microsoft', 'Edge', 'User Data')],
      brave: [path.join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')],
    };
  }

  if (platform === 'darwin') {
    const appSupport = path.join(homeDir, 'Library', 'Application Support');
    return {
      chrome: [path.join(appSupport, 'Google', 'Chrome')],
      edge: [path.join(appSupport, 'Microsoft Edge')],
      brave: [path.join(appSupport, 'BraveSoftware', 'Brave-Browser')],
    };
  }

  // Linux and default POSIX
  const configDir = process.env.XDG_CONFIG_HOME || path.join(homeDir, '.config');
  return {
    chrome: [path.join(configDir, 'google-chrome'), path.join(configDir, 'chromium')],
    edge: [path.join(configDir, 'microsoft-edge')],
    brave: [path.join(configDir, 'BraveSoftware', 'Brave-Browser')],
  };
}
