import { useEffect, useState } from 'react';
import { Folder, HardDrive, Layers, Zap, Check, Palette, Moon, Sun, Languages, Globe, ShieldCheck, FileText, Trash2, KeyRound } from 'lucide-react';
import GlassButton from './GlassButton';
import type { AppSettings } from '../types';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useLanguage, LanguageMode } from '../context/LanguageContext';

const defaultSettings: AppSettings = {
  downloadFolder: '',
  maxConcurrent: 3,
  maxConnections: 8,
  launchOnStartup: false,
  speedLimit: 0,
  autoIntercept: true
};

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [extensionId, setExtensionId] = useState('');
  const [integrationStatus, setIntegrationStatus] = useState('');
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const isLight = theme === 'light';

  useEffect(() => {
    if (window.electronAPI?.getSettings) {
      window.electronAPI.getSettings()
        .then((s) => {
          if (s) {
            setSettings((prev) => ({ ...prev, ...s }));
            if (s.extensionId) {
              setExtensionId(s.extensionId);
            }
            if (s.theme) {
              setTheme(s.theme);
            }
            if (s.language) {
              setLanguage(s.language);
            }
          }
        })
        .catch(console.error);
    }
  }, []);

  const handleChange = (key: keyof AppSettings, value: any) => {
    if (!settings) return;
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    
    setSaving(true);
    window.electronAPI.updateSettings({ [key]: value })
      .then(() => setTimeout(() => setSaving(false), 500))
      .catch(console.error);
  };

  const handleThemeChange = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    handleChange('theme', newTheme);
  };

  const handleLanguageChange = (newLang: LanguageMode) => {
    setLanguage(newLang);
    handleChange('language', newLang);
  };

  const handleSelectFolder = async () => {
    try {
      const folder = await window.electronAPI.selectFolder();
      if (folder) {
        handleChange('downloadFolder', folder);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSelectCookiesFile = async () => {
    try {
      if (window.electronAPI?.selectFile) {
        const file = await window.electronAPI.selectFile('Cookies File (*.txt)', ['txt']);
        if (file) {
          handleChange('cookiesPath', file);
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        input.onchange = (e: any) => {
          const f = e.target.files?.[0];
          if (f && f.name) {
            handleChange('cookiesPath', f.path || f.name);
          }
        };
        input.click();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearCookies = () => {
    handleChange('cookiesPath', '');
  };

  const handleInstallIntegration = async () => {
    if (!extensionId.trim()) return;
    setIntegrationStatus(t('settings.saving'));
    try {
      handleChange('extensionId', extensionId.trim());
      await window.electronAPI.installBrowserIntegration(extensionId.trim());
      setIntegrationStatus(t('settings.installedSuccess'));
      setTimeout(() => setIntegrationStatus(''), 3000);
    } catch (e) {
      console.error(e);
      setIntegrationStatus(t('settings.installFailed'));
    }
  };

  if (!settings) return null;

  return (
    <div className={`flex-1 flex flex-col min-h-0 rounded-2xl overflow-hidden relative transition-colors duration-200 ${
      isLight
        ? 'bg-white/80 border border-purple-900/10 shadow-[0_10px_30px_-5px_rgba(0,0,0,0.04)] backdrop-blur-md'
        : 'bg-[#0A0A16]/50 border border-purple-500/10 shadow-lg'
    }`}>
      <div className={`px-6 py-3.5 flex items-center justify-between shrink-0 transition-colors ${
        isLight
          ? 'border-b border-purple-900/10 bg-slate-50/60'
          : 'border-b border-purple-500/10 bg-black/30'
      }`}>
        <h2 className={`font-display font-medium text-sm ${
          isLight ? 'text-slate-800' : 'text-slate-200'
        }`}>
          {t('settings.title')}
        </h2>
        <div className={`flex gap-2 text-xs items-center ${
          isLight ? 'text-purple-700' : 'text-purple-300'
        }`}>
          {saving ? t('settings.saving') : <><Check size={12} className="text-emerald-500" /> {t('settings.saved')}</>}
        </div>
      </div>
      
      <div className="p-6 overflow-y-auto space-y-6 flex-1 stable-scroll-container">
        
        {/* Language & Localization Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Globe size={15} className={isLight ? "text-purple-600" : "text-fuchsia-400"} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.language')}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* English Card */}
            <div 
              onClick={() => handleLanguageChange('en')}
              className={`p-4 rounded-xl cursor-pointer transition-all relative overflow-hidden border ${
                language === 'en'
                  ? isLight
                    ? 'bg-white border-purple-600 shadow-[0_4px_20px_-2px_rgba(168,85,247,0.25)] ring-1 ring-purple-600/50'
                    : 'bg-[#111122] border-fuchsia-500 shadow-[0_0_20px_-5px_rgba(236,72,153,0.3)] ring-1 ring-fuchsia-500/50'
                  : isLight
                    ? 'bg-white/90 border-slate-200 hover:border-purple-300 hover:shadow-sm'
                    : 'bg-[#111122]/60 border-purple-500/10 hover:border-purple-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm ${
                    isLight 
                      ? 'bg-purple-50 border border-purple-200 text-purple-600' 
                      : 'bg-[#0A0A16] border border-purple-500/20 text-pink-400 shadow-inner'
                  }`}>
                    EN
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold ${
                      language === 'en' 
                        ? isLight ? 'text-purple-950 font-bold' : 'text-white font-bold' 
                        : isLight ? 'text-slate-800' : 'text-slate-300'
                    }`}>
                      {t('settings.english')}
                    </h4>
                    <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('settings.englishDesc')}
                    </p>
                  </div>
                </div>
                {language === 'en' && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    isLight
                      ? 'bg-purple-100 text-purple-800 border border-purple-300 font-bold'
                      : 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                  }`}>
                    <Check size={10} /> {t('common.active')}
                  </span>
                )}
              </div>
            </div>

            {/* Persian Card */}
            <div 
              onClick={() => handleLanguageChange('fa')}
              className={`p-4 rounded-xl cursor-pointer transition-all relative overflow-hidden border ${
                language === 'fa'
                  ? isLight
                    ? 'bg-white border-purple-600 shadow-[0_4px_20px_-2px_rgba(168,85,247,0.25)] ring-1 ring-purple-600/50'
                    : 'bg-[#111122] border-fuchsia-500 shadow-[0_0_20px_-5px_rgba(236,72,153,0.3)] ring-1 ring-fuchsia-500/50'
                  : isLight
                    ? 'bg-white/90 border-slate-200 hover:border-purple-300 hover:shadow-sm'
                    : 'bg-[#111122]/60 border-purple-500/10 hover:border-purple-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm ${
                    isLight 
                      ? 'bg-purple-50 border border-purple-200 text-purple-600' 
                      : 'bg-[#0A0A16] border border-purple-500/20 text-pink-400 shadow-inner'
                  }`}>
                    فا
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold ${
                      language === 'fa' 
                        ? isLight ? 'text-purple-950 font-bold' : 'text-white font-bold' 
                        : isLight ? 'text-slate-800' : 'text-slate-300'
                    }`}>
                      {t('settings.persian')}
                    </h4>
                    <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('settings.persianDesc')}
                    </p>
                  </div>
                </div>
                {language === 'fa' && (
                  <span className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    isLight
                      ? 'bg-purple-100 text-purple-800 border border-purple-300 font-bold'
                      : 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30'
                  }`}>
                    <Check size={10} /> {t('common.active')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Appearance / Theme Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Palette size={15} className={isLight ? "text-purple-600" : "text-fuchsia-400"} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.appearance')}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Dark Theme Card */}
            <div 
              onClick={() => handleThemeChange('dark')}
              className={`p-4 rounded-xl cursor-pointer transition-all relative overflow-hidden border ${
                theme === 'dark'
                  ? 'bg-[#111122] border-fuchsia-500 shadow-[0_0_20px_-5px_rgba(236,72,153,0.3)] ring-1 ring-fuchsia-500/50'
                  : isLight
                    ? 'bg-white/90 border-slate-200 hover:border-purple-300 hover:shadow-sm'
                    : 'bg-[#111122]/60 border-purple-500/10 hover:border-purple-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#0A0A16] border border-purple-500/20 flex items-center justify-center text-pink-400 shadow-inner">
                    <Moon size={15} />
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold ${theme === 'dark' ? 'text-white' : isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                      {t('settings.darkTheme')}
                    </h4>
                    <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('settings.darkThemeDesc')}
                    </p>
                  </div>
                </div>
                {theme === 'dark' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30 text-[10px] font-semibold">
                    <Check size={10} /> {t('common.active')}
                  </span>
                )}
              </div>
              <div className="h-10 w-full rounded-lg bg-[#070712] border border-purple-500/20 flex items-center px-3 gap-2 overflow-hidden">
                <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-purple-500 to-pink-500"></div>
                <div className="h-1.5 w-16 bg-purple-500/30 rounded-full"></div>
                <div className="h-1.5 w-10 bg-pink-500/20 rounded-full"></div>
              </div>
            </div>

            {/* Light Theme Card */}
            <div 
              onClick={() => handleThemeChange('light')}
              className={`p-4 rounded-xl cursor-pointer transition-all relative overflow-hidden border ${
                theme === 'light'
                  ? 'bg-white border-purple-600 shadow-[0_4px_20px_-2px_rgba(168,85,247,0.25)] ring-1 ring-purple-600/50'
                  : isLight
                    ? 'bg-white/90 border-slate-200 hover:border-purple-300 hover:shadow-sm'
                    : 'bg-[#111122]/60 border-purple-500/10 hover:border-purple-500/30'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-sm">
                    <Sun size={15} />
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold ${theme === 'light' ? 'text-purple-950 font-bold' : isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                      {t('settings.lightTheme')}
                    </h4>
                    <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('settings.lightThemeDesc')}
                    </p>
                  </div>
                </div>
                {theme === 'light' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-300 text-[10px] font-bold">
                    <Check size={10} /> {t('common.active')}
                  </span>
                )}
              </div>
              <div className="h-10 w-full rounded-lg bg-gradient-to-r from-slate-50 to-purple-50/50 border border-purple-200/80 flex items-center px-3 gap-2 overflow-hidden shadow-inner">
                <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-r from-purple-600 to-pink-600"></div>
                <div className="h-1.5 w-16 bg-purple-600/40 rounded-full"></div>
                <div className="h-1.5 w-10 bg-fuchsia-500/30 rounded-full"></div>
              </div>
            </div>
          </div>
        </section>

        {/* Storage Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={15} className={isLight ? "text-fuchsia-600" : "text-fuchsia-400"} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.storage')}
            </h3>
          </div>
          <div className={`rounded-xl p-4 transition-colors ${
            isLight
              ? 'bg-white/90 border border-purple-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
              : 'bg-[#111122]/60 border border-purple-500/10'
          }`}>
            <div className="mb-2">
              <label className={`text-xs font-medium block mb-0.5 ${
                isLight ? 'text-slate-800' : 'text-slate-300'
              }`}>
                {t('settings.defaultFolder')}
              </label>
              <p className={`text-[11px] mb-2.5 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('settings.defaultFolderDesc')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex-1 rounded-lg px-3.5 py-2 text-xs font-mono truncate ${
                isLight
                  ? 'bg-slate-50 border border-purple-200/70 text-slate-800'
                  : 'bg-black/40 border border-purple-500/10 text-slate-300'
              }`}>
                {settings.downloadFolder || 'C:\\Users\\User\\Downloads'}
              </div>
              <GlassButton onClick={handleSelectFolder} className="whitespace-nowrap flex items-center gap-1.5 text-xs py-2 px-3.5">
                <Folder size={13} className={`rtl:mr-0 rtl:ml-1 ${isLight ? "text-pink-600" : "text-pink-400"}`} /> {t('common.browse')}
              </GlassButton>
            </div>
          </div>
        </section>

        {/* Engine Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={15} className={isLight ? "text-pink-600" : "text-pink-400"} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.engine')}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`rounded-xl p-4 transition-colors ${
              isLight
                ? 'bg-white/90 border border-purple-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                : 'bg-[#111122]/60 border border-purple-500/10'
            }`}>
              <label className={`text-xs font-medium block mb-0.5 ${
                isLight ? 'text-slate-800' : 'text-slate-300'
              }`}>
                {t('settings.maxConcurrent')}
              </label>
              <p className={`text-[11px] mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('settings.maxConcurrentDesc')}
              </p>
              <div className="flex items-center gap-4">
                <input 
                  type="range" 
                  min="1" 
                  max="10" 
                  value={settings.maxConcurrent}
                  onChange={(e) => handleChange('maxConcurrent', parseInt(e.target.value))}
                  className={`flex-1 ${isLight ? 'accent-purple-600' : 'accent-fuchsia-500'}`}
                />
                <span className={`text-base font-display font-semibold w-6 text-center ${
                  isLight ? 'text-purple-800' : 'text-purple-300'
                }`}>
                  {settings.maxConcurrent}
                </span>
              </div>
            </div>
            
            <div className={`rounded-xl p-4 transition-colors ${
              isLight
                ? 'bg-white/90 border border-purple-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                : 'bg-[#111122]/60 border border-purple-500/10'
            }`}>
              <label className={`text-xs font-medium block mb-0.5 ${
                isLight ? 'text-slate-800' : 'text-slate-300'
              }`}>
                {t('settings.maxConnections')}
              </label>
              <p className={`text-[11px] mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('settings.maxConnectionsDesc')}
              </p>
              <div className="flex items-center gap-4">
                <select 
                  value={settings.maxConnections}
                  onChange={(e) => handleChange('maxConnections', parseInt(e.target.value))}
                  className={`w-full rounded-lg py-1.5 px-3 text-xs focus:outline-none focus:ring-1 ${
                    isLight
                      ? 'bg-white border border-purple-200/90 text-slate-800 focus:border-purple-600 focus:ring-purple-500/20'
                      : 'bg-[#080814] border border-purple-500/20 text-slate-200 focus:border-fuchsia-500/50 focus:ring-fuchsia-500/50'
                  }`}
                >
                  <option value={1}>1 {t('common.connection')}</option>
                  <option value={4}>4 {t('common.connections')}</option>
                  <option value={8}>8 {t('common.connections')}</option>
                  <option value={16}>16 {t('common.connections')}</option>
                  <option value={32}>32 {t('common.connections')}</option>
                </select>
              </div>
            </div>

            <div className={`rounded-xl p-4 md:col-span-2 transition-colors ${
              isLight
                ? 'bg-white/90 border border-purple-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                : 'bg-[#111122]/60 border border-purple-500/10'
            }`}>
              <label className={`text-xs font-medium block mb-0.5 ${
                isLight ? 'text-slate-800' : 'text-slate-300'
              }`}>
                {t('settings.speedLimit')}
              </label>
              <p className={`text-[11px] mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('settings.speedLimitDesc')}
              </p>
              <div className="flex items-center gap-4">
                <select 
                  value={settings.speedLimit || 0}
                  onChange={(e) => handleChange('speedLimit', parseInt(e.target.value))}
                  className={`w-full rounded-lg py-1.5 px-3 text-xs focus:outline-none focus:ring-1 ${
                    isLight
                      ? 'bg-white border border-purple-200/90 text-slate-800 focus:border-purple-600 focus:ring-purple-500/20'
                      : 'bg-[#080814] border border-purple-500/20 text-slate-200 focus:border-fuchsia-500/50 focus:ring-fuchsia-500/50'
                  }`}
                >
                  <option value={0}>{t('common.unlimited')}</option>
                  <option value={100 * 1024}>100 KB/s</option>
                  <option value={250 * 1024}>250 KB/s</option>
                  <option value={500 * 1024}>500 KB/s</option>
                  <option value={1024 * 1024}>1 MB/s</option>
                  <option value={2 * 1024 * 1024}>2 MB/s</option>
                  <option value={5 * 1024 * 1024}>5 MB/s</option>
                  <option value={10 * 1024 * 1024}>10 MB/s</option>
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* System Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={15} className={isLight ? "text-purple-600" : "text-purple-400"} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.system')}
            </h3>
          </div>
          <div 
            className={`rounded-xl p-4 flex items-center justify-between cursor-pointer transition-colors ${
              isLight
                ? 'bg-white/90 border border-purple-100/90 hover:border-purple-300/80 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                : 'bg-[#111122]/60 border border-purple-500/10 hover:border-purple-500/25'
            }`}
            onClick={() => handleChange('launchOnStartup', !settings.launchOnStartup)}
          >
            <div>
              <label className={`text-xs font-medium block mb-0.5 pointer-events-none ${
                isLight ? 'text-slate-800' : 'text-slate-300'
              }`}>
                {t('settings.launchOnStartup')}
              </label>
              <p className={`text-[11px] pointer-events-none ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('settings.launchOnStartupDesc')}
              </p>
            </div>
            <div className={`w-11 h-6 rounded-full transition-colors relative ${
              settings.launchOnStartup 
                ? 'bg-gradient-to-r from-purple-600 to-pink-600' 
                : isLight ? 'bg-slate-200 border border-slate-300' : 'bg-black/60 border border-white/10'
            }`}>
              <div className={`absolute top-1 bottom-1 w-4 rounded-full bg-white transition-all shadow-sm ${
                settings.launchOnStartup ? (isRTL ? 'right-6 left-auto' : 'left-6 right-auto') : (isRTL ? 'right-1 left-auto' : 'left-1 right-auto')
              }`}></div>
            </div>
          </div>
        </section>

        {/* Authentication & Cookies Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={15} className={isLight ? "text-purple-600" : "text-fuchsia-400"} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.authCookies')}
            </h3>
          </div>
          <div className={`rounded-xl p-4 transition-colors ${
            isLight
              ? 'bg-white/90 border border-purple-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
              : 'bg-[#111122]/60 border border-purple-500/10'
          }`}>
            <div className="mb-2">
              <label className={`text-xs font-medium block mb-0.5 ${
                isLight ? 'text-slate-800' : 'text-slate-300'
              }`}>
                {t('settings.cookiesTitle')}
              </label>
              <p className={`text-[11px] mb-2.5 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                {t('settings.cookiesDesc')}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`flex-1 rounded-lg px-3.5 py-2 text-xs font-mono truncate flex items-center gap-2 ${
                settings.cookiesPath
                  ? isLight
                    ? 'bg-purple-50/70 border border-purple-200/90 text-purple-900 font-semibold'
                    : 'bg-purple-950/30 border border-purple-500/30 text-purple-200'
                  : isLight
                    ? 'bg-slate-50 border border-purple-200/70 text-slate-400 italic'
                    : 'bg-black/40 border border-purple-500/10 text-slate-500 italic'
              }`}>
                <FileText size={14} className={settings.cookiesPath ? (isLight ? "text-purple-600" : "text-fuchsia-400") : "text-slate-400 opacity-60"} />
                <span className="truncate">{settings.cookiesPath || t('settings.cookiesPlaceholder')}</span>
              </div>

              {settings.cookiesPath && (
                <GlassButton
                  variant="secondary"
                  onClick={handleClearCookies}
                  className="whitespace-nowrap flex items-center gap-1 text-xs py-2 px-3 hover:text-rose-500 shrink-0"
                  title="Remove Cookies File"
                >
                  <Trash2 size={13} className="text-rose-500" /> {t('settings.clearCookies')}
                </GlassButton>
              )}

              <GlassButton onClick={handleSelectCookiesFile} className="whitespace-nowrap flex items-center gap-1.5 text-xs py-2 px-3.5 shrink-0">
                <Folder size={13} className={`rtl:mr-0 rtl:ml-1 ${isLight ? "text-pink-600" : "text-pink-400"}`} /> {t('common.browse')}
              </GlassButton>
            </div>
          </div>
        </section>

        {/* Browser Integration */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={15} className={isLight ? "text-pink-600" : "text-pink-400"} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.browserIntegration')}
            </h3>
          </div>
          <div className="space-y-3">
            <div 
              className={`rounded-xl p-4 flex items-center justify-between cursor-pointer transition-colors ${
                isLight
                  ? 'bg-white/90 border border-purple-100/90 hover:border-purple-300/80 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                  : 'bg-[#111122]/60 border border-purple-500/10 hover:border-purple-500/25'
              }`}
              onClick={() => handleChange('autoIntercept', settings.autoIntercept !== false ? false : true)}
            >
              <div>
                <label className={`text-xs font-medium block mb-0.5 pointer-events-none ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  {t('settings.autoIntercept')}
                </label>
                <p className={`text-[11px] pointer-events-none ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('settings.autoInterceptDesc')}
                </p>
              </div>
              <div className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.autoIntercept !== false 
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600' 
                  : isLight ? 'bg-slate-200 border border-slate-300' : 'bg-black/60 border border-white/10'
              }`}>
                <div className={`absolute top-1 bottom-1 w-4 rounded-full bg-white transition-all shadow-sm ${
                  settings.autoIntercept !== false ? (isRTL ? 'right-6 left-auto' : 'left-6 right-auto') : (isRTL ? 'right-1 left-auto' : 'left-1 right-auto')
                }`}></div>
              </div>
            </div>

            <div className={`rounded-xl p-4 transition-colors ${
              isLight
                ? 'bg-white/90 border border-purple-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                : 'bg-[#111122]/60 border border-purple-500/10'
            }`}>
              <div className="mb-3">
                <label className={`text-xs font-medium block mb-0.5 ${
                  isLight ? 'text-slate-800' : 'text-slate-300'
                }`}>
                  {t('settings.extensionId')}
                </label>
                <p className={`text-[11px] mb-2 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('settings.extensionIdDesc')}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <input 
                  type="text" 
                  value={extensionId}
                  onChange={(e) => setExtensionId(e.target.value)}
                  placeholder={t('settings.extensionIdPlaceholder')}
                  className={`flex-1 rounded-lg py-1.5 px-3 text-xs font-mono focus:outline-none focus:ring-1 ${
                    isLight
                      ? 'bg-white border border-purple-200/90 text-slate-800 focus:border-purple-600 focus:ring-purple-500/20'
                      : 'bg-[#080814] border border-purple-500/20 text-slate-200 focus:border-fuchsia-500/50 focus:ring-fuchsia-500/50'
                  }`}
                />
                <GlassButton onClick={handleInstallIntegration} className="whitespace-nowrap flex items-center gap-1.5 text-xs py-1.5 px-3.5">
                  {t('settings.installBtn')}
                </GlassButton>
              </div>
              {integrationStatus && (
                <p className={`text-xs mt-2.5 ${isLight ? 'text-purple-700 font-medium' : 'text-pink-400'}`}>
                  {integrationStatus}
                </p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
