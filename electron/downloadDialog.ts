import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

function getAppIconPath(): string | undefined {
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
import type { DownloadManager } from './downloadManager';
import type { 
  PendingDownloadRequest, 
  DownloadDialogData, 
  DownloadDialogResult 
} from '../src/types';

// Map of pending download requests holding full authenticated context in main process memory
const pendingRequests = new Map<string, PendingDownloadRequest>();

// Map of active dialog windows by requestId
const activeDialogWindows = new Map<string, BrowserWindow>();

// Reverse lookup: webContents ID -> requestId
const webContentsToRequestId = new Map<number, string>();

// Clean up stale unconfirmed requests after 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, req] of pendingRequests.entries()) {
    if (now - req.timestamp > 15 * 60 * 1000) {
      pendingRequests.delete(id);
    }
  }
}, 60 * 1000);

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Sanitizes and cleans a suggested filename for Windows and cross-platform filesystems
 */
export function sanitizeFilename(filename?: string, url?: string): string {
  let name = (filename || '').trim();

  if (!name && url) {
    try {
      const parsed = new URL(url);
      const basename = path.basename(parsed.pathname);
      if (basename && basename !== '/') {
        name = decodeURIComponent(basename);
      }
    } catch (e) {}
  }

  if (!name) {
    name = 'downloaded_file';
  }

  // Prevent path traversal: extract pure basename
  name = path.basename(name);

  // Remove invalid characters for Windows filenames: < > : " / \ | ? *
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  
  // Strip leading dots/spaces and trailing periods/spaces
  name = name.replace(/^[. ]+/, '').replace(/[. ]+$/, '');

  // Guard against Windows reserved device names (CON, NUL, AUX, PRN, COM1-9, LPT1-9)
  if (WINDOWS_RESERVED_NAMES.test(name)) {
    name = `_${name}`;
  }

  // Bound maximum filename length to 240 characters to prevent OS path buffer overflow
  if (name.length > 240) {
    const ext = path.extname(name);
    const base = path.basename(name, ext).substring(0, 240 - ext.length);
    name = `${base}${ext}`;
  }

  return name || 'downloaded_file';
}

/**
 * Registers an intercepted or manual download request and stores secure context in memory
 */
export function registerDownloadRequest(request: Partial<PendingDownloadRequest>): string {
  const requestId = request.requestId || crypto.randomUUID();
  const filename = sanitizeFilename(request.filename, request.url);

  const pending: PendingDownloadRequest = {
    requestId,
    url: request.url || '',
    finalUrl: request.finalUrl || request.url || '',
    filename,
    fileSize: request.fileSize && request.fileSize > 0 ? request.fileSize : 0,
    mime: request.mime || '',
    referrer: request.referrer || '',
    cookies: request.cookies || '',
    userAgent: request.userAgent || '',
    timestamp: Date.now()
  };

  pendingRequests.set(requestId, pending);
  return requestId;
}

/**
 * Creates an independent Download Dialog BrowserWindow for a given download request
 */
