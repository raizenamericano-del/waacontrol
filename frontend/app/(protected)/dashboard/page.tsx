'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Activity, ArrowRight, Check, Clock3, Link2, LoaderCircle, MessageCircle, Plus, Radio, Smartphone, Trash2, Wifi, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { useSessionStore } from '@/stores/sessions';
import type { WaSession } from '@/lib/types';

export default function DashboardPage() {
  const sessions = useSessionStore((state) => state.sessions);
  const setSessions = useSessionStore((state) => state.setSessions);
  const removeSession = useSessionStore((state) => state.removeSession);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const refresh = async () => {
    try { const result = await api.sessions(); setSessions(result.sessions); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'Session gagal dimuat.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); }, []);

  const connected = useMemo(() => sessions.filter((session) => session.status === 'connected').length, [sessions]);
  const pending = useMemo(() => sessions.filter((session) => session.status === 'pairing' || session.status === 'connecting').length, [sessions]);

  const unlink = async (session: WaSession) => {
    if (!window.confirm(`Putuskan dan hapus session ${session.phoneNumber}?`)) return;
    setDeletingId(session.id);
    try {
      await api.deleteSession(session.id);
      removeSession(session.id);
      toast.success('Session berhasil dihapus.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Session gagal dihapus.');
    } finally { setDeletingId(null); }
  };

  return <div className="animate-fade-in space-y-7">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-brand"><span className="h-px w-6 bg-brand/50" /> Overview</div>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[30px]">Selamat datang kembali.</h1>
        <p className="mt-2 text-sm text-slate-500">Pantau perangkat WhatsApp dan percakapanmu dari satu tempat.</p>
      </div>
      <Link href="/pair"><Button><Plus className="h-4 w-4" /> Tambah nomor</Button></Link>
    </div>

    <div className="grid gap-3 sm:grid-cols-3">
      <StatCard icon={<Smartphone className="h-4 w-4" />} label="Total perangkat" value={sessions.length} note="Nomor tersimpan" tone="slate" />
      <StatCard icon={<Wifi className="h-4 w-4" />} label="Terhubung" value={connected} note={connected ? 'Koneksi aktif' : 'Belum ada yang online'} tone="green" />
      <StatCard icon={<Clock3 className="h-4 w-4" />} label="Dalam proses" value={pending} note="Pairing atau reconnect" tone="amber" />
    </div>

    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h2 className="text-base font-semibold text-slate-100">Perangkat WhatsApp</h2><p className="mt-1 text-xs text-slate-500">Pilih perangkat untuk membuka inbox.</p></div>
        {sessions.length > 0 && <span className="rounded-lg border border-border bg-white/[.025] px-2.5 py-1 text-[11px] text-slate-500">{sessions.length} session</span>}
      </div>

      {loading ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((item) => <div key={item} className="h-[178px] animate-pulse rounded-2xl border border-border bg-panel/70" />)}</div>
      : sessions.length === 0 ? <Card className="relative overflow-hidden border-dashed bg-panel/40 px-5 py-14 text-center sm:py-16">
        <div className="pointer-events-none absolute left-1/2 top-0 h-44 w-80 -translate-x-1/2 rounded-full bg-brand/5 blur-3xl" />
        <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/15 bg-brand/5 text-brand"><Link2 className="h-6 w-6" /></div>
        <h3 className="relative mt-5 text-lg font-semibold text-white">Belum ada perangkat</h3>
        <p className="relative mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">Hubungkan nomor WhatsApp milikmu dengan pairing code untuk mulai melihat dan mengirim pesan.</p>
        <Link href="/pair" className="relative mt-6 inline-flex"><Button><Plus className="h-4 w-4" /> Hubungkan nomor pertama</Button></Link>
      </Card> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sessions.map((session) => <SessionCard key={session.id} session={session} deleting={deletingId === session.id} onOpen={() => router.push(`/sessions/${session.id}`)} onUnlink={() => void unlink(session)} />)}
        <Link href="/pair" className="group flex min-h-[178px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/90 bg-white/[.012] p-5 text-center transition hover:border-brand/30 hover:bg-brand/[.025]">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-border bg-white/[.025] text-slate-400 transition group-hover:border-brand/20 group-hover:bg-brand/10 group-hover:text-brand"><Plus className="h-5 w-5" /></span>
          <span className="mt-3 text-sm font-semibold text-slate-300">Tambah perangkat</span>
          <span className="mt-1 text-xs text-slate-600">Pair nomor WhatsApp lain</span>
        </Link>
      </div>}
    </section>

    <div className="grid gap-3 lg:grid-cols-[1.15fr_.85fr]">
      <Card className="flex items-center gap-4 p-5 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300"><Radio className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-200">Realtime aktif</p><p className="mt-1 text-xs leading-5 text-slate-500">Perubahan koneksi, pesan, dan status terkirim diperbarui melalui Socket.IO.</p></div>
        <span className="hidden items-center gap-1.5 rounded-full border border-emerald-400/15 bg-emerald-400/[.06] px-2.5 py-1 text-[10px] font-semibold text-emerald-300 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> Live</span>
      </Card>
      <Card className="flex items-center gap-4 p-5 sm:p-6">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-400/10 text-amber-300"><Zap className="h-5 w-5" /></div>
        <div className="min-w-0"><p className="text-sm font-semibold text-slate-200">Penggunaan bertanggung jawab</p><p className="mt-1 text-xs leading-5 text-slate-500">Kirim pesan hanya ke kontak yang menyetujui komunikasi.</p></div>
      </Card>
    </div>
  </div>;
}

