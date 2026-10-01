import { useEffect, useState } from 'react';
import { ArrowDownToLine, HardDrive, Zap, Clock } from 'lucide-react';
import type { DownloadItem } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAccent } from '../context/AccentContext';

export default function StatsArea() {
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { tokens } = useAccent();
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

  const stats = [
    { 
      label: t('stats.activeDownloads'), 
      value: activeDownloads.toString(), 
      icon: ArrowDownToLine,
      useAccent: true,
    },
    { 
      label: t('stats.currentSpeed'), 
      value: `${formatBytes(currentSpeed)}/s`, 
      icon: Zap,
      useAccent: true,
    },
    { 
      label: t('stats.totalDownloaded'), 
      value: formatBytes(totalDownloaded), 
      icon: HardDrive,
      useAccent: true,
    },
    { 
      label: t('stats.uptime'), 
      value: '--', 
      icon: Clock,
      useAccent: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5 shrink-0">
      {stats.map((stat, i) => (
        <div 
          key={i} 
          className={`relative group rounded-2xl p-4 overflow-hidden transition-all duration-200 ${
            isLight
              ? 'bg-white/85 border shadow-[0_4px_20px_-4px_rgba(0,0,0,0.03)] hover:bg-white backdrop-blur-md'
              : 'bg-[#0E0E1C]/70 border hover:bg-[#121224]/80 shadow-sm'
          }`}
          style={{
            borderColor: 'var(--accent-border)'
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border-strong)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)';
          }}
        >
          <div 
            className="absolute top-0 right-0 -mt-4 -mr-4 w-20 h-20 rounded-full blur-xl pointer-events-none transition-all opacity-30 group-hover:opacity-60"
            style={{
              background: `radial-gradient(circle, var(--accent) 0%, transparent 70%)`
            }}
          ></div>
          
          <div className="flex items-center gap-3 mb-2">
            <div 
              className="w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 shadow-sm transition-transform group-hover:scale-105"
              style={{
                backgroundColor: stat.useAccent ? 'var(--accent-soft)' : (isLight ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)'),
                borderColor: stat.useAccent ? 'var(--accent-border)' : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.1)'),
              }}
            >
              <stat.icon 
                className="w-4 h-4" 
                style={stat.useAccent ? { color: 'var(--accent)' } : undefined}
                strokeWidth={2} 
              />
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