export function createDownloadDialog(
  request: Partial<PendingDownloadRequest>, 
  downloadManager: DownloadManager
): BrowserWindow {
  const requestId = registerDownloadRequest(request);

  // If a dialog is already open for this exact request, focus it
  const existingWin = activeDialogWindows.get(requestId);
  if (existingWin && !existingWin.isDestroyed()) {
    if (existingWin.isMinimized()) existingWin.restore();
    existingWin.show();
    existingWin.focus();
    return existingWin;
  }

  const currentSettings = downloadManager.getSettings();
  const currentTheme = currentSettings?.theme || 'dark';
  const currentLanguage = currentSettings?.language || 'en';

  const dialogWin = new BrowserWindow({
    width: 680,
    height: 500,
    minWidth: 560,
    minHeight: 420,
    maxWidth: 1100,
    maxHeight: 850,
    frame: false,
    titleBarStyle: 'hidden',
    resizable: true,
    show: false,
    backgroundColor: currentTheme === 'light' ? '#F8FAFC' : '#07070E',
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, 'downloadDialogPreload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'YAS Downloader',
  });

  const webContentsId = dialogWin.webContents.id;
  activeDialogWindows.set(requestId, dialogWin);
  webContentsToRequestId.set(webContentsId, requestId);

  dialogWin.once('ready-to-show', () => {
    if (!dialogWin.isDestroyed()) {
      dialogWin.show();
      dialogWin.focus();
    }
  });

  dialogWin.on('unresponsive', () => {
    console.warn(`[DownloadDialog] Window for request ${requestId} became unresponsive`);
  });

  dialogWin.webContents.on('render-process-gone', (_event, details) => {
    console.warn(`[DownloadDialog] Render process gone for request ${requestId}:`, details.reason);
  });

  dialogWin.on('closed', () => {
    activeDialogWindows.delete(requestId);
    webContentsToRequestId.delete(webContentsId);
    pendingRequests.delete(requestId);
  });

  // Load the dialog UI
  const isDev = !!process.env.VITE_DEV_SERVER_URL || process.env.NODE_ENV === 'development';
  if (isDev) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:3000';
    dialogWin.loadURL(`${devUrl}/?dialog=true&requestId=${encodeURIComponent(requestId)}&theme=${currentTheme}&lang=${currentLanguage}`);
  } else {
    dialogWin.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { dialog: 'true', requestId, theme: currentTheme, lang: currentLanguage }
    });
  }

  return dialogWin;
}

/**
 * Resolves sanitized data for the dialog renderer without leaking raw cookies
 */
export function getSanitizedDialogData(
  webContentsId: number, 
  downloadManager: DownloadManager,
  explicitRequestId?: string
): DownloadDialogData | null {
  let requestId = explicitRequestId || webContentsToRequestId.get(webContentsId);
  if (!requestId) return null;

  const pending = pendingRequests.get(requestId);
  if (!pending) return null;

  // Ensure mapping exists
  webContentsToRequestId.set(webContentsId, requestId);

  const settings = downloadManager.getSettings();
  const defaultFolder = settings.downloadFolder || app.getPath('downloads');

  return {
    requestId: pending.requestId,
    url: pending.url,
    finalUrl: pending.finalUrl,
    filename: pending.filename,
    fileSize: pending.fileSize,
    mime: pending.mime,
    referrer: pending.referrer,
    defaultFolder
  };
}

/**
 * Starts download from the independent dialog and returns downloadId without closing the window
 */
export async function handleStartDownloadFromDialog(
  options: {
    requestId: string;
    filename: string;
    saveFolder: string;
    url?: string;
  },
  downloadManager: DownloadManager
): Promise<{ success: boolean; downloadId?: string; error?: string }> {
  try {
    const pending = pendingRequests.get(options.requestId);
    if (!pending) {
      return { success: false, error: 'Download request expired or not found' };
    }

    const finalUrl = (options.url && options.url.trim()) ? options.url.trim() : pending.url;
    if (!finalUrl || (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('ftp://'))) {
      return { success: false, error: 'Invalid download URL protocol' };
    }

    const settings = downloadManager.getSettings();
    const targetFolder = path.resolve(options.saveFolder || settings.downloadFolder || app.getPath('downloads'));
    const sanitizedName = sanitizeFilename(options.filename || pending.filename, finalUrl);
    const savePath = path.join(targetFolder, sanitizedName);

    const downloadId = await downloadManager.startDownload({
      url: finalUrl,
      filename: sanitizedName,
      savePath,
      totalBytes: pending.fileSize > 0 ? pending.fileSize : undefined,
      cookies: pending.cookies,
      referrer: pending.referrer,
      userAgent: pending.userAgent,
      startNow: true
    });

    // Sensitive context safely passed to download engine; remove from pendingRequests
    pendingRequests.delete(options.requestId);

    return { success: true, downloadId };
  } catch (err: any) {
    console.error('Error starting download from dialog:', err);
    return { success: false, error: err.message || 'Failed to start download' };
  }
}

