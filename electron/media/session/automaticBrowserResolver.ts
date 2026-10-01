import fs from 'fs';
import path from 'path';
import {
  BrowserInstallation,
  BrowserProfileInfo,
  getStandardBrowserUserDataPaths,
  SupportedBrowser,
} from './cookieProfiles';
import { MediaDiagnosticsLogger } from '../diagnostics/mediaDiagnosticsLogger';

export interface ResolvedBrowserCandidate {
  browser: SupportedBrowser;
  displayName: string;
  profileId: string;
  profileName: string;
  userDataDir: string;
  profileDir: string;
  cookieStorePath?: string;
  cookieStoreSizeBytes?: number;
  cookieStoreLastModifiedMs?: number;
  confidence: number; // 0 to 100
  reason: string;
  isDatabaseAccessible: boolean;
}

export interface BrowserResolutionResult {
  bestCandidate: ResolvedBrowserCandidate | null;
  allCandidates: ResolvedBrowserCandidate[];
  diagnosticsText: string;
}

const BROWSER_PRIORITY_ORDER: SupportedBrowser[] = [
  'brave',
  'chrome',
  'edge',
  'firefox',
  'opera',
  'vivaldi',
];

const BROWSER_DISPLAY_NAMES: Record<SupportedBrowser, string> = {
  brave: 'Brave Browser',
  chrome: 'Google Chrome',
  edge: 'Microsoft Edge',
  firefox: 'Mozilla Firefox',
  opera: 'Opera',
  vivaldi: 'Vivaldi',
};

const BROWSER_BASE_WEIGHTS: Record<SupportedBrowser, number> = {
  brave: 100,
  chrome: 90,
  edge: 80,
  firefox: 70,
  opera: 60,
  vivaldi: 50,
};

export class AutomaticBrowserResolver {
  /**
   * Resolves all usable browser sessions on the host system in prioritized order.
   * Inspects browser installation, profile existence, and presence of cookie databases.
   */
  public resolveBrowserSessions(): BrowserResolutionResult {
    const candidates: ResolvedBrowserCandidate[] = [];
    const standardPaths = getStandardBrowserUserDataPaths();
    const diagnosticsLines: string[] = [];

    diagnosticsLines.push('Detected browsers:');

    for (const browserKey of BROWSER_PRIORITY_ORDER) {
      const candidatePaths = standardPaths[browserKey] || [];
      let resolvedUserDataPath = '';
      let isInstalled = false;

      for (const p of candidatePaths) {
        try {
          if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
            resolvedUserDataPath = p;
            isInstalled = true;
            break;
          }
        } catch {}
      }

      if (!isInstalled || !resolvedUserDataPath) {
        diagnosticsLines.push(`  ${BROWSER_DISPLAY_NAMES[browserKey]}: unavailable`);
        continue;
      }

      const browserCandidates = this.inspectBrowserProfiles(browserKey, resolvedUserDataPath);

      if (browserCandidates.length > 0) {
        // Log detected profiles for diagnostics
        const summary = browserCandidates
          .map((c) => `${c.profileId} (${c.cookieStoreSizeBytes ? `${Math.round(c.cookieStoreSizeBytes / 1024)} KB` : 'no cookies'})`)
          .join(', ');
        diagnosticsLines.push(`  ${BROWSER_DISPLAY_NAMES[browserKey]}: available [${summary}]`);
        candidates.push(...browserCandidates);
      } else {
        diagnosticsLines.push(`  ${BROWSER_DISPLAY_NAMES[browserKey]}: available (no usable profiles found)`);
      }
    }

    // Sort all candidates by confidence score (descending)
    candidates.sort((a, b) => b.confidence - a.confidence);

    const bestCandidate = candidates.length > 0 ? candidates[0] : null;

    diagnosticsLines.push('');
    if (bestCandidate) {
      diagnosticsLines.push('Selected browser session:');
      diagnosticsLines.push(`  ${bestCandidate.displayName} (${bestCandidate.profileName || bestCandidate.profileId})`);
      diagnosticsLines.push('');
      diagnosticsLines.push('Reason:');
      diagnosticsLines.push(`  ${bestCandidate.reason}`);
    } else {
      diagnosticsLines.push('Selected browser session:');
      diagnosticsLines.push('  None (No authenticated browser profiles detected)');
      diagnosticsLines.push('');
      diagnosticsLines.push('Reason:');
      diagnosticsLines.push('  No supported browser user data folders with accessible cookie stores found on host system.');
    }

    const diagnosticsText = diagnosticsLines.join('\n');

    MediaDiagnosticsLogger.log(
      'EXTRACTION',
      'info',
      bestCandidate
        ? `Automatic Browser Session Resolved -> ${bestCandidate.displayName} (${bestCandidate.profileId}) with Confidence ${bestCandidate.confidence}`
        : 'Automatic Browser Session Resolution: No candidate found, proceeding to baseline strategies'
    );

