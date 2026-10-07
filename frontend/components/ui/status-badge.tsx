import { cn } from '@/lib/utils';
import type { SessionStatus } from '@/lib/types';

const statusStyles: Record<SessionStatus, string> = {
  connected: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  connecting: 'border-sky-400/20 bg-sky-400/10 text-sky-300',
  pairing: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  disconnected: 'border-slate-500/25 bg-slate-500/10 text-slate-400'
};

const labels: Record<SessionStatus, string> = {
  connected: 'Terhubung',
  connecting: 'Menghubungkan',
  pairing: 'Menunggu pairing',
  disconnected: 'Terputus'
};

export function StatusBadge({ status, className }: { status: SessionStatus; className?: string }) {
  const active = status === 'connected';
  return <span className={cn('inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide', statusStyles[status], className)}>
    <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,.8)]' : status === 'connecting' ? 'animate-pulse-soft bg-sky-300' : status === 'pairing' ? 'animate-pulse-soft bg-amber-300' : 'bg-slate-500')} />
    {labels[status]}
  </span>;
}
