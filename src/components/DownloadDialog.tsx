import React, { useState, useEffect } from 'react';
import { 
  Download, 
  Folder, 
  Globe, 
  Clock, 
  X, 
  FileText, 
  Video, 
  Music, 
  Archive, 
  Package, 
  FileCode,
  Layers,
  ArrowDownCircle
} from 'lucide-react';
import GlassButton from './GlassButton';
import type { InterceptedDownloadData, StartDownloadOptions } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

interface DownloadDialogProps {
  isOpen: boolean;
  data: InterceptedDownloadData | null;
  onClose: () => void;
  onConfirm: (options: StartDownloadOptions, startNow: boolean) => Promise<void>;
}

function formatBytes(bytes: number, decimals = 2): string {
  if (!bytes || bytes <= 0) return 'Unknown size';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function getFileIcon(filename: string, isLight: boolean, mime?: string) {
  const ext = filename ? filename.toLowerCase().slice(filename.lastIndexOf('.')) : '';
  if (['.mp4', '.mkv', '.webm', '.avi', '.mov'].includes(ext) || mime?.startsWith('video/')) {
    return <Video className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} size={24} />;
  }
  if (['.mp3', '.flac', '.wav', '.aac', '.ogg'].includes(ext) || mime?.startsWith('audio/')) {
    return <Music className={isLight ? "text-pink-600" : "text-pink-400"} size={24} />;
  }
  if (['.pdf', '.docx', '.xlsx', '.pptx', '.txt'].includes(ext) || mime?.startsWith('text/')) {
    return <FileText className={isLight ? "text-violet-600" : "text-violet-400"} size={24} />;
  }
  if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext) || mime?.includes('zip') || mime?.includes('compressed')) {
    return <Archive className={isLight ? "text-rose-600" : "text-rose-400"} size={24} />;
  }
  if (['.exe', '.msi', '.dmg', '.pkg', '.apk'].includes(ext)) {
    return <Package className={isLight ? "text-purple-600" : "text-purple-400"} size={24} />;
  }
  return <FileCode className={isLight ? "text-pink-600" : "text-pink-300"} size={24} />;
}

