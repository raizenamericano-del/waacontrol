'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Brand } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function LoginPage() {
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    void api.me().then(({ user }) => {
      if (alive) {
        setUser(user);
        router.replace('/dashboard');
      }
    }).catch(() => undefined);
    return () => { alive = false; };
  }, [router, setUser]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    try {
      const { user } = await api.login(username.trim(), password);
      setUser(user);
      toast.success('Login berhasil', { description: 'Selamat datang di NexusWA.' });
      router.replace('/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Login gagal.');
    } finally {
      setLoading(false);
    }
  };

  return <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
    <div className="soft-grid pointer-events-none absolute inset-0 opacity-50" />
    <div className="pointer-events-none absolute left-1/2 top-0 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-brand/5 blur-[100px]" />
    <div className="relative grid w-full max-w-[980px] overflow-hidden rounded-[28px] border border-border/80 bg-[#0b1018]/90 shadow-[0_32px_120px_rgba(0,0,0,.55)] lg:grid-cols-[1fr_.85fr]">
      <section className="relative hidden min-h-[590px] flex-col justify-between overflow-hidden border-r border-border/70 bg-[#0d151d] p-10 lg:flex">
        <div className="absolute inset-0 bg-hero-glow" />
        <div className="absolute -right-24 top-36 h-72 w-72 rounded-full border border-brand/10" />
        <div className="absolute -right-10 top-50 h-52 w-52 rounded-full border border-brand/10" />
        <div className="relative"><Brand /></div>
        <div className="relative max-w-sm">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.13em] text-brand"><Sparkles className="h-3.5 w-3.5" /> Private device workspace</span>
          <h1 className="text-4xl font-semibold leading-[1.15] tracking-tight text-white">Satu ruang untuk semua <span className="text-brand">perangkatmu.</span></h1>
          <p className="mt-5 text-sm leading-7 text-slate-400">Kelola sesi WhatsApp milikmu, baca percakapan, dan kirim media dalam dashboard yang aman dan real-time.</p>
          <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border/70 bg-black/20 p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-300"><ShieldCheck className="h-5 w-5" /></div>
            <div><p className="text-xs font-semibold text-slate-200">Akses administrator</p><p className="mt-1 text-[11px] text-slate-500">Cookie HttpOnly · koneksi terenkripsi</p></div>
          </div>
        </div>
        <p className="relative text-[11px] text-slate-600">© {new Date().getFullYear()} NexusWA · Gunakan hanya untuk akun yang kamu miliki.</p>
      </section>
      <section className="flex items-center px-6 py-10 sm:px-10 lg:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 lg:hidden"><Brand /></div>
          <div className="mb-8">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[.2em] text-brand">Admin access</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Masuk ke workspace</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Gunakan kredensial administrator yang dikonfigurasi di environment backend.</p>
          </div>
          <form onSubmit={submit} className="space-y-5">
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-slate-300">Username</span>
              <Input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} placeholder="admin" required autoFocus />
            </label>
            <label className="block space-y-2">
              <span className="text-xs font-semibold text-slate-300">Password</span>
              <div className="relative">
                <Input className="pr-11" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password administrator" required />
                <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-slate-500 transition hover:text-slate-200" aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            </label>
            <Button type="submit" className="mt-2 w-full" disabled={loading || !username || !password}>
              {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              {loading ? 'Memverifikasi…' : 'Masuk dengan aman'}
              {!loading && <ArrowRight className="ml-auto h-4 w-4" />}
            </Button>
          </form>
          <div className="mt-7 rounded-xl border border-amber-400/15 bg-amber-400/[.045] p-3.5 text-[11px] leading-5 text-amber-100/70">
            <span className="font-semibold text-amber-200">Catatan keamanan:</span> jangan paparkan panel admin ke publik tanpa HTTPS, password kuat, dan pembatasan akses.
          </div>
          <p className="mt-8 text-center text-[10px] text-slate-600">WhatsApp merupakan merek dagang WhatsApp LLC. NexusWA bukan produk resmi WhatsApp.</p>
        </div>
      </section>
    </div>
  </main>;
}
