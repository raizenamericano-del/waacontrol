import Link from 'next/link';
import { MessageCircle } from 'lucide-react';

export function Brand({ compact = false }: { compact?: boolean }) {
  return <Link href="/dashboard" className="inline-flex items-center gap-3">
    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-brand/20 bg-brand/10 text-brand shadow-glow">
      <MessageCircle className="h-5 w-5" strokeWidth={2.5} />
    </span>
    {!compact && <span className="leading-tight">
      <span className="block text-[14px] font-bold tracking-wide text-slate-100">Nexus<span className="text-brand">WA</span></span>
      <span className="mt-0.5 block text-[10px] font-medium uppercase tracking-[.19em] text-slate-500">Multi-device console</span>
    </span>}
  </Link>;
}
