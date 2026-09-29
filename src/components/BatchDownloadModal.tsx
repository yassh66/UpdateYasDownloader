import { useState, useMemo } from 'react';
import { X, ListPlus, Link as LinkIcon, Download } from 'lucide-react';
import GlassButton from './GlassButton';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

interface BatchDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BatchDownloadModal({ isOpen, onClose }: BatchDownloadModalProps) {
  const [urlsText, setUrlsText] = useState('');
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isLight = theme === 'light';

  const validUrls = useMemo(() => {
    if (!urlsText.trim()) return [];
    
    // Split by newline or comma, then clean up
    const rawUrls = urlsText.split(/[\n,]/).map(u => u.trim()).filter(Boolean);
    
    // Filter valid URLs (http/https) and remove duplicates
    const valid = new Set<string>();
    for (const url of rawUrls) {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        valid.add(url);
      }
    }
    
    return Array.from(valid);
  }, [urlsText]);

  const handleStartBatch = async () => {
    if (validUrls.length === 0) return;
    
    for (const url of validUrls) {
      try {
        await window.electronAPI?.startDownload(url);
      } catch (e) {
        console.error(`Failed to start download for ${url}:`, e);
      }
    }
    setUrlsText('');
    onClose();
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setUrlsText(prev => prev + (prev.endsWith('\n') || !prev ? '' : '\n') + text);
      }
    } catch (err) {
      console.error('Failed to read clipboard contents: ', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 backdrop-blur-sm ${
          isLight ? 'bg-slate-900/40' : 'bg-[#05050C]/80'
        }`}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className={`relative w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-colors ${
        isLight
          ? 'bg-white/95 border border-purple-200/90 shadow-[0_20px_60px_-15px_rgba(112,26,117,0.12)]'
          : 'bg-[#0C0C18] border border-purple-500/20'
      }`}>
        <div className={`flex items-center justify-between px-6 py-4 transition-colors ${
          isLight 
            ? 'border-b border-purple-100 bg-slate-50/60' 
            : 'border-b border-purple-500/10 bg-black/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl border ${
              isLight 
                ? 'bg-purple-50 border-purple-200 text-purple-600' 
                : 'bg-purple-500/10 border-purple-500/20 text-fuchsia-400'
            }`}>
              <ListPlus size={18} />
            </div>
            <div>
              <h3 className={`font-display font-medium text-sm ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                {t('batchModal.title')}
              </h3>
              <p className={`text-[11px] ${isLight ? 'text-purple-700' : 'text-purple-300/70'}`}>
                {t('batchModal.subtitle')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors ${
              isLight 
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
                {t('batchModal.linksLabel')}
              </label>
              <button 
                onClick={handlePaste}
                className={`text-[11px] flex items-center gap-1 transition-colors ${
                  isLight ? 'text-pink-600 hover:text-pink-700 font-medium' : 'text-pink-400 hover:text-pink-300'
                }`}
              >
                <LinkIcon size={12} /> {t('batchModal.paste')}
              </button>
            </div>
            <textarea
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              placeholder="https://example.com/file1.zip&#10;https://example.com/file2.mp4"
              rows={6}
              className={`w-full rounded-xl p-3 text-xs font-mono resize-none stable-scroll-container focus:outline-none focus:ring-1 ${
                isLight
                  ? 'bg-slate-50 border border-purple-200/90 text-slate-800 placeholder-slate-400 focus:border-purple-600 focus:ring-purple-500/20'
                  : 'bg-[#080814] border border-purple-500/20 text-slate-200 placeholder-slate-500 focus:border-fuchsia-500/50 focus:ring-fuchsia-500/50'
              }`}
            />
          </div>

          <div className={`flex items-center justify-between text-xs border-t pt-4 ${
            isLight ? 'border-purple-100 text-slate-600' : 'border-purple-500/10 text-slate-400'
          }`}>
            <span className={`font-medium ${isLight ? 'text-purple-800' : 'text-purple-300'}`}>
              {validUrls.length} {t('batchModal.validCount')}
            </span>
            <div className="flex items-center gap-2.5">
              <button 
                onClick={onClose}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
                  isLight 
                    ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' 
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {t('common.cancel')}
              </button>
              <GlassButton 
                variant="primary" 
                onClick={handleStartBatch}
                disabled={validUrls.length === 0}
                className="text-xs py-2 px-4"
              >
                <Download size={14} className="mr-1.5 rtl:mr-0 rtl:ml-1.5" /> {t('batchModal.startBatch')} ({validUrls.length})
              </GlassButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
