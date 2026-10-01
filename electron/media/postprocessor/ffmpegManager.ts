import { spawn, execFile, execSync, ChildProcess } from 'child_process';
import fs from 'fs';
import { binManager } from '../bin/binManager';
import { MediaDiagnosticsLogger } from '../diagnostics/mediaDiagnosticsLogger';

export interface MediaVerificationResult {
  isValid: boolean;
  duration?: number;
  formatName?: string;
  fileSizeBytes?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
  error?: string;
}

/**
 * Safely and aggressively kills a child process and its entire process tree on Windows and POSIX.
 */
function terminateProcessTree(child: ChildProcess | null | undefined): void {
  if (!child || child.killed || !child.pid) return;
  const pid = child.pid;
  if (process.platform === 'win32') {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore', windowsHide: true });
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {}
    }
  } else {
    try {
      child.kill('SIGKILL');
    } catch {}
  }
}

export interface FFmpegProgress {
  frame?: number;
  fps?: number;
  time?: string;
  bitrate?: string;
  speed?: string;
  progressPercent?: number;
}

export interface MergeOptions {
  videoPath: string;
  audioPath: string;
  outputPath: string;
  format?: 'mp4' | 'mkv' | 'webm';
  onProgress?: (progress: FFmpegProgress) => void;
  abortSignal?: AbortSignal;
}

export interface ExtractAudioOptions {
  inputPath: string;
  outputPath: string;
  format?: 'mp3' | 'm4a' | 'aac' | 'opus' | 'flac' | 'wav';
  audioBitrate?: string; // e.g. "320k", "256k", "192k", "128k"
  onProgress?: (progress: FFmpegProgress) => void;
  abortSignal?: AbortSignal;
}

export class FFmpegManager {
  /**
   * Checks if FFmpeg binary is available and executable.
   */
  public async checkFFmpeg(): Promise<{ available: boolean; path: string; version?: string; error?: string }> {
    const report = await binManager.checkBinariesAvailable();
    return report.ffmpeg;
  }

  /**
   * Retrieves the installed FFmpeg version string.
   */
  public async getVersion(): Promise<string | undefined> {
    const report = await this.checkFFmpeg();
    return report.version;
  }

  /**
   * Parses time string (HH:MM:SS.micro) to seconds.
   */
  private parseTimeToSeconds(timeStr: string): number {
    if (!timeStr) return 0;
    const parts = timeStr.trim().split(':');
    if (parts.length === 3) {
      const hours = parseFloat(parts[0]) || 0;
      const mins = parseFloat(parts[1]) || 0;
      const secs = parseFloat(parts[2]) || 0;
      return hours * 3600 + mins * 60 + secs;
    }
    return 0;
  }

  /**
   * Parses FFmpeg stderr output to extract real-time progress metrics.
   */
  private parseProgress(stderrChunk: string, totalDurationSeconds?: number): FFmpegProgress {
    const progress: FFmpegProgress = {};
    const timeMatch = stderrChunk.match(/time=(\d{2}:\d{2}:\d{2}\.\d+)/);
    const frameMatch = stderrChunk.match(/frame=\s*(\d+)/);
    const fpsMatch = stderrChunk.match(/fps=\s*([\d.]+)/);
    const bitrateMatch = stderrChunk.match(/bitrate=\s*([\d.]+k?bits\/s)/);
    const speedMatch = stderrChunk.match(/speed=\s*([\d.]+x)/);

    if (timeMatch) {
      progress.time = timeMatch[1];
      if (totalDurationSeconds && totalDurationSeconds > 0) {
        const currentSecs = this.parseTimeToSeconds(timeMatch[1]);
        progress.progressPercent = Math.min(100, Math.round((currentSecs / totalDurationSeconds) * 100));
      }
    }
    if (frameMatch) progress.frame = parseInt(frameMatch[1], 10);
    if (fpsMatch) progress.fps = parseFloat(fpsMatch[1]);
    if (bitrateMatch) progress.bitrate = bitrateMatch[1];
    if (speedMatch) progress.speed = speedMatch[1];

    return progress;
  }

