import { useState, useEffect } from 'react';
import './types';
import type { InterceptedDownloadData, StartDownloadOptions } from './types';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import { MediaDownloadProvider } from './context/MediaDownloadContext';
import { AccentProvider } from './context/AccentContext';

// Components
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatsArea from './components/StatsArea';
import DownloadList from './components/DownloadList';
import SettingsPanel from './components/SettingsPanel';
import DownloadDialog from './components/DownloadDialog';
import StandaloneDownloadDialog from './components/StandaloneDownloadDialog';
import MediaDownloadDialog from './components/MediaDownloadDialog';
import MiniMediaIndicator from './components/MiniMediaIndicator';

// Synchronously initialize mock API bridges for browser/preview mode before any React context or component mounts
function initWebPreviewMocks() {
  if (typeof window === 'undefined') return;

  if (!window.electronAPI) {
    const mockDownloads = new Map<string, any>();
    let subscribers: any[] = [];
    let subscribersRemoved: any[] = [];
    let subscribersCleared: any[] = [];
    let interceptSubscribers: any[] = [];

    let mockSettings = {
      downloadFolder: '/Users/mock/Downloads',
      maxConcurrent: 3,
      maxConnections: 8,
      launchOnStartup: false,
      speedLimit: 0,
      autoIntercept: true,
      theme: (localStorage.getItem('yas_downloader_theme') as any) || 'dark',
      accentColor: localStorage.getItem('yas_downloader_accent') || '#6E4BFF'
    };

    window.electronAPI = {
      isMock: true,
      ping: async () => 'pong from MOCKED Electron API (Web Preview Environment)',
      minimizeWindow: async () => { console.log('Mock: minimize window'); },
      maximizeWindow: async () => { console.log('Mock: maximize window'); },
      closeWindow: async () => { console.log('Mock: close window'); },
      startDownload: async (input: string | StartDownloadOptions) => {
        const opts: StartDownloadOptions = typeof input === 'string' ? { url: input } : input;
        const id = Math.random().toString(36).substring(7);
        const isStartNow = opts.startNow !== false;
        const d = {
          id, 
          url: opts.url, 
          filename: opts.filename || 'mock_file.zip', 
          status: isStartNow ? 'downloading' : 'waiting',
          totalBytes: opts.totalBytes || 100000000, 
          downloadedBytes: 0, 
          progress: 0, 
          speed: isStartNow ? 2500000 : 0, 
          timeRemaining: isStartNow ? 40 : 0,
          savePath: opts.savePath || `/Users/mock/Downloads/${opts.filename || 'mock_file.zip'}`,
          category: 'other'
        };
        mockDownloads.set(id, d);
        subscribers.forEach(cb => cb(d));

        if (isStartNow) {
          let progress = 0;
          const interval = setInterval(() => {
            progress += 5;
            if (progress > 100) {
              clearInterval(interval);
              d.status = 'completed';
              d.progress = 100;
              d.downloadedBytes = d.totalBytes;
              d.speed = 0;
              d.timeRemaining = 0;
            } else {
              d.progress = progress;
              d.downloadedBytes = (d.totalBytes * progress) / 100;
              d.speed = 2500000 + Math.random() * 500000;
              d.timeRemaining = Math.round((d.totalBytes - d.downloadedBytes) / Math.max(1, d.speed));
            }
            subscribers.forEach(cb => cb({ ...d }));
          }, 1000);
        }

        return id;
      },
      pauseDownload: async (id: string) => {
        const d = mockDownloads.get(id);
        if (d) {
          d.status = 'paused';
          d.speed = 0;
          subscribers.forEach(cb => cb({ ...d }));
        }
      },
      resumeDownload: async (id: string) => {
        const d = mockDownloads.get(id);
        if (d) {
          d.status = 'downloading';
          d.speed = 2500000;
          subscribers.forEach(cb => cb({ ...d }));
        }
      },
      cancelDownload: async (id: string) => {
        const d = mockDownloads.get(id);
        if (d) {
          d.status = 'cancelled';
          d.speed = 0;
          subscribers.forEach(cb => cb({ ...d }));
        }
      },
      removeDownload: async (id: string) => {
        mockDownloads.delete(id);
        subscribersRemoved.forEach(cb => cb(id));
      },
      clearDownloads: async () => {
        mockDownloads.clear();
        subscribersCleared.forEach(cb => cb());
      },
      retryDownload: async (id: string) => {
        const d = mockDownloads.get(id);
        if (d) {
          d.status = 'downloading';
          d.progress = 0;
          d.downloadedBytes = 0;
          subscribers.forEach(cb => cb({ ...d }));
        }
      },
      openFile: async (id: string) => console.log('Mock: openFile', id),
      openFolder: async (id: string) => console.log('Mock: openFolder', id),
      getDownloads: async () => Array.from(mockDownloads.values()),
      getSettings: async () => ({ ...mockSettings }),
      updateSettings: async (newSettings: any) => {
        mockSettings = { ...mockSettings, ...newSettings };
        if (newSettings.accentColor) {
          try {
            localStorage.setItem('yas_downloader_accent', newSettings.accentColor);
          } catch (e) {}
        }
        if (newSettings.theme) {
          try {
            localStorage.setItem('yas_downloader_theme', newSettings.theme);
          } catch (e) {}
        }
      },
      selectFolder: async () => '/Users/mock/Downloads',
      installBrowserIntegration: async () => true,
      scheduleDownload: async (url: string, time: number) => {
        const id = Math.random().toString(36).substring(7);
        const d = {
          id,
          url,
          filename: url.split('/').pop() || 'scheduled_file',
          status: 'scheduled',
          totalBytes: 50000000,
          downloadedBytes: 0,
          progress: 0,
          speed: 0,
          timeRemaining: 0,
          scheduledTime: time,
          savePath: `/Users/mock/Downloads/scheduled_file`
        };
        mockDownloads.set(id, d);
        subscribers.forEach(cb => cb(d));
        return id;
      },
      openDownloadDialog: async (request: any) => {
        const data: InterceptedDownloadData = {
          url: request.url,
          finalUrl: request.url,
          filename: request.url.split('/').pop() || 'downloaded_file',
          fileSize: 0,
          defaultFolder: '/Users/mock/Downloads'
        };
        interceptSubscribers.forEach(cb => cb(data));
      },
      onDownloadUpdate: (callback: any) => {
        subscribers.push(callback);
        return () => {
          subscribers = subscribers.filter(cb => cb !== callback);
        };
      },
      onDownloadRemoved: (callback: any) => {
        subscribersRemoved.push(callback);
        return () => {
          subscribersRemoved = subscribersRemoved.filter(cb => cb !== callback);
        };
      },
      onDownloadsCleared: (callback: any) => {
        subscribersCleared.push(callback);
        return () => {
          subscribersCleared = subscribersCleared.filter(cb => cb !== callback);
        };
      },
      onInterceptDownload: (callback: any) => {
        interceptSubscribers.push(callback);
        return () => {
          interceptSubscribers = interceptSubscribers.filter(cb => cb !== callback);
        };
      }
    } as any;
  }

  if (!window.mediaEngine) {
    const mockMediaJobs = new Map<string, any>();
    let mediaJobSubscribers: any[] = [];
    let mediaClearedSubscribers: any[] = [];

    window.mediaEngine = {
      detectUrl: async (u: string) => ({
        isMediaUrl: u.includes('youtube') || u.includes('youtu.be') || u.includes('instagram') || u.includes('tiktok'),
        platform: u.includes('youtube') ? 'youtube' : 'direct_file',
        canonicalUrl: u,
        mediaTypeHint: 'video'
      }),
      extractInfo: async (u: string) => ({
        url: u,
        title: 'Sample Extracted Media',
        duration: 180,
        formats: []
      }),
      getFormats: async () => ({ formats: [] }),
      getActiveDownloads: async () => Array.from(mockMediaJobs.values()),
      getDownload: async (jobId: string) => mockMediaJobs.get(jobId) || null,
      removeJob: async (jobId: string) => {
        mockMediaJobs.delete(jobId);
        return true;
      },
      clearHistory: async () => {
        mockMediaJobs.clear();
        mediaClearedSubscribers.forEach(cb => cb());
        return true;
      },
      onJobUpdate: (cb: any) => {
        mediaJobSubscribers.push(cb);
        return () => {
          mediaJobSubscribers = mediaJobSubscribers.filter(f => f !== cb);
        };
      },
      onHistoryCleared: (cb: any) => {
        mediaClearedSubscribers.push(cb);
        return () => {
          mediaClearedSubscribers = mediaClearedSubscribers.filter(f => f !== cb);
        };
      }
    } as any;
  }
}

