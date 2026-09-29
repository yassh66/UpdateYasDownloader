import { useEffect, useState } from 'react';
import { ArrowDownToLine, HardDrive, Zap, Clock } from 'lucide-react';
import type { DownloadItem } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

export default function StatsArea() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isLight = theme === 'light';

  useEffect(() => {
    if (window.electronAPI?.getDownloads) {
      window.electronAPI.getDownloads()
        .then((res) => {
          if (Array.isArray(res)) setDownloads(res);
        })
        .catch(console.error);
    }

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
        setDownloads((prev) => prev.filter((d) => d.id !== id));
      });
    }

    let unsubscribeCleared: (() => void) | undefined;
    if (window.electronAPI?.onDownloadsCleared) {
      unsubscribeCleared = window.electronAPI.onDownloadsCleared(() => {
        setDownloads([]);
      });
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (unsubscribeRemoved) unsubscribeRemoved();
      if (unsubscribeCleared) unsubscribeCleared();
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const activeDownloads = downloads.filter(d => d.status === 'downloading').length;
  const currentSpeed = downloads.filter(d => d.status === 'downloading').reduce((acc, d) => acc + (d.speed || 0), 0);
  const totalDownloaded = downloads.reduce((acc, d) => acc + (d.downloadedBytes || 0), 0);

  const darkStats = [
    { label: t('stats.activeDownloads'), value: activeDownloads.toString(), icon: ArrowDownToLine, color: 'text-purple-400', bg: 'bg-purple-500/10 border-purple-500/20' },
    { label: t('stats.currentSpeed'), value: `${formatBytes(currentSpeed)}/s`, icon: Zap, color: 'text-pink-400', bg: 'bg-pink-500/10 border-pink-500/20' },
    { label: t('stats.totalDownloaded'), value: formatBytes(totalDownloaded), icon: HardDrive, color: 'text-fuchsia-400', bg: 'bg-fuchsia-500/10 border-fuchsia-500/20' },
    { label: t('stats.uptime'), value: '--', icon: Clock, color: 'text-slate-400', bg: 'bg-white/5 border-white/10' },
  ];

  const lightStats = [
    { label: t('stats.activeDownloads'), value: activeDownloads.toString(), icon: ArrowDownToLine, color: 'text-purple-600', bg: 'bg-purple-50 border-purple-200' },
    { label: t('stats.currentSpeed'), value: `${formatBytes(currentSpeed)}/s`, icon: Zap, color: 'text-pink-600', bg: 'bg-pink-50 border-pink-200' },
    { label: t('stats.totalDownloaded'), value: formatBytes(totalDownloaded), icon: HardDrive, color: 'text-fuchsia-600', bg: 'bg-fuchsia-50 border-fuchsia-200' },
    { label: t('stats.uptime'), value: '--', icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200' },
  ];

  const stats = isLight ? lightStats : darkStats;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5 shrink-0">
      {stats.map((stat, i) => (
        <div 
          key={i} 
          className={`relative group rounded-2xl p-4 overflow-hidden transition-all duration-200 ${
            isLight
              ? 'bg-white/80 border border-purple-100/90 shadow-[0_4px_20px_-4px_rgba(112,26,117,0.04)] hover:border-purple-300/80 hover:bg-white backdrop-blur-md'
              : 'bg-gradient-to-b from-[#111122]/60 to-[#0A0A16]/60 border border-purple-500/10 hover:border-purple-500/25 shadow-sm'
          }`}
        >
          <div className={`absolute top-0 right-0 -mt-4 -mr-4 w-20 h-20 rounded-full blur-xl pointer-events-none transition-all ${
            isLight
              ? 'bg-gradient-to-br from-purple-400/10 via-pink-400/5 to-transparent group-hover:from-purple-400/20'
              : 'bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent group-hover:from-purple-500/20'
          }`}></div>
          
          <div className="flex items-center gap-3 mb-2">
            <div className={`w-8 h-8 rounded-xl ${stat.bg} flex items-center justify-center border shrink-0 shadow-sm`}>
              <stat.icon className={`w-4 h-4 ${stat.color}`} strokeWidth={2} />
            </div>
            <h3 className={`text-[11px] font-semibold uppercase tracking-wider truncate ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {stat.label}
            </h3>
          </div>
          <div className={`font-display text-xl font-bold tracking-tight pl-0.5 ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            {stat.value}
          </div>
        </div>
      ))}
    </div>
  );
}
