import path from 'path';
import fs from 'fs';
import { universalMediaDownloader, UniversalDownloadOptions } from './universalMediaDownloader';
import {
  MediaDownloadJob,
  MediaDownloadStage,
  MediaInfo,
  StandardQuality,
  TargetContainer,
} from '../types';
import { mediaHistoryStore } from '../storage/mediaHistoryStore';
import { mediaCleanupService } from '../cleanup/mediaCleanupService';

export class MediaDownloadManager {
  private jobs: Map<string, MediaDownloadJob> = new Map();
  private cancelledJobIds: Set<string> = new Set();
  private progressListeners: Set<(job: MediaDownloadJob) => void> = new Set();

  constructor() {
    this.initHistoryAndCleanup().catch((err) => {
      console.warn('[MediaDownloadManager] Bootstrap warning:', err);
    });
  }

  /**
   * Initializes persistent download history and triggers startup orphan cleanup.
   */
  private async initHistoryAndCleanup(): Promise<void> {
    try {
      const history = await mediaHistoryStore.load();
      for (const job of history) {
        if (!this.jobs.has(job.id)) {
          this.jobs.set(job.id, job);
        }
      }
      const defaultFolder = this.getDefaultDownloadsFolder();
      await mediaCleanupService.cleanOrphanFiles(defaultFolder);
    } catch {}
  }

  private getDefaultDownloadsFolder(): string {
    const home = process.env.USERPROFILE || process.env.HOME || '.';
    return path.join(home, 'Downloads');
  }

  /**
   * Generates a collision-free file path if the destination file already exists.
   * e.g. video.mp4 -> video (1).mp4 -> video (2).mp4
   */
  public getCollisionFreeFilePath(saveFolder: string, baseName: string, ext: string): { filePath: string; cleanName: string } {
    const cleanExt = ext.startsWith('.') ? ext.slice(1) : ext;
    let currentName = baseName;
    let currentPath = path.join(saveFolder, `${currentName}.${cleanExt}`);

    if (!fs.existsSync(currentPath)) {
      return { filePath: currentPath, cleanName: currentName };
    }

    let index = 1;
    while (true) {
      currentName = `${baseName} (${index})`;
      currentPath = path.join(saveFolder, `${currentName}.${cleanExt}`);
      if (!fs.existsSync(currentPath)) {
        return { filePath: currentPath, cleanName: currentName };
      }
      index++;
    }
  }

  /**
   * Cleans up all registered temporary files for a job.
   */
  public cleanupTempFiles(job: MediaDownloadJob): void {
    if (!job.tempFiles || job.tempFiles.size === 0) return;
    mediaCleanupService.cleanupJobTempFiles(job.tempFiles);
    job.tempFiles.clear();
  }

  /**
   * Subscribes a listener to global media job updates.
   */
  public onJobUpdate(listener: (job: MediaDownloadJob) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  private notifyUpdate(job: MediaDownloadJob): void {
    // If the job was cancelled or blacklisted, do not broadcast any further progress events
    if (this.cancelledJobIds.has(job.id) && job.status !== 'cancelled') {
      return;
    }

    for (const listener of this.progressListeners) {
      try {
        listener(job);
        if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
          mediaHistoryStore.saveJob(job).catch(() => {});
        }
      } catch (err) {
        console.error('[MediaDownloadManager] Listener error:', err);
      }
    }
  }

  /**
   * Gets all active or completed media download jobs.
   */
  public getAllJobs(): MediaDownloadJob[] {
    return Array.from(this.jobs.values()).map((job) => ({
      ...job,
      abortController: undefined, // Do not serialize controller
    }));
  }

  /**
   * Gets a specific job by ID.
   */
  public getJob(id: string): MediaDownloadJob | undefined {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    return {
      ...job,
      abortController: undefined,
    };
  }

