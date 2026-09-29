import { spawn, execFile } from 'child_process';
import { getYtdlpBinaryPath, getFfmpegBinaryPath, getFfprobeBinaryPath, getJsRuntimePath } from './paths';

export interface BinaryStatus {
  available: boolean;
  path: string;
  version?: string;
  error?: string;
}

export interface BinariesReport {
  ytdlp: BinaryStatus;
  ffmpeg: BinaryStatus;
  allRequiredAvailable: boolean;
}

export class BinManager {
  /**
   * Returns the currently resolved path to yt-dlp binary.
   */
  public getYtdlpPath(): string {
    return getYtdlpBinaryPath();
  }

  /**
   * Returns the currently resolved path to FFmpeg binary.
   */
  public getFfmpegPath(): string {
    return getFfmpegBinaryPath();
  }

  /**
   * Returns the currently resolved path to FFprobe binary.
   */
  public getFfprobePath(): string {
    return getFfprobeBinaryPath();
  }

  /**
   * Returns JavaScript runtime configuration for yt-dlp EJS challenges.
   */
  public getJsRuntime(): { runtime: 'node' | 'quickjs' | 'deno'; path?: string } {
    return getJsRuntimePath();
  }

  /**
   * Safely checks binary execution version using --version or -version.
   */
  private async queryVersion(binPath: string, versionFlag: string = '--version'): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(binPath, [versionFlag], { timeout: 7000 }, (error, stdout, stderr) => {
        if (error) {
          return reject(error);
        }
        const output = (stdout || stderr || '').trim().split('\n')[0];
        resolve(output);
      });
    });
  }

  /**
   * Comprehensive health check for all media processing binaries.
   */
  public async checkBinariesAvailable(): Promise<BinariesReport> {
    const ytdlpPath = this.getYtdlpPath();
    const ffmpegPath = this.getFfmpegPath();

    const report: BinariesReport = {
      ytdlp: { available: false, path: ytdlpPath },
      ffmpeg: { available: false, path: ffmpegPath },
      allRequiredAvailable: false,
    };

    // Check yt-dlp
    try {
      const ytdlpVer = await this.queryVersion(ytdlpPath, '--version');
      report.ytdlp.available = true;
      report.ytdlp.version = ytdlpVer;
    } catch (err: any) {
      report.ytdlp.available = false;
      report.ytdlp.error = err.message || 'yt-dlp binary not executable';
    }

    // Check FFmpeg
    try {
      const ffmpegVer = await this.queryVersion(ffmpegPath, '-version');
      report.ffmpeg.available = true;
      report.ffmpeg.version = ffmpegVer;
    } catch (err: any) {
      report.ffmpeg.available = false;
      report.ffmpeg.error = err.message || 'ffmpeg binary not executable';
    }

    report.allRequiredAvailable = report.ytdlp.available;
    return report;
  }

  /**
   * Retrieves version strings for yt-dlp and ffmpeg if available.
   */
  public async getBinaryVersions(): Promise<{ ytdlp?: string; ffmpeg?: string }> {
    const status = await this.checkBinariesAvailable();
    return {
      ytdlp: status.ytdlp.version,
      ffmpeg: status.ffmpeg.version,
    };
  }

  /**
   * Non-blocking async runner for yt-dlp with streaming buffer capture and timeout.
   */
  public async executeYtdlp(
    args: string[],
    options?: {
      timeoutMs?: number;
      abortSignal?: AbortSignal;
      onStderr?: (chunk: string) => void;
    }
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const binPath = this.getYtdlpPath();
    const timeoutMs = options?.timeoutMs || 45000;

    // Production and development safe logging of the exact executed command
    console.log(`[BinManager] Executing yt-dlp: "${binPath}"`);
    console.log(`[BinManager] Arguments:`, args);

    return new Promise((resolve, reject) => {
      let isSettled = false;
      let timeoutHandle: NodeJS.Timeout | null = null;

      const child = spawn(binPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdoutData = '';
      let stderrData = '';

      child.stdout.on('data', (data: Buffer) => {
        stdoutData += data.toString('utf-8');
      });

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        stderrData += text;
        if (options?.onStderr) {
          options.onStderr(text);
        }
      });

      if (options?.abortSignal) {
        options.abortSignal.addEventListener('abort', () => {
          if (!isSettled) {
            isSettled = true;
            if (timeoutHandle) clearTimeout(timeoutHandle);
            child.kill('SIGTERM');
            reject(new Error('Media extraction was cancelled by user.'));
          }
        });
      }

      timeoutHandle = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          child.kill('SIGKILL');
          reject(new Error(`Media extraction timed out after ${timeoutMs / 1000} seconds. Please check your connection or VPN.`));
        }
      }, timeoutMs);

      child.on('error', (err: any) => {
        if (!isSettled) {
          isSettled = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);
          if (err.code === 'ENOENT') {
            reject(new Error(`yt-dlp binary was not found at "${binPath}". Please ensure yt-dlp is installed.`));
          } else {
            reject(new Error(`Failed to execute yt-dlp: ${err.message}`));
          }
        }
      });

      child.on('close', (code: number | null) => {
        if (!isSettled) {
          isSettled = true;
          if (timeoutHandle) clearTimeout(timeoutHandle);

          const exitCode = code ?? 0;
          if (exitCode !== 0) {
            // Analyze stderr for common platform blockage errors
            let userFriendlyMsg = `yt-dlp exited with code ${exitCode}.`;
            const lowerErr = stderrData.toLowerCase();

            if (
              lowerErr.includes('timed out') ||
              lowerErr.includes('connection timed out') ||
              lowerErr.includes('curl: (28)') ||
              lowerErr.includes('operation timed out')
            ) {
              userFriendlyMsg = 'Connection timed out while fetching media. Please check your network connection, VPN, or proxy.';
            } else if (stderrData.includes('Sign in to confirm you’re not a bot') || stderrData.includes('bot confirmation')) {
              userFriendlyMsg = 'YouTube requested bot verification. Providing browser cookies may be required.';
            } else if (stderrData.includes('Video unavailable') || stderrData.includes('Private video')) {
              userFriendlyMsg = 'This media is private or unavailable.';
            } else if (stderrData.includes('HTTP Error 429') || stderrData.includes('Too Many Requests')) {
              userFriendlyMsg = 'Too many requests. Please wait a moment or configure a proxy.';
            } else if (
              lowerErr.includes('login required') ||
              lowerErr.includes('checkpoint_required') ||
              lowerErr.includes('login to view')
            ) {
              userFriendlyMsg = 'Authentication required to view this media. Please configure cookies in Settings.';
            } else if (stderrData.trim()) {
              userFriendlyMsg = stderrData.trim().split('\n').pop() || userFriendlyMsg;
            }

            const error: any = new Error(userFriendlyMsg);
            error.exitCode = exitCode;
            error.stderr = stderrData;
            error.stdout = stdoutData;
            return reject(error);
          }

          resolve({
            stdout: stdoutData,
            stderr: stderrData,
            exitCode,
          });
        }
      });
    });
  }
}

export const binManager = new BinManager();
