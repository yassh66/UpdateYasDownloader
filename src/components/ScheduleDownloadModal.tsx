import React, { useState } from 'react';
import { X, Clock, Calendar } from 'lucide-react';
import GlassButton from './GlassButton';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

interface ScheduleDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  onSchedule: (url: string, time: number) => void;
}

export default function ScheduleDownloadModal({ isOpen, onClose, url, onSchedule }: ScheduleDownloadModalProps) {
  // Default to 1 hour from now
  const defaultTime = new Date(Date.now() + 60 * 60 * 1000);
  // Format to YYYY-MM-DDThh:mm for datetime-local input
  const pad = (n: number) => n.toString().padStart(2, '0');
  const formattedDefault = `${defaultTime.getFullYear()}-${pad(defaultTime.getMonth() + 1)}-${pad(defaultTime.getDate())}T${pad(defaultTime.getHours())}:${pad(defaultTime.getMinutes())}`;

  const [inputUrl, setInputUrl] = useState(url);
  const [datetime, setDatetime] = useState(formattedDefault);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isLight = theme === 'light';

  // Sync url prop when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setInputUrl(url);
      setErrorMsg(null);
    }
  }, [isOpen, url]);

  const handleSchedule = () => {
    if (!inputUrl.trim() || !datetime) return;
    
    const time = new Date(datetime).getTime();
    if (time <= Date.now()) {
      setErrorMsg("Please select a future date and time.");
      return;
    }

    onSchedule(inputUrl, time);
    onClose();
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
      <div 
        className={`relative w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-colors ${
          isLight
            ? 'bg-white/95 border shadow-[0_20px_60px_-15px_rgba(0,0,0,0.12)]'
            : 'bg-[#0C0C18] border'
        }`}
        style={{ borderColor: 'var(--accent-border)' }}
      >
        <div className={`flex items-center justify-between px-6 py-4 transition-colors ${
          isLight 
            ? 'border-b border-slate-200/80 bg-slate-50/60' 
            : 'border-b border-white/5 bg-black/30'
        }`}>
          <div className="flex items-center gap-3">
            <div 
              className="w-8 h-8 rounded-xl border flex items-center justify-center"
              style={{
                backgroundColor: 'var(--accent-soft)',
                borderColor: 'var(--accent-border)',
                color: 'var(--accent-text)',
              }}
            >
              <Clock size={16} />
            </div>
            <div>
              <h3 className={`font-display font-medium text-sm ${isLight ? 'text-slate-900' : 'text-slate-200'}`}>
                {t('scheduleModal.title')}
              </h3>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('scheduleModal.subtitle')}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isLight 
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <X size={16} />
          </button>
        </div>
        
        <div className="p-6 flex flex-col gap-4">
          {errorMsg && (
            <div className={`p-2 rounded-lg text-xs ${
              isLight 
                ? 'bg-rose-50 border border-rose-200 text-rose-700' 
                : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
            }`}>
              {errorMsg}
            </div>
          )}

          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              {t('scheduleModal.urlLabel')}
            </label>
            <input
              type="url"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com/file.zip"
              className={`w-full rounded-xl p-2.5 text-xs font-mono focus:outline-none ${
                isLight
                  ? 'bg-slate-50 text-slate-800 placeholder-slate-400'
                  : 'bg-[#080814] text-slate-200 placeholder-slate-500'
              }`}
              style={{
                border: '1px solid var(--accent-border)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = 'var(--accent-glow-sm)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent-border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
          </div>

          <div>
            <label className={`text-xs font-medium block mb-1.5 ${isLight ? 'text-slate-700' : 'text-slate-300'}`}>
              {t('scheduleModal.timeLabel')}
            </label>
            <div className="relative">
              <input
                type="datetime-local"
                value={datetime}
                onChange={(e) => {
                  setDatetime(e.target.value);
                  setErrorMsg(null);
                }}
                className={`w-full rounded-xl p-2.5 text-xs font-mono focus:outline-none ${
                  isLight
                    ? 'bg-slate-50 text-slate-800'
                    : 'bg-[#080814] text-slate-200'
                }`}
                style={{
                  border: '1px solid var(--accent-border)',
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent)';
                  e.currentTarget.style.boxShadow = 'var(--accent-glow-sm)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = 'var(--accent-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          <div 
            className="flex items-center justify-end gap-2.5 border-t pt-4 mt-1"
            style={{ borderColor: 'var(--accent-border)' }}
          >
            <button 
              onClick={onClose}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                isLight 
                  ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-100' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {t('common.cancel')}
            </button>
            <GlassButton 
              variant="primary" 
              onClick={handleSchedule}
              disabled={!inputUrl.trim()}
              className="text-xs py-2 px-4"
            >
              <Calendar size={14} className="mr-1.5 rtl:mr-0 rtl:ml-1.5" /> {t('scheduleModal.scheduleBtn')}
            </GlassButton>
          </div>
        </div>
      </div>
    </div>
  );
}
