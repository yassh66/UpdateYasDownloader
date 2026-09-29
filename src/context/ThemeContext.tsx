import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = 'yas_downloader_theme';
const BROADCAST_CHANNEL = 'yas_theme_sync';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    // 1. Check local storage first (most recent persisted user preference)
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {}

    // 2. Check URL query params as fallback
    try {
      const params = new URLSearchParams(window.location.search);
      const queryTheme = params.get('theme');
      if (queryTheme === 'light' || queryTheme === 'dark') return queryTheme;
    } catch (e) {}

    return 'dark';
  });

  // Apply CSS class to documentElement and body immediately
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'light') {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    } else {
      root.classList.remove('light');
      root.classList.add('dark');
      document.body.classList.remove('light');
      document.body.classList.add('dark');
    }

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {}
  }, [theme]);

  // Synchronize with Electron main process and cross-window events
  useEffect(() => {
    // A. Query main process for initial theme
    const checkMainTheme = async () => {
      try {
        if (window.electronAPI?.getTheme) {
          const mainTheme = await window.electronAPI.getTheme();
          if (mainTheme === 'light' || mainTheme === 'dark') {
            setThemeState(mainTheme);
          }
        } else if (window.dialogAPI?.getTheme) {
          const mainTheme = await window.dialogAPI.getTheme();
          if (mainTheme === 'light' || mainTheme === 'dark') {
            setThemeState(mainTheme);
          }
        } else if (window.electronAPI?.getSettings) {
          const settings = await window.electronAPI.getSettings();
          if (settings && (settings.theme === 'light' || settings.theme === 'dark')) {
            setThemeState(settings.theme);
          }
        }
      } catch (e) {}
    };
    checkMainTheme();

    // B. Subscribe to Electron IPC theme updates (Main Window)
    let unsubscribeElectron: (() => void) | undefined;
    if (window.electronAPI?.onThemeChanged) {
      unsubscribeElectron = window.electronAPI.onThemeChanged((newTheme: any) => {
        if (newTheme === 'light' || newTheme === 'dark') {
          setThemeState(newTheme);
        }
      });
    }

    // C. Subscribe to Electron IPC theme updates (Dialog Window)
    let unsubscribeDialog: (() => void) | undefined;
    if (window.dialogAPI?.onThemeChanged) {
      unsubscribeDialog = window.dialogAPI.onThemeChanged((newTheme: any) => {
        if (newTheme === 'light' || newTheme === 'dark') {
          setThemeState(newTheme);
        }
      });
    }

    // D. BroadcastChannel for browser/preview multi-window sync
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(BROADCAST_CHANNEL);
        bc.onmessage = (event) => {
          if (event.data === 'light' || event.data === 'dark') {
            setThemeState(event.data);
          }
        };
      }
    } catch (e) {}

    // E. Storage event fallback for cross-tab sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === 'light' || e.newValue === 'dark')) {
        setThemeState(e.newValue);
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

  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);

    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch (e) {}

    // 1. Notify Electron Main Process via IPC
    try {
      if (window.electronAPI?.setTheme) {
        window.electronAPI.setTheme(newTheme).catch(console.error);
      }
      if (window.dialogAPI?.setTheme) {
        window.dialogAPI.setTheme(newTheme).catch(console.error);
      }
      if (window.electronAPI?.updateSettings) {
        window.electronAPI.updateSettings({ theme: newTheme }).catch(console.error);
      }
    } catch (e) {}

    // 2. Broadcast to other web tabs/windows
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(BROADCAST_CHANNEL);
        bc.postMessage(newTheme);
        setTimeout(() => bc.close(), 100);
      }
    } catch (e) {}
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
