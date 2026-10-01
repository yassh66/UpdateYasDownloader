import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { useTheme } from './ThemeContext';

export interface AccentPreset {
  id: string;
  name: string;
  nameFa: string;
  hex: string;
  description: string;
  descriptionFa: string;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: 'yas-purple',
    name: 'YAS Royal Purple',
    nameFa: 'بنفش سلطنتی YAS',
    hex: '#6E4BFF',
    description: 'Signature YAS brand luxury violet',
    descriptionFa: 'رنگ اصیل و نمادین برند YAS',
  },
  {
    id: 'cyber-pink',
    name: 'Cyber Pink',
    nameFa: 'صورتی سایبر',
    hex: '#EC4899',
    description: 'Vibrant neon synthwave fuchsia',
    descriptionFa: 'صورتی نئونی پرانرژی و جذاب',
  },
  {
    id: 'neon-cyan',
    name: 'Neon Cyan',
    nameFa: 'آبی نئون / فیروزه‌ای',
    hex: '#00D2FF',
    description: 'High-tech electric ice cyan',
    descriptionFa: 'آبی یخی و الکتریکی آینده‌نگر',
  },
  {
    id: 'electric-indigo',
    name: 'Electric Indigo',
    nameFa: 'نیلی الکتریکی',
    hex: '#6366F1',
    description: 'Deep modern futuristic indigo',
    descriptionFa: 'نیلی مدرن و باکلاس',
  },
  {
    id: 'emerald-matrix',
    name: 'Emerald Matrix',
    nameFa: 'سبز زمردی',
    hex: '#10B981',
    description: 'Cyber emerald vitality green',
    descriptionFa: 'سبز نئونی زنده و درخشان',
  },
  {
    id: 'sunset-amber',
    name: 'Sunset Amber',
    nameFa: 'کهربایی غروب',
    hex: '#F59E0B',
    description: 'Luminous golden sunset amber',
    descriptionFa: 'طلایی و کهربایی گرم و دلنشین',
  },
  {
    id: 'crimson-flame',
    name: 'Crimson Flame',
    nameFa: 'یاقوتی آتشین',
    hex: '#EF4444',
    description: 'Radiant passionate ruby red',
    descriptionFa: 'قرمز یاقوتی براق و پرقدرت',
  },
  {
    id: 'rose-gold',
    name: 'Rose Coral',
    nameFa: 'رز مرجانی',
    hex: '#F43F5E',
    description: 'Premium luxury rose quartz',
    descriptionFa: 'رز کوارتز لوکس و چشم‌نواز',
  },
  {
    id: 'ocean-sapphire',
    name: 'Ocean Sapphire',
    nameFa: 'آبی یاقوت کبود',
    hex: '#2563EB',
    description: 'Deep royal ultramarine blue',
    descriptionFa: 'آبی کبالت عمیق و پایدار',
  },
  {
    id: 'aura-mint',
    name: 'Aura Teal',
    nameFa: 'سبز دریایی / فیروزه‌ای',
    hex: '#14B8A6',
    description: 'Crisp futuristic bio-luminescent teal',
    descriptionFa: 'ترکیب مدرن سبزآبی و فیروزه‌ای',
  },
];

export const DEFAULT_ACCENT = '#6E4BFF';
const STORAGE_KEY = 'yas_downloader_accent';
const BROADCAST_CHANNEL = 'yas_accent_sync';

