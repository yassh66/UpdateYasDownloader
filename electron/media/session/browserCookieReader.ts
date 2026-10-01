import fs from 'fs';
import path from 'path';
import {
  BrowserInstallation,
  BrowserProfileInfo,
  getStandardBrowserUserDataPaths,
  SupportedBrowser,
} from './cookieProfiles';

const BROWSER_DISPLAY_NAMES: Record<SupportedBrowser, string> = {
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  brave: 'Brave Browser',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
};

export class BrowserCookieReader {
  /**
   * Safely checks installed browsers on the host system without reading or decrypting cookie files.
   */
  public getInstalledBrowsers(): BrowserInstallation[] {
    const standardPaths = getStandardBrowserUserDataPaths();
    const result: BrowserInstallation[] = [];

    for (const [browserKey, candidatePaths] of Object.entries(standardPaths) as [SupportedBrowser, string[]][]) {
      let resolvedUserDataPath = '';
      let isFound = false;

      for (const candidate of candidatePaths) {
        try {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
            resolvedUserDataPath = candidate;
            isFound = true;
            break;
          }
        } catch {}
      }

      const profiles = isFound ? this.scanBrowserProfiles(browserKey, resolvedUserDataPath) : [];

      result.push({
        browser: browserKey,
        displayName: BROWSER_DISPLAY_NAMES[browserKey],
        isAvailable: isFound,
        userDataPath: resolvedUserDataPath,
        profiles,
      });
    }

    return result;
  }

  /**
   * Scans profile folders (e.g. 'Default', 'Profile 1', 'Profile 2') within a browser's User Data directory.
   * Strictly reads folder existence and optional non-sensitive profile names from 'Local State'.
   */
  public scanBrowserProfiles(browser: SupportedBrowser, userDataPath: string): BrowserProfileInfo[] {
    const profiles: BrowserProfileInfo[] = [];

    if (!userDataPath) return profiles;

    try {
      if (!fs.existsSync(userDataPath)) return profiles;

      // Check for Default profile
      const defaultPath = path.join(userDataPath, 'Default');
      if (fs.existsSync(defaultPath) && fs.statSync(defaultPath).isDirectory()) {
        profiles.push({
          id: 'Default',
          name: 'Default Profile',
          browser,
          userDataDir: userDataPath,
        });
      }

      // Try reading non-sensitive profile names cache from 'Local State' if available
      const profileNamesMap = new Map<string, string>();
      const localStatePath = path.join(userDataPath, 'Local State');
      if (fs.existsSync(localStatePath)) {
        try {
          const raw = fs.readFileSync(localStatePath, 'utf8');
          const parsed = JSON.parse(raw);
          const infoCache = parsed?.profile?.info_cache;
          if (infoCache && typeof infoCache === 'object') {
            for (const [profileDir, profileMeta] of Object.entries(infoCache) as [string, any][]) {
              if (profileMeta?.name) {
                profileNamesMap.set(profileDir, String(profileMeta.name));
              }
            }
          }
        } catch {}
      }

      // Update default profile name if custom name found
      if (profiles.length > 0 && profileNamesMap.has('Default')) {
        profiles[0].name = profileNamesMap.get('Default')!;
      }

      // Scan for other profiles: Profile 1, Profile 2, etc.
      const entries = fs.readdirSync(userDataPath);
      for (const entry of entries) {
        if (/^Profile \d+$/i.test(entry)) {
          const fullPath = path.join(userDataPath, entry);
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              const displayName = profileNamesMap.get(entry) || entry;
              profiles.push({
                id: entry,
                name: displayName,
                browser,
                userDataDir: userDataPath,
              });
            }
          } catch {}
        }
      }
    } catch {}

    // Fallback if no specific subfolder detected but User Data exists
    if (profiles.length === 0 && userDataPath) {
      profiles.push({
        id: 'Default',
        name: 'Default Profile',
        browser,
        userDataDir: userDataPath,
      });
    }

    return profiles;
  }

  /**
   * Validates whether a specific browser and profile configuration exists.
   */
  public validateBrowserProfile(browser: SupportedBrowser, profileId?: string): boolean {
    const browsers = this.getInstalledBrowsers();
    const match = browsers.find((b) => b.browser === browser && b.isAvailable);
    if (!match) return false;
    if (!profileId || profileId === 'Default') return true;
    return match.profiles.some((p) => p.id === profileId);
  }
}

export const browserCookieReader = new BrowserCookieReader();
