import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAccent } from '../context/AccentContext';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  disabled?: boolean;
}

export default function GlassButton({ variant = 'secondary', children, className = '', style, ...props }: GlassButtonProps) {
  const { theme } = useTheme();
  const { tokens } = useAccent();
  const isLight = theme === 'light';

  const baseStyles = "relative inline-flex items-center justify-center transition-all duration-200 ease-out overflow-hidden select-none disabled:opacity-50 disabled:pointer-events-none cursor-pointer";
  
  if (variant === 'primary') {
    return (
      <button 
        className={`px-5 py-2 rounded-xl text-xs font-semibold tracking-wide border active:scale-[0.98] ${baseStyles} ${className}`}
        style={{
          background: `linear-gradient(135deg, var(--accent-gradient-start) 0%, var(--accent-gradient-end) 100%)`,
          color: 'var(--accent-contrast)',
          boxShadow: isLight ? 'var(--accent-glow-sm)' : 'var(--accent-glow)',
          borderColor: isLight ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.2)',
          ...style,
        }}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-1.5">{children}</span>
      </button>
    );
  }

  if (variant === 'secondary') {
    return (
      <button 
        className={`px-4 py-1.5 rounded-xl font-medium text-xs tracking-wide border shadow-sm active:scale-[0.98] backdrop-blur-md ${baseStyles} ${
          isLight
            ? 'bg-white/90 text-slate-800 hover:text-slate-950'
            : 'bg-white/[0.05] text-slate-200 hover:text-white'
        } ${className}`}
        style={{
          borderColor: 'var(--accent-border)',
          ...style,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border-strong)';
          (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--accent-rgb), 0.12)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)';
          (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.05)';
        }}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-1.5">{children}</span>
      </button>
    );
  }

  if (variant === 'ghost') {
    return (
      <button 
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${baseStyles} ${
          isLight
            ? 'text-slate-600 hover:text-slate-900'
            : 'text-slate-400 hover:text-white'
        } ${className}`}
        style={style}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--accent-soft)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
        }}
        {...props}
      >
        <span className="relative z-10 flex items-center gap-1.5">{children}</span>
      </button>
    );
  }

  // icon variant
  return (
    <button 
      className={`p-1.5 rounded-xl border backdrop-blur-md transition-all shadow-sm active:scale-[0.98] ${baseStyles} ${
        isLight
          ? 'bg-white/90 text-slate-700 hover:text-slate-950'
          : 'bg-white/[0.05] text-slate-400 hover:text-white'
      } ${className}`}
      style={{
        borderColor: 'var(--accent-border)',
        ...style,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border-strong)';
        (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? 'rgba(var(--accent-rgb), 0.08)' : 'rgba(var(--accent-rgb), 0.12)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent-border)';
        (e.currentTarget as HTMLElement).style.backgroundColor = isLight ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.05)';
      }}
      {...props}
    >
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </button>
  );
}

