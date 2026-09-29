import * as http from 'http';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';
import { app, BrowserWindow, shell } from 'electron';
import { URL } from 'url';
import * as crypto from 'crypto';

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'cancelled' | 'error' | 'scheduled' | 'waiting';

export interface StartDownloadOptions {
  url: string;
  filename?: string;
  savePath?: string;
  totalBytes?: number;
  scheduledTime?: number;
  headers?: Record<string, string>;
  cookies?: string;
  referrer?: string;
  userAgent?: string;
  startNow?: boolean;
}

export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  status: DownloadStatus;
  totalBytes: number;
  downloadedBytes: number;
  progress: number;
  speed: number;
  timeRemaining: number;
  error?: string;
  savePath: string;
  resumable: boolean;
  connections: number;
  category?: string;
  scheduledTime?: number;
  headers?: Record<string, string>;
}

export interface AppSettings {
  downloadFolder: string;
  maxConcurrent: number;
  maxConnections: number;
  launchOnStartup: boolean;
  speedLimit: number;
  autoIntercept?: boolean;
  extensionId?: string;
  theme?: 'dark' | 'light';
  language?: 'en' | 'fa';
  cookiesPath?: string;
}

interface Segment {
  index: number;
  start: number;
  end: number;
  downloaded: number;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  req?: http.ClientRequest;
  stream?: fs.WriteStream;
}

import { Transform, TransformCallback } from 'stream';

class GlobalSpeedLimiter {
  private limitBytesPerSec = 0;
  private availableTokens = 0;
  private lastRefillTime = Date.now();
  private queue: Array<{ cost: number; callback: () => void }> = [];
  private refillInterval: NodeJS.Timeout | null = null;

  setLimit(limit: number) {
    this.limitBytesPerSec = limit;
    if (limit <= 0) {
      // Unlimited: flush all queued
      if (this.refillInterval) {
        clearInterval(this.refillInterval);
        this.refillInterval = null;
      }
      const pending = this.queue;
      this.queue = [];
      pending.forEach(p => p.callback());
    } else {
      if (!this.refillInterval) {
        this.lastRefillTime = Date.now();
        this.availableTokens = limit;
        this.refillInterval = setInterval(() => this.refill(), 100);
      }
    }
  }

  private refill() {
    if (this.limitBytesPerSec <= 0) return;
    const now = Date.now();
    const elapsed = now - this.lastRefillTime;
    this.lastRefillTime = now;
    
    // Add tokens based on elapsed time
    const newTokens = (this.limitBytesPerSec * elapsed) / 1000;
    this.availableTokens = Math.min(this.limitBytesPerSec, this.availableTokens + newTokens);

    // Process queue
    while (this.queue.length > 0) {
      const next = this.queue[0];
      if (this.availableTokens >= next.cost) {
        this.availableTokens -= next.cost;
        this.queue.shift();
        next.callback();
      } else {
        break; // Wait for next refill
      }
    }
  }

  throttle(bytes: number, callback: () => void) {
    if (this.limitBytesPerSec <= 0) {
      callback();
      return;
    }
    
    if (this.availableTokens >= bytes && this.queue.length === 0) {
      this.availableTokens -= bytes;
      callback();
    } else {
      this.queue.push({ cost: bytes, callback });
    }
  }
}

class RateLimitTransform extends Transform {
  constructor(private limiter: GlobalSpeedLimiter, private onChunkProcessed: (chunk: Buffer) => boolean) {
    super();
  }

  _transform(chunk: Buffer, encoding: string, callback: TransformCallback) {
    this.limiter.throttle(chunk.length, () => {
      const shouldContinue = this.onChunkProcessed(chunk);
      if (!shouldContinue) {
        callback();
        return;
      }
      callback(null, chunk);
    });
  }
}

export class DownloadManager {
  private downloads: Map<string, DownloadItem> = new Map();
  private segments: Map<string, Segment[]> = new Map();
  private downloadHeaders: Map<string, Record<string, string>> = new Map();
  private interceptContexts: Map<string, { cookies?: string; referrer?: string; userAgent?: string; timestamp: number }> = new Map();
  
  private lastUpdateTimes: Map<string, number> = new Map();
  private lastUpdateBytes: Map<string, number> = new Map();
  
