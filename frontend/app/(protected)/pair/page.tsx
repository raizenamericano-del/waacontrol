'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Clipboard, LoaderCircle, LockKeyhole, MessageSquare, Smartphone, Sparkles, Wifi } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { api } from '@/lib/api';
import { useRealtimeSocket } from '@/lib/realtime';
import type { WaSession } from '@/lib/types';

export default function PairPage() {
  const router = useRouter();
  const socket = useRealtimeSocket();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [session, setSession] = useState<WaSession | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [confirmationCode, setConfirmationCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  const obtainCode = useCallback(async (id: string) => {
    setLoadingExisting(true);
    try {
      const result = await api.requestPairing(id);
      setPairingCode(result.pairingCode);
      setSession(result.session);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Pairing code gagal dibuat.');
    } finally { setLoadingExisting(false); }
  }, []);

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('sessionId');
    if (!sessionId) return;
    let alive = true;
    setLoadingExisting(true);
    void api.sessionStatus(sessionId).then(({ session: loaded }) => {
      if (!alive) return;
      setSession(loaded);
      setPhoneNumber(loaded.phoneNumber);
      if (loaded.status === 'connected') return;
      return api.requestPairing(sessionId).then((result) => {
        if (alive) { setPairingCode(result.pairingCode); setSession(result.session); }
      });
    }).catch((error: unknown) => {
      if (alive) toast.error(error instanceof Error ? error.message : 'Session gagal dimuat.');
    }).finally(() => { if (alive) setLoadingExisting(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!session || session.status === 'connected') return;
    const timer = window.setInterval(() => {
      void api.sessionStatus(session.id).then(({ session: next }) => setSession(next)).catch(() => undefined);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [session?.id, session?.status]);

  useEffect(() => {
    if (!socket || !session) return;
    const update = (payload: { session?: WaSession }) => {
      if (payload.session?.id === session.id) setSession(payload.session);
    };
    socket.on('session:update', update);
    return () => { socket.off('session:update', update); };
  }, [socket, session?.id]);

  const createAndPair = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = phoneNumber.replace(/\D/g, '');
    if (!/^[1-9]\d{6,14}$/.test(digits)) {
      toast.error('Masukkan nomor internasional 7–15 digit, tanpa tanda +.');
      return;
    }
    setCreating(true);
    try {
      const created = await api.createSession(digits);
      setSession(created.session);
      await obtainCode(created.session.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Session gagal dibuat.');
    } finally { setCreating(false); }
  };

  const confirmLinked = async () => {
    if (!session) return;
    setVerifying(true);
    try {
      const result = await api.verifyPairing(session.id, confirmationCode.trim() || undefined);
      setSession(result.session);
      if (result.connected) toast.success('Nomor WhatsApp berhasil terhubung.');
      else toast.info('Konfirmasi diterima', { description: 'Menunggu WhatsApp menyelesaikan tautan perangkat.' });
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Konfirmasi pairing gagal.'); }
    finally { setVerifying(false); }
  };

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      toast.success('Pairing code disalin.');
      window.setTimeout(() => setCopied(false), 1800);
    } catch { toast.error('Clipboard tidak tersedia di browser ini.'); }
  };

  return <div className="mx-auto max-w-5xl animate-fade-in space-y-6">
    <div>
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-slate-200"><ArrowLeft className="h-3.5 w-3.5" /> Kembali ke dashboard</Link>
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[.18em] text-brand"><span className="h-px w-6 bg-brand/50" /> Tambah perangkat</div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[30px]">Hubungkan nomor WhatsApp</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">Tautkan perangkat pendamping dengan kode pairing resmi yang diminta melalui koneksi WhatsApp Web.</p></div>
        {session && <StatusBadge status={session.status} />}
      </div>
    </div>

    <div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]">
      <div className="space-y-5">
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand/10 text-brand"><Smartphone className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-slate-100">1. Nomor WhatsApp</p><p className="mt-0.5 text-xs text-slate-500">Gunakan kode negara, tanpa tanda +.</p></div></div>
          <form onSubmit={(event) => void createAndPair(event)} className="space-y-3">
            <label className="block space-y-2"><span className="text-xs font-medium text-slate-300">Nomor internasional</span>
              <div className="relative"><span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-sm text-slate-500">+</span><Input className="pl-8 font-mono tracking-wide" inputMode="numeric" autoComplete="tel" placeholder="6281234567890" value={phoneNumber} onChange={(event) => setPhoneNumber(event.target.value.replace(/[^0-9+\s()-]/g, ''))} disabled={Boolean(session)} /></div>
            </label>
            {session ? <div className="rounded-xl border border-border bg-black/10 p-3 text-xs leading-5 text-slate-400">Session untuk <span className="font-semibold text-slate-200">+{session.phoneNumber}</span> siap dipair. Untuk nomor lain, batalkan dan mulai dari dashboard.</div>
            : <Button className="w-full" type="submit" disabled={creating || loadingExisting || !phoneNumber.trim()}>{creating || loadingExisting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{creating || loadingExisting ? 'Menyiapkan koneksi…' : 'Buat session & generate code'}<ArrowRight className="ml-auto h-4 w-4" /></Button>}
          </form>
          <p className="mt-3 text-[11px] leading-5 text-slate-600">Format contoh Indonesia: <span className="font-mono text-slate-400">62812…</span> — nomor harus terdaftar di WhatsApp.</p>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-400/10 text-sky-300"><Wifi className="h-4 w-4" /></span><div><p className="text-sm font-semibold text-slate-100">2. Tautkan dari aplikasi WhatsApp</p><p className="mt-0.5 text-xs text-slate-500">Pilih opsi tautkan dengan nomor telepon.</p></div></div>
          <div className="space-y-3">
            <Instruction number="Android" text="Buka WhatsApp → ⋮ → Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon." />
            <Instruction number="iPhone" text="Buka WhatsApp → Pengaturan → Perangkat tertaut → Tautkan perangkat → Tautkan dengan nomor telepon." />
          </div>
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/15 bg-amber-400/[.045] p-3 text-[11px] leading-5 text-amber-100/70"><LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" /><span>Jangan bagikan pairing code atau file auth. Kode hanya digunakan pada WhatsApp di ponsel pemilik akun.</span></div>
        </Card>
      </div>

      <div className="space-y-5">
        <Card className="relative flex min-h-[310px] flex-col items-center justify-center overflow-hidden p-6 text-center sm:p-8">
          <div className="pointer-events-none absolute left-1/2 top-0 h-52 w-96 -translate-x-1/2 rounded-full bg-brand/[.055] blur-3xl" />
          {pairingCode ? <div className="relative w-full max-w-md">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-brand/20 bg-brand/10 text-brand"><MessageSquare className="h-5 w-5" /></span>
            <p className="mt-5 text-[11px] font-bold uppercase tracking-[.19em] text-brand">Pairing code WhatsApp</p>
            <p className="mt-2 text-sm text-slate-500">Masukkan kode berikut pada aplikasi WhatsApp di ponsel.</p>
            <div className="mt-6 flex items-center justify-center gap-2 rounded-2xl border border-brand/20 bg-black/25 px-3 py-5 sm:px-5">
              <code className="select-all text-3xl font-bold tracking-[.22em] text-white sm:text-[42px]">{pairingCode}</code>
              <button onClick={() => void copyCode()} className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-slate-400 transition hover:border-brand/30 hover:text-brand" aria-label="Salin pairing code">{copied ? <Check className="h-4 w-4 text-brand" /> : <Clipboard className="h-4 w-4" />}</button>
            </div>
            <p className="mt-3 text-[11px] text-slate-600">Kode bersifat sementara dan hanya untuk akun ini.</p>
            <div className="mt-6 border-t border-border/70 pt-5 text-left">
              <label className="mb-2 block text-xs font-medium text-slate-300">Konfirmasi code (opsional)</label>
              <div className="flex gap-2"><Input className="font-mono uppercase tracking-widest" value={confirmationCode} onChange={(event) => setConfirmationCode(event.target.value.toUpperCase())} placeholder="Masukkan kode yang dipakai" maxLength={16} /><Button variant="secondary" onClick={() => void confirmLinked()} disabled={verifying}>{verifying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}Cek</Button></div>
              <p className="mt-2 text-[10px] leading-4 text-slate-600">Pengecekan ini mencocokkan kode yang dibuat; status <em>Terhubung</em> tetap ditentukan oleh konfirmasi server WhatsApp.</p>
            </div>
          </div> : <div className="relative max-w-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-white/[.025] text-slate-600"><MessageSquare className="h-6 w-6" /></div>
            <h3 className="mt-4 text-base font-semibold text-slate-200">Pairing code akan tampil di sini</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">Buat session dengan nomor WhatsApp untuk meminta kode langsung dari Baileys.</p>
            {session && !pairingCode && <Button className="mt-5" onClick={() => void obtainCode(session.id)} disabled={loadingExisting}>{loadingExisting && <LoaderCircle className="h-4 w-4 animate-spin" />}Minta pairing code</Button>}
          </div>}
        </Card>

        {session && <Card className="flex items-center gap-4 p-5">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${session.status === 'connected' ? 'bg-brand/10 text-brand' : 'bg-slate-500/10 text-slate-400'}`}>{session.status === 'connected' ? <CheckCircle2 className="h-5 w-5" /> : <LoaderCircle className="h-5 w-5 animate-spin" />}</div>
          <div className="min-w-0 flex-1"><p className="text-sm font-semibold text-slate-200">{session.status === 'connected' ? 'Perangkat berhasil ditautkan' : 'Menunggu konfirmasi WhatsApp'}</p><p className="mt-1 text-xs text-slate-500">{session.status === 'connected' ? `+${session.phoneNumber} siap menerima pesan.` : 'Biarkan halaman ini terbuka; status akan diperbarui otomatis.'}</p></div>
          {session.status === 'connected' && <Button size="sm" onClick={() => router.push(`/sessions/${session.id}`)}>Buka inbox <ArrowRight className="h-3.5 w-3.5" /></Button>}
        </Card>}

        <div className="rounded-xl border border-sky-400/10 bg-sky-400/[.025] px-4 py-3 text-[11px] leading-5 text-slate-500"><strong className="text-sky-200">Catatan format:</strong> Baileys/WhatsApp mengeluarkan pairing code 8 karakter alfanumerik. Panjang/format kode ditentukan protokol WhatsApp, bukan bisa dipaksa menjadi 6 digit.</div>
      </div>
    </div>
  </div>;
}

function Instruction({ number, text }: { number: string; text: string }) {
  return <div className="flex gap-3 rounded-xl border border-border/70 bg-white/[.018] p-3"><span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[.05] text-[9px] font-bold text-slate-400">{number === 'Android' ? 'A' : 'iOS'}</span><div><p className="text-[11px] font-semibold text-slate-300">{number}</p><p className="mt-1 text-[11px] leading-5 text-slate-500">{text}</p></div></div>;
}