// Synchronously execute setup so window.electronAPI and window.mediaEngine exist BEFORE React providers mount
initWebPreviewMocks();

export default function App() {
  return (
    <ThemeProvider>
      <AccentProvider>
        <LanguageProvider>
          <MediaDownloadProvider>
            <AppContent />
          </MediaDownloadProvider>
        </LanguageProvider>
      </AccentProvider>
    </ThemeProvider>
  );
}

function AppContent() {
  // Check if this window was opened as an independent Download Dialog
  const isDialogWindow = 
    window.location.search.includes('dialog=true') || 
    window.location.hash.includes('dialog') || 
    typeof (window as any).dialogAPI !== 'undefined';

  if (isDialogWindow) {
    return <StandaloneDownloadDialog />;
  }

  return <MainApp />;
}

function MainApp() {
  const isMock = !!(window.electronAPI as any)?.isMock;
  const [ipcStatus, setIpcStatus] = useState<string>(isMock ? 'Web Preview Ready' : 'Ready');
  const [isWebPreview, setIsWebPreview] = useState<boolean>(isMock);
  const [currentTab, setCurrentTab] = useState<string>('Dashboard');
  const [interceptedData, setInterceptedData] = useState<InterceptedDownloadData | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isLight = theme === 'light';

  useEffect(() => {
    if (isMock) {
      // Add dummy initial download to web preview mock if empty
      window.electronAPI?.getDownloads?.().then((items: any[]) => {
        if (!items || items.length === 0) {
          window.electronAPI?.startDownload({
            url: 'https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso',
            filename: 'ubuntu-24.04-desktop-amd64.iso',
            totalBytes: 6100000000
          });
        }
      });
    } else {
      window.electronAPI?.ping?.().then(setIpcStatus).catch(err => setIpcStatus('IPC Error: ' + err));
    }

    const unsubscribers: (() => void)[] = [];

    if (window.electronAPI?.onInterceptDownload) {
      const unsubscribe = window.electronAPI.onInterceptDownload((data: InterceptedDownloadData) => {
        setInterceptedData(data);
        setIsDialogOpen(true);
      });
      if (unsubscribe) unsubscribers.push(unsubscribe);
    }

    // Media Engine Event Subscriptions in App root
    const mediaEngine = (window as any).electron?.mediaEngine || (window as any).mediaEngine;
    if (mediaEngine) {
      if (mediaEngine.onJobUpdate) {
        const unsub = mediaEngine.onJobUpdate((job: any) => {
          console.log('[App] Media Job Update:', job?.id, job?.status, job?.percent);
        });
        if (unsub) unsubscribers.push(unsub);
      }
      if (mediaEngine.onProgress) {
        const unsub = mediaEngine.onProgress((data: any) => {
          console.log('[App] Media Progress:', data?.jobId, data?.percent);
        });
        if (unsub) unsubscribers.push(unsub);
      }
      if (mediaEngine.onComplete) {
        const unsub = mediaEngine.onComplete((data: any) => {
          console.log('[App] Media Complete:', data?.jobId, data?.outputPath);
        });
        if (unsub) unsubscribers.push(unsub);
      }
      if (mediaEngine.onError) {
        const unsub = mediaEngine.onError((data: any) => {
          console.error('[App] Media Error:', data?.jobId, data?.error);
        });
        if (unsub) unsubscribers.push(unsub);
      }
    }

    return () => {
      unsubscribers.forEach(fn => {
        try { fn(); } catch (e) {}
      });
    };
  }, [isMock]);

  // Global Drag & Drop Link Handler
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const text = e.dataTransfer?.getData('text/plain') || e.dataTransfer?.getData('text/uri-list');
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        try {
          if (window.electronAPI?.openDownloadDialog) {
            await window.electronAPI.openDownloadDialog({ url: text.trim() });
          } else {
            await window.electronAPI?.startDownload(text.trim());
          }
        } catch (err) {
          console.error('Failed to trigger download from drop:', err);
        }
      }
    };

    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  const handleConfirmDownload = async (options: StartDownloadOptions, startNow: boolean) => {
    try {
      await window.electronAPI?.startDownload({ ...options, startNow });
    } catch (err) {
      console.error('Failed to start intercepted download:', err);
    }
  };

  return (
    <div className={`h-screen w-screen flex flex-col font-sans overflow-hidden select-none transition-colors duration-200 ${
      isLight ? 'bg-[#F8FAFC] text-slate-800' : 'bg-[#05050C] text-slate-200'
    }`}>
      {/* Web Preview Fallback Dialog */}
      <DownloadDialog 
        isOpen={isDialogOpen}
        data={interceptedData}
        onClose={() => setIsDialogOpen(false)}
        onConfirm={handleConfirmDownload}
      />
      
      {/* Ambient purple/pink background luxury glows */}
      <div className={`fixed top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full blur-[130px] pointer-events-none transition-colors ${
        isLight 
          ? 'bg-gradient-to-br from-purple-300/20 via-pink-200/15 to-transparent' 
          : 'bg-gradient-to-br from-purple-900/15 via-fuchsia-900/10 to-transparent'
      }`}></div>
      <div className={`fixed bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full blur-[130px] pointer-events-none transition-colors ${
        isLight 
          ? 'bg-gradient-to-tl from-pink-300/20 via-purple-200/15 to-transparent' 
          : 'bg-gradient-to-tl from-pink-900/15 via-purple-900/10 to-transparent'
      }`}></div>

      {/* Title Bar (Frameless Draggable Region for Electron) */}
      <div className={`h-9 shrink-0 flex items-center justify-between px-4 select-none drag-region border-b relative z-50 backdrop-blur-md transition-colors ${
        isLight 
          ? 'bg-white/85 border-purple-900/10 text-slate-700 shadow-[0_1px_3px_rgba(0,0,0,0.02)]' 
          : 'bg-[#070712]/90 border-purple-500/10 text-slate-300'
      }`}>
        <span className={`text-[10px] font-bold tracking-[0.25em] uppercase font-display flex items-center gap-2 ${
          isLight ? 'text-slate-800' : 'text-slate-300'
        }`}>
          <span className="w-2 h-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500" />
          YAS Downloader
        </span>
        <div className="flex gap-2.5 no-drag items-center">
          <button 
            onClick={() => window.electronAPI?.minimizeWindow()} 
            className={`w-3 h-3 rounded-full border transition-all flex items-center justify-center group ${
              isLight ? 'bg-slate-200/80 hover:bg-slate-300 border-slate-300' : 'bg-white/10 hover:bg-white/20 border-white/10'
            }`}
            title="Minimize"
          >
            <div className={`w-1.5 h-[1px] transition-colors ${
              isLight ? 'bg-slate-700' : 'bg-white/0 group-hover:bg-white/80'
            }`}></div>
          </button>
          <button 
            onClick={() => window.electronAPI?.maximizeWindow()} 
            className={`w-3 h-3 rounded-full border transition-all flex items-center justify-center group ${
              isLight ? 'bg-slate-200/80 hover:bg-slate-300 border-slate-300' : 'bg-white/10 hover:bg-white/20 border-white/10'
            }`}
            title="Maximize"
          >
             <div className={`w-1.5 h-1.5 border transition-colors ${
               isLight ? 'border-slate-700' : 'border-white/0 group-hover:border-white/80'
             }`}></div>
          </button>
          <button 
            onClick={() => window.electronAPI?.closeWindow()} 
            className={`w-3 h-3 rounded-full border transition-all flex items-center justify-center group ${
              isLight ? 'bg-slate-200/80 hover:bg-rose-500 hover:border-rose-500 border-slate-300' : 'bg-white/10 hover:bg-rose-600 border-white/10'
            }`}
            title="Close"
          >
            <svg width="6" height="6" viewBox="0 0 10 10" className={isLight ? "opacity-70 group-hover:opacity-100" : "opacity-0 group-hover:opacity-100"}>
              <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M1 1l8 8M9 1L1 9" className={isLight ? "text-slate-800 group-hover:text-white" : "text-white"}/>
            </svg>
          </button>
        </div>
      </div>

      {/* Main App Layout: Strict height locking to guarantee no window or container resize */}
      <div className="flex flex-1 overflow-hidden relative z-10 min-h-0">
        <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />
        
        <div className="flex-1 flex flex-col relative min-w-0 min-h-0 overflow-hidden">
          <Header />
          
          <main className="flex-1 p-5 overflow-hidden flex flex-col min-h-0">
            <header className="mb-3 shrink-0">
              <h2 className={`font-display text-2xl font-bold tracking-tight ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                {currentTab === 'Dashboard' ? t('overview.dashboardTitle') : 
                 currentTab === 'History' ? t('overview.historyTitle') : 
                 currentTab === 'Download Queue' ? t('overview.queueTitle') :
                 t('overview.settingsTitle')}
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {currentTab === 'Dashboard' ? t('overview.dashboardSubtitle') : 
                 currentTab === 'History' ? t('overview.historySubtitle') : 
                 currentTab === 'Download Queue' ? t('overview.queueSubtitle') : 
                 t('overview.settingsSubtitle')}
              </p>
            </header>

            {currentTab === 'Dashboard' && <StatsArea />}
            
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
              {currentTab !== 'Settings' ? (
                <DownloadList isWebPreview={isWebPreview} ipcStatus={ipcStatus} currentTab={currentTab} />
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0 stable-scroll-container">
                  <SettingsPanel />
                </div>
              )}
            </div>
          </main>
        </div>
      </div>

      {/* Universal Floating Media Downloader Dialog */}
      <MediaDownloadDialog />

      {/* Floating Minimized Media Progress Indicator */}
      <MiniMediaIndicator />
    </div>
  );
}