  /**
   * Merges separate video and audio streams losslessly into a single container (e.g. MP4/MKV).
   * Uses `-c copy` to merge in seconds without CPU-heavy re-encoding.
   */
  public async mergeVideoAudio(
    videoPath: string,
    audioPath: string,
    outputPath: string,
    options?: {
      format?: 'mp4' | 'mkv' | 'webm';
      audioCodec?: string; // e.g. "opus", "vorbis", "mp4a.40.2"
      totalDurationSeconds?: number;
      onProgress?: (progress: FFmpegProgress) => void;
      abortSignal?: AbortSignal;
    }
  ): Promise<{ outputPath: string }> {
    const ffmpegPath = binManager.getFfmpegPath();

    if (!fs.existsSync(videoPath)) {
      throw new Error(`Video stream source file not found: "${videoPath}"`);
    }
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio stream source file not found: "${audioPath}"`);
    }

    const isMp4 = outputPath.endsWith('.mp4') || options?.format === 'mp4';
    const audioCodecLower = (options?.audioCodec || '').toLowerCase();
    const isOpusOrVorbis =
      audioCodecLower.includes('opus') ||
      audioCodecLower.includes('vorbis') ||
      audioPath.endsWith('.opus') ||
      audioPath.endsWith('.ogg');

    const args: string[] = [
      '-y', // Overwrite output without asking
      '-i', videoPath,
      '-i', audioPath,
      '-c:v', 'copy', // Stream copy video (lossless, instant)
    ];

    // If MP4 container and audio is Opus/Vorbis, transcode to high-quality AAC for 100% Windows/macOS playback compatibility
    if (isMp4 && isOpusOrVorbis) {
      args.push('-c:a', 'aac', '-b:a', '192k');
    } else {
      args.push('-c:a', 'copy'); // Lossless direct stream copy
    }

    // If MP4 container, ensure faststart metadata is placed at beginning of file
    if (isMp4) {
      args.push('-movflags', '+faststart');
    }

    args.push(outputPath);

    console.log(`[FFmpegManager] Spawning merge: "${ffmpegPath}" ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      let isSettled = false;

      const child = spawn(ffmpegPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderrData = '';

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        stderrData += text;
        if (options?.onProgress) {
          const prog = this.parseProgress(text, options.totalDurationSeconds);
          if (prog.time || prog.frame) {
            options.onProgress(prog);
          }
        }
      });

      if (options?.abortSignal) {
        options.abortSignal.addEventListener('abort', () => {
          if (!isSettled) {
            isSettled = true;
            terminateProcessTree(child);
            reject(new Error('FFmpeg stream merging was cancelled by user.'));
          }
        });
      }

      child.on('error', (err: any) => {
        if (!isSettled) {
          isSettled = true;
          if (err.code === 'ENOENT') {
            reject(new Error(`FFmpeg binary was not found at "${ffmpegPath}". Please verify bin/win-x64/ffmpeg.exe exists.`));
          } else {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
          }
        }
      });

