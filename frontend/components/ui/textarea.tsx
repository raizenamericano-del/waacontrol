import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea
    className={cn('w-full resize-y rounded-xl border border-border bg-[#0b1018] px-3.5 py-3 text-sm text-slate-100 outline-none placeholder:text-slate-600 transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-60', className)}
    {...props}
  />;
}
