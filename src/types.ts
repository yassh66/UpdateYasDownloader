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

export interface InterceptedDownloadData {
  requestId?: string;
  action?: 'intercept-download' | 'start-download';
  url: string;
  finalUrl?: string;
  filename?: string;
  fileSize?: number;
  mime?: string;
  referrer?: string;
  cookies?: string;
  userAgent?: string;
  defaultFolder?: string;
}

export interface PendingDownloadRequest {
  requestId: string;
  url: string;
  finalUrl?: string;
  filename: string;
  fileSize: number;
  mime?: string;
  referrer?: string;
  cookies?: string;
  userAgent?: string;
  timestamp: number;
}

/**
 * Sanitized data passed to the independent Download Dialog renderer.
 * Sensitive context (such as cookies) is NEVER exposed to the renderer.
 */
export interface DownloadDialogData {
  requestId: string;
  url: string;
  finalUrl?: string;
  filename: string;
  fileSize: number;
  mime?: string;
  referrer?: string;
  defaultFolder: string;
}

export interface DownloadDialogResult {
  requestId: string;
  action: 'download-now' | 'download-later' | 'cancel';
  filename: string;
  saveFolder: string;
  url?: string;
  scheduledTime?: number;
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
  savePath?: string;
  resumable?: boolean;
  connections?: number;
  category?: 'video' | 'audio' | 'document' | 'software' | 'archive' | 'other';
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
  accentColor?: string;
  cookiesPath?: string;
}

export interface ElectronAPI {
  ping: () => Promise<string>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  startDownload: (options: string | StartDownloadOptions) => Promise<string>;
  scheduleDownload: (url: string, time: number) => Promise<string>;
  openDownloadDialog?: (options?: Partial<DownloadDialogData>) => Promise<void>;
  installBrowserIntegration: (extId: string) => Promise<boolean>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  removeDownload: (id: string) => Promise<void>;
  clearDownloads?: () => Promise<void>;
  openFile: (id: string) => Promise<void>;
  openFolder: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  getDownloads: () => Promise<DownloadItem[]>;
  onDownloadUpdate: (callback: (download: DownloadItem) => void) => () => void;
  onDownloadRemoved: (callback: (id: string) => void) => () => void;
  onDownloadsCleared?: (callback: () => void) => () => void;
  onInterceptDownload?: (callback: (data: InterceptedDownloadData) => void) => () => void;
  getSettings: () => Promise<AppSettings>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  selectFolder: () => Promise<string | null>;
  selectFile?: (filterName?: string, extensions?: string[]) => Promise<string | null>;
  getTheme?: () => Promise<'dark' | 'light'>;
  setTheme?: (theme: 'dark' | 'light') => Promise<void>;
  onThemeChanged?: (callback: (theme: 'dark' | 'light') => void) => () => void;
  getLanguage?: () => Promise<'en' | 'fa'>;
  setLanguage?: (language: 'en' | 'fa') => Promise<void>;
  onLanguageChanged?: (callback: (language: 'en' | 'fa') => void) => () => void;
}

export interface MediaDownloadJobItem {
  id: string;
  url: string;
  title: string;
  cleanFileName: string;
  quality: string;
  container: string;
  saveFolder: string;
  status: 'downloading' | 'paused' | 'completed' | 'error' | 'cancelled';
  stage: string;
  percent: number;
  speed: string;
  eta: string;
  downloadedBytes?: number;
  totalBytes?: number;
  outputPath?: string;
  error?: string;
  startTime: number;
  endTime?: number;
  mediaInfo?: any;
}

export interface MediaEngineAPI {
  detectUrl: (url: string) => Promise<{
    isMediaUrl: boolean;
    platform: string;
    canonicalUrl: string;
    mediaTypeHint: string;
    videoIdOrId?: string;
  }>;
  extractInfo: (url: string, options?: any) => Promise<any>;
  getFormats: (mediaInfo: any, targetQuality?: string, container?: string) => Promise<any>;
  checkBinaries?: () => Promise<any>;
  startDownload?: (options: any) => Promise<{ success: boolean; jobId?: string; outputPath?: string; error?: string }>;
  pauseDownload?: (jobId: string) => Promise<boolean>;
  resumeDownload?: (jobId: string) => Promise<{ success: boolean; jobId?: string; outputPath?: string; error?: string }>;
  cancelDownload?: (jobId: string) => Promise<boolean>;
  openFile?: (pathOrJobId: string) => Promise<boolean>;
  openFolder?: (pathOrJobId: string) => Promise<boolean>;
  getActiveDownloads?: () => Promise<MediaDownloadJobItem[]>;
  getDownload?: (jobId: string) => Promise<MediaDownloadJobItem | null>;
  removeJob?: (jobId: string) => Promise<boolean>;
  clearHistory?: () => Promise<boolean>;
  onDownloadProgress?: (callback: (data: any) => void) => () => void;
  onDownloadComplete?: (callback: (data: any) => void) => () => void;
  onDownloadError?: (callback: (data: any) => void) => () => void;
  onJobUpdate?: (callback: (job: MediaDownloadJobItem) => void) => () => void;
  onHistoryCleared?: (callback: () => void) => () => void;
  onProgress?: (callback: (data: any) => void) => () => void;
  onComplete?: (callback: (data: any) => void) => () => void;
  onError?: (callback: (data: any) => void) => () => void;
}

export interface DialogAPI {
  getDialogData: (explicitRequestId?: string) => Promise<DownloadDialogData>;
  getDownload: (id: string) => Promise<DownloadItem | null>;
  startDownload: (options: {
    requestId: string;
    filename: string;
    saveFolder: string;
    url?: string;
  }) => Promise<{ success: boolean; downloadId?: string; error?: string }>;
  scheduleDownload: (options: {
    requestId: string;
    filename: string;
    saveFolder: string;
    url?: string;
    scheduledTime?: number;
  }) => Promise<{ success: boolean; downloadId?: string; error?: string }>;
  submitAction: (result: DownloadDialogResult) => Promise<{ success: boolean; downloadId?: string; error?: string }>;
  pauseDownload: (id: string) => Promise<void>;
  resumeDownload: (id: string) => Promise<void>;
  cancelDownload: (id: string) => Promise<void>;
  retryDownload: (id: string) => Promise<void>;
  openFile: (id: string) => Promise<void>;
  openFolder: (id: string) => Promise<void>;
  selectFolder: () => Promise<string | null>;
  closeDialog: () => Promise<void>;
  minimizeDialog: () => Promise<void>;
  maximizeDialog: () => Promise<void>;
  closeWindow?: () => Promise<void>;
  minimizeWindow?: () => Promise<void>;
  maximizeWindow?: () => Promise<void>;
  onDownloadUpdate: (callback: (download: DownloadItem) => void) => () => void;
  onDownloadRemoved: (callback: (id: string) => void) => () => void;
  getTheme?: () => Promise<'dark' | 'light'>;
  setTheme?: (theme: 'dark' | 'light') => Promise<void>;
  onThemeChanged?: (callback: (theme: 'dark' | 'light') => void) => () => void;
  getLanguage?: () => Promise<'en' | 'fa'>;
  setLanguage?: (language: 'en' | 'fa') => Promise<void>;
  onLanguageChanged?: (callback: (language: 'en' | 'fa') => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    dialogAPI?: DialogAPI;
    mediaEngine?: MediaEngineAPI;
  }
}