// Color utilities
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace(/^#/, '');
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  if (clean.length !== 6) {
    return { r: 110, g: 75, b: 255 }; // fallback to default
  }
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }

  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.max(0, Math.min(255, Math.round(n))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function getLuminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

export interface GeneratedTokens {
  accent: string;
  accentRgb: string;
  accentHover: string;
  accentActive: string;
  accentSoft: string;
  accentSubtle: string;
  accentSurface: string;
  accentBorder: string;
  accentBorderStrong: string;
  accentGlow: string;
  accentGlowSm: string;
  accentGlowLg: string;
  accentText: string;
  accentContrast: string;
  accentGradientStart: string;
  accentGradientEnd: string;
}

export function generateAccentTokens(baseHex: string, isLight: boolean): GeneratedTokens {
  const { r, g, b } = hexToRgb(baseHex);
  const { h, s, l } = rgbToHsl(r, g, b);
  const luminance = getLuminance(r, g, b);

  // Gradient companion hue shift (rotate hue harmoniously by ~30-45 deg)
  let companionH = (h + 35) % 360;
  if (h >= 240 && h <= 300) {
    // Purple/Violet shifts towards vibrant pink/rose
    companionH = 325;
  } else if (h >= 170 && h <= 210) {
    // Cyan shifts towards deep electric blue
    companionH = 225;
  } else if (h >= 20 && h <= 50) {
    // Amber shifts towards rose red
    companionH = 350;
  }

  const gradStartHex = baseHex;
  const gradEndRgb = hslToRgb(companionH, Math.min(100, Math.max(60, s)), Math.min(65, Math.max(45, l)));
  const gradEndHex = rgbToHex(gradEndRgb.r, gradEndRgb.g, gradEndRgb.b);

  // Hover and active states
  const hoverRgb = hslToRgb(h, s, isLight ? Math.max(25, l - 6) : Math.min(85, l + 7));
  const activeRgb = hslToRgb(h, s, isLight ? Math.max(20, l - 12) : Math.max(25, l - 6));
  const hoverHex = rgbToHex(hoverRgb.r, hoverRgb.g, hoverRgb.b);
  const activeHex = rgbToHex(activeRgb.r, activeRgb.g, activeRgb.b);

  // Text color when standing alone on dark / light background
  let textHex: string;
  if (isLight) {
    // In light theme, text must be sufficiently dark and saturated for strong readability
    const textRgb = hslToRgb(h, Math.min(100, s + 15), Math.min(38, Math.max(22, Math.round(l * 0.7))));
    textHex = rgbToHex(textRgb.r, textRgb.g, textRgb.b);
  } else {
    // In dark theme, text must be light, vibrant and luminous
    const textRgb = hslToRgb(h, Math.min(100, s + 10), Math.min(85, Math.max(65, l)));
    textHex = rgbToHex(textRgb.r, textRgb.g, textRgb.b);
  }

  // Contrast text on top of filled base accent
  // If luminance > 0.45, dark text is required; else white text
  const contrastHex = luminance > 0.48 ? '#0A0A16' : '#FFFFFF';

  const accentRgbStr = `${r}, ${g}, ${b}`;

  if (isLight) {
    return {
      accent: baseHex,
      accentRgb: accentRgbStr,
      accentHover: hoverHex,
      accentActive: activeHex,
      accentSoft: `rgba(${accentRgbStr}, 0.12)`,
      accentSubtle: `rgba(${accentRgbStr}, 0.05)`,
      accentSurface: `rgba(${accentRgbStr}, 0.03)`,
      accentBorder: `rgba(${accentRgbStr}, 0.20)`,
      accentBorderStrong: `rgba(${accentRgbStr}, 0.42)`,
      accentGlow: `0 4px 20px rgba(${accentRgbStr}, 0.28)`,
      accentGlowSm: `0 2px 10px rgba(${accentRgbStr}, 0.18)`,
      accentGlowLg: `0 8px 30px rgba(${accentRgbStr}, 0.35)`,
      accentText: textHex,
      accentContrast: contrastHex,
      accentGradientStart: gradStartHex,
      accentGradientEnd: gradEndHex,
    };
  } else {
    return {
      accent: baseHex,
      accentRgb: accentRgbStr,
      accentHover: hoverHex,
      accentActive: activeHex,
      accentSoft: `rgba(${accentRgbStr}, 0.16)`,
      accentSubtle: `rgba(${accentRgbStr}, 0.07)`,
      accentSurface: `rgba(${accentRgbStr}, 0.035)`,
      accentBorder: `rgba(${accentRgbStr}, 0.24)`,
      accentBorderStrong: `rgba(${accentRgbStr}, 0.50)`,
      accentGlow: `0 0 25px rgba(${accentRgbStr}, 0.45)`,
      accentGlowSm: `0 0 12px rgba(${accentRgbStr}, 0.35)`,
      accentGlowLg: `0 0 45px rgba(${accentRgbStr}, 0.40)`,
      accentText: textHex,
      accentContrast: contrastHex,
      accentGradientStart: gradStartHex,
      accentGradientEnd: gradEndHex,
    };
  }
}

interface AccentContextType {
  accentColor: string;
  setAccentColor: (color: string) => void;
  resetAccentColor: () => void;
  tokens: GeneratedTokens;
  isCustomColor: boolean;
  activePresetId: string | null;
}

const AccentContext = createContext<AccentContextType>({
  accentColor: DEFAULT_ACCENT,
  setAccentColor: () => {},
  resetAccentColor: () => {},
  tokens: generateAccentTokens(DEFAULT_ACCENT, false),
  isCustomColor: false,
  activePresetId: 'yas-purple',
});

export const AccentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const [accentColor, setAccentColorState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && /^#[0-9A-Fa-f]{6}$/.test(saved)) {
        return saved.toUpperCase();
      }
    } catch (e) {}

    try {
      const params = new URLSearchParams(window.location.search);
      const queryAccent = params.get('accent');
      if (queryAccent && /^#[0-9A-Fa-f]{6}$/.test(queryAccent)) {
        return queryAccent.toUpperCase();
      }
    } catch (e) {}

    return DEFAULT_ACCENT;
  });

  const tokens = useMemo(() => {
    return generateAccentTokens(accentColor, isLight);
  }, [accentColor, isLight]);

  // Apply CSS custom properties to documentElement & body
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--accent', tokens.accent);
    root.style.setProperty('--accent-rgb', tokens.accentRgb);
    root.style.setProperty('--accent-hover', tokens.accentHover);
    root.style.setProperty('--accent-active', tokens.accentActive);
    root.style.setProperty('--accent-soft', tokens.accentSoft);
    root.style.setProperty('--accent-subtle', tokens.accentSubtle);
    root.style.setProperty('--accent-surface', tokens.accentSurface);
    root.style.setProperty('--accent-border', tokens.accentBorder);
    root.style.setProperty('--accent-border-strong', tokens.accentBorderStrong);
    root.style.setProperty('--accent-glow', tokens.accentGlow);
    root.style.setProperty('--accent-glow-sm', tokens.accentGlowSm);
    root.style.setProperty('--accent-glow-lg', tokens.accentGlowLg);
    root.style.setProperty('--accent-text', tokens.accentText);
    root.style.setProperty('--accent-contrast', tokens.accentContrast);
    root.style.setProperty('--accent-gradient-start', tokens.accentGradientStart);
    root.style.setProperty('--accent-gradient-end', tokens.accentGradientEnd);

    try {
      localStorage.setItem(STORAGE_KEY, accentColor);
    } catch (e) {}
  }, [tokens, accentColor]);

  // Sync with Electron main process and cross-window events
  useEffect(() => {
    const checkMainAccent = async () => {
      try {
        if (window.electronAPI?.getSettings) {
          const settings = await window.electronAPI.getSettings();
          if (settings && settings.accentColor && /^#[0-9A-Fa-f]{6}$/.test(settings.accentColor)) {
            setAccentColorState(settings.accentColor.toUpperCase());
          }
        }
      } catch (e) {
        console.error('[AccentContext] getSettings error:', e);
      }
    };
    checkMainAccent();

    // BroadcastChannel for browser/preview multi-window sync
    let bc: BroadcastChannel | null = null;
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        bc = new BroadcastChannel(BROADCAST_CHANNEL);
        bc.onmessage = (event) => {
          if (typeof event.data === 'string' && /^#[0-9A-Fa-f]{6}$/.test(event.data)) {
            setAccentColorState(event.data.toUpperCase());
          }
        };
      }
    } catch (e) {}

    // Storage event fallback for cross-tab sync
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue && /^#[0-9A-Fa-f]{6}$/.test(e.newValue)) {
        setAccentColorState(e.newValue.toUpperCase());
      }
    };
    window.addEventListener('storage', handleStorage);

    return () => {
      if (bc) bc.close();
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const setAccentColor = useCallback((color: string) => {
    let clean = color.trim().toUpperCase();
    if (!clean.startsWith('#')) {
      clean = '#' + clean;
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(clean)) {
      return;
    }

    setAccentColorState(clean);

    // Primary persistence via localStorage (guaranteed for browser preview and standalone windows)
    try {
      localStorage.setItem(STORAGE_KEY, clean);
    } catch (e) {
      console.warn('[AccentContext] localStorage write error:', e);
    }

    // 1. Notify Electron Main Process via settings update if bridge is present
    try {
      if (window.electronAPI?.updateSettings) {
        window.electronAPI.updateSettings({ accentColor: clean }).catch((err) => {
          console.error('[AccentContext] Electron IPC updateSettings failed:', err);
        });
      }
    } catch (e) {
      console.error('[AccentContext] updateSettings error:', e);
    }

    // 2. Broadcast to other web tabs/windows
    try {
      if (typeof BroadcastChannel !== 'undefined') {
        const bc = new BroadcastChannel(BROADCAST_CHANNEL);
        bc.postMessage(clean);
        setTimeout(() => bc.close(), 100);
      }
    } catch (e) {}
  }, []);

  const resetAccentColor = useCallback(() => {
    setAccentColor(DEFAULT_ACCENT);
  }, [setAccentColor]);

  const activePreset = ACCENT_PRESETS.find(
    (p) => p.hex.toUpperCase() === accentColor.toUpperCase()
  );
  const isCustomColor = !activePreset;
  const activePresetId = activePreset ? activePreset.id : null;

  return (
    <AccentContext.Provider
      value={{
        accentColor,
        setAccentColor,
        resetAccentColor,
        tokens,
        isCustomColor,
        activePresetId,
      }}
    >
      {children}
    </AccentContext.Provider>
  );
};

export const useAccent = () => useContext(AccentContext);
