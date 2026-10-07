import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const variants = {
  primary: 'bg-brand text-[#05281d] hover:bg-brand-soft shadow-[0_6px_24px_rgba(16,185,129,.14)] disabled:shadow-none',
  secondary: 'border border-border bg-white/[0.035] text-slate-200 hover:bg-white/[0.075] disabled:hover:bg-white/[0.035]',
  ghost: 'text-slate-400 hover:bg-white/[0.06] hover:text-white',
  danger: 'border border-rose-400/20 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15',
  subtle: 'bg-brand/10 text-brand hover:bg-brand/15'
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

export function Button({ className, variant = 'primary', size = 'md', type = 'button', ...props }: ButtonProps) {
  const sizes = {
    sm: 'h-9 px-3 text-xs',
    md: 'h-11 px-4 text-sm',
    lg: 'h-12 px-5 text-sm',
    icon: 'h-10 w-10 p-0'
  };
  return <button
    type={type}
    className={cn('inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:pointer-events-none disabled:opacity-50', variants[variant], sizes[size], className)}
    {...props}
  />;
}
