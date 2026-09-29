import fs from 'fs';
import path from 'path';
import os from 'os';
import { MediaDownloadJob } from '../types';

export class MediaHistoryStore {
  private storageFilePath: string;
  private memoryCache: Map<string, MediaDownloadJob> = new Map();
  private isLoaded = false;

  constructor(customStorePath?: string) {
    if (customStorePath) {
      this.storageFilePath = customStorePath;
    } else {
      const appData =
        process.env.APPDATA ||
        (process.platform === 'darwin'
          ? path.join(os.homedir(), 'Library', 'Application Support')
          : path.join(os.homedir(), '.config'));
      const appDir = path.join(appData, 'yas-downloader');
      this.storageFilePath = path.join(appDir, 'media_history.json');
    }
  }

  /**
   * Initializes and loads persisted jobs from disk into memory.
   */
  public async load(): Promise<MediaDownloadJob[]> {
    if (this.isLoaded) {
      return Array.from(this.memoryCache.values());
    }

    try {
      if (fs.existsSync(this.storageFilePath)) {
        const raw = await fs.promises.readFile(this.storageFilePath, 'utf8');
        const list: MediaDownloadJob[] = JSON.parse(raw);
        if (Array.isArray(list)) {
          for (const item of list) {
            // Restore as not currently active if left in downloading state from prior abrupt shutdown
            if (item.stage !== 'completed' && item.stage !== 'error' && item.stage !== 'cancelled') {
              item.stage = 'error';
              item.error = 'Download interrupted by application shutdown.';
            }
            this.memoryCache.set(item.id, {
              ...item,
              tempFiles: new Set(),
            });
          }
        }
      }
    } catch {}

    this.isLoaded = true;
    return Array.from(this.memoryCache.values());
  }

  /**
   * Saves or updates a media job in the persistent history store.
   */
  public async saveJob(job: MediaDownloadJob): Promise<void> {
    await this.load();
    // Clone job state without ephemeral non-serializable properties
    const serializableJob: MediaDownloadJob = {
      ...job,
      tempFiles: new Set(),
      abortController: undefined,
    };
    this.memoryCache.set(job.id, serializableJob);
    await this.flushToDisk();
  }

  /**
   * Removes a job from persistent storage.
   */
  public async removeJob(jobId: string): Promise<void> {
    await this.load();
    if (this.memoryCache.delete(jobId)) {
      await this.flushToDisk();
    }
  }

  /**
   * Clears all historical records.
   */
  public async clearHistory(): Promise<void> {
    this.memoryCache.clear();
    await this.flushToDisk();
  }

  /**
   * Flushes current state atomically to disk.
   */
  private async flushToDisk(): Promise<void> {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      const list = Array.from(this.memoryCache.values()).map((job) => ({
        ...job,
        tempFiles: undefined,
        abortController: undefined,
      }));
      const tempPath = `${this.storageFilePath}.${Date.now()}.tmp`;
      await fs.promises.writeFile(tempPath, JSON.stringify(list, null, 2), 'utf8');
      await fs.promises.rename(tempPath, this.storageFilePath);
    } catch {}
  }
}

export const mediaHistoryStore = new MediaHistoryStore();
