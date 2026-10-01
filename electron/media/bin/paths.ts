import path from 'path';
import fs from 'fs';

/**
 * Helper to safely check if a file exists and is a readable file.
 */
function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Safely retrieves the Electron app path if running in an Electron environment.
 */
function getElectronApp(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const electron = require('electron');
    return electron.app || (electron.remote && electron.remote.app) || null;
  } catch {
    return null;
  }
}

/**
 * Checks if the current Electron app is running in a packaged production build.
 */
export function isPackagedApp(): boolean {
  const app = getElectronApp();
  if (app && typeof app.isPackaged === 'boolean') {
    return app.isPackaged;
  }

  // Fallback checks for packaged Electron environment
  if (process.resourcesPath && !process.resourcesPath.includes('node_modules')) {
    const resourcesBin = path.join(process.resourcesPath, 'bin');
    if (fs.existsSync(resourcesBin)) {
      return true;
    }
  }

  return process.env.NODE_ENV === 'production';
}

function getModuleDir(): string {
  if (typeof __dirname !== 'undefined') {
    return __dirname;
  }
  try {
    const { fileURLToPath } = require('url');
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    try {
      return path.dirname(new URL(import.meta.url).pathname);
    } catch {
      return process.cwd();
    }
  }
}

/**
 * Universal binary resolution algorithm with multi-tier fallback:
 * 1. Custom environment variable override (e.g. YTDLP_PATH, FFMPEG_PATH)
 * 2. Packaged Electron resources directory (resources/bin, resources/bin/win-x64, app.asar.unpacked)
 * 3. Portable/Unpacked executable relative directories
 * 4. Development workspace directories (bin/win-x64, bin, extraResources)
 * 5. System PATH fallback
 */
export function resolveBinaryPath(baseName: string): string {
  const isWin = process.platform === 'win32';
  const binName = isWin ? (baseName.endsWith('.exe') ? baseName : `${baseName}.exe`) : baseName;

  // 1. Environment variable override check (e.g. YTDLP_PATH, FFMPEG_PATH)
  const envVarKey = `${baseName.toUpperCase().replace(/[-_.]/g, '')}_PATH`;
  if (process.env[envVarKey] && fileExists(process.env[envVarKey]!)) {
    return process.env[envVarKey]!;
  }

  const app = getElectronApp();
  const appPath = app && typeof app.getAppPath === 'function' ? app.getAppPath() : null;
  const execDir = process.execPath ? path.dirname(process.execPath) : null;

  const candidatePaths: string[] = [];

  // 2. Packaged Production Locations (process.resourcesPath)
  if (process.resourcesPath) {
    candidatePaths.push(
      path.join(process.resourcesPath, 'bin', binName),
      path.join(process.resourcesPath, 'bin', 'win-x64', binName),
      path.join(process.resourcesPath, 'bin', isWin ? 'win' : process.platform, binName),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', binName),
      path.join(process.resourcesPath, 'app.asar.unpacked', 'bin', 'win-x64', binName)
    );
  }

  // 3. Executable-relative Locations (for unpacked Windows builds: <app-dir>/resources/bin/...)
  if (execDir) {
    candidatePaths.push(
      path.join(execDir, 'resources', 'bin', binName),
      path.join(execDir, 'resources', 'bin', 'win-x64', binName),
      path.join(execDir, 'bin', binName),
      path.join(execDir, 'bin', 'win-x64', binName)
    );
  }

  // 4. Development Workspace Locations
  const cwd = process.cwd();
  candidatePaths.push(
    path.join(cwd, 'bin', 'win-x64', binName),
    path.join(cwd, 'bin', binName),
    path.join(cwd, 'bin', isWin ? 'win' : process.platform, binName),
    path.join(cwd, 'extraResources', 'bin', binName),
    path.join(cwd, 'extraResources', 'bin', 'win-x64', binName)
  );

  if (appPath && appPath !== cwd) {
    candidatePaths.push(
      path.join(appPath, 'bin', 'win-x64', binName),
      path.join(appPath, 'bin', binName),
      path.join(appPath, 'extraResources', 'bin', binName)
    );
  }

  // Relative to compiled module directory (in dist-electron/...)
  const moduleDir = getModuleDir();
  candidatePaths.push(
    path.join(moduleDir, '..', '..', '..', 'bin', 'win-x64', binName),
    path.join(moduleDir, '..', '..', '..', 'bin', binName),
    path.join(moduleDir, '..', '..', 'bin', binName),
    path.join(moduleDir, '..', 'bin', binName)
  );

  // Iterate and return first matched physical executable
  for (const candidate of candidatePaths) {
    if (fileExists(candidate)) {
      return candidate;
    }
  }

  // 5. Fallback to binary invocation name on system PATH
  return binName;
}

/**
 * Resolves the path to the yt-dlp binary.
 */
export function getYtdlpBinaryPath(): string {
  return resolveBinaryPath('yt-dlp');
}

/**
 * Resolves the path to the FFmpeg binary.
 */
export function getFfmpegBinaryPath(): string {
  return resolveBinaryPath('ffmpeg');
}

/**
 * Resolves the path to the FFprobe binary.
 */
export function getFfprobeBinaryPath(): string {
  return resolveBinaryPath('ffprobe');
}

/**
 * Resolves the JavaScript runtime path (Node.js) for yt-dlp EJS challenge solving.
 * In packaged Electron apps, checks for bundled node.exe in resources/bin or uses system node.
 */
export function getJsRuntimePath(): { runtime: 'node' | 'quickjs' | 'deno'; path?: string } {
  // 1. Explicit environment variable
  if (process.env.JS_RUNTIME_PATH && fileExists(process.env.JS_RUNTIME_PATH)) {
    return { runtime: 'node', path: process.env.JS_RUNTIME_PATH };
  }

  // 2. Check for bundled node.exe in app resources / bin
  const bundledNode = resolveBinaryPath('node');
  if (bundledNode && fileExists(bundledNode)) {
    return { runtime: 'node', path: bundledNode };
  }

  // 3. Fall back to standard Node.js on PATH
  return { runtime: 'node' };
}

/**
 * Diagnostic information to assist with binary path debugging.
 */
export function getBinaryDiagnostics(): {
  isPackaged: boolean;
  resourcesPath?: string;
  execPath: string;
  cwd: string;
  ytdlp: { resolvedPath: string; exists: boolean };
  ffmpeg: { resolvedPath: string; exists: boolean };
  ffprobe: { resolvedPath: string; exists: boolean };
} {
  const ytdlp = getYtdlpBinaryPath();
  const ffmpeg = getFfmpegBinaryPath();
  const ffprobe = getFfprobeBinaryPath();

  return {
    isPackaged: isPackagedApp(),
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
    cwd: process.cwd(),
    ytdlp: { resolvedPath: ytdlp, exists: fileExists(ytdlp) },
    ffmpeg: { resolvedPath: ffmpeg, exists: fileExists(ffmpeg) },
    ffprobe: { resolvedPath: ffprobe, exists: fileExists(ffprobe) },
  };
}