  private settings: AppSettings = {
    downloadFolder: app.getPath('downloads'),
    maxConcurrent: 3,
    maxConnections: 8,
    launchOnStartup: false,
    speedLimit: 0,
    theme: 'dark',
    language: 'en'
  };
  
  private stateFilePath: string;
  private settingsFilePath: string;
  private saveTimeout: NodeJS.Timeout | null = null;
  private saveSettingsTimeout: NodeJS.Timeout | null = null;
  private speedLimiter = new GlobalSpeedLimiter();
  private schedulerInterval: NodeJS.Timeout | null = null;
  
  constructor(private mainWindow?: BrowserWindow) {
    this.stateFilePath = path.join(app.getPath('userData'), 'downloads_state.json');
    this.settingsFilePath = path.join(app.getPath('userData'), 'settings.json');
    this.loadSettings();
    this.loadState();
    this.speedLimiter.setLimit(this.settings.speedLimit || 0);
    this.startScheduler();
  }

  private startScheduler() {
    if (this.schedulerInterval) clearInterval(this.schedulerInterval);
    this.schedulerInterval = setInterval(() => {
      this.checkScheduledDownloads();
    }, 10000); // Check every 10 seconds
    
    // Check immediately on startup
    this.checkScheduledDownloads();
  }

  private checkScheduledDownloads() {
    const now = Date.now();
    let changed = false;
    
    for (const dl of this.downloads.values()) {
      if (dl.status === 'scheduled' && dl.scheduledTime && now >= dl.scheduledTime) {
        dl.status = 'queued';
        dl.scheduledTime = undefined;
        this.notifyUpdate(dl.id);
        changed = true;
      }
    }
    
    if (changed) {
      this.processQueue();
    }
  }

