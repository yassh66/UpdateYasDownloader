import fs from 'fs';
import path from 'path';

export interface CleanupResult {
  scannedCount: number;
  deletedFiles: string[];
  reclaimedBytes: number;
  errors: string[];
}

export class MediaCleanupService {
  /**
   * Scans a target directory for leftover orphaned temporary files.
   * Matches:
   *  - `*.*.temp_video.*`
   *  - `*.*.temp_audio.*`
   *  - `*.part`
   *  - `*.ytdl`
   *
   * @param targetDirectory Directory path to scan
   * @param maxAgeMs Minimum age of file before it is considered an orphan (default: 10 minutes)
   */
  public async cleanOrphanFiles(
    targetDirectory: string,
    maxAgeMs: number = 10 * 60 * 1000
  ): Promise<CleanupResult> {
    const result: CleanupResult = {
      scannedCount: 0,
      deletedFiles: [],
      reclaimedBytes: 0,
      errors: [],
    };

    if (!targetDirectory || !fs.existsSync(targetDirectory)) {
      return result;
    }

    try {
      const files = await fs.promises.readdir(targetDirectory);
      const now = Date.now();

      for (const file of files) {
        result.scannedCount++;
        const isOrphanCandidate =
          file.includes('.temp_video.') ||
          file.includes('.temp_audio.') ||
          file.endsWith('.part') ||
          file.endsWith('.ytdl');

        if (!isOrphanCandidate) continue;

        const fullPath = path.join(targetDirectory, file);

        try {
          const stats = await fs.promises.stat(fullPath);
          const age = now - stats.mtimeMs;

          // Only delete files older than maxAgeMs to avoid interfering with active concurrent jobs
          if (age >= maxAgeMs) {
            const size = stats.size;
            await this.safeUnlinkWithRetry(fullPath);
            result.deletedFiles.push(fullPath);
            result.reclaimedBytes += size;
          }
        } catch (err: any) {
          result.errors.push(`Failed to remove ${file}: ${err.message}`);
        }
      }
    } catch (dirErr: any) {
      result.errors.push(`Directory scan error on ${targetDirectory}: ${dirErr.message}`);
    }

    return result;
  }

  /**
   * Safely deletes a file with a delayed retry to handle Windows file locking (EBUSY).
   */
  public async safeUnlinkWithRetry(filePath: string, maxRetries: number = 3, delayMs: number = 150): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (!fs.existsSync(filePath)) return true;
        await fs.promises.unlink(filePath);
        return true;
      } catch (err: any) {
        // Windows EBUSY / EPERM file locking retry
        if (attempt < maxRetries - 1 && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        } else {
          return false;
        }
      }
    }
    return false;
  }

  /**
   * Cleans up temporary files tracked by a job during cancellation, completion, or error.
   * Uses non-blocking unlinking with retries to avoid Windows EBUSY crashes.
   */
  public cleanupJobTempFiles(filePaths: Iterable<string>): void {
    const list = Array.from(filePaths);
    // Execute async unlink with delayed retry in background
    setTimeout(async () => {
      for (const filePath of list) {
        await this.safeUnlinkWithRetry(filePath);
        await this.safeUnlinkWithRetry(`${filePath}.part`);
        await this.safeUnlinkWithRetry(`${filePath}.ytdl`);
      }
    }, 100);
  }
}

export const mediaCleanupService = new MediaCleanupService();