  /**
   * Starts or queues a media download with full lifecycle tracking.
   */
  public async startMediaDownload(options: {
    jobId?: string;
    url: string;
    title?: string;
    cleanFileName?: string;
    quality?: StandardQuality;
    container?: TargetContainer;
    saveFolder: string;
    mediaInfo?: MediaInfo;
    platform?: any;
    cookiesPath?: string;
    browserCookies?: string;
    customUserAgent?: string;
    proxyUrl?: string;
  }): Promise<{ success: boolean; jobId: string; outputPath?: string; error?: string }> {
    const jobId = options.jobId || `media_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const quality = options.quality || '1080p';
    const container = options.container || (quality === 'audio_only' ? 'mp3' : 'mp4');
    const rawTitle = options.title || options.mediaInfo?.title || 'YouTube_Media';
    const rawBaseName = options.cleanFileName || options.mediaInfo?.cleanFileName || rawTitle.replace(/[\\/:*?"<>|]/g, '_').trim();

    // Ensure save directory exists
    if (!fs.existsSync(options.saveFolder)) {
      fs.mkdirSync(options.saveFolder, { recursive: true });
    }

    // Apply collision-free naming protection
    const { cleanName } = this.getCollisionFreeFilePath(options.saveFolder, rawBaseName, container);

    const abortController = new AbortController();

    const job: MediaDownloadJob = {
      id: jobId,
      url: options.url,
      title: rawTitle,
      cleanFileName: cleanName,
      quality,
      container,
      saveFolder: options.saveFolder,
      status: 'downloading',
      stage: 'extracting',
      percent: 0,
      speed: '',
      eta: '',
      startTime: Date.now(),
      tempFiles: new Set<string>(),
      abortController,
      mediaInfo: options.mediaInfo,
      options: {
        ...options,
        jobId,
        cleanFileName: cleanName,
        title: rawTitle,
        quality,
        container,
      },
    };

    this.jobs.set(jobId, job);
    this.notifyUpdate(job);

    return this.executeDownload(job);
  }

  /**
   * Internal execution pipeline for a media job. Supports both initial start and resume.
   */
  private async executeDownload(job: MediaDownloadJob): Promise<{ success: boolean; jobId: string; outputPath?: string; error?: string }> {
    const options = job.options || {};
    const abortController = job.abortController || new AbortController();
    job.abortController = abortController;

    try {
      // Execute universal media download pipeline with temp file tracking
      const finalPath = await universalMediaDownloader.download({
        jobId: job.id,
        url: job.url,
        title: job.title,
        cleanFileName: job.cleanFileName,
        quality: job.quality,
        container: job.container,
        saveFolder: job.saveFolder,
        mediaInfo: job.mediaInfo,
        platform: options.platform,
        cookiesPath: options.cookiesPath,
        browserCookies: options.browserCookies,
        customUserAgent: options.customUserAgent,
        proxyUrl: options.proxyUrl,
        abortSignal: abortController.signal,
        tempFilesTracker: job.tempFiles,
        onProgress: (prog) => {
          if (job.status === 'paused') return;
          job.stage = prog.stage;
          job.percent = Math.round(prog.percent);
          if (prog.speed) job.speed = prog.speed;
          if (prog.eta) job.eta = prog.eta;
          if (prog.outputPath) job.outputPath = prog.outputPath;
          this.notifyUpdate(job);
        },
      });

      job.status = 'completed';
      job.stage = 'completed';
      job.percent = 100;
      job.outputPath = finalPath;
      job.endTime = Date.now();

      // Clean temporary files on success
      this.cleanupTempFiles(job);
      this.notifyUpdate(job);

      return { success: true, jobId: job.id, outputPath: finalPath };
    } catch (err: any) {
      // If the job was paused by the user, keep tempFiles intact for resumption and do not treat as fatal error
      if (job.status === 'paused') {
        job.speed = '0 B/s';
        job.eta = '';
        this.notifyUpdate(job);
        return {
          success: false,
          jobId: job.id,
          error: 'Download paused',
        };
      }

      // Cleanup temporary files on failure or cancellation
      this.cleanupTempFiles(job);

      if (abortController.signal.aborted || err.message?.includes('cancelled')) {
        job.status = 'cancelled';
        job.stage = 'cancelled';
        job.error = 'Download cancelled by user.';
      } else {
        job.status = 'error';
        job.stage = 'error';
        job.error = err.message || 'Media download encountered an error.';
      }

      job.endTime = Date.now();
      this.notifyUpdate(job);

      return {
        success: false,
        jobId: job.id,
        error: job.error,
      };
    }
  }

  /**
   * Safely pauses an active media download.
   * Stops the active yt-dlp child process without deleting `.part` temporary stream files.
   */
  public pauseMediaDownload(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;
    if (job.status !== 'downloading') return false;

    job.status = 'paused';
    job.stage = 'paused';
    job.speed = '0 B/s';
    job.eta = '';

    if (job.abortController) {
      try {
        job.abortController.abort();
      } catch (err) {
        console.warn('[MediaDownloadManager] Pause abort signal:', err);
      }
    }

    this.notifyUpdate(job);
    return true;
  }

  /**
   * Resumes a paused media download.
   * Restarts yt-dlp with the exact same format and target file paths.
   * yt-dlp natively continues downloading from partial `.part` streams.
   */
  public async resumeMediaDownload(jobId: string): Promise<{ success: boolean; jobId: string; outputPath?: string; error?: string }> {
    const job = this.jobs.get(jobId);
    if (!job) return { success: false, jobId, error: 'Job not found.' };
    if (job.status !== 'paused' && job.status !== 'error') {
      return { success: false, jobId, error: 'Job is not paused or in retryable state.' };
    }

    job.status = 'downloading';
    job.error = undefined;
    job.abortController = new AbortController();
    this.notifyUpdate(job);

    // Asynchronously execute download pipeline
    return this.executeDownload(job);
  }

  /**
   * Safely cancels an active media download and removes intermediate files.
   */
  public cancelMediaDownload(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    this.cancelledJobIds.add(jobId);

    if (!job) return false;

    if (job.abortController) {
      try {
        job.abortController.abort();
      } catch (err) {
        console.error('[MediaDownloadManager] Abort error:', err);
      }
    }

    job.status = 'cancelled';
    job.stage = 'cancelled';
    job.error = 'Download cancelled by user.';
    job.endTime = Date.now();

    // Clean all registered temp files immediately
    this.cleanupTempFiles(job);
    this.notifyUpdate(job);

    // Delete job from map and persistent store so it completely disappears
    this.jobs.delete(jobId);
    mediaHistoryStore.removeJob(jobId).catch(() => {});

    // Clean up blacklist entry after 30 seconds to prevent unbounded memory growth
    setTimeout(() => {
      this.cancelledJobIds.delete(jobId);
    }, 30000);

    return true;
  }

  /**
   * Removes a job record from the manager and disk persistence.
   */
  public async removeJob(jobId: string): Promise<boolean> {
    this.cancelledJobIds.add(jobId);
    const job = this.jobs.get(jobId);

    if (job && (job.status === 'downloading' || job.status === 'paused')) {
      if (job.abortController) {
        try {
          job.abortController.abort();
        } catch {}
      }
      this.cleanupTempFiles(job);
    }

    this.jobs.delete(jobId);
    await mediaHistoryStore.removeJob(jobId);

    setTimeout(() => {
      this.cancelledJobIds.delete(jobId);
    }, 30000);

    return true;
  }

  /**
   * Cancels all active jobs and wipes all persistent media history from disk.
   */
  public async clearAllJobs(): Promise<boolean> {
    for (const [jobId, job] of this.jobs.entries()) {
      this.cancelledJobIds.add(jobId);
      if (job.abortController) {
        try {
          job.abortController.abort();
        } catch {}
      }
      this.cleanupTempFiles(job);
    }

    this.jobs.clear();
    await mediaHistoryStore.clearHistory();

    return true;
  }
}

export const mediaDownloadManager = new MediaDownloadManager();
