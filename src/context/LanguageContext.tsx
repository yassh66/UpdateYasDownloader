import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import enDict from '../locales/en.json';
import faDict from '../locales/fa.json';

export type LanguageMode = 'en' | 'fa';

interface LanguageContextType {
  language: LanguageMode;
  setLanguage: (lang: LanguageMode) => void;
  toggleLanguage: () => void;
  dir: 'ltr' | 'rtl';
  isRTL: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  toggleLanguage: () => {},
  dir: 'ltr',
  isRTL: false,
  t: (key: string) => key,
});

const STORAGE_KEY = 'yas_downloader_language';
const BROADCAST_CHANNEL = 'yas_language_sync';

const dictionaries: Record<LanguageMode, any> = {
  en: enDict,
  fa: faDict,
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<LanguageMode>(() => {
    // 1. Check local storage first (most recent persisted user preference)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'fa') return saved;
    } catch (e) {}

    // 2. Check URL query params as fallback
    try {
      const params = new URLSearchParams(window.location.search);
      const queryLang = params.get('lang');
      if (queryLang === 'en' || queryLang === 'fa') return queryLang;
    } catch (e) {}

    return 'en';
  });

  const dir: 'ltr' | 'rtl' = language === 'fa' ? 'rtl' : 'ltr';
  const isRTL = dir === 'rtl';

  // Synchronize HTML root attributes (dir and lang)
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('dir', dir);
    root.setAttribute('lang', language);
    if (isRTL) {
      root.classList.add('rtl');
      document.body.classList.add('rtl');
    } else {
      root.classList.remove('rtl');
      document.body.classList.remove('rtl');
    }

    try {
      localStorage.setItem(STORAGE_KEY, language);
    } catch (e) {}
  }, [language, dir, isRTL]);

  // IPC / Sync Listeners
  useEffect(() => {
    // A. Query main process for stored language
    const checkMainLanguage = async () => {
      try {
        if (window.electronAPI?.getLanguage) {
          const mainLang = await window.electronAPI.getLanguage();
          if (mainLang === 'en' || mainLang === 'fa') {
            setLanguageState(mainLang);
          }
        } else if (window.dialogAPI?.getLanguage) {
          const mainLang = await window.dialogAPI.getLanguage();
          if (mainLang === 'en' || mainLang === 'fa') {
            setLanguageState(mainLang);
          }
        }
      } catch (e) {}
    };
    checkMainLanguage();

    // B. Subscribe to Electron IPC events
    let unsubscribeElectron: (() => void) | undefined;
    if (window.electronAPI?.onLanguageChanged) {
      unsubscribeElectron = window.electronAPI.onLanguageChanged((newLang: any) => {
        if (newLang === 'en' || newLang === 'fa') {
          setLanguageState(newLang);
        }
      });
    }

    let unsubscribeDialog: (() => void) | undefined;
    if (window.dialogAPI?.onLanguageChanged) {
      unsubscribeDialog = window.dialogAPI.onLanguageChanged((newLang: any) => {
        if (newLang === 'en' || newLang === 'fa') {
          setLanguageState(newLang);
        }
      });
    }

    // C. Subscribe to BroadcastChannel for multi-window web preview sync
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(BROADCAST_CHANNEL);
        bc.onmessage = (event) => {
          if (event.data === 'en' || event.data === 'fa') {
            setLanguageState(event.data);
          }
        };
      }
    } catch (e) {}

    // D. Storage event listener fallback
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'en' || e.newValue === 'fa')) {
        setLanguageState(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (unsubscribeElectron) unsubscribeElectron();
      if (unsubscribeDialog) unsubscribeDialog();
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setLanguage = useCallback((newLang: LanguageMode) => {
    setLanguageState(newLang);

    try {
      localStorage.setItem(STORAGE_KEY, newLang);
    } catch (e) {}

    // Notify Electron main process
    try {
      if (window.electronAPI?.setLanguage) {
        window.electronAPI.setLanguage(newLang).catch(console.error);
      }
      if (window.dialogAPI?.setLanguage) {
        window.dialogAPI.setLanguage(newLang).catch(console.error);
      }
      if (window.electronAPI?.updateSettings) {
        window.electronAPI.updateSettings({ language: newLang }).catch(console.error);
      }
    } catch (e) {}

    // Notify other preview tabs/windows via BroadcastChannel
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(BROADCAST_CHANNEL);
        bc.postMessage(newLang);
        setTimeout(() => bc.close(), 100);
      }
    } catch (e) {}
  }, []);

  const toggleLanguage = useCallback(() => {
    setLanguage(language === 'en' ? 'fa' : 'en');
  }, [language, setLanguage]);

  // Nested dotted key lookup helper
  const t = useCallback((key: string, params?: Record<string, string | number>): string => {
    const dict = dictionaries[language] || dictionaries.en;
    const fallbackDict = dictionaries.en;

    const getVal = (obj: any, path: string) => {
      const parts = path.split('.');
      let cur = obj;
      for (const p of parts) {
        if (cur && typeof cur === 'object' && p in cur) {
          cur = cur[p];
        } else {
          return undefined;
        }
      }
      return typeof cur === 'string' ? cur : undefined;
    };

    let text = getVal(dict, key) ?? getVal(fallbackDict, key) ?? key;

    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        text = text.replace(new RegExp(`{${k}}`, 'g'), String(v));
      });
    }

    return text;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, toggleLanguage, dir, isRTL, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
