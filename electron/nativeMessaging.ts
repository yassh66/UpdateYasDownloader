import * as net from 'net';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { app } from 'electron';
import type { DownloadManager } from './downloadManager';
import { createDownloadDialog } from './downloadDialog';

const PIPE_NAME = 'yas-downloader-ipc';
const PIPE_PATH = process.platform === 'win32' 
  ? `\\\\.\\pipe\\${PIPE_NAME}` 
  : path.join(require('os').tmpdir(), `${PIPE_NAME}.sock`);

let debugLogPath: string | null = null;
function logDebug(msg: string) {
  try {
    if (!debugLogPath) {
      debugLogPath = path.join(app.getPath('userData'), 'native-messaging-debug.log');
    }
    fs.appendFileSync(debugLogPath, `[${new Date().toISOString()}] ${msg}\n`);
  } catch (e) {
    try {
      const fallback = path.join(process.env.APPDATA || process.cwd(), 'yas-downloader', 'native-messaging-debug.log');
      fs.mkdirSync(path.dirname(fallback), { recursive: true });
      fs.appendFileSync(fallback, `[${new Date().toISOString()}] ${msg}\n`);
    } catch (err) {}
  }
}

export function setupPrimaryIPCServer(downloadManager: DownloadManager) {
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      try {
        const msg = JSON.parse(buffer);
        buffer = ''; // reset buffer after successful parse
        
        logDebug(`Received message from Named Pipe: ${msg.action} for ${msg.url} (requestId: ${msg.requestId || 'auto'})`);
        
        if (msg.action === 'intercept-download' && msg.url) {
          const settings = downloadManager.getSettings();
          if (settings.autoIntercept === false) {
            logDebug(`Ignoring intercepted download because autoIntercept is false`);
            return;
          }

          // Directly create the independent Download Dialog BrowserWindow in Main Process
          createDownloadDialog({
            requestId: msg.requestId,
            url: msg.url,
            finalUrl: msg.finalUrl,
            filename: msg.filename,
            fileSize: msg.fileSize,
            mime: msg.mime,
            referrer: msg.referrer,
            cookies: msg.cookies,
            userAgent: msg.userAgent
          }, downloadManager);

        } else if (msg.action === 'start-download' && msg.url) {
          downloadManager.startDownload({
            url: msg.url,
            filename: msg.filename,
            totalBytes: msg.fileSize,
            cookies: msg.cookies,
            referrer: msg.referrer,
            userAgent: msg.userAgent,
            startNow: true
          });
        }
      } catch (e) {
        // May be incomplete JSON, wait for more data
      }
    });
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error('Pipe already in use. Is another instance running?');
    }
  });

  if (process.platform !== 'win32') {
    if (fs.existsSync(PIPE_PATH)) {
      try { fs.unlinkSync(PIPE_PATH); } catch (e) {}
    }
  }

  try {
    server.listen(PIPE_PATH, () => {
      console.log(`Primary IPC server listening on ${PIPE_PATH}`);
    });
  } catch (e) {
    console.error('Failed to start IPC server:', e);
  }

  app.on('before-quit', () => {
    server.close();
    if (process.platform !== 'win32') {
      if (fs.existsSync(PIPE_PATH)) {
        try { fs.unlinkSync(PIPE_PATH); } catch (e) {}
      }
    }
  });
}

export function getNativeMessagingHostExecutablePath(): string {
  const isPackaged = app.isPackaged;
  console.log(`[NativeMessaging] ==========================================`);
  console.log(`[NativeMessaging] Environment: ${isPackaged ? 'PRODUCTION (Packaged)' : 'DEVELOPMENT (Unpackaged)'}`);
  console.log(`[NativeMessaging] app.isPackaged: ${isPackaged}`);
  console.log(`[NativeMessaging] app.getAppPath(): ${app.getAppPath()}`);
  console.log(`[NativeMessaging] process.execPath: ${process.execPath}`);
  console.log(`[NativeMessaging] __dirname: ${__dirname}`);

  if (process.platform === 'win32') {
    if (isPackaged) {
      // In Production (Packaged Application):
      // yas-nm-host.exe is packaged alongside the main application executable (e.g. C:\Program Files\YAS Downloader\yas-nm-host.exe)
      // or inside the app installation directory / resources directory.
      const prodCandidates = [
        path.join(path.dirname(process.execPath), 'yas-nm-host.exe'),
        path.join(process.resourcesPath, '..', 'yas-nm-host.exe'),
        path.join(process.resourcesPath, 'yas-nm-host.exe'),
        path.join(app.getAppPath(), '..', 'yas-nm-host.exe')
      ];

      for (const candidate of prodCandidates) {
        if (fs.existsSync(candidate)) {
          console.log(`[NativeMessaging] Found production host executable at: ${candidate}`);
          return candidate;
        }
      }

      // Default production path relative to the app's main executable
      const defaultProdPath = path.join(path.dirname(process.execPath), 'yas-nm-host.exe');
      console.log(`[NativeMessaging] Defaulting to production host path: ${defaultProdPath}`);
      return defaultProdPath;
    } else {
      // In Development:
      // process.execPath points to node_modules/electron/dist/electron.exe.
      // WE MUST NEVER USE node_modules/electron/dist as the host path!
      // Instead, resolve relative to the project root or current dist-electron folder.
      const appRoot = app.getAppPath(); // Points to project root in dev mode
      const cwd = process.cwd();
      const currentDir = __dirname; // Points to dist-electron when running compiled main.cjs

      const devCandidates = [
        path.join(appRoot, 'dist-electron', 'yas-nm-host.exe'),
        path.join(currentDir, 'yas-nm-host.exe'),
        path.join(cwd, 'dist-electron', 'yas-nm-host.exe'),
        path.resolve(currentDir, '..', 'dist-electron', 'yas-nm-host.exe')
      ];

      for (const candidate of devCandidates) {
        if (fs.existsSync(candidate)) {
          console.log(`[NativeMessaging] Found development host executable at: ${candidate}`);
          return candidate;
        }
      }

      // Default development path: <project_root>/dist-electron/yas-nm-host.exe
      const defaultDevPath = path.join(appRoot, 'dist-electron', 'yas-nm-host.exe');
      console.log(`[NativeMessaging] Defaulting to development host path: ${defaultDevPath}`);
      return defaultDevPath;
    }
  } else {
    // macOS / Linux wrapper script
    const shPath = path.join(app.getPath('userData'), 'yas-nm-host.sh');
    const nmHostScript = isPackaged
      ? path.join(process.resourcesPath, 'app.asar', 'dist-electron', 'nm-host.cjs')
      : path.join(app.getAppPath(), 'dist-electron', 'nm-host.cjs');
    
    const nodeOrElectron = process.execPath;
    const shContent = `#!/bin/bash\nexport ELECTRON_RUN_AS_NODE=1\n"${nodeOrElectron}" "${nmHostScript}" "$@"`;
    try {
      fs.writeFileSync(shPath, shContent, 'utf8');
      fs.chmodSync(shPath, '755');
    } catch (e) {
      console.error(`[NativeMessaging] Failed to write shell script wrapper:`, e);
    }
    return shPath;
  }
}

