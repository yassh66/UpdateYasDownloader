import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  ping: () => ipcRenderer.invoke('ping'),
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  maximizeWindow: () => ipcRenderer.invoke('maximize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  startDownload: (options: any) => ipcRenderer.invoke('start-download', options),
  scheduleDownload: (url: string, time: number) => ipcRenderer.invoke('schedule-download', url, time),
  installBrowserIntegration: (extId: string) => ipcRenderer.invoke('install-browser-integration', extId),
  pauseDownload: (id: string) => ipcRenderer.invoke('pause-download', id),
  resumeDownload: (id: string) => ipcRenderer.invoke('resume-download', id),
  cancelDownload: (id: string) => ipcRenderer.invoke('cancel-download', id),
  removeDownload: (id: string) => ipcRenderer.invoke('remove-download', id),
  clearDownloads: () => ipcRenderer.invoke('clear-downloads'),
  openFile: (id: string) => ipcRenderer.invoke('open-file', id),
  openFolder: (id: string) => ipcRenderer.invoke('open-folder', id),
  retryDownload: (id: string) => ipcRenderer.invoke('retry-download', id),
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  onDownloadUpdate: (callback: (download: any) => void) => {
    const subscription = (_event: any, download: any) => callback(download);
    ipcRenderer.on('download-update', subscription);
    return () => ipcRenderer.removeListener('download-update', subscription);
  },
  onDownloadRemoved: (callback: (id: string) => void) => {
    const subscription = (_event: any, id: string) => callback(id);
    ipcRenderer.on('download-removed', subscription);
    return () => ipcRenderer.removeListener('download-removed', subscription);
  },
  onDownloadsCleared: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('downloads-cleared', subscription);
    return () => ipcRenderer.removeListener('downloads-cleared', subscription);
  },
  onInterceptDownload: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('intercept-download', subscription);
    return () => ipcRenderer.removeListener('intercept-download', subscription);
  },
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSettings: (settings: any) => ipcRenderer.invoke('update-settings', settings),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: (filterName?: string, extensions?: string[]) => ipcRenderer.invoke('select-file', filterName, extensions),
  validateCookies: (filePath: string) => ipcRenderer.invoke('validate-cookies', filePath),
  openDownloadDialog: (options?: any) => ipcRenderer.invoke('open-download-dialog', options),
  getTheme: () => ipcRenderer.invoke('get-theme'),
  setTheme: (theme: string) => ipcRenderer.invoke('set-theme', theme),
  onThemeChanged: (callback: (theme: string) => void) => {
    const subscription = (_event: any, theme: string) => callback(theme);
    ipcRenderer.on('theme-changed', subscription);
    return () => ipcRenderer.removeListener('theme-changed', subscription);
  },
  getLanguage: () => ipcRenderer.invoke('get-language'),
  setLanguage: (language: string) => ipcRenderer.invoke('set-language', language),
  onLanguageChanged: (callback: (language: string) => void) => {
    const subscription = (_event: any, language: string) => callback(language);
    ipcRenderer.on('language-changed', subscription);
    return () => ipcRenderer.removeListener('language-changed', subscription);
  }
});

const mediaEngineBridge = {
  detectUrl: (url: string) => ipcRenderer.invoke('media:detect-url', url),
  extractInfo: (url: string, options?: any) => ipcRenderer.invoke('media:extract-info', url, options),
  getFormats: (mediaInfo: any, targetQuality?: string, container?: string) =>
    ipcRenderer.invoke('media:get-formats', mediaInfo, targetQuality, container),
  checkBinaries: () => ipcRenderer.invoke('media:check-binaries'),
  validateCookies: (filePath: string) => ipcRenderer.invoke('media:validate-cookies', filePath),
  startDownload: (options: any) => ipcRenderer.invoke('media:start-download', options),
  pauseDownload: (jobId: string) => ipcRenderer.invoke('media:pause-download', jobId),
  resumeDownload: (jobId: string) => ipcRenderer.invoke('media:resume-download', jobId),
  cancelDownload: (jobId: string) => ipcRenderer.invoke('media:cancel-download', jobId),
  openFile: (pathOrJobId: string) => ipcRenderer.invoke('media:open-file', pathOrJobId),
  openFolder: (pathOrJobId: string) => ipcRenderer.invoke('media:open-folder', pathOrJobId),
  getActiveDownloads: () => ipcRenderer.invoke('media:get-active-downloads'),
  getDownload: (jobId: string) => ipcRenderer.invoke('media:get-download', jobId),
  removeJob: (jobId: string) => ipcRenderer.invoke('media:remove-job', jobId),
  clearHistory: () => ipcRenderer.invoke('media:clear-history'),
  onHistoryCleared: (callback: () => void) => {
    const subscription = () => callback();
    ipcRenderer.on('media:history-cleared', subscription);
    return () => ipcRenderer.removeListener('media:history-cleared', subscription);
  },
  onJobUpdate: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:job-update', subscription);
    return () => ipcRenderer.removeListener('media:job-update', subscription);
  },
  onProgress: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:download-progress', subscription);
    return () => ipcRenderer.removeListener('media:download-progress', subscription);
  },
  onComplete: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:download-complete', subscription);
    return () => ipcRenderer.removeListener('media:download-complete', subscription);
  },
  onError: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:download-error', subscription);
    return () => ipcRenderer.removeListener('media:download-error', subscription);
  },
  // Compatibility aliases
  onDownloadProgress: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:download-progress', subscription);
    return () => ipcRenderer.removeListener('media:download-progress', subscription);
  },
  onDownloadComplete: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:download-complete', subscription);
    return () => ipcRenderer.removeListener('media:download-complete', subscription);
  },
  onDownloadError: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('media:download-error', subscription);
    return () => ipcRenderer.removeListener('media:download-error', subscription);
  },
};

// Expose on window.mediaEngine and window.electron.mediaEngine
contextBridge.exposeInMainWorld('mediaEngine', mediaEngineBridge);
contextBridge.exposeInMainWorld('electron', {
  mediaEngine: mediaEngineBridge,
});


