/**
 * Media Diagnostics Logger
 * Provides structured internal developer-level logging without exposing
 * sensitive credentials, tokens, or raw technical spam to UI users.
 */

export interface MediaDiagnosticEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  category: 'EXTRACTION' | 'DOWNLOAD' | 'FFMPEG' | 'VERIFICATION' | 'STRATEGY';
  message: string;
  details?: Record<string, any>;
}

export class MediaDiagnosticsLogger {
  private static sanitizeArg(arg: string): string {
    if (!arg) return arg;
    // Sanitize cookie file contents or raw tokens
    if (arg.includes('auth_token=') || arg.includes('sessionid=') || arg.includes('access_token=')) {
      return '[REDACTED_AUTH_TOKEN]';
    }
    return arg;
  }

  public static sanitizeArgs(args: string[]): string[] {
    const sanitized: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const current = args[i];
      if (current === '--cookies' && i + 1 < args.length) {
        sanitized.push('--cookies', '[COOKIES_FILE_PATH]');
        i++;
      } else if (current === '--cookies-from-browser' && i + 1 < args.length) {
        sanitized.push('--cookies-from-browser', args[i + 1]);
        i++;
      } else if (current === '--proxy' && i + 1 < args.length) {
        sanitized.push('--proxy', '[REDACTED_PROXY]');
        i++;
      } else {
        sanitized.push(this.sanitizeArg(current));
      }
    }
    return sanitized;
  }

  public static log(
    category: MediaDiagnosticEntry['category'],
    level: MediaDiagnosticEntry['level'],
    message: string,
    details?: Record<string, any>
  ): void {
    const timestamp = new Date().toISOString();
    const tag = `[MediaEngine::${category}]`;
    const detailsStr = details ? ` | Details: ${JSON.stringify(details)}` : '';

    if (level === 'error') {
      console.error(`${timestamp} ${tag} ERROR: ${message}${detailsStr}`);
    } else if (level === 'warn') {
      console.warn(`${timestamp} ${tag} WARN: ${message}${detailsStr}`);
    } else {
      console.log(`${timestamp} ${tag} ${message}${detailsStr}`);
    }
  }

  public static logExtractionStart(url: string, platform: string): void {
    this.log('EXTRACTION', 'info', `Beginning metadata extraction pipeline`, {
      url,
      platform,
    });
  }

  public static logStrategyAttempt(tier: number, name: string, description: string): void {
    this.log('STRATEGY', 'info', `Executing recovery ladder Tier ${tier}: ${name} (${description})`);
  }

  public static logStrategySuccess(tier: number, name: string, durationMs: number): void {
    this.log('STRATEGY', 'info', `Tier ${tier} (${name}) succeeded in ${durationMs}ms`);
  }

  public static logStrategyFailure(tier: number, name: string, errorMsg: string, willTryNext: boolean): void {
    this.log(
      'STRATEGY',
      willTryNext ? 'warn' : 'error',
      `Tier ${tier} (${name}) failed: ${errorMsg}${willTryNext ? ' -> Advancing to next recovery strategy' : ' -> No more strategies available'}`
    );
  }

  public static logCommand(binPath: string, args: string[], pid?: number): void {
    const sanitized = this.sanitizeArgs(args);
    this.log('DOWNLOAD', 'info', `Spawned process [PID: ${pid || 'N/A'}]`, {
      binary: binPath,
      args: sanitized,
    });
  }

  public static logVerification(filePath: string, isValid: boolean, details?: Record<string, any>): void {
    this.log(
      'VERIFICATION',
      isValid ? 'info' : 'error',
      isValid ? `Zero Fake Completion verified: File physically valid and playable -> "${filePath}"` : `Zero Fake Completion FAILED for -> "${filePath}"`,
      details
    );
  }
}
