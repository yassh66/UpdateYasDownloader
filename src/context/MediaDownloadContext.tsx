import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { MediaDownloadJobItem } from '../types';

interface MediaDownloadContextType {
  isMediaModalOpen: boolean;
  isMinimized: boolean;
  activeJob: MediaDownloadJobItem | null;
  currentUrl: string;
  setCurrentUrl: (url: string) => void;
  openMediaDialog: (url?: string) => void;
  minimizeMediaDialog: () => void;
  closeMediaDialog: () => void;
  restoreMediaDialog: () => void;
  setActiveJob: (job: MediaDownloadJobItem | null) => void;
}

const MediaDownloadContext = createContext<MediaDownloadContextType | undefined>(undefined);

export function MediaDownloadProvider({ children }: { children: React.ReactNode }) {
  const [isMediaModalOpen, setIsMediaModalOpen] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [activeJob, setActiveJob] = useState<MediaDownloadJobItem | null>(null);
  const [currentUrl, setCurrentUrl] = useState<string>('');

  const openMediaDialog = useCallback((url?: string) => {
    if (url !== undefined) {
      setCurrentUrl(url);
      // Replace any previous active dialog item
      setActiveJob((prev) => {
        if (prev && (prev.status === 'downloading' || prev.status === 'paused') && prev.url === url) {
          return prev;
        }
        return null;
      });
    } else {
      // Clear completed/stale jobs from dialog memory
      setActiveJob((prev) => {
        if (prev && (prev.status === 'downloading' || prev.status === 'paused')) {
          return prev;
        }
        return null;
      });
    }
    setIsMinimized(false);
    setIsMediaModalOpen(true);
  }, []);

  const minimizeMediaDialog = useCallback(() => {
    setIsMediaModalOpen(false);
    // If there is an active job or an ongoing URL/analysis, mark as minimized so indicator shows
    setIsMinimized(true);
  }, []);

  const closeMediaDialog = useCallback(() => {
    setIsMediaModalOpen(false);
    setIsMinimized(false);
  }, []);

  const restoreMediaDialog = useCallback(() => {
    setIsMinimized(false);
    setIsMediaModalOpen(true);
  }, []);

  // Listen for real-time media engine job updates to keep activeJob synchronized
  useEffect(() => {
    const engine = (window as any).electron?.mediaEngine || (window as any).mediaEngine;
    if (!engine) return;

    let unsubJob: (() => void) | undefined;
    let unsubProgress: (() => void) | undefined;
    let unsubComplete: (() => void) | undefined;
    let unsubError: (() => void) | undefined;

    if (engine.onJobUpdate) {
      unsubJob = engine.onJobUpdate((job: MediaDownloadJobItem) => {
        if (!job) return;
        setActiveJob((prev) => {
          if (job.status === 'completed' || job.status === 'cancelled') {
            // Remove completed or cancelled item from active dialog memory immediately
            if (prev && prev.id === job.id) return null;
            return prev;
          }
          if (!prev || prev.id === job.id) {
            return job;
          }
          return prev;
        });
      });
    }

    if (engine.onDownloadProgress) {
      unsubProgress = engine.onDownloadProgress((prog: any) => {
        if (!prog || !prog.jobId) return;
        setActiveJob((prev) => {
          if (prev && prev.id === prog.jobId) {
            return {
              ...prev,
              stage: prog.stage || prev.stage,
              percent: Math.round(prog.percent ?? prev.percent),
              speed: prog.speed || prev.speed,
              eta: prog.eta || prev.eta,
              outputPath: prog.outputPath || prev.outputPath,
              error: prog.error || prev.error,
            };
          }
          return prev;
        });
      });
    }

    if (engine.onDownloadComplete) {
      unsubComplete = engine.onDownloadComplete((data: any) => {
        if (!data || !data.jobId) return;
        setActiveJob((prev) => {
          // Clear the active media dialog state on completion
          if (prev && prev.id === data.jobId) {
            return null;
          }
          return prev;
        });
      });
    }

    if (engine.onDownloadError) {
      unsubError = engine.onDownloadError((data: any) => {
        if (!data || !data.jobId) return;
        setActiveJob((prev) => {
          if (prev && prev.id === data.jobId) {
            return {
              ...prev,
              status: 'error',
              stage: 'error',
              error: data.error || 'Download failed',
            };
          }
          return prev;
        });
      });
    }

    return () => {
      if (unsubJob) unsubJob();
      if (unsubProgress) unsubProgress();
      if (unsubComplete) unsubComplete();
      if (unsubError) unsubError();
    };
  }, []);

  return (
    <MediaDownloadContext.Provider
      value={{
        isMediaModalOpen,
        isMinimized,
        activeJob,
        currentUrl,
        setCurrentUrl,
        openMediaDialog,
        minimizeMediaDialog,
        closeMediaDialog,
        restoreMediaDialog,
        setActiveJob,
      }}
    >
      {children}
    </MediaDownloadContext.Provider>
  );
}

export function useMediaDownload() {
  const context = useContext(MediaDownloadContext);
  if (!context) {
    throw new Error('useMediaDownload must be used within a MediaDownloadProvider');
  }
  return context;
}
