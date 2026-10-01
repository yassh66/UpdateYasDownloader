import fs from 'fs';
import path from 'path';
import os from 'os';

export interface CookieValidationResult {
  valid: boolean;
  message: string;
  cookieCount: number;
  hasYouTubeCookies: boolean;
  fileSizeBytes: number;
}

/**
 * Validates a Netscape cookies.txt file.
 * Verifies file existence, readability, size, Netscape format structure,
 * and checks whether YouTube authentication cookies are present.
 */
export function validateCookiesFile(filePath: string): CookieValidationResult {
  if (!filePath || typeof filePath !== 'string' || !filePath.trim()) {
    return {
      valid: false,
      message: 'No cookies file path provided.',
      cookieCount: 0,
      hasYouTubeCookies: false,
      fileSizeBytes: 0,
    };
  }

  const cleanPath = filePath.trim();

  try {
    if (!fs.existsSync(cleanPath)) {
      return {
        valid: false,
        message: `Cookies file does not exist at "${cleanPath}".`,
        cookieCount: 0,
        hasYouTubeCookies: false,
        fileSizeBytes: 0,
      };
    }

    const stat = fs.statSync(cleanPath);
    if (!stat.isFile()) {
      return {
        valid: false,
        message: 'The selected path is a directory, not a file.',
        cookieCount: 0,
        hasYouTubeCookies: false,
        fileSizeBytes: 0,
      };
    }

    if (stat.size === 0) {
      return {
        valid: false,
        message: 'The selected cookies file is empty (0 bytes).',
        cookieCount: 0,
        hasYouTubeCookies: false,
        fileSizeBytes: 0,
      };
    }

    const content = fs.readFileSync(cleanPath, 'utf8');
    const lines = content.split(/\r?\n/);

    let cookieCount = 0;
    let hasYouTubeCookies = false;
    let isNetscapeHeaderPresent = false;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('# Netscape HTTP Cookie File') || line.startsWith('# HTTP Cookie File')) {
        isNetscapeHeaderPresent = true;
        continue;
      }

      if (line.startsWith('#')) {
        // Comment or disabled cookie line
        continue;
      }

      // Netscape cookie line is tab-separated with 7 fields:
      // domain, flag, path, secure, expiration, name, value
      const parts = line.split('\t');
      if (parts.length >= 6) {
        cookieCount++;
        const domain = parts[0].toLowerCase();
        const cookieName = parts[5];

        if (
          domain.includes('youtube.com') ||
          domain.includes('.youtube.com') ||
          domain.includes('google.com') ||
          domain.includes('.google.com')
        ) {
          hasYouTubeCookies = true;
        }

        // Also check signature YouTube auth cookie names
        if (
          cookieName === 'LOGIN_INFO' ||
          cookieName === 'SAPISID' ||
          cookieName === 'SID' ||
          cookieName === 'HSID' ||
          cookieName === 'SSID' ||
          cookieName === '__Secure-1PSID' ||
          cookieName === '__Secure-3PSID'
        ) {
          hasYouTubeCookies = true;
        }
      }
    }

    if (cookieCount === 0) {
      return {
        valid: false,
        message: 'No valid Netscape-formatted cookie entries were found in this file.',
        cookieCount: 0,
        hasYouTubeCookies: false,
        fileSizeBytes: stat.size,
      };
    }

    let summaryMessage = `Valid Netscape cookies file with ${cookieCount} cookie${cookieCount === 1 ? '' : 's'}.`;
    if (hasYouTubeCookies) {
      summaryMessage += ' YouTube authentication cookies verified.';
    } else {
      summaryMessage += ' Notice: No specific .youtube.com cookies detected.';
    }

    return {
      valid: true,
      message: summaryMessage,
      cookieCount,
      hasYouTubeCookies,
      fileSizeBytes: stat.size,
    };
  } catch (err: any) {
    return {
      valid: false,
      message: `Failed to read cookies file: ${err.message || String(err)}`,
      cookieCount: 0,
      hasYouTubeCookies: false,
      fileSizeBytes: 0,
    };
  }
}

/**
 * Resolves the user-configured cookies.txt path from application configuration storage.
 * Reads %APPDATA%/YAS Downloader/settings.json or electron userData settings.
 */
export function getSavedCookiesSettings(userDataDir?: string): {
  enabled: boolean;
  cookiesPath?: string;
} {
  try {
    let settingsDir = userDataDir;
    if (!settingsDir) {
      try {
        const electron = (globalThis as any).electronApp || (process as any).electronApp;
        if (electron && typeof electron.getPath === 'function') {
          settingsDir = electron.getPath('userData');
        }
      } catch {}
    }

    if (!settingsDir) {
      // Fallback to standard platform config directories for both productName (YAS Downloader) and name (yas-downloader)
      const home = os.homedir();
      const possibleDirs: string[] = [];

      if (process.platform === 'win32') {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        possibleDirs.push(
          path.join(appData, 'YAS Downloader'),
          path.join(appData, 'yas-downloader')
        );
      } else if (process.platform === 'darwin') {
        const appSupport = path.join(home, 'Library', 'Application Support');
        possibleDirs.push(
          path.join(appSupport, 'YAS Downloader'),
          path.join(appSupport, 'yas-downloader')
        );
      } else {
        const configHome = process.env.XDG_CONFIG_HOME || path.join(home, '.config');
        possibleDirs.push(
          path.join(configHome, 'YAS Downloader'),
          path.join(configHome, 'yas-downloader')
        );
      }

      for (const candDir of possibleDirs) {
        if (fs.existsSync(path.join(candDir, 'settings.json'))) {
          settingsDir = candDir;
          break;
        }
      }

      if (!settingsDir) {
        settingsDir = possibleDirs[0];
      }
    }

    const settingsFilePath = path.join(settingsDir, 'settings.json');
    if (!fs.existsSync(settingsFilePath)) {
      return { enabled: false };
    }

    const raw = fs.readFileSync(settingsFilePath, 'utf8');
    const parsed = JSON.parse(raw);

    const isExplicitlyDisabled = parsed.enableCookiesAuth === false;
    const rawPath = typeof parsed.cookiesPath === 'string' ? parsed.cookiesPath.trim() : '';

    if (isExplicitlyDisabled || !rawPath) {
      return { enabled: false };
    }

    // Resolve candidates relative only to configured path or userData settings directory.
    // Strictly NO Desktop or developer paths.
    const candidatePaths = [
      rawPath,
      path.resolve(rawPath),
      path.resolve(settingsDir, rawPath),
    ];

    for (const cand of candidatePaths) {
      try {
        if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
          return {
            enabled: true,
            cookiesPath: path.isAbsolute(cand) ? cand : path.resolve(cand),
          };
        }
      } catch {}
    }

    // If absolute path was specified even if not in standard relative search
    if (path.isAbsolute(rawPath) && fs.existsSync(rawPath)) {
      return {
        enabled: true,
        cookiesPath: rawPath,
      };
    }

    return { enabled: false };
  } catch {
    return { enabled: false };
  }
}