export function installBrowserIntegration(extensionId?: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    try {
      const manifestPath = path.join(app.getPath('userData'), 'com.yas.downloader.json');
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });

      const executablePathForManifest = getNativeMessagingHostExecutablePath();

      // Collect allowed origins (support current ID, existing IDs, and defaults)
      const allowedOriginsSet = new Set<string>();

      // Preserve existing allowed origins from manifest if present
      if (fs.existsSync(manifestPath)) {
        try {
          const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          if (Array.isArray(existing.allowed_origins)) {
            existing.allowed_origins.forEach((origin: string) => {
              if (typeof origin === 'string' && origin.trim()) {
                allowedOriginsSet.add(origin.trim());
              }
            });
          }
        } catch (e) {}
      }

      // Add passed extension ID
      if (extensionId && extensionId.trim()) {
        const cleanId = extensionId.trim().replace(/^chrome-extension:\/\//, '').replace(/\/+$/, '');
        if (cleanId) {
          allowedOriginsSet.add(`chrome-extension://${cleanId}/`);
        }
      }

      // Fallback default origin if empty
      if (allowedOriginsSet.size === 0) {
        allowedOriginsSet.add(`chrome-extension://fjfdkbacppapclmffmbfpaimlegjgldc/`);
      }

      const manifest = {
        name: "com.yas.downloader",
        description: "YAS Downloader Integration",
        path: executablePathForManifest,
        type: "stdio",
        allowed_origins: Array.from(allowedOriginsSet)
      };

      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      console.log(`[NativeMessaging] ==========================================`);
      console.log(`[NativeMessaging] Generated Manifest Path: ${manifestPath}`);
      console.log(`[NativeMessaging] Final Host Executable Path: ${executablePathForManifest}`);
      console.log(`[NativeMessaging] Allowed Origins:`, manifest.allowed_origins);
      console.log(`[NativeMessaging] Manifest Payload:\n${JSON.stringify(manifest, null, 2)}`);

      if (process.platform === 'win32') {
        const regEntries = [
          { browser: 'Brave', key: 'HKCU\\Software\\BraveSoftware\\Brave-Browser\\NativeMessagingHosts\\com.yas.downloader' },
          { browser: 'Chrome', key: 'HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.yas.downloader' },
          { browser: 'Edge', key: 'HKCU\\Software\\Microsoft\\Edge\\NativeMessagingHosts\\com.yas.downloader' },
          { browser: 'Chromium', key: 'HKCU\\Software\\Chromium\\NativeMessagingHosts\\com.yas.downloader' }
        ];

        let pending = regEntries.length;
        let anySuccess = false;

        regEntries.forEach(({ browser, key }) => {
          const cmd = `REG ADD "${key}" /ve /t REG_SZ /d "${manifestPath}" /f`;
          child_process.exec(cmd, (err) => {
            if (err) {
              console.error(`[NativeMessaging] Registry registration for ${browser} failed:`, err.message);
            } else {
              console.log(`[NativeMessaging] Registry registration for ${browser} succeeded (${key})`);
              anySuccess = true;
            }
            pending--;
            if (pending === 0) {
              console.log(`[NativeMessaging] Registry operations complete. Result: ${anySuccess ? 'SUCCESS' : 'FAILED'}`);
              console.log(`[NativeMessaging] ==========================================`);
              resolve(true);
            }
          });
        });
      } else {
        console.log(`[NativeMessaging] Manifest generated for non-win32 platform.`);
        console.log(`[NativeMessaging] ==========================================`);
        resolve(true);
      }
    } catch (e: any) {
      console.error(`[NativeMessaging] Error during installBrowserIntegration:`, e);
      reject(e);
    }
  });
}