    return {
      bestCandidate,
      allCandidates: candidates,
      diagnosticsText,
    };
  }

  /**
   * Returns only the yt-dlp `--cookies-from-browser` argument string for the best candidate.
   * E.g. 'brave', 'chrome:Profile 1', 'edge:Default'
   */
  public getBestCookiesFromBrowserArg(): string | undefined {
    const result = this.resolveBrowserSessions();
    if (!result.bestCandidate) return undefined;
    return this.formatCookiesFromBrowserArg(result.bestCandidate);
  }

  /**
   * Returns a list of yt-dlp `--cookies-from-browser` arguments in priority order for all detected browsers.
   */
  public getAllCookiesFromBrowserArgs(): string[] {
    const result = this.resolveBrowserSessions();
    const args: string[] = [];

    for (const cand of result.allCandidates) {
      const formatted = this.formatCookiesFromBrowserArg(cand);
      if (!args.includes(formatted)) {
        args.push(formatted);
      }
    }

    return args;
  }

  /**
   * Formats a candidate into yt-dlp's `--cookies-from-browser` syntax.
   */
  public formatCookiesFromBrowserArg(candidate: ResolvedBrowserCandidate): string {
    if (candidate.browser === 'firefox') {
      return 'firefox';
    }
    if (candidate.profileId && candidate.profileId !== 'Default') {
      return `${candidate.browser}:${candidate.profileId}`;
    }
    return candidate.browser;
  }

  /**
   * Inspects a browser User Data directory to find all profiles and score them.
   */
  private inspectBrowserProfiles(browser: SupportedBrowser, userDataPath: string): ResolvedBrowserCandidate[] {
    const results: ResolvedBrowserCandidate[] = [];

    if (browser === 'firefox') {
      return this.inspectFirefoxProfiles(userDataPath);
    }

    // Chromium-based browsers (Brave, Chrome, Edge, Opera, Vivaldi)
    try {
      const profileNamesMap = this.readChromiumLocalStateProfileNames(userDataPath);
      const profileDirs = this.discoverChromiumProfileDirs(userDataPath);

      for (const profileId of profileDirs) {
        const fullProfileDir = path.join(userDataPath, profileId);
        const displayName = profileNamesMap.get(profileId) || (profileId === 'Default' ? 'Default Profile' : profileId);

        const cookieInfo = this.findChromiumCookieStore(fullProfileDir);

        let confidence = BROWSER_BASE_WEIGHTS[browser];
        const reasons: string[] = [];

        reasons.push(`Priority ranking: ${BROWSER_DISPLAY_NAMES[browser]}`);

        if (cookieInfo.cookieStorePath) {
          confidence += 20;
          reasons.push('Active cookie store file detected');

          if (cookieInfo.sizeBytes && cookieInfo.sizeBytes > 8192) {
            confidence += 10;
            reasons.push(`Cookie database populated (${Math.round(cookieInfo.sizeBytes / 1024)} KB)`);
          }

          if (cookieInfo.lastModifiedMs) {
            const ageDays = (Date.now() - cookieInfo.lastModifiedMs) / (1000 * 60 * 60 * 24);
            if (ageDays <= 7) {
              confidence += 15;
              reasons.push('Recently active browser session (modified within 7 days)');
            } else if (ageDays <= 30) {
              confidence += 8;
              reasons.push('Active within last 30 days');
            }
          }

          if (cookieInfo.isAccessible) {
            confidence += 5;
          }
        } else {
          // No cookie database found in this profile
          confidence = Math.max(10, confidence - 30);
          reasons.push('No direct cookie database found');
        }

        if (profileId === 'Default') {
          confidence += 5;
        }

        results.push({
          browser,
          displayName: BROWSER_DISPLAY_NAMES[browser],
          profileId,
          profileName: displayName,
          userDataDir: userDataPath,
          profileDir: fullProfileDir,
          cookieStorePath: cookieInfo.cookieStorePath,
          cookieStoreSizeBytes: cookieInfo.sizeBytes,
          cookieStoreLastModifiedMs: cookieInfo.lastModifiedMs,
          confidence,
          reason: reasons.join('; '),
          isDatabaseAccessible: cookieInfo.isAccessible,
        });
      }
    } catch (err) {
      MediaDiagnosticsLogger.log('EXTRACTION', 'warn', `Error inspecting Chromium profiles for ${browser}:`, { error: String(err) });
    }

    return results;
  }

  /**
   * Inspects Firefox profile directories.
   */
  private inspectFirefoxProfiles(userDataPath: string): ResolvedBrowserCandidate[] {
    const results: ResolvedBrowserCandidate[] = [];
    const baseWeight = BROWSER_BASE_WEIGHTS['firefox'];

    try {
      if (!fs.existsSync(userDataPath)) return results;

      // Scan for profiles inside userDataPath (e.g. *.default-release, *.default)
      const entries = fs.readdirSync(userDataPath);
      for (const entry of entries) {
        const fullDir = path.join(userDataPath, entry);
        try {
          if (!fs.statSync(fullDir).isDirectory()) continue;

          const cookieSqlite = path.join(fullDir, 'cookies.sqlite');
          let hasCookieStore = false;
          let sizeBytes = 0;
          let lastModifiedMs = 0;
          let isAccessible = false;

          if (fs.existsSync(cookieSqlite)) {
            try {
              const stat = fs.statSync(cookieSqlite);
              if (stat.isFile() && stat.size > 0) {
                hasCookieStore = true;
                sizeBytes = stat.size;
                lastModifiedMs = stat.mtimeMs;
                isAccessible = true;
              }
            } catch {}
          }

          if (hasCookieStore || entry.includes('default')) {
            let confidence = baseWeight;
            const reasons: string[] = ['Firefox profile installation'];

            if (hasCookieStore) {
              confidence += 25;
              reasons.push(`cookies.sqlite verified (${Math.round(sizeBytes / 1024)} KB)`);
            }
            if (entry.includes('default-release')) {
              confidence += 15;
              reasons.push('Default release profile');
            }

            results.push({
              browser: 'firefox',
              displayName: 'Mozilla Firefox',
              profileId: entry,
              profileName: entry,
              userDataDir: userDataPath,
              profileDir: fullDir,
              cookieStorePath: hasCookieStore ? cookieSqlite : undefined,
              cookieStoreSizeBytes: sizeBytes,
              cookieStoreLastModifiedMs: lastModifiedMs,
              confidence,
              reason: reasons.join('; '),
              isDatabaseAccessible: isAccessible,
            });
          }
        } catch {}
      }
    } catch {}

    return results;
  }

  /**
   * Discovers Chromium profile directories: 'Default', 'Profile 1', 'Profile 2', etc.
   */
  private discoverChromiumProfileDirs(userDataPath: string): string[] {
    const profileDirs: string[] = [];

    try {
      const defaultPath = path.join(userDataPath, 'Default');
      if (fs.existsSync(defaultPath) && fs.statSync(defaultPath).isDirectory()) {
        profileDirs.push('Default');
      }

      const entries = fs.readdirSync(userDataPath);
      for (const entry of entries) {
        if (/^Profile \d+$/i.test(entry)) {
          const fullPath = path.join(userDataPath, entry);
          try {
            if (fs.statSync(fullPath).isDirectory()) {
              profileDirs.push(entry);
            }
          } catch {}
        }
      }

      // If no Default / Profile N folder exists (e.g. Opera root structure), check if root is the profile
      if (profileDirs.length === 0) {
        const rootCookies = path.join(userDataPath, 'Network', 'Cookies');
        const rootLegacyCookies = path.join(userDataPath, 'Cookies');
        if (fs.existsSync(rootCookies) || fs.existsSync(rootLegacyCookies)) {
          profileDirs.push('Default');
        }
      }
    } catch {}

    return profileDirs;
  }

  /**
   * Reads non-sensitive profile names from Chromium 'Local State' JSON.
   */
  private readChromiumLocalStateProfileNames(userDataPath: string): Map<string, string> {
    const map = new Map<string, string>();
    const localStatePath = path.join(userDataPath, 'Local State');

    if (!fs.existsSync(localStatePath)) return map;

    try {
      const raw = fs.readFileSync(localStatePath, 'utf8');
      const parsed = JSON.parse(raw);
      const infoCache = parsed?.profile?.info_cache;
      if (infoCache && typeof infoCache === 'object') {
        for (const [dirName, meta] of Object.entries(infoCache) as [string, any][]) {
          if (meta?.name) {
            map.set(dirName, String(meta.name));
          }
        }
      }
    } catch {}

    return map;
  }

  /**
   * Checks for cookie database file in Chromium profile folder.
   * Looks for 'Network/Cookies' (Chromium v96+) or 'Cookies'.
   */
  private findChromiumCookieStore(profileDir: string): {
    cookieStorePath?: string;
    sizeBytes?: number;
    lastModifiedMs?: number;
    isAccessible: boolean;
  } {
    const candidateFiles = [
      path.join(profileDir, 'Network', 'Cookies'),
      path.join(profileDir, 'Cookies'),
      path.join(profileDir, 'Network', 'Cookies-journal'),
    ];

    for (const cand of candidateFiles) {
      try {
        if (fs.existsSync(cand)) {
          const stat = fs.statSync(cand);
          if (stat.isFile() && stat.size > 0) {
            // Check if file is readable or locked
            let accessible = true;
            try {
              const fd = fs.openSync(cand, 'r');
              fs.closeSync(fd);
            } catch {
              accessible = false;
            }

            return {
              cookieStorePath: cand,
              sizeBytes: stat.size,
              lastModifiedMs: stat.mtimeMs,
              isAccessible: accessible,
            };
          }
        }
      } catch {}
    }

    return { isAccessible: false };
  }
}

export const automaticBrowserResolver = new AutomaticBrowserResolver();