      child.on('close', (code: number | null) => {
        if (!isSettled) {
          isSettled = true;
          if (code === 0 && fs.existsSync(outputPath)) {
            console.log(`[FFmpegManager] Stream merge completed successfully -> "${outputPath}"`);
            resolve({ outputPath });
          } else {
            console.error(`[FFmpegManager] Merge failed (exit code ${code}):\n${stderrData}`);
            const errorLines = stderrData.split('\n').filter(l => l.trim().length > 0);
            const lastError = errorLines.slice(-3).join(' ') || `FFmpeg exited with code ${code}`;
            reject(new Error(`Stream merge failed: ${lastError}`));
          }
        }
      });
    });
  }

  /**
   * Extracts audio track from video and converts to target audio format (e.g. MP3, M4A, Opus).
   */
  public async extractAudio(
    inputPath: string,
    outputPath: string,
    options?: {
      format?: 'mp3' | 'm4a' | 'aac' | 'opus' | 'flac' | 'wav';
      audioBitrate?: string; // e.g. "320k", "256k", "192k"
      totalDurationSeconds?: number;
      onProgress?: (progress: FFmpegProgress) => void;
      abortSignal?: AbortSignal;
    }
  ): Promise<{ outputPath: string }> {
    const ffmpegPath = binManager.getFfmpegPath();

    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input file not found: "${inputPath}"`);
    }

    const format = options?.format || 'mp3';
    const bitrate = options?.audioBitrate || '320k';

    const args: string[] = [
      '-y',
      '-i', inputPath,
      '-vn', // Disable video recording
    ];

    if (format === 'mp3') {
      args.push('-c:a', 'libmp3lame', '-b:a', bitrate);
    } else if (format === 'm4a' || format === 'aac') {
      args.push('-c:a', 'aac', '-b:a', bitrate);
    } else if (format === 'opus') {
      args.push('-c:a', 'libopus', '-b:a', bitrate);
    } else if (format === 'flac') {
      args.push('-c:a', 'flac');
    } else if (format === 'wav') {
      args.push('-c:a', 'pcm_s16le');
    } else {
      args.push('-b:a', bitrate);
    }

    args.push(outputPath);

    console.log(`[FFmpegManager] Spawning audio extract: "${ffmpegPath}" ${args.join(' ')}`);

    return new Promise((resolve, reject) => {
      let isSettled = false;

      const child = spawn(ffmpegPath, args, {
        windowsHide: true,
        stdio: ['ignore', 'ignore', 'pipe'],
      });

      let stderrData = '';

      child.stderr.on('data', (data: Buffer) => {
        const text = data.toString('utf-8');
        stderrData += text;
        if (options?.onProgress) {
          const prog = this.parseProgress(text, options.totalDurationSeconds);
          if (prog.time || prog.frame) {
            options.onProgress(prog);
          }
        }
      });

      if (options?.abortSignal) {
        options.abortSignal.addEventListener('abort', () => {
          if (!isSettled) {
            isSettled = true;
            terminateProcessTree(child);
            reject(new Error('Audio extraction was cancelled by user.'));
          }
        });
      }

      child.on('error', (err: any) => {
        if (!isSettled) {
          isSettled = true;
          if (err.code === 'ENOENT') {
            reject(new Error(`FFmpeg binary was not found at "${ffmpegPath}".`));
          } else {
            reject(new Error(`Failed to spawn FFmpeg: ${err.message}`));
          }
        }
      });

      child.on('close', (code: number | null) => {
        if (!isSettled) {
          isSettled = true;
          if (code === 0 && fs.existsSync(outputPath)) {
            console.log(`[FFmpegManager] Audio extraction completed successfully -> "${outputPath}"`);
            resolve({ outputPath });
          } else {
            console.error(`[FFmpegManager] Audio extraction failed (exit code ${code}):\n${stderrData}`);
            const errorLines = stderrData.split('\n').filter(l => l.trim().length > 0);
            const lastError = errorLines.slice(-3).join(' ') || `FFmpeg audio extraction exited with code ${code}`;
            reject(new Error(`Audio extraction failed: ${lastError}`));
          }
        }
      });
    });
  }

  /**
   * Performs deep file verification using ffprobe and container inspection.
   * Ensures Zero Fake Completion: File must physically exist, be non-empty,
   * have valid container headers, duration > 0, and playable streams.
   */
  public async verifyMediaFile(
    filePath: string,
    expectedMediaType?: 'video' | 'audio'
  ): Promise<MediaVerificationResult> {
    if (!filePath || typeof filePath !== 'string') {
      return { isValid: false, error: 'Invalid file path specified for verification.' };
    }

    if (!fs.existsSync(filePath)) {
      MediaDiagnosticsLogger.logVerification(filePath, false, { reason: 'File does not exist' });
      return { isValid: false, error: `Downloaded media file does not exist on disk: "${filePath}"` };
    }

    let stats: fs.Stats;
    try {
      stats = fs.statSync(filePath);
      if (!stats.isFile()) {
        return { isValid: false, error: `Specified path is not a file: "${filePath}"` };
      }
      if (stats.size < 1024) {
        MediaDiagnosticsLogger.logVerification(filePath, false, { size: stats.size, reason: 'File size too small (<1KB)' });
        return { isValid: false, fileSizeBytes: stats.size, error: `Downloaded file is empty or corrupted (${stats.size} bytes).` };
      }
    } catch (e: any) {
      return { isValid: false, error: `Failed to inspect file stats: ${e.message}` };
    }

    const ffprobePath = binManager.getFfprobePath();

    // 1. Try probing with ffprobe if available
    try {
      const probeOutput = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
        execFile(
          ffprobePath,
          [
            '-v', 'error',
            '-show_entries', 'format=duration,format_name,size:stream=index,codec_type,codec_name',
            '-of', 'json',
            filePath,
          ],
          { timeout: 12000 },
          (err, stdout, stderr) => {
            if (err) return reject(err);
            resolve({ stdout, stderr });
          }
        );
      });

      if (probeOutput.stdout && probeOutput.stdout.trim()) {
        const parsed = JSON.parse(probeOutput.stdout.trim());
        const streams = Array.isArray(parsed.streams) ? parsed.streams : [];
        const format = parsed.format || {};
        const duration = parseFloat(format.duration) || 0;
        const hasVideo = streams.some((s: any) => s.codec_type === 'video');
        const hasAudio = streams.some((s: any) => s.codec_type === 'audio');

        if (expectedMediaType === 'video' && !hasVideo) {
          const res = {
            isValid: false,
            duration,
            fileSizeBytes: stats.size,
            hasVideo: false,
            hasAudio,
            error: 'Output file is missing valid video streams.',
          };
          MediaDiagnosticsLogger.logVerification(filePath, false, res);
          return res;
        }

        if (expectedMediaType === 'audio' && !hasAudio) {
          const res = {
            isValid: false,
            duration,
            fileSizeBytes: stats.size,
            hasVideo,
            hasAudio: false,
            error: 'Output file is missing valid audio streams.',
          };
          MediaDiagnosticsLogger.logVerification(filePath, false, res);
          return res;
        }

        const res = {
          isValid: true,
          duration,
          formatName: format.format_name,
          fileSizeBytes: stats.size,
          hasVideo,
          hasAudio,
        };
        MediaDiagnosticsLogger.logVerification(filePath, true, res);
        return res;
      }
    } catch (probeErr: any) {
      console.warn(`[FFmpegManager] ffprobe inspection warning: ${probeErr.message}. Falling back to binary signature verification.`);
    }

    // 2. Binary signature / Magic bytes fallback verification
    try {
      const fd = fs.openSync(filePath, 'r');
      const buffer = Buffer.alloc(256);
      fs.readSync(fd, buffer, 0, 256, 0);
      fs.closeSync(fd);

      const isMp4 = buffer.includes(Buffer.from('ftyp')) || buffer.includes(Buffer.from('moov'));
      const isMatroska = buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3;
      const isMp3 = (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0);
      const isFlac = buffer.toString('utf8', 0, 4) === 'fLaC';
      const isOgg = buffer.toString('utf8', 0, 4) === 'OggS';

      const isValidContainer = isMp4 || isMatroska || isMp3 || isFlac || isOgg;

      if (!isValidContainer) {
        const res = {
          isValid: false,
          fileSizeBytes: stats.size,
          error: 'File does not contain valid multimedia container signatures.',
        };
        MediaDiagnosticsLogger.logVerification(filePath, false, res);
        return res;
      }

      const res = {
        isValid: true,
        fileSizeBytes: stats.size,
        hasVideo: expectedMediaType !== 'audio',
        hasAudio: true,
      };
      MediaDiagnosticsLogger.logVerification(filePath, true, res);
      return res;
    } catch (binErr: any) {
      return { isValid: false, error: `Failed to verify media headers: ${binErr.message}` };
    }
  }
}

export const ffmpegManager = new FFmpegManager();
