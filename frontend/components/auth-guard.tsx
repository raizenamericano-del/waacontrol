'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { AppShell } from './app-shell';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [ready, setReady] = useState(false);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.me().then(({ user }) => {
      if (!alive) return;
      setUser(user);
      setAuthorized(true);
    }).catch(() => {
      if (!alive) return;
      setUser(null);
      setAuthorized(false);
      router.replace('/login');
    }).finally(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [router, setUser]);

  if (!ready || !authorized) return <div className="flex min-h-screen items-center justify-center bg-background text-slate-400">
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-panel px-5 py-4 text-sm"><LoaderCircle className="h-4 w-4 animate-spin text-brand" /> Memeriksa sesi aman…</div>
  </div>;

  return <RealtimeProvider><AppShell>{children}</AppShell></RealtimeProvider>;
}
