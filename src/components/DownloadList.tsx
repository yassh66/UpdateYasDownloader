import { useEffect, useState } from 'react';
import { Play, Pause, X, File, RefreshCw, FolderOpen, Trash2, Search, Video, Music, FileText, Monitor, Archive } from 'lucide-react';
import GlassButton from './GlassButton';
import type { DownloadItem, MediaDownloadJobItem } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export default function DownloadList({ isWebPreview, ipcStatus, currentTab }: { isWebPreview: boolean, ipcStatus: string, currentTab: string }) {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const [mediaJobs, setMediaJobs] = useState<MediaDownloadJobItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isLight = theme === 'light';

  const getCategoryIcon = (category?: string, isMedia?: boolean) => {
    const iconClass = "w-5 h-5";
    if (isMedia) {
      if (category === 'audio') return <Music className={`${iconClass} ${isLight ? 'text-pink-600' : 'text-pink-400'}`} strokeWidth={1.5} />;
      return <Video className={`${iconClass} ${isLight ? 'text-purple-600' : 'text-purple-400'}`} strokeWidth={1.5} />;
    }
    switch (category) {
      case 'video': return <Video className={`${iconClass} ${isLight ? 'text-fuchsia-600' : 'text-fuchsia-400'}`} strokeWidth={1.5} />;
      case 'audio': return <Music className={`${iconClass} ${isLight ? 'text-pink-600' : 'text-pink-400'}`} strokeWidth={1.5} />;
      case 'document': return <FileText className={`${iconClass} ${isLight ? 'text-violet-600' : 'text-violet-400'}`} strokeWidth={1.5} />;
      case 'software': return <Monitor className={`${iconClass} ${isLight ? 'text-purple-600' : 'text-purple-400'}`} strokeWidth={1.5} />;
      case 'archive': return <Archive className={`${iconClass} ${isLight ? 'text-rose-600' : 'text-rose-400'}`} strokeWidth={1.5} />;
      default: return <File className={`${iconClass} ${isLight ? 'text-fuchsia-600' : 'text-fuchsia-400'}`} strokeWidth={1.5} />;
    }
  };

  useEffect(() => {
    // Initial fetch of regular downloads
    if (window.electronAPI?.getDownloads) {
      window.electronAPI.getDownloads()
        .then((res) => {
          if (Array.isArray(res)) setDownloads(res);
        })
        .catch(console.error);
    }

    // Initial fetch of media downloads
    if (window.mediaEngine?.getActiveDownloads) {
      window.mediaEngine.getActiveDownloads()
        .then((jobs) => {
          if (Array.isArray(jobs)) setMediaJobs(jobs);
        })
        .catch(console.error);
    }

    // Subscribe to download updates
    let unsubscribe: (() => void) | undefined;
    if (window.electronAPI?.onDownloadUpdate) {
      unsubscribe = window.electronAPI.onDownloadUpdate((updatedDownload) => {
        if (!updatedDownload || !updatedDownload.id) return;
        setDownloads((prev) => {
          const index = prev.findIndex((d) => d.id === updatedDownload.id);
          if (index !== -1) {
            const next = [...prev];
            next[index] = updatedDownload;
            return next;
          } else {
            return [updatedDownload, ...prev];
          }
        });
      });
    }
    
    let unsubscribeRemoved: (() => void) | undefined;
    if (window.electronAPI?.onDownloadRemoved) {
      unsubscribeRemoved = window.electronAPI.onDownloadRemoved((id) => {
        setDownloads((prev) => prev.filter(d => d.id !== id));
      });
    }

    // Subscribe to media job updates
    let unsubscribeMedia: (() => void) | undefined;
    if (window.mediaEngine?.onJobUpdate) {
      unsubscribeMedia = window.mediaEngine.onJobUpdate((updatedJob: MediaDownloadJobItem) => {
        if (!updatedJob || !updatedJob.id) return;
        setMediaJobs((prev) => {
          const idx = prev.findIndex((j) => j.id === updatedJob.id);
          if (idx !== -1) {
            const next = [...prev];
            next[idx] = updatedJob;
            return next;
          } else {
            return [updatedJob, ...prev];
          }
        });
      });
    }

    // Subscribe to downloads cleared events
    let unsubscribeCleared: (() => void) | undefined;
    if (window.electronAPI?.onDownloadsCleared) {
      unsubscribeCleared = window.electronAPI.onDownloadsCleared(() => {
        setDownloads([]);
      });
    }

    // Subscribe to media history cleared events
    let unsubscribeMediaCleared: (() => void) | undefined;
    if (window.mediaEngine?.onHistoryCleared) {
      unsubscribeMediaCleared = window.mediaEngine.onHistoryCleared(() => {
        setMediaJobs([]);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeRemoved) unsubscribeRemoved();
      if (unsubscribeMedia) unsubscribeMedia();
      if (unsubscribeCleared) unsubscribeCleared();
      if (unsubscribeMediaCleared) unsubscribeMediaCleared();
    };
  }, []);

  const handlePause = (id: string) => window.electronAPI.pauseDownload(id).catch(console.error);
  const handleResume = (id: string) => window.electronAPI.resumeDownload(id).catch(console.error);
  const handleCancel = (id: string) => window.electronAPI.cancelDownload(id).catch(console.error);
  const handleRemove = (id: string) => window.electronAPI.removeDownload(id).catch(console.error);
  const handleRetry = (id: string) => window.electronAPI.retryDownload(id).catch(console.error);
  const handleOpenFile = (id: string) => window.electronAPI.openFile(id).catch(console.error);
  const handleOpenFolder = (pathOrId: string) => window.electronAPI.openFolder(pathOrId).catch(console.error);

  const handleCancelMedia = async (jobId: string) => {
    if (window.mediaEngine?.cancelDownload) {
      await window.mediaEngine.cancelDownload(jobId).catch(console.error);
    }
  };

  const handlePauseMedia = async (jobId: string) => {
    if (window.mediaEngine?.pauseDownload) {
      await window.mediaEngine.pauseDownload(jobId).catch(console.error);
    }
  };

  const handleResumeMedia = async (jobId: string) => {
    if (window.mediaEngine?.resumeDownload) {
      await window.mediaEngine.resumeDownload(jobId).catch(console.error);
    }
  };

  const handleRemoveMedia = async (jobId: string) => {
    if (window.mediaEngine?.removeJob) {
      await window.mediaEngine.removeJob(jobId).catch(console.error);
    }
    setMediaJobs((prev) => prev.filter((j) => j.id !== jobId));
  };
  
  const handlePauseAll = () => {
    downloads.forEach(d => {
      if (d.status === 'downloading') handlePause(d.id);
    });
    mediaJobs.forEach(j => {
      if (j.status === 'downloading') handlePauseMedia(j.id);
    });
  };

  const handleClearRecentDownloads = async () => {
    setDownloads([]);
    if (window.electronAPI?.clearDownloads) {
      await window.electronAPI.clearDownloads().catch(console.error);
    }
  };

  const handleClearMediaHistory = async () => {
    setMediaJobs([]);
    if (window.mediaEngine?.clearHistory) {
      await window.mediaEngine.clearHistory().catch(console.error);
    }
  };
  
  const handleClearCompleted = () => {
    downloads.forEach(d => {
      if (d.status === 'completed' || d.status === 'cancelled') handleRemove(d.id);
    });
    mediaJobs.forEach(j => {
      if (j.status === 'completed' || j.status === 'cancelled') handleRemoveMedia(j.id);
    });
  };

  const formatBytes = (bytes?: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatTime = (seconds: number) => {
    if (!seconds || seconds === Infinity) return '--:--';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
  };

  // Convert MediaJobs into a display-compatible item list
  const combinedItems = [
    ...mediaJobs.map((m) => ({
      id: m.id,
      url: m.url,
      filename: m.title ? `${m.title} [${m.quality}]` : `${m.cleanFileName}.${m.container}`,
      savePath: m.outputPath || `${m.saveFolder}\\${m.cleanFileName}.${m.container}`,
      category: m.container === 'mp3' ? 'audio' : 'video',
      status: m.status as any,
      progress: m.percent || 0,
      downloadedBytes: m.downloadedBytes || 0,
      totalBytes: m.totalBytes || 0,
      speed: 0,
      speedText: m.speed,
      timeRemaining: 0,
      etaText: m.eta,
      stage: m.stage,
      isMedia: true,
      error: m.error,
      outputPath: m.outputPath,
      connections: 0,
    })),
    ...downloads.map((d) => ({
      ...d,
      speedText: '',
      etaText: '',
      stage: '',
      isMedia: false,
      outputPath: d.savePath,
    }))
  ];

  const filteredItems = combinedItems.filter(item => {
    let matchTab = true;
    if (currentTab === 'Dashboard') matchTab = true;
    if (currentTab === 'Download Queue') matchTab = ['downloading', 'queued', 'paused', 'scheduled', 'waiting'].includes(item.status);
    if (currentTab === 'History') matchTab = ['completed', 'cancelled', 'error'].includes(item.status);
    
    if (!matchTab) return false;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (item.filename?.toLowerCase().includes(q) || item.url.toLowerCase().includes(q));
    }
    return true;
  });

  return (
    <div className={`flex-1 flex flex-col min-h-0 h-full w-full rounded-2xl overflow-hidden relative transition-colors duration-200 ${
      isLight
        ? 'bg-white/80 border border-purple-900/10 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] backdrop-blur-md'
        : 'bg-white/[0.01] border border-white/5 shadow-lg'
    }`}>
      {/* Subtle top glow with purple-to-pink gradient */}
      <div className={`absolute top-0 inset-x-0 h-px ${
        isLight
          ? 'bg-gradient-to-r from-transparent via-purple-500/40 to-transparent'
          : 'bg-gradient-to-r from-transparent via-purple-500/30 to-transparent'
      }`}></div>
      
      <div className={`px-6 py-3.5 flex items-center justify-between shrink-0 transition-colors ${
        isLight
          ? 'border-b border-purple-900/10 bg-slate-50/60'
          : 'border-b border-white/5 bg-black/30'
      }`}>
        <h2 className={`font-display font-medium text-sm ${
          isLight ? 'text-slate-800' : 'text-slate-200'
        }`}>
          {currentTab === 'Dashboard' ? t('downloadList.recentDownloads') : currentTab === 'History' ? t('downloadList.completedHistory') : t('downloadList.activeQueue')}
        </h2>
        <div className="flex gap-4 items-center">
          {currentTab === 'History' && (
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-2.5 rtl:left-auto rtl:right-0 rtl:pl-0 rtl:pr-2.5 flex items-center pointer-events-none">
                <Search className={`transition-colors size-3.5 ${
                  isLight ? 'text-slate-400 group-focus-within:text-purple-600' : 'text-slate-500 group-focus-within:text-purple-400'
                }`} />
              </div>
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('downloadList.searchPlaceholder')} 
                className={`w-44 rounded-lg py-1 pl-7 pr-3 rtl:pl-3 rtl:pr-7 text-xs transition-all focus:outline-none focus:ring-1 ${
                  isLight
                    ? 'bg-white border border-purple-200/80 text-slate-800 placeholder-slate-400 focus:border-purple-500/80 focus:ring-purple-500/20 shadow-sm'
                    : 'bg-[#12121A]/90 border border-white/5 text-slate-200 placeholder-slate-500 focus:border-purple-500/50 focus:ring-purple-500/50 shadow-inner'
                }`}
              />
            </div>
          )}
          <div className="flex gap-2 flex-wrap items-center">
            {currentTab === 'Download Queue' && (
              <GlassButton variant="ghost" className="text-xs py-1 px-3" onClick={handlePauseAll}>
                {t('downloadList.pauseAll')}
              </GlassButton>
            )}
            {currentTab === 'Dashboard' && (
              <>
                <GlassButton variant="ghost" className="text-xs py-1 px-3" onClick={handlePauseAll}>
                  {t('downloadList.pauseAll')}
                </GlassButton>
                <GlassButton 
                  variant="ghost" 
                  className="text-xs py-1 px-3 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300" 
                  onClick={handleClearRecentDownloads}
                >
                  <Trash2 size={12} className="mr-1 rtl:mr-0 rtl:ml-1 inline" />
                  {t('downloadList.clearRecentDownloads')}
                </GlassButton>
                {mediaJobs.length > 0 && (
                  <GlassButton 
                    variant="ghost" 
                    className="text-xs py-1 px-3 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300" 
                    onClick={handleClearMediaHistory}
                  >
                    <Trash2 size={12} className="mr-1 rtl:mr-0 rtl:ml-1 inline" />
                    {t('downloadList.clearMediaHistory')}
                  </GlassButton>
                )}
              </>
            )}
            {currentTab === 'History' && (
              <>
                <GlassButton 
                  variant="ghost" 
                  className="text-xs py-1 px-3 text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300" 
                  onClick={handleClearRecentDownloads}
                >
                  <Trash2 size={12} className="mr-1 rtl:mr-0 rtl:ml-1 inline" />
                  {t('downloadList.clearRecentDownloads')}
                </GlassButton>
                <GlassButton 
                  variant="ghost" 
                  className="text-xs py-1 px-3 text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300" 
                  onClick={handleClearMediaHistory}
                >
                  <Trash2 size={12} className="mr-1 rtl:mr-0 rtl:ml-1 inline" />
                  {t('downloadList.clearMediaHistory')}
                </GlassButton>
                <GlassButton variant="ghost" className="text-xs py-1 px-3" onClick={handleClearCompleted}>
                  {t('downloadList.clearCompleted')}
                </GlassButton>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-5 stable-scroll-container">
        {filteredItems.length === 0 ? (
          /* Placeholder state for no downloads */
          <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center max-w-md mx-auto py-8">
            <div className={`w-16 h-16 mb-4 rounded-2xl flex items-center justify-center ${
              isLight
                ? 'bg-gradient-to-br from-purple-500/10 via-fuchsia-500/10 to-pink-500/10 border border-purple-200/80 shadow-[0_0_30px_-10px_rgba(168,85,247,0.15)]'
                : 'bg-gradient-to-br from-purple-500/10 via-fuchsia-500/10 to-pink-500/10 border border-purple-500/10 shadow-[0_0_30px_-10px_rgba(168,85,247,0.2)]'
            }`}>
              <File className={`w-7 h-7 ${isLight ? 'text-purple-600/70' : 'text-purple-400/50'}`} strokeWidth={1.5} />
            </div>
            <h3 className={`font-display text-base font-medium mb-1 ${
              isLight ? 'text-slate-800' : 'text-slate-200'
            }`}>
              {t('downloadList.noDownloads')}
            </h3>
            <p className={`text-xs max-w-xs mx-auto leading-relaxed ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {t('downloadList.noDownloadsSub')}
            </p>

            {isWebPreview && (
              <div className={`w-full mt-4 rounded-xl p-3 text-left rtl:text-right ${
                isLight
                  ? 'bg-purple-50/80 border border-purple-200/80'
                  : 'bg-purple-950/20 border border-purple-900/30'
              }`}>
                <h4 className={`text-[11px] font-semibold mb-0.5 uppercase tracking-wider ${
                  isLight ? 'text-purple-700' : 'text-purple-400'
                }`}>
                  Web Preview Mode
                </h4>
                <p className={`text-[11px] leading-relaxed ${
                  isLight ? 'text-purple-600/80' : 'text-purple-300/60'
                }`}>
                  Running in preview sandbox. Native Electron features are mocked.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {filteredItems.map(item => (
              <div 
                key={item.id} 
                className={`rounded-xl p-3.5 transition-all relative overflow-hidden group shrink-0 ${
                  isLight
                    ? 'bg-white/90 border border-purple-100/90 hover:border-purple-300/90 hover:bg-white shadow-[0_2px_12px_rgba(0,0,0,0.02)]'
                    : 'bg-white/[0.02] border border-white/5 hover:bg-white/[0.04]'
                }`}
              >
                <div className="absolute top-0 left-0 rtl:left-auto rtl:right-0 h-full w-1 bg-gradient-to-b from-purple-500 via-fuchsia-500 to-pink-500 rounded-l-xl rtl:rounded-l-none rtl:rounded-r-xl opacity-60 group-hover:opacity-100 transition-opacity"></div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pl-2 rtl:pl-0 rtl:pr-2">
                  <div className="flex items-center min-w-0 flex-1">
                    <div className={`flex-none p-2.5 rounded-xl mr-3 rtl:mr-0 rtl:ml-3 flex items-center justify-center ${
                      isLight
                        ? 'bg-purple-50 border border-purple-200/80'
                        : 'bg-purple-950/20 border border-purple-500/10'
                    }`}>
                      {getCategoryIcon(item.category, item.isMedia)}
                    </div>
                    <div className="flex-1 min-w-0 pr-2 rtl:pr-0 rtl:pl-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className={`text-xs font-semibold truncate ${
                          isLight ? 'text-slate-900' : 'text-slate-200'
                        }`} title={item.savePath}>
                          {item.filename || item.url}
                        </h4>
                        {item.isMedia && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 shrink-0">
                            MEDIA ENGINE
                          </span>
                        )}
                      </div>
                      
                      <div className={`flex items-center gap-3 mt-1.5 text-[11px] flex-wrap ${
                        isLight ? 'text-slate-600' : 'text-slate-400'
                      }`}>
                        {item.isMedia ? (
                          <>
                            {item.stage && (
                              <span className="font-mono text-purple-600 dark:text-purple-400 font-medium">
                                Stage: {item.stage.replace(/_/g, ' ')}
                              </span>
                            )}
                            {item.speedText && (
                              <span className={`font-mono font-medium ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>
                                {item.speedText}
                              </span>
                            )}
                            {item.etaText && (
                              <span className={`font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                ETA: {item.etaText}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="font-mono">{formatBytes(item.downloadedBytes)} / {item.totalBytes ? formatBytes(item.totalBytes) : t('common.unknownSize')}</span>
                            {item.status === 'downloading' && (
                              <span className={`font-mono font-medium ${isLight ? 'text-purple-700' : 'text-purple-300'}`}>
                                {formatBytes(item.speed)}/s
                              </span>
                            )}
                            {item.status === 'downloading' && (
                              <span className={`font-mono ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                                {t('downloadList.eta')}: {formatTime(item.timeRemaining)}
                              </span>
                            )}
                            {item.connections !== undefined && item.connections > 0 && (
                              <span className={isLight ? 'text-purple-700' : 'text-purple-400/80'}>
                                {item.connections} {t('common.connections')}
                              </span>
                            )}
                          </>
                        )}
                        
                        <span className={`capitalize font-medium ${
                          item.status === 'error' || item.status === 'cancelled'
                            ? isLight ? 'text-rose-600' : 'text-rose-400' 
                            : item.status === 'completed' 
                              ? isLight ? 'text-emerald-600' : 'text-emerald-400' 
                              : isLight ? 'text-purple-600 font-semibold' : 'text-fuchsia-400'
                        }`}>
                          {t(`status.${item.status}`) || item.status}
                        </span>
                        {item.error && (
                          <span className={`truncate max-w-[200px] ${isLight ? 'text-rose-600 font-medium' : 'text-rose-400'}`} title={item.error}>
                            {item.error}
                          </span>
                        )}
                      </div>

                      {item.status !== 'completed' && item.status !== 'cancelled' && (
                        <div className={`w-full h-1.5 rounded-full mt-2.5 overflow-hidden border ${
                          isLight ? 'bg-slate-100 border-slate-200/80' : 'bg-black/40 border border-white/5'
                        }`}>
                          <div 
                            className={`h-full transition-all duration-300 rounded-full ${
                              item.status === 'error' 
                                ? 'bg-rose-500' 
                                : isLight
                                  ? 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_10px_rgba(168,85,247,0.3)]'
                                  : 'bg-gradient-to-r from-purple-500 via-fuchsia-500 to-pink-500 shadow-[0_0_10px_rgba(236,72,153,0.3)]'
                            }`}
                            style={{ width: `${item.progress || 0}%` }}
                          ></div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0 self-end sm:self-center">
                    {item.status === 'completed' && (
                      <GlassButton variant="secondary" className="text-xs py-1 px-3" onClick={() => handleOpenFolder(item.outputPath || item.id)} title={t('downloadList.openFolder')}>
                        <FolderOpen size={13} className={`mr-1 rtl:mr-0 rtl:ml-1 ${isLight ? 'text-pink-600' : 'text-pink-400'}`} />
                        {t('downloadList.openFolder')}
                      </GlassButton>
                    )}
                    {item.status === 'waiting' && (
                      <GlassButton variant="primary" className="text-xs py-1 px-3" onClick={() => item.isMedia ? handleResumeMedia(item.id) : handleResume(item.id)}>
                        <Play size={13} className="mr-1 rtl:mr-0 rtl:ml-1" />
                        {t('downloadList.resume')}
                      </GlassButton>
                    )}
                    {item.status === 'downloading' && (
                      <GlassButton 
                        variant="secondary" 
                        className={`text-xs py-1 px-3 ${
                          isLight 
                            ? 'border-amber-300 text-amber-800 hover:bg-amber-50' 
                            : 'border-amber-500/30 text-amber-300'
                        }`} 
                        onClick={() => item.isMedia ? handlePauseMedia(item.id) : handlePause(item.id)}
                      >
                        <Pause size={13} className={`mr-1 rtl:mr-0 rtl:ml-1 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
                        {t('downloadList.pause')}
                      </GlassButton>
                    )}
                    {(item.status === 'paused' || item.status === 'error') && (
                      <GlassButton variant="primary" className="text-xs py-1 px-3" onClick={() => item.isMedia ? handleResumeMedia(item.id) : handleResume(item.id)}>
                        <Play size={13} className="mr-1 rtl:mr-0 rtl:ml-1" />
                        {t('downloadList.resume')}
                      </GlassButton>
                    )}
                    {item.status === 'downloading' && (
                      <GlassButton variant="icon" className="p-1.5" onClick={() => item.isMedia ? handleCancelMedia(item.id) : handleCancel(item.id)} title={t('downloadList.cancel')}>
                        <X size={13} />
                      </GlassButton>
                    )}
                    {['completed', 'cancelled', 'error'].includes(item.status) && (
                      <GlassButton variant="icon" className="p-1.5" onClick={() => item.isMedia ? handleRemoveMedia(item.id) : handleRemove(item.id)} title={t('downloadList.remove')}>
                        <Trash2 size={13} />
                      </GlassButton>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
