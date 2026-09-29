import { ipcMain, BrowserWindow, shell, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { mediaEngine } from './mediaEngine';
import { ExtractionOptions, StandardQuality, TargetContainer } from './types';

let isMediaIpcRegistered = false;

function getSavedCookiesPath(): string | undefined {
  try {
    const settingsPath = path.join(app.getPath('userData'), 'settings.json');
    if (fs.existsSync(settingsPath)) {
      const raw = fs.readFileSync(settingsPath, 'utf8');
      const data = JSON.parse(raw);
      if (data?.cookiesPath && typeof data.cookiesPath === 'string' && data.cookiesPath.trim()) {
        const rawPath = data.cookiesPath.trim();
        // Candidate locations if given a relative filename like 'cookies.txt'
        const candidatePaths = [
          rawPath,
          path.resolve(rawPath),
          path.resolve(app.getPath('desktop'), rawPath),
          path.resolve(app.getPath('userData'), rawPath),
        ];
        for (const candidate of candidatePaths) {
          if (fs.existsSync(candidate)) {
            return path.isAbsolute(candidate) ? candidate : path.resolve(candidate);
          }
        }
        return path.isAbsolute(rawPath) ? rawPath : path.resolve(rawPath);
      }
    }
  } catch {}
  return undefined;
}

/**
 * Registers all Media Engine IPC channels for Electron renderer communication.
 * Handles URL detection, metadata extraction, format resolution, download execution,
 * cancellation, and real-time job progress event broadcasting.
 */
export function setupMediaIPC(): void {
  if (isMediaIpcRegistered) {
    return;
  }
  isMediaIpcRegistered = true;

  // 1. URL Detection & Platform Classification
  ipcMain.handle('media:detect-url', async (_event, url: string) => {
    try {
      if (!url || typeof url !== 'string') {
        return {
          isMediaUrl: false,
          platform: 'direct_file',
          canonicalUrl: '',
          mediaTypeHint: 'direct',
          error: 'Invalid URL provided',
        };
      }
      return mediaEngine.detectUrl(url);
    } catch (err: any) {
      return {
        isMediaUrl: false,
        platform: 'direct_file',
        canonicalUrl: url,
        mediaTypeHint: 'direct',
        error: err.message || 'Failed to detect media URL',
      };
    }
  });

  // 2. Metadata & Format Extraction
  ipcMain.handle(
    'media:extract-info',
    async (_event, url: string, options?: ExtractionOptions) => {
      try {
        if (!url || typeof url !== 'string') {
          return { success: false, error: 'Valid URL is required for metadata extraction.' };
        }
        const effectiveOptions: ExtractionOptions = {
          ...options,
          cookiesPath: options?.cookiesPath || getSavedCookiesPath(),
        };
        const info = await mediaEngine.extractMediaInfo(url, effectiveOptions);
        return { success: true, data: info };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'Failed to extract media information.',
        };
      }
    }
  );

  // 3. Format Selector Resolution Helper
  ipcMain.handle(
    'media:get-formats',
    async (
      _event,
      mediaInfo: any,
      targetQuality?: StandardQuality,
      container?: TargetContainer
    ) => {
      try {
        if (!mediaInfo) {
          return { success: false, error: 'MediaInfo is required to resolve formats.' };
        }
        const result = mediaEngine.formatSelector.selectBestQuality(
          mediaInfo,
          targetQuality,
          container
        );
        return { success: true, data: result };
      } catch (err: any) {
        return {
          success: false,
          error: err.message || 'Failed to resolve media formats.',
        };
      }
    }
  );

  // 4. Binary Integrity Verification
  ipcMain.handle('media:check-binaries', async () => {
    try {
      const report = await mediaEngine.binManager.checkBinariesAvailable();
      return { success: true, data: report };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to verify binaries.' };
    }
  });

  // 5. Download Execution (Start / Queue)
  ipcMain.handle('media:start-download', async (_event, options: any) => {
    try {
      if (!options || !options.url) {
        return { success: false, error: 'URL is required to start download.' };
      }
      const effectiveOptions = {
        ...options,
        cookiesPath: options.cookiesPath || getSavedCookiesPath(),
      };
      return await mediaEngine.downloadManager.startMediaDownload(effectiveOptions);
    } catch (err: any) {
      return { success: false, error: err.message || 'Media download failed to initiate.' };
    }
  });

  // 6. Download Pause, Resume, and Cancellation
  ipcMain.handle('media:pause-download', async (_event, jobId: string) => {
    try {
      if (!jobId) return false;
      return mediaEngine.downloadManager.pauseMediaDownload(jobId);
    } catch (err: any) {
      console.error('[MediaIPC] Pause download error:', err);
      return false;
    }
  });

  ipcMain.handle('media:resume-download', async (_event, jobId: string) => {
    try {
      if (!jobId) return { success: false, error: 'Job ID required' };
      return await mediaEngine.downloadManager.resumeMediaDownload(jobId);
    } catch (err: any) {
      console.error('[MediaIPC] Resume download error:', err);
      return { success: false, error: err.message || 'Failed to resume' };
    }
  });

  ipcMain.handle('media:cancel-download', async (_event, jobId: string) => {
    try {
      if (!jobId) return false;
      return mediaEngine.downloadManager.cancelMediaDownload(jobId);
    } catch (err: any) {
      console.error('[MediaIPC] Cancel download error:', err);
      return false;
    }
  });

  // 7. Media Open File & Open Folder (Path and Job ID resilient)
  ipcMain.handle('media:open-file', async (_event, pathOrJobId: string) => {
    try {
      if (!pathOrJobId) return false;
      let targetPath = pathOrJobId;
      const job = mediaEngine.downloadManager.getJob(pathOrJobId);
      if (job && job.outputPath) {
        targetPath = job.outputPath;
      }
      if (fs.existsSync(targetPath)) {
        await shell.openPath(targetPath);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[MediaIPC] Open file error:', err);
      return false;
    }
  });

  ipcMain.handle('media:open-folder', async (_event, pathOrJobId: string) => {
    try {
      if (!pathOrJobId) return false;
      let targetPath = pathOrJobId;
      const job = mediaEngine.downloadManager.getJob(pathOrJobId);
      if (job && job.outputPath) {
        targetPath = job.outputPath;
      }
      if (fs.existsSync(targetPath)) {
        shell.showItemInFolder(targetPath);
        return true;
      } else {
        const dir = path.dirname(targetPath);
        if (fs.existsSync(dir)) {
          await shell.openPath(dir);
          return true;
        }
      }
      return false;
    } catch (err: any) {
      console.error('[MediaIPC] Open folder error:', err);
      return false;
    }
  });

  // 7. Active Downloads & Job State Queries
  ipcMain.handle('media:get-active-downloads', async () => {
    try {
      return mediaEngine.downloadManager.getAllJobs();
    } catch (err: any) {
      return [];
    }
  });

  ipcMain.handle('media:get-download', async (_event, jobId: string) => {
    try {
      if (!jobId) return null;
      return mediaEngine.downloadManager.getJob(jobId) || null;
    } catch (err: any) {
      return null;
    }
  });

  ipcMain.handle('media:remove-job', async (_event, jobId: string) => {
    try {
      if (!jobId) return false;
      return await mediaEngine.downloadManager.removeJob(jobId);
    } catch (err: any) {
      return false;
    }
  });

  ipcMain.handle('media:clear-history', async () => {
    try {
      const result = await mediaEngine.downloadManager.clearAllJobs();
      const windows = BrowserWindow.getAllWindows();
      for (const win of windows) {
        try {
          if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send('media:history-cleared');
          }
        } catch (e) {}
      }
      return result;
    } catch (err: any) {
      console.error('[MediaIPC] Clear history error:', err);
      return false;
    }
  });

  // 8. Real-time Progress and Event Broadcasting to All Active Windows
  mediaEngine.downloadManager.onJobUpdate((job) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      try {
        if (!win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
          win.webContents.send('media:job-update', job);
          win.webContents.send('media:download-progress', {
            jobId: job.id,
            url: job.url,
            title: job.title,
            stage: job.stage,
            percent: job.percent,
            speed: job.speed,
            eta: job.eta,
            outputPath: job.outputPath,
            error: job.error,
          });

          if (job.status === 'completed' && job.outputPath) {
            win.webContents.send('media:download-complete', {
              jobId: job.id,
              url: job.url,
              outputPath: job.outputPath,
            });
          }

          if (job.status === 'error' && job.error) {
            win.webContents.send('media:download-error', {
              jobId: job.id,
              url: job.url,
              error: job.error,
            });
          }
        }
      } catch (e) {
        // Window might have been closed during dispatch
      }
    }
  });
}
