import { Download, List, Activity, Settings, FolderClock } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { useAccent } from '../context/AccentContext';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export default function Sidebar({ currentTab, setCurrentTab }: SidebarProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const { tokens } = useAccent();
  const isLight = theme === 'light';

  const navItems = [
    { icon: Activity, key: 'Dashboard', label: t('nav.dashboard') },
    { icon: List, key: 'Download Queue', label: t('nav.queue') },
    { icon: FolderClock, key: 'History', label: t('nav.history') },
  ];

  return (
    <div className={`w-56 shrink-0 border-r rtl:border-r-0 rtl:border-l flex flex-col h-full relative z-20 transition-colors duration-200 ${
      isLight 
        ? 'border-slate-200/80 bg-white/80 backdrop-blur-xl shadow-[4px_0_24px_rgba(0,0,0,0.02)]' 
        : 'border-white/5 bg-[#080814]/80 backdrop-blur-xl'
    }`}
    style={{
      borderColor: 'var(--accent-border)'
    }}>
      {/* Brand Area */}
      <div className={`h-20 shrink-0 flex items-center px-6 border-b relative overflow-hidden ${
        isLight ? 'border-slate-200/80 bg-gradient-to-b from-white to-transparent' : 'border-white/5'
      }`}
      style={{
        borderColor: 'var(--accent-border)'
      }}>
        <div 
          className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20"
          style={{
            background: `radial-gradient(circle at top left, var(--accent) 0%, transparent 70%)`
          }}
        ></div>
        
        <div className="relative z-10 flex items-center gap-3">
          <div 
            className="w-9 h-9 rounded-xl p-[1.5px] transition-all"
            style={{
              background: `linear-gradient(135deg, var(--accent-gradient-start) 0%, var(--accent-gradient-end) 100%)`,
              boxShadow: 'var(--accent-glow-sm)',
            }}
          >
            <div className={`w-full h-full rounded-[10px] flex items-center justify-center ${
              isLight ? 'bg-white shadow-inner' : 'bg-[#090915]'
            }`}>
              <Download className="w-4 h-4" strokeWidth={2.5} style={{ color: 'var(--accent)' }} />
            </div>
          </div>
          <div>
            <h1 className={`font-display font-bold text-base tracking-wide leading-none ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              YAS
            </h1>
            <p 
              className="text-[9px] uppercase tracking-[0.25em] font-semibold mt-1"
              style={{ color: 'var(--accent-text)' }}
            >
              Downloader
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 py-6 px-3 flex flex-col gap-1.5 overflow-hidden">
        <div className={`px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider ${
          isLight ? 'text-slate-400' : 'text-slate-500'
        }`}>
          {t('nav.menu')}
        </div>
        
        {navItems.map((item, i) => {
          const isActive = currentTab === item.key;
          return (
            <button 
              key={i}
              onClick={() => setCurrentTab(item.key)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer ${
                isActive 
                  ? isLight
                    ? 'text-slate-900 font-bold border-l-2 rtl:border-l-0 rtl:border-r-2 shadow-sm'
                    : 'text-white font-semibold border-l-2 rtl:border-l-0 rtl:border-r-2 shadow-sm' 
                  : isLight
                    ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/70 border-l-2 rtl:border-l-0 rtl:border-r-2 border-transparent font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border-l-2 rtl:border-l-0 rtl:border-r-2 border-transparent'
              }`}
              style={isActive ? {
                background: `linear-gradient(to right, var(--accent-soft) 0%, transparent 100%)`,
                borderColor: 'var(--accent)',
              } : undefined}
            >
              <item.icon 
                size={16} 
                style={isActive ? { color: 'var(--accent)' } : undefined}
                className={isActive ? '' : 'text-slate-400'} 
              />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Settings */}
      <div 
        className="p-3 border-t shrink-0"
        style={{ borderColor: 'var(--accent-border)' }}
      >
        <button 
          onClick={() => setCurrentTab('Settings')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 w-full cursor-pointer ${
            currentTab === 'Settings' 
              ? isLight
                ? 'text-slate-900 font-bold border-l-2 rtl:border-l-0 rtl:border-r-2 shadow-sm'
                : 'text-white font-semibold border-l-2 rtl:border-l-0 rtl:border-r-2 shadow-sm' 
              : isLight
                ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-100/70 border-l-2 rtl:border-l-0 rtl:border-r-2 border-transparent font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border-l-2 rtl:border-l-0 rtl:border-r-2 border-transparent'
          }`}
          style={currentTab === 'Settings' ? {
            background: `linear-gradient(to right, var(--accent-soft) 0%, transparent 100%)`,
            borderColor: 'var(--accent)',
          } : undefined}
        >
          <Settings 
            size={16} 
            style={currentTab === 'Settings' ? { color: 'var(--accent)' } : undefined}
            className={currentTab === 'Settings' ? '' : 'text-slate-400'} 
          />
          <span className="text-xs">{t('nav.settings')}</span>
        </button>
      </div>
    </div>
  );
}