function StatCard({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: number; note: string; tone: 'slate' | 'green' | 'amber' }) {
  const iconClass = tone === 'green' ? 'bg-brand/10 text-brand' : tone === 'amber' ? 'bg-amber-400/10 text-amber-300' : 'bg-slate-400/10 text-slate-300';
  return <Card className="p-4 sm:p-5">
    <div className="flex items-start justify-between"><span className="text-xs font-medium text-slate-500">{label}</span><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${iconClass}`}>{icon}</span></div>
    <div className="mt-4 flex items-end justify-between"><span className="text-3xl font-semibold tracking-tight text-white">{value}</span><span className="pb-1 text-[10px] text-slate-600">{note}</span></div>
  </Card>;
}

function SessionCard({ session, deleting, onOpen, onUnlink }: { session: WaSession; deleting: boolean; onOpen: () => void; onUnlink: () => void }) {
  const active = session.status === 'connected';
  return <Card className="group relative overflow-hidden p-5 transition hover:border-slate-600/70 hover:bg-[#101723]">
    {active && <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-brand/[.035] blur-2xl" />}
    <div className="relative flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${active ? 'border-brand/20 bg-brand/10 text-brand' : 'border-border bg-white/[.035] text-slate-300'}`}><Smartphone className="h-5 w-5" /></div>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">+{session.phoneNumber}</p><p className="mt-1 text-[11px] text-slate-500">Ditambahkan {formatDate(session.createdAt)}</p></div>
      </div>
      <button onClick={onUnlink} disabled={deleting} className="relative rounded-lg p-2 text-slate-600 transition hover:bg-rose-400/10 hover:text-rose-300 disabled:opacity-50" aria-label="Unlink session">{deleting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}</button>
    </div>
    <div className="relative mt-5 flex items-center justify-between border-t border-border/70 pt-4">
      <StatusBadge status={session.status} />
      {active ? <button onClick={onOpen} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition hover:text-brand-soft">Buka inbox <ArrowRight className="h-3.5 w-3.5" /></button>
      : session.status === 'pairing' || session.status === 'connecting' ? <Link href={`/pair?sessionId=${encodeURIComponent(session.id)}`} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 transition hover:text-white">Lanjutkan <ArrowRight className="h-3.5 w-3.5" /></Link>
      : <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600"><Check className="h-3.5 w-3.5" /> Sesi tersimpan</span>}
    </div>
  </Card>;
}
