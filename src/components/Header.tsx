import React, { useState, useEffect } from 'react';
import { Plus, Link as LinkIcon, ListPlus, Clock, Sun, Moon, Youtube } from 'lucide-react';
import GlassButton from './GlassButton';
import BatchDownloadModal from './BatchDownloadModal';
import ScheduleDownloadModal from './ScheduleDownloadModal';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useMediaDownload } from '../context/MediaDownloadContext';

export default function Header() {
  const [url, setUrl] = useState('');
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const { openMediaDialog } = useMediaDownload();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const isLight = theme === 'light';

  const handleStartDownload = async () => {
    const trimmed = url.trim();
    if (!trimmed) return;

    try {
      // Check if URL is YouTube or media link
      if (window.mediaEngine?.detectUrl) {
        const detection = await window.mediaEngine.detectUrl(trimmed);
        if (detection?.isMediaUrl) {
          openMediaDialog(trimmed);
          setUrl('');
          return;
        }
      }

      if (window.electronAPI?.openDownloadDialog) {
        await window.electronAPI.openDownloadDialog({ url: trimmed });
        setUrl('');
      } else if (trimmed) {
        await window.electronAPI?.startDownload(trimmed);
        setUrl('');
      }
    } catch (e) {
      console.error('Failed to start download:', e);
    }
  };

  const handleScheduleDownload = async (scheduleUrl: string, time: number) => {
    try {
      await window.electronAPI.scheduleDownload(scheduleUrl, time);
      if (scheduleUrl === url) setUrl('');
    } catch (e) {
      console.error('Failed to schedule download:', e);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleStartDownload();
    }
  };
  
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        setUrl(text);
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  useEffect(() => {
    const handleFocus = async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (text && (text.startsWith('http://') || text.startsWith('https://')) && !url) {
          setUrl(text);
        }
      } catch (e) {}
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [url]);

  return (
    <header className={`h-20 shrink-0 flex items-center justify-between px-6 border-b transition-colors duration-200 relative z-10 ${
      isLight 
        ? 'border-purple-900/10 bg-white/75 backdrop-blur-md shadow-[0_4px_20px_rgba(112,26,117,0.03)]' 
        : 'border-white/5 bg-[#090915]/60 backdrop-blur-md'
    }`}>
      
      <div className="flex items-center justify-between w-full gap-4">
        {/* Expanded Premium URL Input */}
        <div className="flex-1 max-w-2xl relative group">
          <div className="absolute inset-y-0 left-0 pl-4 rtl:left-auto rtl:right-0 rtl:pl-0 rtl:pr-4 flex items-center pointer-events-none">
            <LinkIcon className={`transition-colors size-4 ${
              isLight 
                ? 'text-purple-500/70 group-focus-within:text-purple-600' 
                : 'text-purple-400/60 group-focus-within:text-pink-400'
            }`} />
          </div>
          <input 
            type="url" 
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('header.placeholder')} 
            className={`w-full rounded-xl py-2.5 pl-11 pr-24 rtl:pl-24 rtl:pr-11 text-xs font-mono truncate transition-all focus:outline-none focus:ring-2 ${
              isLight
                ? 'bg-white/95 border border-purple-200/90 focus:border-purple-500 hover:border-purple-300 text-slate-800 placeholder-slate-400 focus:ring-purple-500/15 shadow-[0_2px_8px_rgba(0,0,0,0.03)]'
                : 'bg-[#10101E]/90 border border-purple-500/15 focus:border-fuchsia-500/50 hover:border-purple-500/30 text-slate-200 placeholder-slate-500 focus:ring-purple-500/20 shadow-inner'
            }`}
          />
          <div className="absolute inset-y-0 right-1.5 rtl:right-auto rtl:left-1.5 flex items-center">
            <button 
              onClick={handlePaste} 
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all flex items-center gap-1.5 shadow-sm ${
                isLight
                  ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 hover:text-purple-950 border border-purple-200/90'
                  : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 hover:text-white border border-purple-500/20'
              }`}
            >
              <LinkIcon size={12} />
              {t('header.pasteBtn')}
            </button>
          </div>
        </div>

        {/* Action Buttons & Theme Switcher */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Quick Theme Switcher */}
          <button
            onClick={toggleTheme}
            title={isLight ? t('header.switchToDark') : t('header.switchToLight')}
            className={`p-2 rounded-xl transition-all duration-200 border flex items-center justify-center active:scale-95 shadow-sm ${
              isLight
                ? 'bg-white/90 hover:bg-purple-50 text-purple-700 border-purple-200/80 shadow-[0_2px_8px_rgba(0,0,0,0.04)]'
                : 'bg-white/[0.04] hover:bg-purple-500/10 text-slate-300 hover:text-white border-purple-500/15'
            }`}
          >
            {isLight ? (
              <Moon size={15} className="text-purple-600 transition-transform duration-300 hover:rotate-12" />
            ) : (
              <Sun size={15} className="text-amber-300 transition-transform duration-300 hover:rotate-45" />
            )}
          </button>

          <GlassButton 
            variant="secondary" 
            onClick={() => setIsScheduleModalOpen(true)} 
            className="text-xs py-2 px-3.5"
          >
            <Clock size={14} className={isLight ? "text-purple-600" : "text-purple-400"} />
            {t('header.scheduleBtn')}
          </GlassButton>

          <GlassButton 
            variant="secondary" 
            data-media-trigger="true"
            onClick={() => openMediaDialog(url)} 
            className="text-xs py-2 px-3.5"
          >
            <Youtube size={14} className="text-red-500" />
            Media
          </GlassButton>

          <GlassButton 
            variant="secondary" 
            onClick={() => setIsBatchModalOpen(true)} 
            className="text-xs py-2 px-3.5"
          >
            <ListPlus size={14} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
            {t('header.batchBtn')}
          </GlassButton>

          <GlassButton 
            variant="primary" 
            onClick={handleStartDownload} 
            className="text-xs py-2 px-4"
          >
            <Plus size={15} strokeWidth={2.5} />
            {t('header.newDownloadBtn')}
          </GlassButton>
        </div>
      </div>
      
      <BatchDownloadModal 
        isOpen={isBatchModalOpen} 
        onClose={() => setIsBatchModalOpen(false)} 
      />
      <ScheduleDownloadModal 
        isOpen={isScheduleModalOpen} 
        onClose={() => setIsScheduleModalOpen(false)} 
        url={url}
        onSchedule={handleScheduleDownload}
      />
    </header>
  );
}
