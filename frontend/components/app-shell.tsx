'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Activity, ArrowUpRight, LogOut, Menu, MessageSquareText, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Brand } from './brand';
import { Button } from './ui/button';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { cn, initials } from '@/lib/utils';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Activity },
  { href: '/pair', label: 'Tambah nomor', icon: Plus }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    try { await api.logout(); } catch { /* clear local state even when the API is unreachable */ }
    setUser(null);
    router.replace('/login');
    setLoggingOut(false);
  };

  const side = <>
    <div className="flex h-[76px] items-center justify-between border-b border-border/70 px-5">
      <Brand />
      <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-white/5 hover:text-white lg:hidden" aria-label="Tutup menu"><X className="h-5 w-5" /></button>
    </div>
    <div className="px-3 py-5">
      <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-600">Workspace</p>
      <nav className="space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
          return <Link key={href} href={href} onClick={() => setMobileOpen(false)} className={cn('group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition', active ? 'bg-brand/10 text-brand' : 'text-slate-400 hover:bg-white/[.04] hover:text-slate-100')}>
            <Icon className={cn('h-[17px] w-[17px]', active ? 'text-brand' : 'text-slate-500 group-hover:text-slate-200')} />
            {label}
            {href === '/pair' && <ArrowUpRight className="ml-auto h-3.5 w-3.5 opacity-50" />}
          </Link>;
        })}
      </nav>
    </div>
    <div className="mt-auto border-t border-border/70 p-4">
      <div className="mb-3 rounded-xl border border-border/70 bg-white/[.025] p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700/70 text-xs font-bold text-slate-200">{initials(user?.username ?? 'Admin')}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-slate-200">{user?.username ?? 'Admin'}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Administrator</p>
          </div>
          <span className="h-2 w-2 rounded-full bg-brand shadow-[0_0_10px_rgba(110,231,183,.5)]" />
        </div>
      </div>
      <Button variant="ghost" size="sm" className="w-full justify-start text-slate-500" onClick={() => void logout()} disabled={loggingOut}>
        <LogOut className="h-4 w-4" />
        {loggingOut ? 'Keluar…' : 'Keluar'}
      </Button>
    </div>
  </>;

  return <div className="min-h-screen">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] flex-col border-r border-border/70 bg-[#0b1018]/95 lg:flex">{side}</aside>
    {mobileOpen && <button className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm lg:hidden" aria-label="Tutup menu" onClick={() => setMobileOpen(false)} />}
    <aside className={cn('fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-border bg-[#0b1018] transition-transform lg:hidden', mobileOpen ? 'translate-x-0' : '-translate-x-full')}>{side}</aside>
    <div className="min-h-screen lg:pl-[252px]">
      <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/60 bg-[#080b12]/80 px-4 backdrop-blur-xl sm:px-7">
        <div className="flex items-center gap-3">
          <button onClick={() => setMobileOpen(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 lg:hidden" aria-label="Buka menu"><Menu className="h-5 w-5" /></button>
          <div className="hidden items-center gap-2 text-xs text-slate-500 sm:flex"><MessageSquareText className="h-3.5 w-3.5" /> Workspace <span className="text-slate-700">/</span> <span className="text-slate-300">{pathname.startsWith('/sessions') ? 'Percakapan' : pathname === '/pair' ? 'Tambah nomor' : 'Dashboard'}</span></div>
        </div>
        <Link href="/pair" className="inline-flex h-9 items-center gap-2 rounded-lg bg-brand px-3 text-xs font-bold text-[#05281d] transition hover:bg-brand-soft sm:hidden"><Plus className="h-4 w-4" /> Nomor</Link>
        <div className="hidden items-center gap-3 sm:flex">
          <span className="flex items-center gap-2 rounded-full border border-border/80 bg-white/[.025] px-3 py-1.5 text-[11px] text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-brand" /> Server aktif</span>
          <span className="h-7 w-px bg-border" />
          <span className="text-xs font-medium text-slate-300">{user?.username ?? 'Admin'}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-7 sm:py-8 lg:px-9">{children}</main>
    </div>
  </div>;
}
