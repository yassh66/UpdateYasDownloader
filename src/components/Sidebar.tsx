import { Download, List, Activity, Settings, FolderClock } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export default function Sidebar({ currentTab, setCurrentTab }: SidebarProps) {
  const { theme } = useTheme();
  const { t } = useLanguage();
  const isLight = theme === 'light';

  const navItems = [
    { icon: Activity, key: 'Dashboard', label: t('nav.dashboard') },
    { icon: List, key: 'Download Queue', label: t('nav.queue') },
    { icon: FolderClock, key: 'History', label: t('nav.history') },
  ];

  return (
    <div className={`w-56 shrink-0 border-r rtl:border-r-0 rtl:border-l flex flex-col h-full relative z-20 transition-colors duration-200 ${
      isLight 
        ? 'border-purple-900/10 bg-white/80 backdrop-blur-xl shadow-[4px_0_24px_rgba(112,26,117,0.03)]' 
        : 'border-purple-500/10 bg-[#080814]/80 backdrop-blur-xl'
    }`}>
      {/* Brand Area */}
      <div className={`h-20 shrink-0 flex items-center px-6 border-b relative overflow-hidden ${
        isLight ? 'border-purple-900/10 bg-gradient-to-b from-purple-50/40 to-transparent' : 'border-purple-500/10'
      }`}>
        <div className={`absolute top-0 left-0 w-full h-full pointer-events-none ${
          isLight 
            ? 'bg-gradient-to-br from-purple-500/5 via-pink-500/5 to-transparent' 
            : 'bg-gradient-to-br from-purple-500/10 via-pink-500/5 to-transparent'
        }`}></div>
        
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-purple-600 via-fuchsia-500 to-pink-500 p-[1px] shadow-[0_0_15px_-3px_rgba(236,72,153,0.4)]">
            <div className={`w-full h-full rounded-xl flex items-center justify-center ${
              isLight ? 'bg-white shadow-inner' : 'bg-[#090915]'
            }`}>
              <Download className="text-fuchsia-500 w-4 h-4" strokeWidth={2.5} />
            </div>
          </div>
          <div>
            <h1 className={`font-display font-bold text-base tracking-wide leading-none ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              YAS
            </h1>
            <p className={`text-[9px] uppercase tracking-[0.25em] font-semibold mt-1 ${
              isLight ? 'text-purple-600' : 'text-pink-400'
            }`}>
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
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 ${
                isActive 
                  ? isLight
                    ? 'bg-gradient-to-r from-purple-500/15 via-fuchsia-500/10 to-transparent text-purple-950 font-bold border-l-2 rtl:border-l-0 rtl:border-r-2 border-purple-600 shadow-sm'
                    : 'bg-gradient-to-r from-purple-600/20 via-pink-600/10 to-transparent text-white font-semibold border-l-2 rtl:border-l-0 rtl:border-r-2 border-fuchsia-500 shadow-sm' 
                  : isLight
                    ? 'text-slate-600 hover:text-slate-950 hover:bg-purple-50/70 border-l-2 rtl:border-l-0 rtl:border-r-2 border-transparent font-medium'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border-l-2 rtl:border-l-0 rtl:border-r-2 border-transparent'
              }`}
            >
              <item.icon size={16} className={
                isActive 
                  ? isLight ? 'text-purple-600' : 'text-pink-400' 
                  : isLight ? 'text-slate-400' : 'text-slate-400'
              } />
              <span className="text-xs">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Settings */}
      <div className={`p-3 border-t shrink-0 ${isLight ? 'border-purple-900/10' : 'border-purple-500/10'}`}>
        <button 
          onClick={() => setCurrentTab('Settings')}
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 w-full ${
            currentTab === 'Settings' 
              ? isLight
                ? 'bg-gradient-to-r from-purple-500/15 via-fuchsia-500/10 to-transparent text-purple-950 font-bold border-l-2 rtl:border-l-0 rtl:border-r-2 border-purple-600'
                : 'bg-gradient-to-r from-purple-600/20 via-pink-600/10 to-transparent text-white font-semibold border-l-2 rtl:border-l-0 rtl:border-r-2 border-fuchsia-500' 
              : isLight
                ? 'text-slate-600 hover:text-slate-950 hover:bg-purple-50/70 border-l-2 rtl:border-l-0 rtl:border-r-2 border-transparent font-medium'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.03] border-l-2 rtl:border-l-0 rtl:border-r-2 border-transparent'
          }`}
        >
          <Settings size={16} className={
            currentTab === 'Settings' 
              ? isLight ? 'text-purple-600' : 'text-pink-400' 
              : isLight ? 'text-slate-400' : 'text-slate-400'
          } />
          <span className="text-xs">{t('nav.settings')}</span>
        </button>
      </div>
    </div>
  );
}