/**
 * Schedules download from the independent dialog and returns downloadId without closing the window
 */
export async function handleScheduleDownloadFromDialog(
  options: {
    requestId: string;
    filename: string;
    saveFolder: string;
    url?: string;
    scheduledTime?: number;
  },
  downloadManager: DownloadManager
): Promise<{ success: boolean; downloadId?: string; error?: string }> {
  try {
    const pending = pendingRequests.get(options.requestId);
    if (!pending) {
      return { success: false, error: 'Download request expired or not found' };
    }

    const finalUrl = (options.url && options.url.trim()) ? options.url.trim() : pending.url;
    if (!finalUrl || (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://') && !finalUrl.startsWith('ftp://'))) {
      return { success: false, error: 'Invalid download URL protocol' };
    }

    const settings = downloadManager.getSettings();
    const targetFolder = path.resolve(options.saveFolder || settings.downloadFolder || app.getPath('downloads'));
    const sanitizedName = sanitizeFilename(options.filename || pending.filename, finalUrl);
    const savePath = path.join(targetFolder, sanitizedName);
    const scheduledTime = options.scheduledTime || (Date.now() + 3600000);

    const downloadId = await downloadManager.scheduleDownload({
      url: finalUrl,
      filename: sanitizedName,
      savePath,
      totalBytes: pending.fileSize > 0 ? pending.fileSize : undefined,
      cookies: pending.cookies,
      referrer: pending.referrer,
      userAgent: pending.userAgent,
      startNow: false,
      scheduledTime
    }, scheduledTime);

    pendingRequests.delete(options.requestId);

    return { success: true, downloadId };
  } catch (err: any) {
    console.error('Error scheduling download from dialog:', err);
    return { success: false, error: err.message || 'Failed to schedule download' };
  }
}

/**
 * Handles legacy action dispatch from the independent dialog
 */
export async function handleDialogAction(
  result: DownloadDialogResult, 
  downloadManager: DownloadManager
): Promise<{ success: boolean; downloadId?: string; error?: string }> {
  try {
    if (result.action === 'cancel') {
      // Clean up sensitive context from memory immediately
      pendingRequests.delete(result.requestId);

      const dialogWin = activeDialogWindows.get(result.requestId);
      if (dialogWin && !dialogWin.isDestroyed()) {
        setImmediate(() => {
          try {
            if (!dialogWin.isDestroyed()) {
              dialogWin.close();
            }
          } catch (e) {}
        });
      }
      activeDialogWindows.delete(result.requestId);
      return { success: true };
    }

    if (result.action === 'download-now') {
      return handleStartDownloadFromDialog({
        requestId: result.requestId,
        filename: result.filename,
        saveFolder: result.saveFolder,
        url: result.url
      }, downloadManager);
    } else if (result.action === 'download-later') {
      return handleScheduleDownloadFromDialog({
        requestId: result.requestId,
        filename: result.filename,
        saveFolder: result.saveFolder,
        url: result.url,
        scheduledTime: result.scheduledTime
      }, downloadManager);
    }

    return { success: false, error: 'Unknown action' };
  } catch (err: any) {
    console.error('Error handling dialog action:', err);
    return { success: false, error: err.message || 'Failed to process download action' };
  }
}

/**
 * Lets user select a folder via native dialog modal
 */
export async function showFolderPicker(win: BrowserWindow | null): Promise<string | null> {
  const targetWin = (win && !win.isDestroyed()) ? win : undefined;
  const result = targetWin 
    ? await dialog.showOpenDialog(targetWin, { properties: ['openDirectory', 'createDirectory'] })
    : await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });

  if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
    return null;
  }
  return result.filePaths[0];
}