export default function DownloadDialog({ isOpen, data, onClose, onConfirm }: DownloadDialogProps) {
  const [filename, setFilename] = useState('');
  const [saveFolder, setSaveFolder] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isLight = theme === 'light';

  useEffect(() => {
    if (data) {
      setFilename(data.filename || '');
      setSaveFolder(data.defaultFolder || '');
    }
  }, [data]);

  if (!isOpen || !data) return null;

  const handleSelectFolder = async () => {
    try {
      if (window.electronAPI?.selectFolder) {
        const folder = await window.electronAPI.selectFolder();
        if (folder) setSaveFolder(folder);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDownload = async (startNow: boolean) => {
    setIsSubmitting(true);
    try {
      await onConfirm({
        url: data.finalUrl || data.url,
        filename: filename.trim() || data.filename,
        savePath: `${saveFolder}/${filename.trim() || data.filename}`,
        totalBytes: data.fileSize,
        referrer: data.referrer,
        cookies: data.cookies,
        userAgent: data.userAgent
      }, startNow);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const domain = data.url ? new URL(data.url).hostname : 'Direct Link';

  return (
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-md animate-in fade-in duration-200 ${
      isLight ? 'bg-slate-900/40' : 'bg-black/70'
    }`}>
      <div 
        className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl relative overflow-hidden flex flex-col gap-6 transition-colors ${
          isLight 
            ? 'bg-white/95 border border-purple-200/90 text-slate-900 shadow-[0_20px_60px_-15px_rgba(112,26,117,0.12)]' 
            : 'bg-[#0C0C18] border border-purple-500/20 text-white shadow-2xl'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Glow accent */}
        <div className={`absolute top-0 right-0 -mt-8 -mr-8 w-40 h-40 rounded-full blur-3xl pointer-events-none ${
          isLight
            ? 'bg-gradient-to-br from-purple-400/20 via-pink-400/20 to-transparent'
            : 'bg-gradient-to-br from-purple-600/20 via-pink-600/20 to-transparent'
        }`} />

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 text-white shadow-md shadow-purple-950/40">
              <ArrowDownCircle size={22} />
            </div>
            <div>
              <h3 className={`font-display font-bold text-base ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {t('downloadDialog.title')}
              </h3>
              <p className={`text-xs ${isLight ? 'text-purple-700' : 'text-purple-300/70'}`}>
                {t('downloadDialog.subtitle')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors ${
              isLight 
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <X size={18} />
          </button>
        </div>

        {/* Overview Box */}
        <div className={`p-4 rounded-2xl flex items-start gap-4 ${
          isLight 
            ? 'bg-purple-50/70 border border-purple-200/80 shadow-sm' 
            : 'bg-purple-950/20 border border-purple-500/15'
        }`}>
          <div className={`p-3 rounded-xl border ${
            isLight 
              ? 'bg-white border-purple-200/90 shadow-sm' 
              : 'bg-purple-900/30 border border-purple-500/20'
          }`}>
            {getFileIcon(filename || data.filename, isLight, data.mime)}
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold truncate ${isLight ? 'text-slate-900' : 'text-white'}`} title={filename || data.filename}>
              {filename || data.filename}
            </div>
            <div className={`flex items-center gap-4 mt-2 text-xs font-mono ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              <span className={`flex items-center gap-1 ${isLight ? 'text-purple-700 font-medium' : 'text-purple-200'}`}>
                <Layers size={13} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
                {formatBytes(data.fileSize)}
              </span>
              <span className={`flex items-center gap-1 truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                <Globe size={13} className={isLight ? "text-pink-600" : "text-pink-400"} />
                {domain}
              </span>
            </div>
          </div>
        </div>

        {/* Form Inputs */}
        <div className="space-y-4 text-xs">
          <div>
            <label className={`block font-medium mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
              {t('downloadDialog.fileName')}
            </label>
            <input 
              type="text" 
              value={filename} 
              onChange={(e) => setFilename(e.target.value)}
              className={`w-full rounded-xl py-2 px-3.5 font-mono focus:outline-none focus:ring-1 ${
                isLight
                  ? 'bg-white border border-purple-200/90 text-slate-800 placeholder-slate-400 focus:border-purple-600 focus:ring-purple-500/20 shadow-sm'
                  : 'bg-[#121222] border border-purple-500/20 text-slate-100 placeholder-slate-500 focus:border-fuchsia-500/50 focus:ring-fuchsia-500/50'
              }`}
            />
          </div>

          <div>
            <label className={`block font-medium mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-400'}`}>
              {t('downloadDialog.saveLocation')}
            </label>
            <div className="flex items-center gap-2">
              <div className={`flex-1 rounded-xl py-2 px-3.5 font-mono truncate ${
                isLight
                  ? 'bg-slate-50 border border-purple-200/80 text-slate-800'
                  : 'bg-[#121222] border border-purple-500/20 text-slate-300'
              }`}>
                {saveFolder || t('downloadDialog.selectFolder')}
              </div>
              <button 
                onClick={handleSelectFolder}
                className={`px-3.5 py-2 rounded-xl transition-colors shrink-0 flex items-center gap-1.5 ${
                  isLight
                    ? 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200/90 shadow-sm'
                    : 'bg-purple-500/10 hover:bg-purple-500/20 text-purple-200 border border-purple-500/20'
                }`}
              >
                <Folder size={14} className={isLight ? "text-pink-600" : "text-pink-400"} />
                {t('downloadDialog.browse')}
              </button>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className={`flex items-center justify-between pt-2 border-t ${
          isLight ? 'border-purple-100' : 'border-purple-500/10'
        }`}>
          <button 
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
              isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            {t('common.cancel')}
          </button>
          
          <div className="flex items-center gap-2.5">
            <GlassButton 
              variant="secondary" 
              onClick={() => handleDownload(false)}
              disabled={isSubmitting}
              className="text-xs py-2 px-3.5"
            >
              <Clock size={14} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
              {t('downloadDialog.downloadLater')}
            </GlassButton>
            <GlassButton 
              variant="primary" 
              onClick={() => handleDownload(true)}
              disabled={isSubmitting}
              className="text-xs py-2 px-4"
            >
              <Download size={14} />
              {t('downloadDialog.startDownload')}
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  );
}
