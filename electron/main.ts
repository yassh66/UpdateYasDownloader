import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { DownloadManager } from './downloadManager';

export function getAppIconPath(): string | undefined {
  const iconCandidates = [
    path.join(__dirname, '../build/icon.ico'),
    path.join(__dirname, '../build/icon.png'),
    path.join(__dirname, '../dist/icon.ico'),
    path.join(__dirname, '../dist/icon.png'),
    path.join(process.cwd(), 'build/icon.ico'),
    path.join(process.cwd(), 'build/icon.png'),
  ];
  for (const candidate of iconCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}
import { setupPrimaryIPCServer, installBrowserIntegration } from './nativeMessaging';
import { 
  createDownloadDialog, 
  getSanitizedDialogData, 
  handleDialogAction, 
  handleStartDownloadFromDialog,
  handleScheduleDownloadFromDialog,
  showFolderPicker 
} from './downloadDialog';
import type { DownloadDialogResult } from '../src/types';
import { setupMediaIPC } from './media/mediaIpcHandler';

let downloadManager: DownloadManager | null = null;
let mainWindow: BrowserWindow | null = null;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus main window if open
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  function createMainWindow() {
    const currentSettings = downloadManager?.getSettings();
    const currentTheme = currentSettings?.theme || 'dark';

    const appIcon = getAppIconPath();

    mainWindow = new BrowserWindow({
      width: 1024,
      height: 768,
      minWidth: 800,
      minHeight: 600,
      frame: false,
      titleBarStyle: 'hidden',
      backgroundColor: currentTheme === 'light' ? '#F8FAFC' : '#07070E',
      icon: appIcon,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
      },
      title: 'YAS Downloader',
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';
    if (isDev) {
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000');
    } else {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
  }

  function setupIPC() {
    if (!downloadManager) return;

    // Test IPC Communication
    ipcMain.handle('ping', () => 'pong from Electron Main Process!');
    
    // Window Controls
    ipcMain.handle('minimize-window', (event) => {
      try {
        const win = (!event.sender.isDestroyed() ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
        if (win && !win.isDestroyed()) {
          win.minimize();
        }
      } catch (e) {}
    });
    
    ipcMain.handle('maximize-window', (event) => {
      try {
        const win = (!event.sender.isDestroyed() ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
        if (win && !win.isDestroyed()) {
          if (win.isMaximized()) {
            win.unmaximize();
          } else {
            win.maximize();
          }
        }
      } catch (e) {}
    });
    
    ipcMain.handle('close-window', (event) => {
      try {
        const win = (!event.sender.isDestroyed() ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
        if (win && !win.isDestroyed()) {
          win.close();
        }
      } catch (e) {}
    });
    
    // Broadcast functions
    const broadcastTheme = (theme: 'dark' | 'light') => {
      const bgColor = theme === 'light' ? '#F8FAFC' : '#07070E';
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed()) {
            win.setBackgroundColor(bgColor);
            if (win.webContents && !win.webContents.isDestroyed()) {
              win.webContents.send('theme-changed', theme);
            }
          }
        } catch (e) {}
      }
    };

    const broadcastLanguage = (language: 'en' | 'fa') => {
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send('language-changed', language);
          }
        } catch (e) {}
      }
    };

    // Theme IPC
    ipcMain.handle('get-theme', () => downloadManager?.getSettings().theme || 'dark');
    ipcMain.handle('set-theme', (_event, theme: 'dark' | 'light') => {
      if (downloadManager) {
        downloadManager.updateSettings({ theme });
      }
      broadcastTheme(theme);
    });

    // Language IPC
    ipcMain.handle('get-language', () => downloadManager?.getSettings().language || 'en');
    ipcMain.handle('set-language', (_event, language: 'en' | 'fa') => {
      if (downloadManager) {
        downloadManager.updateSettings({ language });
      }
      broadcastLanguage(language);
    });

    // Browser Integration IPC
    ipcMain.handle('install-browser-integration', (_event, extId: string) => installBrowserIntegration(extId));
    
    // Download Engine IPC
    ipcMain.handle('start-download', (_event, options: any) => downloadManager?.startDownload(options));
    ipcMain.handle('schedule-download', (_event, url: string, time: number) => downloadManager?.scheduleDownload(url, time));
    ipcMain.handle('pause-download', (_event, id: string) => downloadManager?.pauseDownload(id));
    ipcMain.handle('resume-download', (_event, id: string) => downloadManager?.resumeDownload(id));
    ipcMain.handle('cancel-download', (_event, id: string) => downloadManager?.cancelDownload(id));
    ipcMain.handle('remove-download', (_event, id: string) => downloadManager?.removeDownload(id));
    ipcMain.handle('clear-downloads', (_event) => downloadManager?.clearAllDownloads());
    ipcMain.handle('open-file', (_event, id: string) => downloadManager?.openFile(id));
    ipcMain.handle('open-folder', (_event, id: string) => downloadManager?.openFolder(id));
    ipcMain.handle('retry-download', (_event, id: string) => downloadManager?.retryDownload(id));
    ipcMain.handle('get-downloads', (_event) => downloadManager?.getDownloads() || []);
    ipcMain.handle('get-settings', (_event) => downloadManager?.getSettings());
    ipcMain.handle('update-settings', (_event, settings: any) => {
      downloadManager?.updateSettings(settings);
      if (settings.theme) {
        broadcastTheme(settings.theme);
      }
      if (settings.language) {
        broadcastLanguage(settings.language);
      }
    });
    
    // Main Window Folder Picker
    ipcMain.handle('select-folder', async (event) => {
      const win = (!event.sender.isDestroyed() ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
      return showFolderPicker(win);
    });

    // Native File Picker for Cookies and Text Files
    ipcMain.handle('select-file', async (event, filterName?: string, extensions?: string[]) => {
      const win = (!event.sender.isDestroyed() ? BrowserWindow.fromWebContents(event.sender) : null) || mainWindow;
      const targetWin = (win && !win.isDestroyed()) ? win : undefined;
      const filters = (extensions && extensions.length > 0)
        ? [{ name: filterName || 'Text Files (*.txt)', extensions: extensions.map(e => e.replace(/^\./, '')) }]
        : [{ name: 'Text Files (*.txt)', extensions: ['txt'] }, { name: 'All Files (*.*)', extensions: ['*'] }];

      const result = targetWin
        ? await dialog.showOpenDialog(targetWin, {
            properties: ['openFile'],
            filters,
          })
        : await dialog.showOpenDialog({
            properties: ['openFile'],
            filters,
          });

      if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
        return null;
      }
      return result.filePaths[0];
    });

    // Validate cookies.txt Netscape format and YouTube session
    ipcMain.handle('validate-cookies', async (_event, filePath: string) => {
      const { validateCookiesFile } = await import('./media/session/cookieValidator');
      return validateCookiesFile(filePath);
    });

    // Open Manual Download Dialog
    ipcMain.handle('open-download-dialog', (_event, options: any) => {
      if (downloadManager) {
        createDownloadDialog(options || {}, downloadManager);
      }
    });

    // ==========================================
    // Standalone Download Dialog IPC Handlers
    // ==========================================
    ipcMain.handle('dialog-get-data', (event, explicitRequestId?: string) => {
      if (!downloadManager || event.sender.isDestroyed()) return null;
      return getSanitizedDialogData(event.sender.id, downloadManager, explicitRequestId);
    });

    ipcMain.handle('dialog-get-download', (_event, id: string) => {
      if (!downloadManager) return null;
      return downloadManager.getDownload(id) || null;
    });

    ipcMain.handle('dialog-start-download', async (_event, options: any) => {
      if (!downloadManager) return { success: false, error: 'Download Manager not initialized' };
      return handleStartDownloadFromDialog(options, downloadManager);
    });

    ipcMain.handle('dialog-schedule-download', async (_event, options: any) => {
      if (!downloadManager) return { success: false, error: 'Download Manager not initialized' };
      return handleScheduleDownloadFromDialog(options, downloadManager);
    });

    ipcMain.handle('dialog-action', async (_event, result: DownloadDialogResult) => {
      if (!downloadManager) return { success: false, error: 'Download Manager not initialized' };
      return handleDialogAction(result, downloadManager);
    });

    ipcMain.handle('dialog-select-folder', async (event) => {
      if (event.sender.isDestroyed()) return null;
      const win = BrowserWindow.fromWebContents(event.sender);
      return showFolderPicker(win);
    });

    ipcMain.handle('dialog-close', (event) => {
      if (event.sender.isDestroyed()) return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.close();
      }
    });

    ipcMain.handle('dialog-minimize', (event) => {
      if (event.sender.isDestroyed()) return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        win.minimize();
      }
    });

    ipcMain.handle('dialog-maximize', (event) => {
      if (event.sender.isDestroyed()) return;
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        if (win.isMaximized()) {
          win.unmaximize();
        } else {
          win.maximize();
        }
      }
    });

    // Media Engine IPC Handlers
    setupMediaIPC();
  }

  app.whenReady().then(async () => {
    downloadManager = new DownloadManager();
    setupIPC();
    setupPrimaryIPCServer(downloadManager);
    
    // Automatically register and sync Native Messaging manifest with the correct executable path
    try {
      const currentSettings = downloadManager.getSettings();
      await installBrowserIntegration(currentSettings?.extensionId);
      console.log('[NativeMessaging] Auto-sync of manifest completed on startup.');
    } catch (nmErr) {
      console.error('[NativeMessaging] Auto-sync on startup encountered an issue:', nmErr);
    }

    createMainWindow();
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
}