  private loadSettings() {
    try {
      if (fs.existsSync(this.settingsFilePath)) {
        const data = fs.readFileSync(this.settingsFilePath, 'utf8');
        const parsed = JSON.parse(data);
        this.settings = { ...this.settings, ...parsed };
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
  }

  public getSettings(): AppSettings {
    return this.settings;
  }

  public updateSettings(newSettings: Partial<AppSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    
    if (newSettings.speedLimit !== undefined) {
      this.speedLimiter.setLimit(this.settings.speedLimit);
    }
    
    if (newSettings.launchOnStartup !== undefined) {
      app.setLoginItemSettings({
        openAtLogin: this.settings.launchOnStartup
      });
    }

    if (this.saveSettingsTimeout) return;
    this.saveSettingsTimeout = setTimeout(() => {
      try {
        fs.writeFileSync(this.settingsFilePath, JSON.stringify(this.settings, null, 2), 'utf8');
      } catch (e) {
        console.error('Failed to save settings', e);
      }
      this.saveSettingsTimeout = null;
    }, 1000);
    
    this.processQueue();
  }

  private loadState() {
    try {
      const oldStatePath = path.join(app.getPath('userData'), 'downloads.json');
      const statePathToRead = fs.existsSync(this.stateFilePath) ? this.stateFilePath : (fs.existsSync(oldStatePath) ? oldStatePath : null);
      
      if (statePathToRead) {
        const data = fs.readFileSync(statePathToRead, 'utf8');
        const parsed = JSON.parse(data);
        
        let items: DownloadItem[] = [];
        let segmentsMap: Record<string, any[]> = {};
        
        if (Array.isArray(parsed)) {
          items = parsed;
        } else {
          items = parsed.downloads || [];
          segmentsMap = parsed.segments || {};
        }

        for (const item of items) {
          if (item.status === 'downloading' || item.status === 'queued') {
            item.status = 'paused';
            item.speed = 0;
            item.connections = 0;
          }
          // If status is 'scheduled', keep it as 'scheduled'
          this.downloads.set(item.id, item);
          
          if (segmentsMap[item.id]) {
            const segs = segmentsMap[item.id].map((s: any) => ({
              ...s,
              status: s.status === 'downloading' ? 'pending' : s.status
            }));
            this.segments.set(item.id, segs);
          }
        }
      }
    } catch (e) {
      console.error('Failed to load download state', e);
    }
  }

  private saveState() {
    if (this.saveTimeout) return;
    this.saveTimeout = setTimeout(() => {
      this.saveStateImmediate();
    }, 1000);
  }

  public saveStateImmediate() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    try {
      const items = Array.from(this.downloads.values()).map(d => {
        const { headers, ...rest } = d;
        return rest;
      });
      const segs: Record<string, any[]> = {};
      for (const [id, segments] of this.segments.entries()) {
        segs[id] = segments.map(s => ({
          index: s.index,
          start: s.start,
          end: s.end,
          downloaded: s.downloaded,
          status: s.status
        }));
      }
      const state = { downloads: items, segments: segs };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
      
      const oldStatePath = path.join(app.getPath('userData'), 'downloads.json');
      if (fs.existsSync(oldStatePath)) {
        try {
          fs.writeFileSync(oldStatePath, JSON.stringify(state, null, 2), 'utf8');
        } catch {}
      }
    } catch (e) {
      console.error('Failed to save download state', e);
    }
  }

  public clearAllDownloads() {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    // Cancel and abort all active segments
    for (const [id, download] of this.downloads.entries()) {
      if (download.status === 'downloading' || download.status === 'queued') {
        const segs = this.segments.get(id) || [];
        for (const seg of segs) {
          if (seg.req) {
            try { seg.req.destroy(); } catch (e) {}
          }
          if (seg.stream) {
            try { seg.stream.end(); } catch (e) {}
          }
        }
      }
    }

    this.downloads.clear();
    this.segments.clear();
    this.downloadHeaders.clear();
    this.lastUpdateTimes.clear();
    this.lastUpdateBytes.clear();

    try {
      const state = { downloads: [], segments: {} };
      fs.writeFileSync(this.stateFilePath, JSON.stringify(state, null, 2), 'utf8');
      const oldStatePath = path.join(app.getPath('userData'), 'downloads.json');
      if (fs.existsSync(oldStatePath)) {
        try { fs.unlinkSync(oldStatePath); } catch {}
      }
    } catch (e) {
      console.error('Failed to clear download state file', e);
    }

    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          const wc = win.webContents;
          if (wc && !wc.isDestroyed()) {
            wc.send('downloads-cleared');
          }
        }
      } catch (e) {}
    }
  }

  private notifyUpdate(id: string) {
    const download = this.downloads.get(id);
    if (download) {
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed()) {
            const wc = win.webContents;
            if (wc && !wc.isDestroyed()) {
              wc.send('download-update', download);
            }
          }
        } catch (e) {
          // Window or webContents may be in the middle of closing
        }
      }
    }
    this.saveState();
  }

  public getDownload(id: string): DownloadItem | undefined {
    return this.downloads.get(id);
  }

  public getDownloads(): DownloadItem[] {
    return Array.from(this.downloads.values());
  }

  public storeInterceptContext(url: string, context: { cookies?: string; referrer?: string; userAgent?: string }) {
    const now = Date.now();
    for (const [k, v] of this.interceptContexts.entries()) {
      if (now - v.timestamp > 300000) {
        this.interceptContexts.delete(k);
      }
    }
    this.interceptContexts.set(url, { ...context, timestamp: now });
  }

  public getCategory(filename: string): 'video' | 'audio' | 'document' | 'software' | 'archive' | 'other' {
    const ext = path.extname(filename).toLowerCase();
    if (['.mp4', '.mkv', '.avi', '.mov', '.webm'].includes(ext)) return 'video';
    if (['.mp3', '.wav', '.ogg', '.flac', '.m4a'].includes(ext)) return 'audio';
    if (['.pdf', '.doc', '.docx', '.txt', '.xlsx', '.pptx'].includes(ext)) return 'document';
    if (['.exe', '.msi', '.dmg', '.pkg', '.apk', '.app'].includes(ext)) return 'software';
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext)) return 'archive';
    return 'other';
  }

  public async startDownload(input: string | StartDownloadOptions): Promise<string> {
    return this.startDownloadInternal(input);
  }

  public async scheduleDownload(input: string | StartDownloadOptions, scheduledTime: number): Promise<string> {
    if (typeof input === 'string') {
      return this.startDownloadInternal({ url: input, scheduledTime });
    }
    return this.startDownloadInternal({ ...input, scheduledTime });
  }

  private async startDownloadInternal(input: string | StartDownloadOptions, explicitScheduledTime?: number): Promise<string> {
    const opts: StartDownloadOptions = typeof input === 'string' ? { url: input } : input;
    const fileUrl = opts.url;
    const scheduledTime = explicitScheduledTime || opts.scheduledTime;
    const id = crypto.randomUUID();
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(fileUrl);
    } catch (e) {
      throw new Error('Invalid URL');
    }
    
    let filename = opts.filename?.trim() || path.basename(parsedUrl.pathname) || 'downloaded_file';
    if (!filename || filename === '/') {
        filename = 'downloaded_file';
    }
    
    let targetFolder = opts.savePath ? path.dirname(opts.savePath) : this.settings.downloadFolder;
    let savePath = opts.savePath || path.join(targetFolder, filename);
    
    const isPathUsed = (p: string) => {
        if (fs.existsSync(p)) return true;
        for (const dl of this.downloads.values()) {
            if (dl.savePath === p && dl.status !== 'cancelled') return true;
        }
        return false;
    };

    // Auto-rename if file already exists or is in use (only if auto-computed path)
    if (!opts.savePath && isPathUsed(savePath)) {
      const ext = path.extname(filename);
      const name = path.basename(filename, ext);
      let counter = 1;
      while (isPathUsed(savePath)) {
        savePath = path.join(targetFolder, `${name} (${counter})${ext}`);
        counter++;
      }
      filename = path.basename(savePath);
    }

    const headers: Record<string, string> = { ...(opts.headers || {}) };
    
    // Check if there is an in-memory intercepted context for this URL
    const interceptCtx = this.interceptContexts.get(fileUrl);
    if (interceptCtx) {
      if (interceptCtx.cookies) headers['Cookie'] = interceptCtx.cookies;
      if (interceptCtx.referrer) headers['Referer'] = interceptCtx.referrer;
      if (interceptCtx.userAgent) headers['User-Agent'] = interceptCtx.userAgent;
      this.interceptContexts.delete(fileUrl);
    }

    if (opts.cookies) {
      headers['Cookie'] = opts.cookies;
    }
    if (opts.referrer) {
      headers['Referer'] = opts.referrer;
    }
    if (opts.userAgent) {
      headers['User-Agent'] = opts.userAgent;
    }

    if (Object.keys(headers).length > 0) {
      this.downloadHeaders.set(id, headers);
    }

    const isStartNow = opts.startNow !== false;

    const download: DownloadItem = {
      id,
      url: fileUrl,
      filename,
      status: scheduledTime ? 'scheduled' : (isStartNow ? 'queued' : 'paused'),
      totalBytes: opts.totalBytes && opts.totalBytes > 0 ? opts.totalBytes : 0,
      downloadedBytes: 0,
      progress: 0,
      speed: 0,
      timeRemaining: 0,
      savePath,
      resumable: false,
      connections: 0,
      category: this.getCategory(filename),
      scheduledTime
    };

    this.downloads.set(id, download);
    this.notifyUpdate(id);
    
    if (!scheduledTime && isStartNow) {
      this.processQueue();
    }

    return id;
  }

  private processQueue() {
    let activeCount = 0;
    for (const dl of this.downloads.values()) {
      if (dl.status === 'downloading') activeCount++;
    }

    if (activeCount >= this.settings.maxConcurrent) return;

    for (const dl of this.downloads.values()) {
      if (dl.status === 'queued') {
        this.initiateDownload(dl.id);
        activeCount++;
        if (activeCount >= this.settings.maxConcurrent) break;
      }
    }
  }
  
  private async getFileInfo(fileUrl: string, headers?: Record<string, string>, redirectCount = 0): Promise<{ totalBytes: number; resumable: boolean; redirectUrl?: string }> {
      return new Promise((resolve) => {
          if (redirectCount > 5) {
              resolve({ totalBytes: 0, resumable: false });
              return;
          }

          let parsedUrl: URL;
          try {
              parsedUrl = new URL(fileUrl);
          } catch(e) {
              resolve({ totalBytes: 0, resumable: false });
              return;
          }
          
          const client = parsedUrl.protocol === 'https:' ? https : http;
          const reqHeaders: Record<string, string> = { 
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            ...(headers || {}) 
          };
          
          let isResolved = false;
          const safeResolve = (val: { totalBytes: number; resumable: boolean; redirectUrl?: string }) => {
            if (!isResolved) {
              isResolved = true;
              resolve(val);
            }
          };

          try {
            const req = client.request(fileUrl, { method: 'HEAD', headers: reqHeaders }, (res) => {
                if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
                    if (res.headers.location) {
                        try {
                          const redirectUrl = new URL(res.headers.location, fileUrl).toString();
                          resolve(this.getFileInfo(redirectUrl, headers, redirectCount + 1));
                          return;
                        } catch (e) {}
                    }
                }
                
                if (res.statusCode && res.statusCode >= 400) {
                    safeResolve({ totalBytes: 0, resumable: false });
                    return;
                }
                
                const contentLength = res.headers['content-length'];
                const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
                const resumable = res.headers['accept-ranges'] === 'bytes';
                
                safeResolve({ totalBytes: isNaN(totalBytes) ? 0 : totalBytes, resumable });
            });

            req.setTimeout(6000, () => {
              try { req.destroy(); } catch (e) {}
              safeResolve({ totalBytes: 0, resumable: false });
            });
            
            req.on('error', () => {
              safeResolve({ totalBytes: 0, resumable: false });
            });

            req.end();
          } catch (err) {
            safeResolve({ totalBytes: 0, resumable: false });
          }
      });
  }

  private async initiateDownload(id: string) {
    const download = this.downloads.get(id);
    if (!download) return;

    download.status = 'downloading';
    this.notifyUpdate(id);

    try {
        // Ensure destination folder exists
        const targetDir = path.dirname(download.savePath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        const existingSegments = this.segments.get(id);
        if (existingSegments && existingSegments.length > 0) {
            // Resuming existing segments
            this.lastUpdateTimes.set(id, Date.now());
            this.lastUpdateBytes.set(id, download.downloadedBytes);
            
            if (existingSegments.length === 1) {
                this.setupSingleConnection(id, true);
            } else {
                this.startSegments(id);
            }
            return;
        }

        let info = { totalBytes: download.totalBytes || 0, resumable: download.resumable || false, redirectUrl: undefined as string | undefined };
        try {
            const fetchedInfo = await this.getFileInfo(download.url, this.downloadHeaders.get(id));
            if (fetchedInfo.totalBytes > 0) {
              info.totalBytes = fetchedInfo.totalBytes;
            }
            info.resumable = fetchedInfo.resumable;
            if (fetchedInfo.redirectUrl) {
              info.redirectUrl = fetchedInfo.redirectUrl;
              download.url = fetchedInfo.redirectUrl;
            }
        } catch (e) {
            console.warn(`[DownloadEngine] HEAD check warning for ${download.url}:`, e);
        }

        download.totalBytes = info.totalBytes || download.totalBytes;
        download.resumable = info.resumable;
        
        this.lastUpdateTimes.set(id, Date.now());
        this.lastUpdateBytes.set(id, download.downloadedBytes);

        if (download.resumable && download.totalBytes > 0) {
            this.setupSegments(id);
            this.startSegments(id);
        } else {
            this.setupSingleConnection(id, false);
        }
    } catch (err: any) {
        console.error(`[DownloadEngine] Error initiating download ${id}:`, err);
        download.status = 'error';
        download.error = err.message || 'Failed to initiate download';
        this.notifyUpdate(id);
        this.processQueue();
    }
  }

  private setupSegments(id: string) {
      const download = this.downloads.get(id);
      if (!download) return;
      
      const numSegments = this.settings.maxConnections;
      const segmentSize = Math.floor(download.totalBytes / numSegments);
      const segments: Segment[] = [];
      
      for (let i = 0; i < numSegments; i++) {
          const start = i * segmentSize;
          const end = i === numSegments - 1 ? download.totalBytes - 1 : start + segmentSize - 1;
          segments.push({
              index: i,
              start,
              end,
              downloaded: 0,
              status: 'pending'
          });
      }
      
      this.segments.set(id, segments);
  }

  private startSegments(id: string) {
      const download = this.downloads.get(id);
      const segments = this.segments.get(id);
      if (!download || !segments || download.status !== 'downloading') return;

      let totalDownloaded = 0;
      for (const seg of segments) {
          if (seg.status === 'pending') {
              const partPath = `${download.savePath}.part${seg.index}`;
              if (fs.existsSync(partPath)) {
                  const stat = fs.statSync(partPath);
                  seg.downloaded = stat.size;
              } else {
                  seg.downloaded = 0;
              }
          }
          totalDownloaded += seg.downloaded;
      }
      download.downloadedBytes = totalDownloaded;

      for (const seg of segments) {
          if (seg.status === 'pending') {
              this.downloadSegment(id, seg.index);
          }
      }
  }

  private downloadSegment(id: string, segmentIndex: number) {
      const download = this.downloads.get(id);
      const segments = this.segments.get(id);
      if (!download || !segments || download.status !== 'downloading') return;
      
      const seg = segments[segmentIndex];
      if (seg.downloaded >= (seg.end - seg.start + 1)) {
          seg.status = 'completed';
          this.checkCompletion(id);
          return;
      }
      
      seg.status = 'downloading';
      download.connections = segments.filter(s => s.status === 'downloading').length;
      this.notifyUpdate(id);

      const parsedUrl = new URL(download.url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const rangeStart = seg.start + seg.downloaded;
      const options: http.RequestOptions = {
          headers: {
              ...(this.downloadHeaders.get(id) || {}),
              'Range': `bytes=${rangeStart}-${seg.end}`
          }
      };

      const partPath = `${download.savePath}.part${seg.index}`;

      seg.req = client.get(download.url, options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
             if (res.headers.location) {
                 download.url = new URL(res.headers.location, download.url).toString();
                 this.downloadSegment(id, segmentIndex);
                 return;
             }
          }
          
          if (res.statusCode === 200) {
              // Server ignored Range header
              if (download.status !== 'downloading') return;
              this.pauseDownload(id);
              download.resumable = false;
              // Clean up segments
              segments.forEach(s => {
                  const p = `${download.savePath}.part${s.index}`;
                  if (fs.existsSync(p)) fs.unlinkSync(p);
              });
              this.segments.delete(id);
              download.downloadedBytes = 0;
              download.status = 'queued';
              this.processQueue();
              return;
          }

          if (res.statusCode !== 206) {
              seg.status = 'error';
              this.handleDownloadError(id, `HTTP Error: ${res.statusCode} on segment ${seg.index}`);
              return;
          }

          const flags = seg.downloaded > 0 ? 'a' : 'w';
          seg.stream = fs.createWriteStream(partPath, { flags });

          const transform = new RateLimitTransform(this.speedLimiter, (chunk) => {
              if (download.status !== 'downloading') {
                  res.destroy();
                  return false;
              }
              seg.downloaded += chunk.length;
              this.updateProgress(id, chunk.length);
              return true;
          });
          
          res.pipe(transform).pipe(seg.stream!);
          
          seg.stream!.on('finish', () => {
              if (download.status === 'paused' || download.status === 'cancelled') return;
              seg.status = 'completed';
              download.connections = segments.filter(s => s.status === 'downloading').length;
              this.notifyUpdate(id);
              this.checkCompletion(id);
          });
          
          seg.stream!.on('error', (err) => {
              if (download.status === 'paused' || download.status === 'cancelled') return;
              seg.status = 'error';
              this.handleDownloadError(id, `Segment ${seg.index} stream error: ${err.message}`);
          });
      });
      
      seg.req.on('error', (err) => {
          if (download.status === 'paused' || download.status === 'cancelled') return;
          seg.status = 'error';
          if (seg.stream) seg.stream.close();
          this.handleDownloadError(id, `Segment ${seg.index} request error: ${err.message}`);
      });
  }
  
  private setupSingleConnection(id: string, isResume: boolean) {
      const download = this.downloads.get(id);
      if (!download) return;
      
      let segments = this.segments.get(id);
      if (!segments || segments.length === 0) {
          segments = [{
              index: 0,
              start: 0,
              end: download.totalBytes > 0 ? download.totalBytes - 1 : 0,
              downloaded: download.downloadedBytes,
              status: 'pending'
          }];
          this.segments.set(id, segments);
      }
      
      const seg = segments[0];
      const partPath = `${download.savePath}.part0`;

      if (isResume && fs.existsSync(partPath)) {
          const stat = fs.statSync(partPath);
          seg.downloaded = stat.size;
          download.downloadedBytes = stat.size;
      } else if (isResume && !fs.existsSync(partPath)) {
          seg.downloaded = 0;
          download.downloadedBytes = 0;
      }
      
      seg.status = 'downloading';
      download.connections = 1;
      this.notifyUpdate(id);
      
      const parsedUrl = new URL(download.url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options: http.RequestOptions = { 
          headers: {
              ...(this.downloadHeaders.get(id) || {})
          } 
      };
      if (isResume && download.resumable && seg.downloaded > 0) {
          options.headers!['Range'] = `bytes=${seg.downloaded}-`;
      } else if (isResume && !download.resumable) {
          seg.downloaded = 0;
          download.downloadedBytes = 0;
          this.updateProgress(id, 0);
      }

      seg.req = client.get(download.url, options, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 303 || res.statusCode === 307 || res.statusCode === 308) {
              if (res.headers.location) {
                  download.url = new URL(res.headers.location, download.url).toString();
                  this.setupSingleConnection(id, isResume);
                  return;
              }
          }

          if (res.statusCode === 200 && isResume && seg.downloaded > 0) {
              seg.downloaded = 0;
              download.downloadedBytes = 0;
              this.updateProgress(id, 0);
          }
          
          if (res.statusCode !== 200 && res.statusCode !== 206) {
              seg.status = 'error';
              this.handleDownloadError(id, `HTTP Error: ${res.statusCode}`);
              return;
          }

          const flags = seg.downloaded > 0 ? 'a' : 'w';
          seg.stream = fs.createWriteStream(partPath, { flags });
          
          if (!download.totalBytes && res.headers['content-length']) {
              download.totalBytes = parseInt(res.headers['content-length'], 10);
              seg.end = download.totalBytes - 1;
          }
          
          const transform = new RateLimitTransform(this.speedLimiter, (chunk) => {
              if (download.status !== 'downloading') {
                  res.destroy();
                  return false;
              }
              seg.downloaded += chunk.length;
              this.updateProgress(id, chunk.length);
              return true;
          });
          
          res.pipe(transform).pipe(seg.stream!);
          
          seg.stream!.on('finish', () => {
              if (download.status === 'paused' || download.status === 'cancelled') return;
              seg.status = 'completed';
              download.connections = 0;
              this.notifyUpdate(id);
              this.checkCompletion(id);
          });
          
          seg.stream!.on('error', (err) => {
             if (download.status === 'paused' || download.status === 'cancelled') return;
             seg.status = 'error';
             this.handleDownloadError(id, err.message);
          });
      });
      
      seg.req.on('error', (err) => {
          if (download.status === 'paused' || download.status === 'cancelled') return;
          seg.status = 'error';
          if (seg.stream) seg.stream.close();
          this.handleDownloadError(id, err.message);
      });
  }

  private updateProgress(id: string, newBytes: number) {
      const download = this.downloads.get(id);
      if (!download) return;
      
      download.downloadedBytes += newBytes;
      if (download.totalBytes > 0) {
          download.progress = (download.downloadedBytes / download.totalBytes) * 100;
      }
      
      const now = Date.now();
      const lastTime = this.lastUpdateTimes.get(id) || now;
      const timeDiff = now - lastTime;
      
      if (timeDiff >= 500 || download.downloadedBytes === download.totalBytes) {
          const lastBytes = this.lastUpdateBytes.get(id) || 0;
          const bytesDiff = download.downloadedBytes - lastBytes;
          download.speed = (bytesDiff / timeDiff) * 1000;
          
          if (download.speed > 0 && download.totalBytes > 0) {
              const remainingBytes = download.totalBytes - download.downloadedBytes;
              download.timeRemaining = remainingBytes / download.speed;
          } else {
              download.timeRemaining = 0;
          }
          
          this.lastUpdateTimes.set(id, now);
          this.lastUpdateBytes.set(id, download.downloadedBytes);
          this.notifyUpdate(id);
      }
  }
  
  private handleDownloadError(id: string, message: string) {
      const download = this.downloads.get(id);
      if (!download) return;
      
      download.status = 'error';
      download.error = message;
      download.speed = 0;
      download.connections = 0;
      this.notifyUpdate(id);
      this.processQueue();
  }

  private checkCompletion(id: string) {
      const download = this.downloads.get(id);
      const segments = this.segments.get(id);
      if (!download || !segments) return;
      
      const allCompleted = segments.every(s => s.status === 'completed');
      if (allCompleted) {
          try {
              const writeStream = fs.createWriteStream(download.savePath);
              this.mergeSegments(id, segments, 0, writeStream, () => {
                  download.status = 'completed';
                  download.progress = 100;
                  download.speed = 0;
                  download.timeRemaining = 0;
                  download.connections = 0;
                  this.notifyUpdate(id);
                  this.processQueue();
              });
          } catch (e: any) {
              this.handleDownloadError(id, `Merge error: ${e.message}`);
          }
      }
  }
  
  private mergeSegments(id: string, segments: Segment[], index: number, writeStream: fs.WriteStream, callback: () => void) {
      if (index >= segments.length) {
          writeStream.close();
          segments.forEach(s => {
              const partPath = `${this.downloads.get(id)?.savePath}.part${s.index}`;
              if (fs.existsSync(partPath)) fs.unlink(partPath, () => {});
          });
          callback();
          return;
      }
      
      const partPath = `${this.downloads.get(id)?.savePath}.part${segments[index].index}`;
      if (!fs.existsSync(partPath)) {
          writeStream.close();
          this.handleDownloadError(id, `Missing part file: ${partPath}`);
          return;
      }
      
      const readStream = fs.createReadStream(partPath);
      readStream.pipe(writeStream, { end: false });
      
      readStream.on('end', () => {
          this.mergeSegments(id, segments, index + 1, writeStream, callback);
      });
      
      readStream.on('error', (err) => {
          writeStream.close();
          this.handleDownloadError(id, `Read part error: ${err.message}`);
      });
  }

  public pauseDownload(id: string) {
    const download = this.downloads.get(id);
    const segments = this.segments.get(id);
    if (!download || download.status !== 'downloading') return;

    download.status = 'paused';
    download.speed = 0;
    download.connections = 0;
    
    if (segments) {
        segments.forEach(seg => {
            if (seg.status === 'downloading') {
                seg.status = 'pending';
                if (seg.req) {
                    seg.req.destroy();
                    seg.req = undefined;
                }
                if (seg.stream) {
                    seg.stream.close();
                    seg.stream = undefined;
                }
            }
        });
    }

    this.notifyUpdate(id);
    this.processQueue();
  }

  public resumeDownload(id: string) {
    const download = this.downloads.get(id);
    if (!download || (download.status !== 'paused' && download.status !== 'error' && download.status !== 'waiting')) return;
    
    download.status = 'queued';
    download.error = undefined;
    this.notifyUpdate(id);
    this.processQueue();
  }

  public cancelDownload(id: string) {
    const download = this.downloads.get(id);
    const segments = this.segments.get(id);
    if (!download) return;

    download.status = 'cancelled';
    download.speed = 0;
    download.connections = 0;

    if (segments) {
        segments.forEach(seg => {
            if (seg.req) seg.req.destroy();
            
            const deletePart = () => {
                const partPath = `${download.savePath}.part${seg.index}`;
                if (fs.existsSync(partPath)) fs.unlink(partPath, () => {});
            };

            if (seg.stream) {
                seg.stream.close(() => {
                    deletePart();
                });
            } else {
                deletePart();
            }
        });
    }
    
    if (download.savePath && fs.existsSync(download.savePath)) {
        fs.unlink(download.savePath, () => {});
    }

    this.notifyUpdate(id);
    this.processQueue();
  }

  public removeDownload(id: string) {
    const download = this.downloads.get(id);
    if (!download) return;
    
    if (download.status !== 'completed') {
      this.cancelDownload(id);
    }
    
    this.downloads.delete(id);
    this.segments.delete(id);
    this.downloadHeaders.delete(id);
    this.lastUpdateTimes.delete(id);
    this.lastUpdateBytes.delete(id);
    this.saveStateImmediate();
    
    for (const win of BrowserWindow.getAllWindows()) {
      try {
        if (!win.isDestroyed()) {
          const wc = win.webContents;
          if (wc && !wc.isDestroyed()) {
            wc.send('download-removed', id);
          }
        }
      } catch (e) {
        // Window or webContents may be in the middle of closing
      }
    }
  }
  
  public async openFile(idOrPath: string) {
    if (!idOrPath) return;
    const download = this.downloads.get(idOrPath);
    const targetPath = download?.savePath || idOrPath;
    if (targetPath && fs.existsSync(targetPath)) {
      await shell.openPath(targetPath);
    }
  }

  public async openFolder(idOrPath: string) {
    if (!idOrPath) return;
    const download = this.downloads.get(idOrPath);
    const targetPath = download?.savePath || idOrPath;
    if (targetPath && fs.existsSync(targetPath)) {
      shell.showItemInFolder(targetPath);
    } else if (targetPath) {
      const parentDir = path.dirname(targetPath);
      if (fs.existsSync(parentDir)) {
        await shell.openPath(parentDir);
      }
    }
  }

  public retryDownload(id: string) {
    // Retry simply calls resume if it was in error state
    this.resumeDownload(id);
  }
}
