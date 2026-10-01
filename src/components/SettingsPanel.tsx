import { useEffect, useState } from 'react';
import { Folder, HardDrive, Layers, Zap, Check, Palette, Moon, Sun, Languages, Globe, ShieldCheck, FileText, Trash2, KeyRound, Sparkles, RefreshCw, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import GlassButton from './GlassButton';
import type { AppSettings } from '../types';
import { useTheme, ThemeMode } from '../context/ThemeContext';
import { useLanguage, LanguageMode } from '../context/LanguageContext';
import { useAccent, ACCENT_PRESETS, DEFAULT_ACCENT } from '../context/AccentContext';

const defaultSettings: AppSettings = {
  downloadFolder: '',
  maxConcurrent: 3,
  maxConnections: 8,
  launchOnStartup: false,
  speedLimit: 0,
  autoIntercept: true,
  enableCookiesAuth: false,
  cookiesPath: ''
};

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [saving, setSaving] = useState(false);
  const [extensionId, setExtensionId] = useState('');
  const [integrationStatus, setIntegrationStatus] = useState('');
  const [validatingCookies, setValidatingCookies] = useState(false);
  const [cookieValidationResult, setCookieValidationResult] = useState<{
    valid: boolean;
    message: string;
    cookieCount?: number;
    hasYouTubeCookies?: boolean;
    fileSizeBytes?: number;
  } | null>(null);
  const { theme, setTheme } = useTheme();
  const { language, setLanguage, t, isRTL } = useLanguage();
  const { accentColor, setAccentColor, resetAccentColor, isCustomColor, activePresetId } = useAccent();
  const isLight = theme === 'light';
  const [customHexInput, setCustomHexInput] = useState(accentColor);

  useEffect(() => {
    setCustomHexInput(accentColor);
  }, [accentColor]);

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
    if (window.electronAPI?.updateSettings) {
      window.electronAPI.updateSettings({ [key]: value })
        .then(() => setTimeout(() => setSaving(false), 500))
        .catch((err) => {
          console.error('[SettingsPanel] Electron IPC updateSettings failed:', err);
          setSaving(false);
        });
    } else {
      // Browser preview / standalone fallback: persist to localStorage
      try {
        localStorage.setItem(`yas_setting_${String(key)}`, JSON.stringify(value));
      } catch (e) {
        console.warn('[SettingsPanel] localStorage write fallback error:', e);
      }
      setTimeout(() => setSaving(false), 300);
    }
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
      if (window.electronAPI?.selectFolder) {
        const folder = await window.electronAPI.selectFolder();
        if (folder) {
          handleChange('downloadFolder', folder);
        }
      }
    } catch (e) {
      console.error('[SettingsPanel] selectFolder error:', e);
    }
  };

  const handleSelectCookiesFile = async () => {
    try {
      if (window.electronAPI?.selectFile) {
        const file = await window.electronAPI.selectFile('Cookies File (*.txt)', ['txt']);
        if (file) {
          handleChange('cookiesPath', file);
          handleChange('enableCookiesAuth', true);
          setCookieValidationResult(null);
        }
      } else {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.txt';
        input.onchange = (e: any) => {
          const f = e.target.files?.[0];
          if (f && f.name) {
            const chosen = f.path || f.name;
            handleChange('cookiesPath', chosen);
            handleChange('enableCookiesAuth', true);
            setCookieValidationResult(null);
          }
        };
        input.click();
      }
    } catch (e) {
      console.error('[SettingsPanel] selectFile error:', e);
    }
  };

  const handleClearCookies = () => {
    handleChange('cookiesPath', '');
    handleChange('enableCookiesAuth', false);
    setCookieValidationResult(null);
  };

  const handleValidateCookies = async () => {
    if (!settings.cookiesPath || !settings.cookiesPath.trim()) {
      setCookieValidationResult({
        valid: false,
        message: t('settings.cookiesNoPath') || 'Please select a cookies.txt file first.',
      });
      return;
    }

    setValidatingCookies(true);
    setCookieValidationResult(null);

    try {
      let result: any;
      if (window.electronAPI?.validateCookies) {
        result = await window.electronAPI.validateCookies(settings.cookiesPath.trim());
      } else if (window.mediaEngine?.validateCookies) {
        result = await window.mediaEngine.validateCookies(settings.cookiesPath.trim());
      } else {
        // Fallback for browser preview environment
        result = {
          valid: true,
          message: 'Valid Netscape cookies file (Simulated preview). YouTube authentication verified.',
          cookieCount: 42,
          hasYouTubeCookies: true,
          fileSizeBytes: 8192,
        };
      }
      setCookieValidationResult(result);
    } catch (err: any) {
      setCookieValidationResult({
        valid: false,
        message: err.message || 'Failed to validate cookies file.',
      });
    } finally {
      setValidatingCookies(false);
    }
  };

  const handleInstallIntegration = async () => {
    if (!extensionId.trim()) return;
    setIntegrationStatus(t('settings.saving'));
    try {
      handleChange('extensionId', extensionId.trim());
      if (window.electronAPI?.installBrowserIntegration) {
        await window.electronAPI.installBrowserIntegration(extensionId.trim());
      }
      setIntegrationStatus(t('settings.installedSuccess'));
      setTimeout(() => setIntegrationStatus(''), 3000);
    } catch (e) {
      console.error('[SettingsPanel] installBrowserIntegration error:', e);
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
            <Globe size={15} style={{ color: 'var(--accent)' }} />
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
                    ? 'bg-white shadow-md ring-1'
                    : 'bg-[#111122] shadow-md ring-1'
                  : isLight
                    ? 'bg-white/90 border-slate-200 hover:shadow-sm'
                    : 'bg-[#111122]/60 border-white/5 hover:border-white/10'
              }`}
              style={language === 'en' ? {
                borderColor: 'var(--accent)',
                boxShadow: 'var(--accent-glow-sm)',
                outlineColor: 'var(--accent)',
              } : undefined}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm border"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      borderColor: 'var(--accent-border)',
                      color: 'var(--accent-text)',
                    }}
                  >
                    EN
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold ${
                      language === 'en' 
                        ? isLight ? 'text-slate-900 font-bold' : 'text-white font-bold' 
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
                  <span 
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      borderColor: 'var(--accent-border-strong)',
                    }}
                  >
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
                    ? 'bg-white shadow-md ring-1'
                    : 'bg-[#111122] shadow-md ring-1'
                  : isLight
                    ? 'bg-white/90 border-slate-200 hover:shadow-sm'
                    : 'bg-[#111122]/60 border-white/5 hover:border-white/10'
              }`}
              style={language === 'fa' ? {
                borderColor: 'var(--accent)',
                boxShadow: 'var(--accent-glow-sm)',
                outlineColor: 'var(--accent)',
              } : undefined}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shadow-sm border"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      borderColor: 'var(--accent-border)',
                      color: 'var(--accent-text)',
                    }}
                  >
                    فا
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold ${
                      language === 'fa' 
                        ? isLight ? 'text-slate-900 font-bold' : 'text-white font-bold' 
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
                  <span 
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      borderColor: 'var(--accent-border-strong)',
                    }}
                  >
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
            <Palette size={15} style={{ color: 'var(--accent)' }} />
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
                  ? 'bg-[#111122] shadow-lg ring-1'
                  : isLight
                    ? 'bg-white/90 border-slate-200 hover:shadow-sm'
                    : 'bg-[#111122]/60 border-white/5 hover:border-white/15'
              }`}
              style={theme === 'dark' ? {
                borderColor: 'var(--accent)',
                boxShadow: 'var(--accent-glow-sm)',
                outlineColor: 'var(--accent)',
              } : undefined}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-8 h-8 rounded-lg bg-[#0A0A16] border flex items-center justify-center shadow-inner"
                    style={{ borderColor: 'var(--accent-border)' }}
                  >
                    <Moon size={15} style={{ color: 'var(--accent)' }} />
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
                  <span 
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      borderColor: 'var(--accent-border-strong)',
                    }}
                  >
                    <Check size={10} /> {t('common.active')}
                  </span>
                )}
              </div>
              <div className="h-10 w-full rounded-lg bg-[#070712] border border-white/5 flex items-center px-3 gap-2 overflow-hidden">
                <div 
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, var(--accent-gradient-start), var(--accent-gradient-end))`
                  }}
                ></div>
                <div 
                  className="h-1.5 w-16 rounded-full opacity-60"
                  style={{ backgroundColor: 'var(--accent)' }}
                ></div>
                <div 
                  className="h-1.5 w-10 rounded-full opacity-30"
                  style={{ backgroundColor: 'var(--accent-gradient-end)' }}
                ></div>
              </div>
            </div>

            {/* Light Theme Card */}
            <div 
              onClick={() => handleThemeChange('light')}
              className={`p-4 rounded-xl cursor-pointer transition-all relative overflow-hidden border ${
                theme === 'light'
                  ? 'bg-white shadow-md ring-1'
                  : isLight
                    ? 'bg-white/90 border-slate-200 hover:shadow-sm'
                    : 'bg-[#111122]/60 border-white/5 hover:border-white/15'
              }`}
              style={theme === 'light' ? {
                borderColor: 'var(--accent)',
                boxShadow: 'var(--accent-glow-sm)',
                outlineColor: 'var(--accent)',
              } : undefined}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <div 
                    className="w-8 h-8 rounded-lg bg-slate-50 border flex items-center justify-center shadow-sm"
                    style={{ borderColor: 'var(--accent-border)' }}
                  >
                    <Sun size={15} style={{ color: 'var(--accent)' }} />
                  </div>
                  <div>
                    <h4 className={`text-xs font-semibold ${theme === 'light' ? 'text-slate-900 font-bold' : isLight ? 'text-slate-800' : 'text-slate-300'}`}>
                      {t('settings.lightTheme')}
                    </h4>
                    <p className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {t('settings.lightThemeDesc')}
                    </p>
                  </div>
                </div>
                {theme === 'light' && (
                  <span 
                    className="flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold"
                    style={{
                      backgroundColor: 'var(--accent-soft)',
                      color: 'var(--accent-text)',
                      borderColor: 'var(--accent-border-strong)',
                    }}
                  >
                    <Check size={10} /> {t('common.active')}
                  </span>
                )}
              </div>
              <div className="h-10 w-full rounded-lg bg-slate-50 border border-slate-200 flex items-center px-3 gap-2 overflow-hidden shadow-inner">
                <div 
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: `linear-gradient(135deg, var(--accent-gradient-start), var(--accent-gradient-end))`
                  }}
                ></div>
                <div 
                  className="h-1.5 w-16 rounded-full opacity-70"
                  style={{ backgroundColor: 'var(--accent)' }}
                ></div>
                <div 
                  className="h-1.5 w-10 rounded-full opacity-40"
                  style={{ backgroundColor: 'var(--accent-gradient-end)' }}
                ></div>
              </div>
            </div>
          </div>
        </section>

        {/* Dynamic Brand Accent Color System */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles size={15} style={{ color: 'var(--accent)' }} />
              <div>
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${
                  isLight ? 'text-slate-700' : 'text-slate-300'
                }`}>
                  {t('settings.accentColor')}
                </h3>
              </div>
            </div>
            {accentColor.toUpperCase() !== DEFAULT_ACCENT.toUpperCase() && (
              <button
                onClick={() => {
                  resetAccentColor();
                  handleChange('accentColor', DEFAULT_ACCENT);
                }}
                className="text-[11px] flex items-center gap-1 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                style={{
                  color: 'var(--accent-text)',
                  backgroundColor: 'var(--accent-soft)',
                  border: '1px solid var(--accent-border)',
                }}
              >
                <RefreshCw size={11} />
                {t('settings.resetAccent')}
              </button>
            )}
          </div>
          
          <p className={`text-[11px] mb-4 leading-relaxed ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
            {t('settings.accentColorDesc')}
          </p>

          {/* Curated Preset Swatches */}
          <div className="mb-4">
            <div className={`text-[10px] font-semibold uppercase tracking-wider mb-2.5 ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {t('settings.presetColors')}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              {ACCENT_PRESETS.map((preset) => {
                const isSelected = activePresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => {
                      setAccentColor(preset.hex);
                      handleChange('accentColor', preset.hex);
                    }}
                    className={`p-2.5 rounded-xl border text-left rtl:text-right transition-all flex flex-col justify-between relative overflow-hidden group cursor-pointer ${
                      isSelected
                        ? isLight
                          ? 'bg-white shadow-md ring-2'
                          : 'bg-[#151528] shadow-md ring-2'
                        : isLight
                          ? 'bg-white/80 hover:bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
                          : 'bg-white/[0.02] hover:bg-white/[0.05] border-white/5 hover:border-white/10'
                    }`}
                    style={isSelected ? {
                      borderColor: preset.hex,
                      outlineColor: preset.hex,
                      boxShadow: `0 0 15px ${preset.hex}44`,
                    } : undefined}
                  >
                    <div className="flex items-center justify-between w-full mb-2">
                      <div 
                        className="w-5 h-5 rounded-full flex items-center justify-center shadow-sm shrink-0 transition-transform group-hover:scale-110"
                        style={{
                          backgroundColor: preset.hex,
                          boxShadow: `0 2px 8px ${preset.hex}66`,
                        }}
                      >
                        {isSelected && <Check size={11} className="text-white drop-shadow" strokeWidth={3} />}
                      </div>
                      <span className="font-mono text-[9px] text-slate-400 uppercase">
                        {preset.hex}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <div className={`text-xs font-semibold truncate ${
                        isSelected 
                          ? isLight ? 'text-slate-900 font-bold' : 'text-white font-bold'
                          : isLight ? 'text-slate-700' : 'text-slate-300'
                      }`}>
                        {isRTL ? preset.nameFa : preset.name}
                      </div>
                      <div className={`text-[9px] truncate ${
                        isLight ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {isRTL ? preset.descriptionFa : preset.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Hex Color Picker & Live Preview Card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            {/* Custom Color Picker Card */}
            <div className={`p-4 rounded-xl border flex flex-col justify-between ${
              isLight ? 'bg-white/90 border-slate-200 shadow-sm' : 'bg-[#101020]/70 border-white/5'
            }`}>
              <div>
                <h4 className={`text-xs font-semibold mb-1 ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {t('settings.customColor')}
                </h4>
                <p className={`text-[10px] mb-3 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  {t('settings.customColorDesc')}
                </p>
              </div>

              <div className="flex items-center gap-3">
                {/* HTML Color Picker Well */}
                <div className="relative shrink-0">
                  <input
                    type="color"
                    value={accentColor}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setAccentColor(val);
                      handleChange('accentColor', val);
                    }}
                    className="w-10 h-10 rounded-xl cursor-pointer border-0 p-0 bg-transparent overflow-hidden"
                    title="Choose Custom Accent Color"
                  />
                  <div 
                    className="absolute inset-0 rounded-xl pointer-events-none border shadow-inner"
                    style={{
                      backgroundColor: accentColor,
                      borderColor: 'rgba(255,255,255,0.2)',
                      boxShadow: 'var(--accent-glow-sm)',
                    }}
                  ></div>
                </div>

                {/* Hex Text Input */}
                <div className="flex-1 relative">
                  <input
                    type="text"
                    value={customHexInput}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomHexInput(val);
                      if (/^#[0-9A-Fa-f]{6}$/.test(val) || /^[0-9A-Fa-f]{6}$/.test(val)) {
                        setAccentColor(val);
                        handleChange('accentColor', val.startsWith('#') ? val.toUpperCase() : '#' + val.toUpperCase());
                      }
                    }}
                    placeholder={t('settings.customColorPlaceholder')}
                    maxLength={7}
                    className={`w-full py-2 px-3 rounded-xl font-mono text-xs uppercase tracking-wider focus:outline-none ${
                      isLight 
                        ? 'bg-slate-50 text-slate-800 border-slate-300 focus:bg-white' 
                        : 'bg-[#080814] text-slate-200 border-white/10 focus:bg-[#0c0c1e]'
                    }`}
                    style={{
                      border: '1px solid var(--accent-border)'
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent-border)';
                    }}
                  />
                </div>

                {/* Applied Indicator */}
                <div 
                  className="px-2.5 py-1.5 rounded-xl text-[10px] font-mono font-semibold shrink-0"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    color: 'var(--accent-text)',
                    border: '1px solid var(--accent-border)',
                  }}
                >
                  {accentColor}
                </div>
              </div>
            </div>

            {/* Live Interactive Preview Card */}
            <div 
              className={`p-4 rounded-xl border relative overflow-hidden transition-all ${
                isLight ? 'bg-white/90 shadow-sm' : 'bg-[#101020]/70'
              }`}
              style={{
                borderColor: 'var(--accent-border)',
                backgroundColor: 'var(--accent-surface)',
              }}
            >
              <div 
                className="absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl pointer-events-none opacity-20"
                style={{ backgroundColor: 'var(--accent)' }}
              ></div>

              <div className="flex items-center justify-between mb-3 relative z-10">
                <span className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                  {t('settings.previewTitle')}
                </span>
                <span 
                  className="text-[9px] px-2 py-0.5 rounded-full font-semibold border"
                  style={{
                    backgroundColor: 'var(--accent-soft)',
                    color: 'var(--accent-text)',
                    borderColor: 'var(--accent-border-strong)',
                  }}
                >
                  {t('settings.previewBadge')}
                </span>
              </div>

              {/* Action Buttons in preview */}
              <div className="flex items-center gap-2 mb-3 relative z-10">
                <GlassButton variant="primary" className="text-xs py-1 px-3">
                  <Sparkles size={12} />
                  {t('settings.previewButton')}
                </GlassButton>
                <GlassButton variant="secondary" className="text-xs py-1 px-3">
                  Secondary
                </GlassButton>
              </div>

              {/* Progress bar in preview */}
              <div className="relative z-10">
                <div className="flex justify-between text-[10px] mb-1 font-mono text-slate-400">
                  <span>{t('settings.previewProgress')}</span>
                  <span style={{ color: 'var(--accent-text)' }}>78%</span>
                </div>
                <div className={`w-full h-2 rounded-full overflow-hidden border ${
                  isLight ? 'bg-slate-100 border-slate-200' : 'bg-black/40 border-white/5'
                }`}>
                  <div 
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: '78%',
                      background: `linear-gradient(to right, var(--accent-gradient-start), var(--accent-gradient-end))`,
                      boxShadow: 'var(--accent-glow-sm)',
                    }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Storage Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <HardDrive size={15} style={{ color: 'var(--accent)' }} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.storage')}
            </h3>
          </div>
          <div 
            className={`rounded-xl p-4 transition-colors border ${
              isLight
                ? 'bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                : 'bg-[#111122]/60'
            }`}
            style={{ borderColor: 'var(--accent-border)' }}
          >
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
              <div 
                className={`flex-1 rounded-lg px-3.5 py-2 text-xs font-mono truncate border ${
                  isLight
                    ? 'bg-slate-50 text-slate-800'
                    : 'bg-black/40 text-slate-300'
                }`}
                style={{ borderColor: 'var(--accent-border)' }}
              >
                {settings.downloadFolder || 'C:\\Users\\User\\Downloads'}
              </div>
              <GlassButton onClick={handleSelectFolder} className="whitespace-nowrap flex items-center gap-1.5 text-xs py-2 px-3.5">
                <Folder size={13} style={{ color: 'var(--accent)' }} /> {t('common.browse')}
              </GlassButton>
            </div>
          </div>
        </section>

        {/* Engine Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Zap size={15} style={{ color: 'var(--accent)' }} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.engine')}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div 
              className={`rounded-xl p-4 transition-colors border ${
                isLight
                  ? 'bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                  : 'bg-[#111122]/60'
              }`}
              style={{ borderColor: 'var(--accent-border)' }}
            >
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
                  className="flex-1 cursor-pointer"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <span 
                  className="text-base font-display font-semibold w-6 text-center"
                  style={{ color: 'var(--accent-text)' }}
                >
                  {settings.maxConcurrent}
                </span>
              </div>
            </div>
            
            <div 
              className={`rounded-xl p-4 transition-colors border ${
                isLight
                  ? 'bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                  : 'bg-[#111122]/60'
              }`}
              style={{ borderColor: 'var(--accent-border)' }}
            >
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
                  className={`w-full rounded-lg py-1.5 px-3 text-xs focus:outline-none ${
                    isLight
                      ? 'bg-white text-slate-800'
                      : 'bg-[#080814] text-slate-200'
                  }`}
                  style={{ border: '1px solid var(--accent-border)' }}
                >
                  <option value={1}>1 {t('common.connection')}</option>
                  <option value={4}>4 {t('common.connections')}</option>
                  <option value={8}>8 {t('common.connections')}</option>
                  <option value={16}>16 {t('common.connections')}</option>
                  <option value={32}>32 {t('common.connections')}</option>
                </select>
              </div>
            </div>

            <div 
              className={`rounded-xl p-4 md:col-span-2 transition-colors border ${
                isLight
                  ? 'bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                  : 'bg-[#111122]/60'
              }`}
              style={{ borderColor: 'var(--accent-border)' }}
            >
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
                  className={`w-full rounded-lg py-1.5 px-3 text-xs focus:outline-none ${
                    isLight
                      ? 'bg-white text-slate-800'
                      : 'bg-[#080814] text-slate-200'
                  }`}
                  style={{ border: '1px solid var(--accent-border)' }}
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
            <Layers size={15} style={{ color: 'var(--accent)' }} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.system')}
            </h3>
          </div>
          <div 
            className={`rounded-xl p-4 flex items-center justify-between cursor-pointer transition-colors border ${
              isLight
                ? 'bg-white/90 hover:bg-slate-50 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                : 'bg-[#111122]/60 hover:bg-[#151528]'
            }`}
            style={{ borderColor: 'var(--accent-border)' }}
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
            <div 
              className={`w-11 h-6 rounded-full transition-colors relative ${
                settings.launchOnStartup 
                  ? '' 
                  : isLight ? 'bg-slate-200 border border-slate-300' : 'bg-black/60 border border-white/10'
              }`}
              style={settings.launchOnStartup ? {
                background: `linear-gradient(to right, var(--accent-gradient-start), var(--accent-gradient-end))`
              } : undefined}
            >
              <div className={`absolute top-1 bottom-1 w-4 rounded-full bg-white transition-all shadow-sm ${
                settings.launchOnStartup ? (isRTL ? 'right-6 left-auto' : 'left-6 right-auto') : (isRTL ? 'right-1 left-auto' : 'left-1 right-auto')
              }`}></div>
            </div>
          </div>
        </section>

        {/* YouTube Authentication Settings */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={15} style={{ color: 'var(--accent)' }} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.youtubeAuth')}
            </h3>
          </div>
          <div 
            className={`rounded-xl p-4 transition-colors border space-y-4 ${
              isLight
                ? 'bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                : 'bg-[#111122]/60'
            }`}
            style={{ borderColor: 'var(--accent-border)' }}
          >
            {/* Option: [ ] Enable cookies.txt authentication */}
            <div 
              className={`p-3 rounded-lg flex items-center justify-between cursor-pointer transition-colors border ${
                isLight ? 'bg-slate-50/80 hover:bg-slate-100/70 border-slate-200/80' : 'bg-black/30 hover:bg-black/50 border-white/5'
              }`}
              onClick={() => handleChange('enableCookiesAuth', !settings.enableCookiesAuth)}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!settings.enableCookiesAuth}
                  onChange={(e) => handleChange('enableCookiesAuth', e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-4 h-4 rounded cursor-pointer"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div>
                  <span className={`text-xs font-semibold block ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    {t('settings.enableCookiesAuth')}
                  </span>
                  <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    {t('settings.enableCookiesAuthDesc')}
                  </p>
                </div>
              </div>
            </div>

            {/* Path: C:\... */}
            <div>
              <label className={`text-xs font-medium block mb-1.5 ${
                isLight ? 'text-slate-800' : 'text-slate-300'
              }`}>
                {t('settings.cookiesPathLabel')}
              </label>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                <div 
                  className={`flex-1 rounded-lg px-3.5 py-2 text-xs font-mono truncate flex items-center gap-2 border ${
                    settings.cookiesPath
                      ? isLight
                        ? 'bg-slate-50 font-semibold text-slate-800'
                        : 'bg-black/40 font-semibold text-slate-200'
                      : isLight
                        ? 'bg-slate-50 text-slate-400 italic'
                        : 'bg-black/40 text-slate-500 italic'
                  }`}
                  style={{ 
                    borderColor: 'var(--accent-border)',
                  }}
                >
                  <FileText size={14} style={{ color: settings.cookiesPath ? 'var(--accent)' : undefined }} className={settings.cookiesPath ? "" : "text-slate-400 opacity-60"} />
                  <span className="truncate">{settings.cookiesPath || t('settings.cookiesPlaceholder')}</span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <GlassButton onClick={handleSelectCookiesFile} className="whitespace-nowrap flex items-center gap-1.5 text-xs py-2 px-3.5">
                    <Folder size={13} style={{ color: 'var(--accent)' }} /> {t('common.browse')}
                  </GlassButton>

                  <GlassButton 
                    variant="secondary"
                    onClick={handleValidateCookies}
                    disabled={validatingCookies || !settings.cookiesPath}
                    className="whitespace-nowrap flex items-center gap-1.5 text-xs py-2 px-3.5"
                  >
                    {validatingCookies ? (
                      <Loader2 size={13} className="animate-spin" style={{ color: 'var(--accent)' }} />
                    ) : (
                      <CheckCircle2 size={13} style={{ color: 'var(--accent)' }} />
                    )}
                    {validatingCookies ? t('settings.validating') : t('settings.validateCookies')}
                  </GlassButton>

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
                </div>
              </div>
            </div>

            {/* Validation Feedback Banner */}
            {cookieValidationResult && (
              <div 
                className={`p-3 rounded-lg text-xs flex items-start gap-2.5 border transition-all ${
                  cookieValidationResult.valid
                    ? isLight
                      ? 'bg-emerald-50/80 border-emerald-300/80 text-emerald-800'
                      : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : isLight
                      ? 'bg-rose-50/80 border-rose-300/80 text-rose-800'
                      : 'bg-rose-950/30 border-rose-500/30 text-rose-300'
                }`}
              >
                {cookieValidationResult.valid ? (
                  <CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle size={16} className="text-rose-500 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <span className="font-semibold block mb-0.5">
                    {cookieValidationResult.valid ? 'Cookies File Validated' : 'Validation Failed'}
                  </span>
                  <p className="opacity-90 leading-relaxed">
                    {cookieValidationResult.message}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Browser Integration */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Layers size={15} style={{ color: 'var(--accent)' }} />
            <h3 className={`text-xs font-semibold uppercase tracking-wider ${
              isLight ? 'text-slate-700' : 'text-slate-300'
            }`}>
              {t('settings.browserIntegration')}
            </h3>
          </div>
          <div className="space-y-3">
            <div 
              className={`rounded-xl p-4 flex items-center justify-between cursor-pointer transition-colors border ${
                isLight
                  ? 'bg-white/90 hover:bg-slate-50 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                  : 'bg-[#111122]/60 hover:bg-[#151528]'
              }`}
              style={{ borderColor: 'var(--accent-border)' }}
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
              <div 
                className={`w-11 h-6 rounded-full transition-colors relative ${
                  settings.autoIntercept !== false 
                    ? '' 
                    : isLight ? 'bg-slate-200 border border-slate-300' : 'bg-black/60 border border-white/10'
                }`}
                style={settings.autoIntercept !== false ? {
                  background: `linear-gradient(to right, var(--accent-gradient-start), var(--accent-gradient-end))`
                } : undefined}
              >
                <div className={`absolute top-1 bottom-1 w-4 rounded-full bg-white transition-all shadow-sm ${
                  settings.autoIntercept !== false ? (isRTL ? 'right-6 left-auto' : 'left-6 right-auto') : (isRTL ? 'right-1 left-auto' : 'left-1 right-auto')
                }`}></div>
              </div>
            </div>

            <div 
              className={`rounded-xl p-4 transition-colors border ${
                isLight
                  ? 'bg-white/90 shadow-[0_2px_8px_rgba(0,0,0,0.02)]'
                  : 'bg-[#111122]/60'
              }`}
              style={{ borderColor: 'var(--accent-border)' }}
            >
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
                  className={`flex-1 rounded-lg py-1.5 px-3 text-xs font-mono focus:outline-none ${
                    isLight
                      ? 'bg-white text-slate-800'
                      : 'bg-[#080814] text-slate-200'
                  }`}
                  style={{ border: '1px solid var(--accent-border)' }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent-border)';
                  }}
                />
                <GlassButton onClick={handleInstallIntegration} className="whitespace-nowrap flex items-center gap-1.5 text-xs py-1.5 px-3.5">
                  {t('settings.installBtn')}
                </GlassButton>
              </div>
              {integrationStatus && (
                <p className="text-xs mt-2.5 font-medium" style={{ color: 'var(--accent-text)' }}>
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
