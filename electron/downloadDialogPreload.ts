import { contextBridge, ipcRenderer } from 'electron';
import type { DownloadDialogResult, DownloadDialogData, DownloadItem } from '../src/types';

contextBridge.exposeInMainWorld('dialogAPI', {
  getDialogData: (explicitRequestId?: string): Promise<DownloadDialogData> => {
    return ipcRenderer.invoke('dialog-get-data', explicitRequestId);
  },
  getDownload: (id: string): Promise<DownloadItem | null> => {
    return ipcRenderer.invoke('dialog-get-download', id);
  },
  startDownload: (options: {
    requestId: string;
    filename: string;
    saveFolder: string;
    url?: string;
  }): Promise<{ success: boolean; downloadId?: string; error?: string }> => {
    return ipcRenderer.invoke('dialog-start-download', options);
  },
  scheduleDownload: (options: {
    requestId: string;
    filename: string;
    saveFolder: string;
    url?: string;
    scheduledTime?: number;
  }): Promise<{ success: boolean; downloadId?: string; error?: string }> => {
    return ipcRenderer.invoke('dialog-schedule-download', options);
  },
  submitAction: (result: DownloadDialogResult): Promise<{ success: boolean; downloadId?: string; error?: string }> => {
    return ipcRenderer.invoke('dialog-action', result);
  },
  pauseDownload: (id: string): Promise<void> => {
    return ipcRenderer.invoke('pause-download', id);
  },
  resumeDownload: (id: string): Promise<void> => {
    return ipcRenderer.invoke('resume-download', id);
  },
  cancelDownload: (id: string): Promise<void> => {
    return ipcRenderer.invoke('cancel-download', id);
  },
  retryDownload: (id: string): Promise<void> => {
    return ipcRenderer.invoke('retry-download', id);
  },
  openFile: (id: string): Promise<void> => {
    return ipcRenderer.invoke('open-file', id);
  },
  openFolder: (id: string): Promise<void> => {
    return ipcRenderer.invoke('open-folder', id);
  },
  selectFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('dialog-select-folder');
  },
  closeDialog: (): Promise<void> => {
    return ipcRenderer.invoke('dialog-close');
  },
  minimizeDialog: (): Promise<void> => {
    return ipcRenderer.invoke('dialog-minimize');
  },
  maximizeDialog: (): Promise<void> => {
    return ipcRenderer.invoke('dialog-maximize');
  },
  closeWindow: (): Promise<void> => {
    return ipcRenderer.invoke('dialog-close');
  },
  minimizeWindow: (): Promise<void> => {
    return ipcRenderer.invoke('dialog-minimize');
  },
  maximizeWindow: (): Promise<void> => {
    return ipcRenderer.invoke('dialog-maximize');
  },
  onDownloadUpdate: (callback: (download: DownloadItem) => void) => {
    const handler = (_event: any, download: DownloadItem) => callback(download);
    ipcRenderer.on('download-update', handler);
    return () => {
      ipcRenderer.removeListener('download-update', handler);
    };
  },
  onDownloadRemoved: (callback: (id: string) => void) => {
    const handler = (_event: any, id: string) => callback(id);
    ipcRenderer.on('download-removed', handler);
    return () => {
      ipcRenderer.removeListener('download-removed', handler);
    };
  },
  getTheme: (): Promise<'dark' | 'light'> => {
    return ipcRenderer.invoke('get-theme');
  },
  setTheme: (theme: string): Promise<void> => {
    return ipcRenderer.invoke('set-theme', theme);
  },
  onThemeChanged: (callback: (theme: string) => void) => {
    const handler = (_event: any, theme: string) => callback(theme);
    ipcRenderer.on('theme-changed', handler);
    return () => {
      ipcRenderer.removeListener('theme-changed', handler);
    };
  },
  getLanguage: (): Promise<'en' | 'fa'> => {
    return ipcRenderer.invoke('get-language');
  },
  setLanguage: (language: string): Promise<void> => {
    return ipcRenderer.invoke('set-language', language);
  },
  onLanguageChanged: (callback: (language: string) => void) => {
    const handler = (_event: any, language: string) => callback(language);
    ipcRenderer.on('language-changed', handler);
    return () => {
      ipcRenderer.removeListener('language-changed', handler);
    };
  }
});

