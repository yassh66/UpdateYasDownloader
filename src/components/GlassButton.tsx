import React from 'react';
import { useTheme } from '../context/ThemeContext';

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon';
  children: React.ReactNode;
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  title?: string;
  disabled?: boolean;
}

export default function GlassButton({ variant = 'secondary', children, className = '', ...props }: GlassButtonProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const baseStyles = "relative inline-flex items-center justify-center transition-all duration-200 ease-out overflow-hidden select-none disabled:opacity-50 disabled:pointer-events-none";
  
  const darkVariants = {
    primary: "px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:via-fuchsia-500 hover:to-pink-500 text-white font-semibold text-xs tracking-wide shadow-[0_0_20px_-5px_rgba(236,72,153,0.4)] hover:shadow-[0_0_25px_-3px_rgba(236,72,153,0.6)] border border-white/20 active:scale-[0.98]",
    secondary: "px-4 py-1.5 rounded-xl bg-white/[0.04] hover:bg-purple-500/10 backdrop-blur-md border border-purple-500/15 hover:border-purple-500/30 text-slate-200 hover:text-white font-medium text-xs tracking-wide shadow-sm active:scale-[0.98]",
    ghost: "px-3 py-1.5 rounded-lg hover:bg-purple-500/10 text-slate-400 hover:text-purple-200 transition-colors text-xs font-medium",
    icon: "p-1.5 rounded-xl bg-white/[0.04] hover:bg-purple-500/10 backdrop-blur-md border border-purple-500/15 hover:border-purple-500/30 text-slate-400 hover:text-white transition-all shadow-sm active:scale-[0.98]"
  };

  const lightVariants = {
    primary: "px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 via-fuchsia-600 to-pink-600 hover:from-purple-500 hover:via-fuchsia-500 hover:to-pink-500 text-white font-semibold text-xs tracking-wide shadow-[0_4px_16px_rgba(168,85,247,0.35)] hover:shadow-[0_6px_22px_rgba(168,85,247,0.5)] border border-purple-300/40 active:scale-[0.98]",
    secondary: "px-4 py-1.5 rounded-xl bg-white/85 hover:bg-purple-50/90 backdrop-blur-md border border-purple-200/80 hover:border-purple-300/90 text-slate-700 hover:text-purple-950 font-medium text-xs tracking-wide shadow-[0_2px_8px_rgba(0,0,0,0.03)] active:scale-[0.98]",
    ghost: "px-3 py-1.5 rounded-lg hover:bg-purple-100/70 text-slate-600 hover:text-purple-900 transition-colors text-xs font-medium",
    icon: "p-1.5 rounded-xl bg-white/85 hover:bg-purple-50/90 backdrop-blur-md border border-purple-200/80 hover:border-purple-300/90 text-slate-600 hover:text-purple-950 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] active:scale-[0.98]"
  };

  const variants = isLight ? lightVariants : darkVariants;

  return (
    <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
      <span className="relative z-10 flex items-center gap-1.5">{children}</span>
    </button>
  );
}
