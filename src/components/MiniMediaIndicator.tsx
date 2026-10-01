import React from 'react';
import { 
  Play, 
  Pause, 
  X, 
  Maximize2, 
  Youtube, 
  Video, 
  Music, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Film
} from 'lucide-react';
import { useMediaDownload } from '../context/MediaDownloadContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAccent } from '../context/AccentContext';

export default function MiniMediaIndicator() {
  const { isMinimized, activeJob, currentUrl, restoreMediaDialog, closeMediaDialog, setActiveJob } = useMediaDownload();
  const { theme } = useTheme();
  const { isRTL } = useLanguage();
  const { tokens } = useAccent();
  const isLight = theme === 'light';

  // Show indicator if minimized and there is an active job, or an active analyzed URL
  if (!isMinimized) return null;
  if (!activeJob && !currentUrl) return null;

  const isDownloading = activeJob?.status === 'downloading';
  const isPaused = activeJob?.status === 'paused';
  const isCompleted = activeJob?.status === 'completed';
  const isError = activeJob?.status === 'error';

  const percent = activeJob?.percent || 0;
  const title = activeJob?.title || activeJob?.cleanFileName || currentUrl || 'Media Processing';
  const speed = activeJob?.speed || '';
  const eta = activeJob?.eta || '';
  const stage = activeJob?.stage || (isDownloading ? 'downloading' : isPaused ? 'paused' : 'ready');

  const getMediaIcon = () => {
    if (activeJob?.container === 'mp3') {
      return <Music size={16} className="text-pink-500" />;
    }
    if (activeJob?.url?.includes('youtube') || activeJob?.url?.includes('youtu.be')) {
      return <Youtube size={16} className="text-red-500" />;
    }
    if (activeJob?.url?.includes('tiktok') || activeJob?.url?.includes('instagram')) {
      return <Film size={16} className="text-cyan-400" />;
    }
    return <Video size={16} className="text-purple-400" />;
  };

  const getStageLabel = () => {
    if (isCompleted) return 'Completed';
    if (isPaused) return 'Paused';
    if (isError) return 'Interrupted';
    switch (stage) {
      case 'extracting': return 'Extracting Info...';
      case 'downloading_video': return 'Downloading Video';
      case 'downloading_audio': return 'Downloading Audio';
      case 'merging_streams': return 'FFmpeg Muxing';
      case 'converting_audio': return 'Transcoding MP3';
      default: return isDownloading ? 'Downloading' : 'Active';
    }
  };

  const handleTogglePause = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeJob?.id) return;
    const engine = (window as any).electron?.mediaEngine || (window as any).mediaEngine;
    if (!engine) return;

    try {
      if (isDownloading) {
        if (engine.pauseDownload) await engine.pauseDownload(activeJob.id);
        setActiveJob({
          ...activeJob,
          status: 'paused',
          stage: 'paused',
          speed: '0 B/s',
        });
      } else if (isPaused || isError) {
        if (engine.resumeDownload) await engine.resumeDownload(activeJob.id);
        setActiveJob({
          ...activeJob,
          status: 'downloading',
          stage: 'downloading_video',
          error: undefined,
        });
      }
    } catch (err) {
      console.error('Failed to toggle pause on mini player:', err);
    }
  };

  const handleCancelOrDismiss = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (activeJob?.id && (isDownloading || isPaused)) {
      const engine = (window as any).electron?.mediaEngine || (window as any).mediaEngine;
      if (engine?.cancelDownload) {
        try {
          await engine.cancelDownload(activeJob.id);
        } catch (err) {
          console.error(err);
        }
      }
    }
    closeMediaDialog();
  };

  return (
    <div
      dir={isRTL ? 'rtl' : 'ltr'}
      onClick={restoreMediaDialog}
      className={`fixed bottom-5 right-6 z-[95] w-84 sm:w-96 rounded-2xl border p-3.5 shadow-2xl backdrop-blur-xl transition-all duration-300 cursor-pointer group hover:scale-[1.02] active:scale-[0.99] select-none animate-in slide-in-from-bottom-5 fade-in ${
        isLight
          ? 'bg-white/95 border-purple-200 text-slate-800 shadow-[0_15px_40px_rgba(112,26,117,0.18)] hover:border-purple-400'
          : 'bg-[#0E0E1B]/95 border-purple-500/30 text-white shadow-[0_20px_50px_rgba(0,0,0,0.85)] hover:border-purple-500/60'
      }`}
      title="Click to expand Media Downloader"
    >
      {/* Top Section: Media icon, Title, Stage, and Controls */}
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center border ${
            isCompleted
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
              : isError
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-500'
              : isLight
              ? 'bg-purple-50 border-purple-200'
              : 'bg-purple-950/40 border-purple-500/20'
          }`}>
            {isCompleted ? (
              <CheckCircle2 size={17} className="text-emerald-500" />
            ) : isError ? (
              <AlertCircle size={17} className="text-rose-500" />
            ) : isDownloading ? (
              <Loader2 size={16} className="animate-spin text-purple-500" />
            ) : (
              getMediaIcon()
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h4 className="text-xs font-bold truncate leading-tight group-hover:text-purple-600 dark:group-hover:text-purple-300 transition-colors">
                {title}
              </h4>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
              <span className={`font-semibold ${
                isCompleted 
                  ? 'text-emerald-600 dark:text-emerald-400' 
                  : isPaused 
                  ? 'text-amber-600 dark:text-amber-400' 
                  : isError
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-purple-600 dark:text-purple-400'
              }`}>
                {getStageLabel()}
              </span>
              {activeJob?.quality && (
                <span className="px-1 py-0.2 rounded bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 uppercase font-bold text-[9px]">
                  {activeJob.quality}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {(isDownloading || isPaused || isError) && activeJob?.id && (
            <button
              type="button"
              onClick={handleTogglePause}
              className={`p-1.5 rounded-lg transition-colors ${
                isDownloading
                  ? 'hover:bg-amber-500/10 text-slate-400 hover:text-amber-500'
                  : 'hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-500'
              }`}
              title={isDownloading ? 'Pause Download' : 'Resume Download'}
            >
              {isDownloading ? <Pause size={14} /> : <Play size={14} />}
            </button>
          )}

          <button
            type="button"
            onClick={restoreMediaDialog}
            className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 dark:hover:text-purple-300 hover:bg-purple-500/10 transition-colors"
            title="Expand Media Downloader"
          >
            <Maximize2 size={14} />
          </button>

          <button
            type="button"
            onClick={handleCancelOrDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
            title="Dismiss"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Progress Bar & Real-time Metrics */}
      {(isDownloading || isPaused || isCompleted || isError) && (
        <div className="mt-2.5 space-y-1.5">
          <div className="w-full h-1.5 rounded-full bg-black/15 dark:bg-white/10 overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isCompleted
                  ? 'bg-emerald-500'
                  : isPaused
                  ? 'bg-amber-500'
                  : isError
                  ? 'bg-rose-500'
                  : ''
              }`}
              style={{ 
                width: `${Math.max(2, percent)}%`,
                background: (!isCompleted && !isPaused && !isError) 
                  ? `linear-gradient(to right, var(--accent-gradient-start), var(--accent-gradient-end))`
                  : undefined,
                boxShadow: (!isCompleted && !isPaused && !isError) ? 'var(--accent-glow-sm)' : undefined,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-2">
              {speed && <span>{speed}</span>}
              {eta && <span>ETA: {eta}</span>}
            </div>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {percent}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
