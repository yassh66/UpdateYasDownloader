import React, { useState, useEffect, useRef } from 'react';
import { 
  Download, 
  Folder, 
  Globe, 
  Clock, 
  X, 
  Minus, 
  Maximize2, 
  FileText, 
  Video, 
  Music, 
  Archive, 
  Package, 
  FileCode, 
  Layers, 
  ArrowDownCircle, 
  Copy, 
  Check, 
  AlertCircle, 
  Edit2, 
  Calendar, 
  Pause, 
  Play, 
  RotateCcw, 
  ExternalLink, 
  FolderOpen, 
  Gauge, 
  Hourglass, 
  Activity,
  Sun,
  Moon
} from 'lucide-react';
import GlassButton from './GlassButton';
import type { DownloadDialogData, DownloadItem, DownloadStatus } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes <= 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s';
  if (bytesPerSec < 1024 * 1024) {
    return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
}

function formatTimeRemaining(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return '--';
  if (seconds < 60) return `${Math.ceil(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
}

function getCategoryInfo(filename: string, isLight: boolean, mime?: string, t?: (key: string) => string): { icon: React.ReactNode; label: string; badgeColor: string } {
  const ext = filename ? filename.toLowerCase().slice(filename.lastIndexOf('.')) : '';
  if (['.mp4', '.mkv', '.webm', '.avi', '.mov'].includes(ext) || mime?.startsWith('video/')) {
    return { 
      icon: <Video className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} size={22} />, 
      label: t ? t('categories.video') : 'Video', 
      badgeColor: isLight ? 'border-fuchsia-200 text-fuchsia-700 bg-fuchsia-50' : 'border-fuchsia-500/30 text-fuchsia-300 bg-fuchsia-500/10'
    };
  }
  if (['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a'].includes(ext) || mime?.startsWith('audio/')) {
    return { 
      icon: <Music className={isLight ? "text-pink-600" : "text-pink-400"} size={22} />, 
      label: t ? t('categories.audio') : 'Audio', 
      badgeColor: isLight ? 'border-pink-200 text-pink-700 bg-pink-50' : 'border-pink-500/30 text-pink-300 bg-pink-500/10'
    };
  }
  if (['.pdf', '.docx', '.doc', '.xlsx', '.pptx', '.txt'].includes(ext) || mime?.startsWith('text/')) {
    return { 
      icon: <FileText className={isLight ? "text-violet-600" : "text-violet-400"} size={22} />, 
      label: t ? t('categories.document') : 'Document', 
      badgeColor: isLight ? 'border-violet-200 text-violet-700 bg-violet-50' : 'border-violet-500/30 text-violet-300 bg-violet-500/10'
    };
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso'].includes(ext) || mime?.includes('zip') || mime?.includes('compressed') || mime?.includes('iso')) {
    return { 
      icon: <Archive className={isLight ? "text-rose-600" : "text-rose-400"} size={22} />, 
      label: t ? t('categories.archive') : 'Archive', 
      badgeColor: isLight ? 'border-rose-200 text-rose-700 bg-rose-50' : 'border-rose-500/30 text-rose-300 bg-rose-500/10'
    };
  }
  if (['.exe', '.msi', '.dmg', '.pkg', '.apk', '.app', '.deb', '.rpm'].includes(ext)) {
    return { 
      icon: <Package className={isLight ? "text-purple-600" : "text-purple-400"} size={22} />, 
      label: t ? t('categories.software') : 'Software', 
      badgeColor: isLight ? 'border-purple-200 text-purple-700 bg-purple-50' : 'border-purple-500/30 text-purple-300 bg-purple-500/10'
    };
  }
  return { 
    icon: <FileCode className={isLight ? "text-pink-600" : "text-pink-300"} size={22} />, 
    label: t ? t('categories.other') : 'Other', 
    badgeColor: isLight ? 'border-pink-200 text-pink-700 bg-pink-50' : 'border-pink-500/30 text-pink-300 bg-pink-500/10'
  };
}

export default function StandaloneDownloadDialog() {
  const [data, setData] = useState<DownloadDialogData | null>(null);
  const [url, setUrl] = useState('');
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [filename, setFilename] = useState('');
  const [saveFolder, setSaveFolder] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [scheduleDelayMinutes, setScheduleDelayMinutes] = useState(60);

  // Live Download Engine State
  const [downloadId, setDownloadId] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus | 'idle'>('idle');
  const [downloadItem, setDownloadItem] = useState<DownloadItem | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const { theme, toggleTheme } = useTheme();
  const { language, dir, isRTL, t } = useLanguage();
  const isLight = theme === 'light';

  // Keep ref for event subscription matching
  const downloadIdRef = useRef<string | null>(null);
  downloadIdRef.current = downloadId;

  // 1. Initial Load: Fetch dialog metadata from Electron Main Process
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryRequestId = params.get('requestId') || undefined;

    if (window.dialogAPI?.getDialogData) {
      window.dialogAPI.getDialogData(queryRequestId)
        .then((dialogData) => {
          if (dialogData) {
            setData(dialogData);
            setUrl(dialogData.url || '');
            setFilename(dialogData.filename || '');
            setSaveFolder(dialogData.defaultFolder || '');
          }
        })
        .catch((err) => {
          console.error('Failed to load dialog data:', err);
          setErrorMsg('Failed to initialize download request metadata.');
        });
    } else {
      // Standalone Web Preview Mock
      const mockData: DownloadDialogData = {
        requestId: 'req-mock-123',
        url: 'https://releases.ubuntu.com/24.04/ubuntu-24.04-desktop-amd64.iso',
        filename: 'ubuntu-24.04-desktop-amd64.iso',
        fileSize: 6100000000,
        defaultFolder: 'C:\\Users\\User\\Downloads',
        mime: 'application/x-iso9660-image'
      };
      setData(mockData);
      setUrl(mockData.url);
      setFilename(mockData.filename);
      setSaveFolder(mockData.defaultFolder);
    }
  }, []);

  // 2. Subscribe to real-time download engine progress updates
  useEffect(() => {
    if (!window.dialogAPI?.onDownloadUpdate) return;

    const unsubscribe = window.dialogAPI.onDownloadUpdate((updatedItem: DownloadItem) => {
      if (!updatedItem) return;

      const currentId = downloadIdRef.current;
      const isTarget = (currentId && updatedItem.id === currentId) || 
                       (data?.url && updatedItem.url === data.url) ||
                       (filename && updatedItem.filename === filename);

      if (isTarget) {
        if (!currentId) {
          setDownloadId(updatedItem.id);
          downloadIdRef.current = updatedItem.id;
        }
        setDownloadItem(updatedItem);
        setDownloadStatus(updatedItem.status);
        if (updatedItem.error) {
          setErrorMsg(updatedItem.error);
        }
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [data, filename]);

  // Window Controls
  const handleMinimize = () => window.dialogAPI?.minimizeWindow?.();
  const handleMaximize = () => window.dialogAPI?.maximizeWindow?.();
  const handleClose = () => {
    if (window.dialogAPI?.closeWindow) {
      window.dialogAPI.closeWindow();
    } else {
      window.close();
    }
  };

  // Copy URL to Clipboard
  const handleCopyUrl = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  // Directory Picker
  const handleSelectFolder = async () => {
    try {
      if (window.dialogAPI?.selectFolder) {
        const folder = await window.dialogAPI.selectFolder();
        if (folder) setSaveFolder(folder);
      }
    } catch (e) {
      console.error('Folder selection failed:', e);
    }
  };

  // 4. Start Download Immediately
  const handleStartDownload = async () => {
    if (!data || isActionPending) return;
    if (!url.trim()) {
      setErrorMsg('Please specify a valid download URL.');
      return;
    }

    setIsActionPending(true);
    setErrorMsg(null);
    setDownloadStatus('waiting');

    try {
      if (window.dialogAPI?.startDownload) {
        const res = await window.dialogAPI.startDownload({
          requestId: data.requestId,
          filename: filename.trim() || data.filename || 'downloaded_file',
          saveFolder: saveFolder || data.defaultFolder,
          url: url.trim()
        });

        if (res.success && res.downloadId) {
          setDownloadId(res.downloadId);
          downloadIdRef.current = res.downloadId;
          setDownloadStatus('downloading');

          if (window.dialogAPI?.getDownload) {
            try {
              const liveItem = await window.dialogAPI.getDownload(res.downloadId);
              if (liveItem) {
                setDownloadItem(liveItem);
                setDownloadStatus(liveItem.status);
              }
            } catch (err) {}
          }
        } else {
          setErrorMsg(res.error || 'Failed to start download');
          setDownloadStatus('error');
        }
      } else {
        // Web Preview Simulation Mode
        const simulatedId = 'sim-' + Math.random().toString(36).substring(7);
        setDownloadId(simulatedId);
        downloadIdRef.current = simulatedId;
        setDownloadStatus('downloading');

        const totalBytes = data.fileSize || 50000000;
        let downloaded = 0;
        const interval = setInterval(() => {
          downloaded += Math.floor(totalBytes / 20);
          if (downloaded >= totalBytes) {
            downloaded = totalBytes;
            setDownloadStatus('completed');
            setDownloadItem({
              id: simulatedId,
              url,
              filename: filename || data.filename,
              status: 'completed',
              totalBytes,
              downloadedBytes: totalBytes,
              progress: 100,
              speed: 0,
              timeRemaining: 0,
              savePath: `${saveFolder || data.defaultFolder}\\${filename || data.filename}`
            });
            clearInterval(interval);
          } else {
            const progress = Math.round((downloaded / totalBytes) * 100);
            const speed = 14500000; // 14.5 MB/s
            const timeRemaining = Math.round((totalBytes - downloaded) / speed);
            setDownloadItem({
              id: simulatedId,
              url,
              filename: filename || data.filename,
              status: 'downloading',
              totalBytes,
              downloadedBytes: downloaded,
              progress,
              speed,
              timeRemaining,
              savePath: `${saveFolder || data.defaultFolder}\\${filename || data.filename}`
            });
          }
        }, 600);
      }
    } catch (e: any) {
      console.error('Failed to start download:', e);
      setErrorMsg(e.message || 'An error occurred while starting the download.');
      setDownloadStatus('error');
    } finally {
      setIsActionPending(false);
    }
  };

  // 5. Schedule Download
  const handleScheduleDownload = async () => {
    if (!data || isActionPending) return;
    if (!url.trim()) {
      setErrorMsg('Please specify a valid download URL.');
      return;
    }

    setIsActionPending(true);
    setErrorMsg(null);

    const scheduledTime = Date.now() + (scheduleDelayMinutes * 60 * 1000);

    try {
      if (window.dialogAPI?.scheduleDownload) {
        const res = await window.dialogAPI.scheduleDownload({
          requestId: data.requestId,
          filename: filename.trim() || data.filename || 'downloaded_file',
          saveFolder: saveFolder || data.defaultFolder,
          url: url.trim(),
          scheduledTime
        });

        if (res.success && res.downloadId) {
          setDownloadId(res.downloadId);
          downloadIdRef.current = res.downloadId;
          setDownloadStatus('scheduled');
          setDownloadItem({
            id: res.downloadId,
            url,
            filename: filename || data.filename,
            status: 'scheduled',
            totalBytes: data.fileSize || 0,
            downloadedBytes: 0,
            progress: 0,
            speed: 0,
            timeRemaining: 0,
            scheduledTime,
            savePath: `${saveFolder || data.defaultFolder}\\${filename || data.filename}`
          });
        } else {
          setErrorMsg(res.error || 'Failed to schedule download');
        }
      } else {
        // Web Preview Simulation
        setDownloadStatus('scheduled');
        setDownloadItem({
          id: 'sim-scheduled',
          url,
          filename: filename || data.filename,
          status: 'scheduled',
          totalBytes: data.fileSize || 0,
          downloadedBytes: 0,
          progress: 0,
          speed: 0,
          timeRemaining: 0,
          scheduledTime,
          savePath: `${saveFolder || data.defaultFolder}\\${filename || data.filename}`
        });
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to schedule download.');
    } finally {
      setIsActionPending(false);
    }
  };

  // 6. Pause Download
  const handlePause = async () => {
    if (!downloadId) return;
    try {
      if (window.dialogAPI?.pauseDownload) {
        await window.dialogAPI.pauseDownload(downloadId);
      }
      setDownloadStatus('paused');
      if (downloadItem) {
        setDownloadItem({ ...downloadItem, status: 'paused', speed: 0 });
      }
    } catch (e: any) {
      console.error('Failed to pause download:', e);
    }
  };

  // 7. Resume Download
  const handleResume = async () => {
    if (!downloadId) return;
    try {
      if (window.dialogAPI?.resumeDownload) {
        await window.dialogAPI.resumeDownload(downloadId);
      }
      setDownloadStatus('downloading');
      if (downloadItem) {
        setDownloadItem({ ...downloadItem, status: 'downloading' });
      }
    } catch (e: any) {
      console.error('Failed to resume download:', e);
    }
  };

  // 8. Cancel Download
  const handleCancel = async () => {
    try {
      if (downloadId && window.dialogAPI?.cancelDownload) {
        await window.dialogAPI.cancelDownload(downloadId);
      } else if (data && window.dialogAPI?.submitAction) {
        await window.dialogAPI.submitAction({
          requestId: data.requestId,
          action: 'cancel',
          filename: filename.trim(),
          saveFolder
        });
      }
      handleClose();
    } catch (e) {
      handleClose();
    }
  };

  // 9. Retry Download
  const handleRetry = async () => {
    if (downloadId && window.dialogAPI?.retryDownload) {
      setErrorMsg(null);
      await window.dialogAPI.retryDownload(downloadId);
      setDownloadStatus('downloading');
    } else {
      handleStartDownload();
    }
  };

  // 10. Open File
  const handleOpenFile = async () => {
    if (downloadId && window.dialogAPI?.openFile) {
      await window.dialogAPI.openFile(downloadId);
    }
  };

  // 11. Open Folder
  const handleOpenFolder = async () => {
    if (downloadId && window.dialogAPI?.openFolder) {
      await window.dialogAPI.openFolder(downloadId);
    }
  };

  // Computed values
  let domain = t('dialog.directLink');
  if (url) {
    try {
      domain = new URL(url).hostname;
    } catch (e) {
      domain = t('dialog.directLink');
    }
  }

  const catInfo = getCategoryInfo(filename, isLight, data?.mime, t);
  const totalBytes = downloadItem?.totalBytes || data?.fileSize || 0;
  const downloadedBytes = downloadItem?.downloadedBytes || 0;
  const progress = downloadItem ? downloadItem.progress : 0;
  const speed = downloadItem?.speed || 0;
  const timeRemaining = downloadItem?.timeRemaining || 0;
  const savePath = downloadItem?.savePath || (saveFolder && filename ? `${saveFolder}\\${filename}` : (data?.defaultFolder ? `${data.defaultFolder}\\${filename || data.filename}` : ''));

  const isDownloading = downloadStatus === 'downloading';
  const isPaused = downloadStatus === 'paused';
  const isCompleted = downloadStatus === 'completed';
  const isError = downloadStatus === 'error';
  const isScheduled = downloadStatus === 'scheduled';
  const isWaiting = downloadStatus === 'waiting' || downloadStatus === 'queued';
  const isIdle = downloadStatus === 'idle';

  return (
    <div 
      dir={dir}
      className={`h-screen w-screen flex flex-col select-none overflow-hidden font-sans border shadow-2xl relative transition-colors duration-200 ${
        isLight 
          ? 'bg-[#F8FAFC] text-slate-800 border-purple-200' 
          : 'bg-[#070711] text-slate-100 border-purple-500/20'
      }`}
    >
      {/* Luxury Ambient Glows */}
      <div className={`absolute -top-24 -left-24 w-72 h-72 rounded-full blur-3xl pointer-events-none ${
        isLight
          ? 'bg-gradient-to-br from-purple-300/20 via-pink-200/15 to-transparent'
          : 'bg-gradient-to-br from-purple-600/15 via-fuchsia-600/10 to-transparent'
      }`} />
      <div className={`absolute -bottom-24 -right-24 w-72 h-72 rounded-full blur-3xl pointer-events-none ${
        isLight
          ? 'bg-gradient-to-tl from-pink-300/20 via-purple-200/15 to-transparent'
          : 'bg-gradient-to-tl from-pink-600/15 via-purple-600/10 to-transparent'
      }`} />

      {/* ========================================================= */}
      {/* 1. TOP DRAGGABLE TITLE BAR                                */}
      {/* ========================================================= */}
      <div 
        className={`h-10 px-3.5 backdrop-blur-md border-b flex items-center justify-between shrink-0 cursor-default relative z-20 transition-colors ${
          isLight
            ? 'bg-white/95 border-purple-100 text-slate-800'
            : 'bg-[#090915]/95 border-purple-500/10 text-slate-200'
        }`}
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-pink-500 flex items-center justify-center text-white shadow-md shadow-purple-950/40">
            <ArrowDownCircle size={13} />
          </div>
          <span className={`text-xs font-semibold tracking-wide font-display ${
            isLight ? 'text-slate-900' : 'text-slate-200'
          }`}>
            {t('common.appName')}
          </span>
          <span className={isLight ? "text-purple-300" : "text-purple-400/40"}>•</span>
          
          {/* Dynamic Status Pill */}
          <div className="flex items-center gap-1.5">
            {isIdle && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                isLight ? 'bg-purple-50 border-purple-200 text-purple-700 font-semibold' : 'bg-purple-500/10 border-purple-500/20 text-purple-300'
              }`}>
                {t('dialog.ready')}
              </span>
            )}
            {isWaiting && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                isLight ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-amber-500/10 border-amber-500/20 text-amber-300'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                {t('dialog.connecting')}
              </span>
            )}
            {isDownloading && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                isLight 
                  ? 'bg-purple-100 border-purple-300 text-purple-900 font-bold' 
                  : 'bg-gradient-to-r from-purple-500/20 to-pink-500/20 border-purple-400/30 text-purple-200'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-pink-500 animate-pulse" />
                {t('status.downloading')} ({progress}%)
              </span>
            )}
            {isPaused && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border ${
                isLight ? 'bg-amber-50 border-amber-200 text-amber-800 font-semibold' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
              }`}>
                {t('status.paused')} ({progress}%)
              </span>
            )}
            {isCompleted && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                isLight ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-bold' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              }`}>
                <Check size={11} className={isLight ? "text-emerald-600" : "text-emerald-400"} />
                {t('status.completed')}
              </span>
            )}
            {isError && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                isLight ? 'bg-rose-50 border-rose-200 text-rose-700 font-bold' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              }`}>
                <AlertCircle size={11} className={isLight ? "text-rose-600" : "text-rose-400"} />
                {t('dialog.failed')}
              </span>
            )}
            {isScheduled && (
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium border flex items-center gap-1 ${
                isLight ? 'bg-purple-50 border-purple-200 text-purple-700 font-semibold' : 'bg-purple-500/10 border-purple-500/30 text-purple-300'
              }`}>
                <Clock size={11} className={isLight ? "text-purple-600" : "text-purple-400"} />
                {t('status.scheduled')}
              </span>
            )}
          </div>
        </div>

        {/* Window control buttons + theme toggle */}
        <div 
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as any}
        >
          <button
            onClick={toggleTheme}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              isLight ? 'text-slate-500 hover:text-purple-700 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title={isLight ? t('header.switchToDark') : t('header.switchToLight')}
          >
            {isLight ? <Moon size={12} className="text-purple-600" /> : <Sun size={12} className="text-amber-300" />}
          </button>
          <button
            onClick={handleMinimize}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title={t('common.minimize')}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={handleMaximize}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/10'
            }`}
            title={t('common.maximize')}
          >
            <Maximize2 size={11} />
          </button>
          <button
            onClick={handleClose}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
              isLight ? 'text-slate-500 hover:text-white hover:bg-rose-500' : 'text-slate-400 hover:text-white hover:bg-rose-600/80'
            }`}
            title={t('common.close')}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. COMPACT, NON-SCROLLING LUXURY CONTENT CONTAINER        */}
      {/* ========================================================= */}
      <div className="flex-1 p-4 flex flex-col justify-between overflow-hidden relative z-10 space-y-3">
        
        {/* Error Alert Message */}
        {errorMsg && (
          <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 shrink-0 animate-in fade-in ${
            isLight
              ? 'bg-rose-50 border border-rose-200 text-rose-700 font-medium'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}>
            <AlertCircle size={15} className={`shrink-0 ${isLight ? 'text-rose-600' : 'text-rose-400'}`} />
            <span className="flex-1 leading-tight text-[11px]">{errorMsg}</span>
          </div>
        )}

        {/* ========================================================= */}
        {/* FILE HEADER / OVERVIEW CARD                               */}
        {/* ========================================================= */}
        <div className={`p-3 rounded-xl border flex items-start gap-3 shrink-0 transition-colors ${
          isLight
            ? 'bg-white/95 border-purple-100/90 shadow-[0_4px_20px_-4px_rgba(112,26,117,0.05)]'
            : 'bg-gradient-to-b from-[#111122] to-[#0D0D19] border border-purple-500/15 shadow-lg'
        }`}>
          <div className={`p-2.5 rounded-xl shrink-0 shadow-sm flex items-center justify-center border ${
            isLight
              ? 'bg-purple-50 border-purple-200/80'
              : 'bg-purple-950/40 border-purple-500/20'
          }`}>
            {catInfo.icon}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <label className={`text-[10px] font-semibold uppercase tracking-wider block ${
                isLight ? 'text-purple-700' : 'text-purple-300/80'
              }`}>
                {isIdle ? t('dialog.targetFilename') : t('dialog.downloadingFile')}
              </label>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${catInfo.badgeColor}`}>
                {catInfo.label}
              </span>
            </div>

            {isIdle ? (
              <input 
                type="text" 
                value={filename} 
                onChange={(e) => setFilename(e.target.value)}
                placeholder={t('dialog.fileName')}
                autoFocus
                className={`w-full rounded-lg py-1 px-2.5 text-xs font-medium transition-all focus:outline-none focus:ring-1 ${
                  isLight
                    ? 'bg-slate-50 border border-purple-200/90 focus:border-purple-600 text-slate-900 focus:ring-purple-500/20'
                    : 'bg-[#080812] border border-purple-500/20 focus:border-fuchsia-500/60 text-slate-100 focus:ring-fuchsia-500/50'
                }`}
              />
            ) : (
              <div className={`text-xs font-semibold truncate font-sans ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                {filename || data?.filename}
              </div>
            )}

            {/* Metadata Pills */}
            <div className={`flex items-center gap-2.5 mt-1.5 text-[11px] ${
              isLight ? 'text-slate-600' : 'text-slate-400'
            }`}>
              <span className={`flex items-center gap-1 font-mono ${
                isLight ? 'text-purple-700 font-semibold' : 'text-purple-200'
              }`}>
                <Layers size={12} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
                {formatBytes(totalBytes)}
              </span>
              <span className={isLight ? "text-slate-300" : "text-purple-500/30"}>•</span>
              <span className={`flex items-center gap-1 truncate max-w-[200px] ${
                isLight ? 'text-slate-600' : 'text-slate-400'
              }`}>
                <Globe size={11} className={isLight ? "text-pink-600 shrink-0" : "text-pink-400 shrink-0"} />
                {domain}
              </span>
              {data?.mime && (
                <>
                  <span className={isLight ? "text-slate-300" : "text-purple-500/30"}>•</span>
                  <span className={`truncate max-w-[140px] font-mono text-[9px] px-1.5 py-0.5 rounded border ${
                    isLight 
                      ? 'bg-purple-50 text-purple-700 border-purple-200' 
                      : 'text-purple-300/60 bg-purple-500/5 border-purple-500/10'
                  }`}>
                    {data.mime}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* LIVE PROGRESS METRICS (When download has started / active)*/}
        {/* ========================================================= */}
        {!isIdle && (
          <div className={`p-3 rounded-xl border space-y-2.5 shrink-0 transition-colors ${
            isLight
              ? 'bg-white/95 border-purple-200/90 shadow-[0_4px_20px_-4px_rgba(112,26,117,0.05)]'
              : 'bg-gradient-to-r from-purple-950/30 via-fuchsia-950/20 to-pink-950/20 border-purple-500/25 shadow-lg'
          }`}>
            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className={`font-medium flex items-center gap-1.5 ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}>
                  <Activity size={12} className={isDownloading ? isLight ? 'text-fuchsia-600 animate-pulse' : 'text-fuchsia-400 animate-pulse' : isLight ? 'text-slate-400' : 'text-slate-400'} />
                  {t('dialog.downloadProgress')}
                </span>
                <span className={`font-semibold ${
                  isCompleted 
                    ? isLight ? 'text-emerald-600' : 'text-emerald-400' 
                    : isError 
                      ? isLight ? 'text-rose-600' : 'text-rose-400' 
                      : isPaused 
                        ? isLight ? 'text-amber-600' : 'text-amber-400' 
                        : isLight ? 'text-purple-700 font-bold' : 'text-fuchsia-300'
                }`}>
                  {progress}%
                </span>
              </div>

              <div className={`h-2 w-full rounded-full overflow-hidden border relative ${
                isLight ? 'bg-slate-100 border-slate-200/80' : 'bg-black/60 border-purple-500/20'
              }`}>
                <div 
                  className={`h-full transition-all duration-300 rounded-full relative ${
                    isCompleted 
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-400' 
                      : isError 
                      ? 'bg-gradient-to-r from-rose-500 to-red-600' 
                      : isPaused 
                      ? 'bg-gradient-to-r from-amber-500 to-yellow-400' 
                      : isLight
                        ? 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_10px_rgba(168,85,247,0.4)]'
                        : 'bg-gradient-to-r from-purple-600 via-fuchsia-500 to-pink-500 shadow-[0_0_12px_rgba(236,72,153,0.5)]'
                  }`}
                  style={{ width: `${Math.max(2, progress)}%` }}
                >
                  {isDownloading && (
                    <div className="absolute inset-0 bg-white/20 animate-[pulse_1.5s_infinite]" />
                  )}
                </div>
              </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-3 gap-2 pt-0.5">
              {/* Transferred */}
              <div className={`rounded-lg p-1.5 px-2 flex flex-col border ${
                isLight ? 'bg-slate-50 border-purple-100' : 'bg-black/40 border-purple-500/10'
              }`}>
                <span className={`text-[9px] uppercase tracking-wider font-semibold ${
                  isLight ? 'text-purple-700' : 'text-purple-300/70'
                }`}>{t('dialog.transferred')}</span>
                <span className={`text-xs font-mono font-medium mt-0.5 truncate ${
                  isLight ? 'text-slate-800' : 'text-slate-200'
                }`}>
                  {formatBytes(downloadedBytes)} / {formatBytes(totalBytes)}
                </span>
              </div>

              {/* Speed */}
              <div className={`rounded-lg p-1.5 px-2 flex flex-col border ${
                isLight ? 'bg-slate-50 border-purple-100' : 'bg-black/40 border-purple-500/10'
              }`}>
                <span className={`text-[9px] uppercase tracking-wider font-semibold flex items-center gap-1 ${
                  isLight ? 'text-purple-700' : 'text-purple-300/70'
                }`}>
                  <Gauge size={10} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
                  {t('dialog.speed')}
                </span>
                <span className={`text-xs font-mono font-medium mt-0.5 ${
                  isLight ? 'text-purple-700 font-bold' : 'text-pink-300'
                }`}>
                  {isDownloading ? formatSpeed(speed) : isPaused ? t('status.paused') : isCompleted ? t('dialog.finished') : '--'}
                </span>
              </div>

              {/* ETA / Time Remaining */}
              <div className={`rounded-lg p-1.5 px-2 flex flex-col border ${
                isLight ? 'bg-slate-50 border-purple-100' : 'bg-black/40 border-purple-500/10'
              }`}>
                <span className={`text-[9px] uppercase tracking-wider font-semibold flex items-center gap-1 ${
                  isLight ? 'text-purple-700' : 'text-purple-300/70'
                }`}>
                  <Hourglass size={10} className={isLight ? "text-purple-600" : "text-purple-400"} />
                  {t('dialog.timeRemaining')}
                </span>
                <span className={`text-xs font-mono font-medium mt-0.5 ${
                  isLight ? 'text-slate-800' : 'text-slate-200'
                }`}>
                  {isDownloading ? formatTimeRemaining(timeRemaining) : isCompleted ? '0s' : '--'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SOURCE URL CARD (Expandable / Editable)                   */}
        {/* ========================================================= */}
        <div className="space-y-1 shrink-0">
          <div className="flex items-center justify-between text-[11px] px-1">
            <span className={`flex items-center gap-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <Globe size={11} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
              {t('dialog.sourceUrl')}
            </span>
            {isIdle && (
              <button
                onClick={() => setIsEditingUrl(!isEditingUrl)}
                className={`text-[10px] flex items-center gap-1 transition-colors ${
                  isLight ? 'text-purple-600 hover:text-purple-800 font-semibold' : 'text-fuchsia-400 hover:text-fuchsia-300'
                }`}
              >
                <Edit2 size={10} />
                {isEditingUrl ? t('dialog.done') : t('dialog.editUrl')}
              </button>
            )}
          </div>
          
          {isEditingUrl && isIdle ? (
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/file.zip"
              className={`w-full rounded-lg p-1.5 px-2.5 text-xs font-mono focus:outline-none focus:ring-1 ${
                isLight
                  ? 'bg-white border border-purple-200 text-slate-800 focus:ring-purple-500'
                  : 'bg-black/50 border border-fuchsia-500/40 text-slate-200 focus:ring-fuchsia-500'
              }`}
            />
          ) : (
            <div className="relative group">
              <div className={`rounded-lg py-1.5 px-2.5 pr-8 text-xs font-mono truncate select-all border ${
                isLight
                  ? 'bg-white/80 border-purple-100 text-slate-600 shadow-sm'
                  : 'bg-black/40 border-purple-500/10 text-slate-400'
              }`}>
                {url || 'https://...'}
              </div>
              <button 
                onClick={handleCopyUrl}
                className={`absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                  isLight
                    ? 'text-slate-400 hover:text-purple-700 hover:bg-purple-50'
                    : 'text-slate-400 hover:text-pink-300 hover:bg-purple-500/10'
                }`}
                title={t('dialog.copyUrl')}
              >
                {copiedUrl ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
              </button>
            </div>
          )}
        </div>

        {/* ========================================================= */}
        {/* SAVE DESTINATION / PATH CARD                              */}
        {/* ========================================================= */}
        <div className="space-y-1 shrink-0">
          <label className={`text-[11px] flex items-center gap-1 px-1 ${
            isLight ? 'text-slate-600' : 'text-slate-400'
          }`}>
            <Folder size={11} className={isLight ? "text-pink-600" : "text-pink-400"} />
            {t('dialog.saveTo')}
          </label>
          <div className="flex items-center gap-2">
            <div className={`flex-1 rounded-lg px-2.5 py-1.5 text-xs font-mono truncate border ${
              isLight
                ? 'bg-white/80 border-purple-100 text-slate-700 shadow-sm'
                : 'bg-black/40 border-purple-500/10 text-slate-300'
            }`}>
              {savePath || saveFolder || data?.defaultFolder || t('settings.defaultFolder')}
            </div>
            {isIdle && (
              <button 
                onClick={handleSelectFolder}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors shrink-0 flex items-center gap-1.5 shadow-sm ${
                  isLight
                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200'
                    : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border-purple-500/20'
                }`}
              >
                <Folder size={11} className={isLight ? "text-pink-600" : "text-pink-400"} />
                {t('common.browse')}
              </button>
            )}
          </div>
        </div>

        {/* ========================================================= */}
        {/* SCHEDULE PICKER (When in Idle state)                      */}
        {/* ========================================================= */}
        {showSchedulePicker && isIdle && (
          <div className={`p-2.5 rounded-xl border space-y-1.5 shrink-0 animate-in fade-in ${
            isLight
              ? 'bg-purple-50/80 border-purple-200'
              : 'bg-purple-950/30 border-purple-500/25'
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span className={`font-medium flex items-center gap-1.5 text-[11px] ${
                isLight ? 'text-purple-800' : 'text-purple-300'
              }`}>
                <Calendar size={12} />
                {t('dialog.scheduleTime')}:
              </span>
              <button 
                onClick={() => setShowSchedulePicker(false)}
                className={`text-[10px] ${isLight ? 'text-slate-500 hover:text-slate-800' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t('common.cancel')}
              </button>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { label: t('dialog.in30m'), val: 30 },
                { label: t('dialog.in1h'), val: 60 },
                { label: t('dialog.in3h'), val: 180 },
                { label: t('dialog.in6h'), val: 360 }
              ].map((preset) => (
                <button
                  key={preset.val}
                  type="button"
                  onClick={() => setScheduleDelayMinutes(preset.val)}
                  className={`py-1 px-2 rounded-lg text-[10px] font-medium border transition-all ${
                    scheduleDelayMinutes === preset.val 
                      ? isLight
                        ? 'bg-purple-600 border-purple-600 text-white shadow-sm'
                        : 'bg-gradient-to-r from-purple-600/40 to-pink-600/40 border-fuchsia-500 text-fuchsia-200 shadow-sm' 
                      : isLight
                        ? 'bg-white border-purple-100 text-slate-600 hover:bg-purple-50'
                        : 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* DYNAMIC ACTION FOOTER CONTROLS                            */}
        {/* ========================================================= */}
        <div className={`pt-2 border-t flex items-center justify-between gap-2.5 shrink-0 ${
          isLight ? 'border-purple-100' : 'border-purple-500/10'
        }`}>
          
          {/* STATE 1: IDLE / PRE-START */}
          {isIdle && (
            <>
              <button
                onClick={handleCancel}
                disabled={isActionPending}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors disabled:opacity-50 ${
                  isLight
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                {t('common.cancel')}
              </button>

              <div className="flex items-center gap-2">
                {!showSchedulePicker ? (
                  <GlassButton 
                    variant="secondary" 
                    onClick={() => setShowSchedulePicker(true)}
                    disabled={isActionPending || !url}
                    className="flex items-center gap-1 text-xs py-1.5 px-3"
                  >
                    <Clock size={13} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
                    {t('header.scheduleBtn')}
                  </GlassButton>
                ) : (
                  <GlassButton 
                    variant="secondary" 
                    onClick={handleScheduleDownload}
                    disabled={isActionPending || !url}
                    className="flex items-center gap-1 text-xs py-1.5 px-3"
                  >
                    <Clock size={13} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
                    {t('dialog.confirm')}
                  </GlassButton>
                )}
                
                <GlassButton 
                  variant="primary" 
                  onClick={handleStartDownload}
                  disabled={isActionPending || !url}
                  className="flex items-center gap-1.5 text-xs py-1.5 px-4"
                >
                  {isActionPending ? (
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Download size={13} />
                  )}
                  {t('dialog.startDownload')}
                </GlassButton>
              </div>
            </>
          )}

          {/* STATE 2: DOWNLOADING */}
          {isDownloading && (
            <>
              <button
                onClick={handleCancel}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                  isLight
                    ? 'text-rose-600 hover:bg-rose-50 border-rose-200'
                    : 'text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border-rose-500/20'
                }`}
              >
                {t('dialog.cancelDownload')}
              </button>

              <GlassButton 
                variant="secondary" 
                onClick={handlePause}
                className={`flex items-center gap-1.5 text-xs py-1.5 px-3.5 ${
                  isLight ? 'border-amber-300 text-amber-800 hover:bg-amber-50' : 'border-amber-500/30 text-amber-300 hover:bg-amber-500/10'
                }`}
              >
                <Pause size={13} className={isLight ? "text-amber-600" : "text-amber-400"} />
                {t('dialog.pause')}
              </GlassButton>
            </>
          )}

          {/* STATE 3: PAUSED */}
          {isPaused && (
            <>
              <button
                onClick={handleCancel}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  isLight ? 'text-slate-600 hover:text-rose-600' : 'text-slate-400 hover:text-rose-300 hover:bg-rose-500/10'
                }`}
              >
                {t('dialog.cancelDownload')}
              </button>

              <GlassButton 
                variant="primary" 
                onClick={handleResume}
                className="flex items-center gap-1.5 text-xs py-1.5 px-3.5"
              >
                <Play size={13} />
                {t('dialog.resume')}
              </GlassButton>
            </>
          )}

          {/* STATE 4: QUEUED/WAITING */}
          {isWaiting && (
            <>
              <button
                onClick={handleCancel}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('common.cancel')}
              </button>

              <div className={`flex items-center gap-2 text-xs px-2.5 py-1 rounded-lg border ${
                isLight ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-amber-300 bg-amber-500/10 border-amber-500/20'
              }`}>
                <div className="w-3 h-3 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin" />
                {t('dialog.connectingEngine')}
              </div>
            </>
          )}

          {/* STATE 5: COMPLETED */}
          {isCompleted && (
            <>
              <button
                onClick={handleOpenFolder}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors flex items-center gap-1.5 ${
                  isLight
                    ? 'text-purple-700 hover:bg-purple-50 bg-purple-50/50 border-purple-200'
                    : 'text-slate-300 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/20'
                }`}
              >
                <FolderOpen size={13} className={isLight ? "text-pink-600" : "text-pink-400"} />
                {t('dialog.openFolder')}
              </button>

              <div className="flex items-center gap-2">
                <GlassButton 
                  variant="primary" 
                  onClick={handleOpenFile}
                  className="flex items-center gap-1.5 text-xs py-1.5 px-3.5"
                >
                  <ExternalLink size={13} />
                  {t('dialog.openFile')}
                </GlassButton>
                <button
                  onClick={handleClose}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                    isLight ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-100' : 'text-slate-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {t('common.close')}
                </button>
              </div>
            </>
          )}

          {/* STATE 6: ERROR */}
          {isError && (
            <>
              <button
                onClick={handleClose}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {t('common.close')}
              </button>

              <GlassButton 
                variant="primary" 
                onClick={handleRetry}
                className="flex items-center gap-1.5 text-xs py-1.5 px-3.5 bg-rose-600 hover:bg-rose-500 border-rose-400/30"
              >
                <RotateCcw size={13} />
                {t('dialog.retry')}
              </GlassButton>
            </>
          )}

          {/* STATE 7: SCHEDULED */}
          {isScheduled && (
            <>
              <button
                onClick={handleCancel}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                  isLight ? 'text-slate-600 hover:text-rose-600' : 'text-slate-400 hover:text-rose-300'
                }`}
              >
                {t('common.cancel')}
              </button>

              <GlassButton 
                variant="primary" 
                onClick={handleStartDownload}
                className="flex items-center gap-1.5 text-xs py-1.5 px-3.5"
              >
                <Play size={13} />
                {t('dialog.startNow')}
              </GlassButton>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
