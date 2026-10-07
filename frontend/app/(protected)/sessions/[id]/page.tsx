'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, AudioLines, Check, CheckCheck, FileText, Image as ImageIcon, LoaderCircle, MessageSquare, Mic, MoreHorizontal,
  Paperclip, Plus, Search, Send, ShieldCheck, Smile, StopCircle, Video, Wifi, X
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/ui/status-badge';
import { api, apiFetch, assetUrl } from '@/lib/api';
import { useRealtimeSocket } from '@/lib/realtime';
import { formatTime, initials } from '@/lib/utils';
import type { WaChat, WaMessage, WaSession } from '@/lib/types';

export default function ChatPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const router = useRouter();
  const socket = useRealtimeSocket();
  const [session, setSession] = useState<WaSession | null>(null);
  const [chats, setChats] = useState<WaChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<WaChat | null>(null);
  const [messages, setMessages] = useState<WaMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [search, setSearch] = useState('');
  const [draft, setDraft] = useState('');
  const [media, setMedia] = useState<File | null>(null);
  const [ptt, setPtt] = useState(false);
  const [sending, setSending] = useState(false);
  const [statusByChat, setStatusByChat] = useState<Record<string, string>>({});
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<WaChat | null>(null);

  useEffect(() => { selectedRef.current = selectedChat; }, [selectedChat]);

  const loadChats = useCallback(async () => {
    const result = await api.chats(sessionId);
    setChats(result.chats);
    setSelectedChat((current) => {
      if (current && result.chats.some((chat) => chat.jid === current.jid)) return result.chats.find((chat) => chat.jid === current.jid) ?? current;
      return current ?? result.chats[0] ?? null;
    });
  }, [sessionId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void Promise.all([api.sessionStatus(sessionId), api.chats(sessionId)]).then(([statusResult, chatResult]) => {
      if (!alive) return;
      setSession(statusResult.session);
      setChats(chatResult.chats);
      setSelectedChat((current) => current ?? chatResult.chats[0] ?? null);
    }).catch((error: unknown) => {
      if (alive) {
        toast.error(error instanceof Error ? error.message : 'Data percakapan gagal dimuat.');
        router.replace('/dashboard');
      }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [sessionId, router]);

  useEffect(() => {
    if (!selectedChat) { setMessages([]); return; }
    let alive = true;
    setLoadingMessages(true);
    setMessages([]);
    void api.messages(sessionId, selectedChat.jid).then(({ messages: result }) => { if (alive) setMessages(result); })
      .catch((error: unknown) => { if (alive) toast.error(error instanceof Error ? error.message : 'Pesan gagal dimuat.'); })
      .finally(() => { if (alive) setLoadingMessages(false); });
    return () => { alive = false; };
  }, [sessionId, selectedChat?.jid]);

  useEffect(() => {
    if (!socket) return;
    const handleNewMessage = (payload: { sessionId?: string; chatJid?: string; message?: WaMessage; chat?: WaChat | null }) => {
      if (payload.sessionId !== sessionId || !payload.message) return;
      if (payload.chat) {
        setChats((current) => [payload.chat as WaChat, ...current.filter((chat) => chat.jid !== payload.chat?.jid)]);
      } else void loadChats().catch(() => undefined);
      if (selectedRef.current?.jid === payload.message.chatJid) {
        setMessages((current) => current.some((message) => message.waMessageId === payload.message?.waMessageId) ? current : [...current, payload.message as WaMessage]);
      }
    };
    const handleMessageUpdate = (payload: { sessionId?: string; chatJid?: string; waMessageId?: string; status?: string; message?: WaMessage }) => {
      if (payload.sessionId !== sessionId) return;
      const updated = payload.message;
      setMessages((current) => current.map((message) => {
        if (updated && message.waMessageId === updated.waMessageId) return { ...message, ...updated };
        if (payload.waMessageId && message.waMessageId === payload.waMessageId) return { ...message, status: payload.status ?? message.status };
        return message;
      }));
    };
    const handleChatUpdate = (payload: { sessionId?: string; chat?: WaChat | null }) => {
      if (payload.sessionId !== sessionId || !payload.chat) return;
      setChats((current) => [payload.chat as WaChat, ...current.filter((chat) => chat.jid !== payload.chat?.jid)]);
    };
    const handlePresence = (payload: { sessionId?: string; id?: string; presences?: Record<string, { lastKnownPresence?: string }> }) => {
      if (payload.sessionId !== sessionId || !payload.id) return;
      const values = Object.values(payload.presences ?? {});
      const state = values.some((value) => value.lastKnownPresence === 'composing') ? 'mengetik…'
        : values.some((value) => value.lastKnownPresence === 'recording') ? 'merekam audio…'
          : values.some((value) => value.lastKnownPresence === 'available') ? 'online' : 'offline';
      setStatusByChat((current) => ({ ...current, [payload.id as string]: state }));
    };
    const handleSessionUpdate = (payload: { session?: WaSession }) => {
      if (payload.session?.id === sessionId) setSession(payload.session);
    };
    socket.on('message:new', handleNewMessage);
    socket.on('message:update', handleMessageUpdate);
    socket.on('chat:update', handleChatUpdate);
    socket.on('presence:update', handlePresence);
    socket.on('session:update', handleSessionUpdate);
    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:update', handleMessageUpdate);
      socket.off('chat:update', handleChatUpdate);
      socket.off('presence:update', handlePresence);
      socket.off('session:update', handleSessionUpdate);
    };
  }, [socket, sessionId, loadChats]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages.length, selectedChat?.jid]);

  useEffect(() => () => {
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const visibleChats = useMemo(() => chats.filter((chat) => `${chat.name} ${chat.jid}`.toLowerCase().includes(search.toLowerCase())), [chats, search]);
  const presenceLabel = selectedChat ? statusByChat[selectedChat.jid] : undefined;

  const selectChat = (chat: WaChat) => {
    setSelectedChat(chat);
    setMobileChatOpen(true);
    setChats((current) => current.map((item) => item.jid === chat.jid ? { ...item, unreadCount: 0 } : item));
  };

  const startNewChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = newPhone.replace(/\D/g, '');
    if (!/^[1-9]\d{6,14}$/.test(digits)) { toast.error('Masukkan nomor internasional 7–15 digit tanpa +.'); return; }
    const jid = `${digits}@s.whatsapp.net`;
    const existing = chats.find((chat) => chat.jid === jid);
    const chat: WaChat = existing ?? {
      id: `draft-${digits}`, sessionId, jid, name: `+${digits}`, isGroup: false,
      unreadCount: 0, lastMessageAt: null, lastMessagePreview: null, updatedAt: new Date().toISOString()
    };
    if (!existing) setChats((current) => [chat, ...current]);
    setSelectedChat(chat);
    setMobileChatOpen(true);
    setNewPhone('');
    setNewChatOpen(false);
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setMedia(file);
    setPtt(false);
    event.target.value = '';
  };

  const send = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!selectedChat || sending) return;
    if (!draft.trim() && !media) return;
    if (session?.status !== 'connected') { toast.error('Hubungkan session sebelum mengirim pesan.'); return; }
    setSending(true);
    const form = new FormData();
    form.append('sessionId', sessionId);
    form.append('chatJid', selectedChat.jid);
    form.append('text', draft.trim());
    form.append('ptt', ptt ? 'true' : 'false');
    if (media) form.append('media', media);
    try {
      const result = await apiFetch<{ message: WaMessage }>('/api/messages/send', { method: 'POST', body: form });
      setMessages((current) => current.some((message) => message.waMessageId === result.message.waMessageId) ? current : [...current, result.message]);
      setDraft('');
      setMedia(null);
      setPtt(false);
      void loadChats().catch(() => undefined);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Pesan gagal dikirim.'); }
    finally { setSending(false); }
  };

  const handleComposerKey = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void send(); }
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Browser ini tidak mendukung perekaman audio.'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        const extension = blob.type.includes('ogg') ? 'ogg' : 'webm';
        setMedia(new File([blob], `voice-note.${extension}`, { type: blob.type }));
        setPtt(true);
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        setRecording(false);
      };
      recorder.start();
      setRecording(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Mikrofon tidak dapat diakses.');
    }
  };

  const stopRecording = () => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const mediaKind = media?.type.startsWith('image/') ? 'Gambar' : media?.type.startsWith('video/') ? 'Video' : media?.type.startsWith('audio/') ? (ptt ? 'Voice note' : 'Audio') : media ? 'Dokumen' : '';

  return <div className="animate-fade-in">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div className="min-w-0"><button onClick={() => router.push('/dashboard')} className="mb-2 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 transition hover:text-slate-200"><ArrowLeft className="h-3.5 w-3.5" /> Semua perangkat</button><h1 className="truncate text-lg font-semibold text-white">Inbox <span className="text-slate-600">/</span> <span className="font-mono text-sm text-slate-400">+{session?.phoneNumber ?? '…'}</span></h1></div>
      <div className="hidden sm:block">{session && <StatusBadge status={session.status} />}</div>
    </div>

    <div className="grid h-[calc(100vh-12.5rem)] min-h-[540px] overflow-hidden rounded-2xl border border-border/80 bg-[#0c111a] shadow-card md:grid-cols-[285px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside className={`${mobileChatOpen ? 'hidden md:flex' : 'flex'} min-w-0 flex-col border-r border-border/80`}>
        <div className="border-b border-border/70 p-4">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-semibold text-slate-100">Percakapan</p><p className="mt-1 text-[10px] text-slate-500">{chats.length} chat tersimpan</p></div><button onClick={() => setNewChatOpen((open) => !open)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-slate-400 transition hover:border-brand/30 hover:bg-brand/5 hover:text-brand" aria-label="Chat baru"><Plus className="h-4 w-4" /></button></div>
          {newChatOpen && <form onSubmit={startNewChat} className="mb-3 space-y-2 rounded-xl border border-brand/15 bg-brand/[.035] p-3"><label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500">Chat baru · nomor internasional</label><div className="flex gap-2"><Input className="h-9 min-w-0 font-mono text-xs" placeholder="62812…" inputMode="numeric" value={newPhone} onChange={(event) => setNewPhone(event.target.value)} autoFocus /><Button type="submit" size="icon" className="h-9 w-9 shrink-0" aria-label="Mulai chat"><ArrowLeft className="h-4 w-4 rotate-180" /></Button></div></form>}
          <div className="relative"><Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-600" /><Input className="h-9 border-transparent bg-white/[.035] pl-9 text-xs focus:border-border" placeholder="Cari chat…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {loading ? <div className="space-y-2 p-1">{[0, 1, 2, 3].map((item) => <div key={item} className="h-[66px] animate-pulse rounded-xl bg-white/[.025]" />)}</div>
          : visibleChats.length === 0 ? <div className="px-5 py-12 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-white/[.025] text-slate-600"><MessageSquareIcon /></div><p className="mt-3 text-xs font-semibold text-slate-300">Belum ada percakapan</p><p className="mt-1 text-[11px] leading-5 text-slate-600">Klik + untuk mulai chat atau tunggu pesan masuk.</p></div>
          : visibleChats.map((chat) => <button key={chat.jid} onClick={() => selectChat(chat)} className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${selectedChat?.jid === chat.jid ? 'bg-white/[.065]' : 'hover:bg-white/[.035]'}`}>
            <Avatar name={chat.name} online={statusByChat[chat.jid] === 'online' || statusByChat[chat.jid]?.includes('…')} />
            <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="truncate text-xs font-semibold text-slate-200">{chat.name}</p><span className="shrink-0 text-[9px] text-slate-600">{chat.lastMessageAt ? formatTime(chat.lastMessageAt) : ''}</span></div><p className="mt-1 truncate text-[10px] text-slate-500">{chat.lastMessagePreview ?? chat.jid}</p></div>
            {chat.unreadCount > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-[9px] font-bold text-[#05281d]">{chat.unreadCount}</span>}
          </button>)}
        </div>
        <div className="border-t border-border/70 px-4 py-3"><div className="flex items-center gap-2 text-[10px] text-slate-600"><ShieldCheck className="h-3.5 w-3.5 text-slate-500" /> Percakapan hanya dapat diakses admin</div></div>
      </aside>

      <section className={`${mobileChatOpen ? 'flex' : 'hidden md:flex'} min-w-0 flex-col bg-[#0a0f17]`}>
        {selectedChat ? <>
          <header className="flex min-h-[68px] items-center justify-between gap-3 border-b border-border/70 px-3 sm:px-5">
            <div className="flex min-w-0 items-center gap-3"><button onClick={() => setMobileChatOpen(false)} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 md:hidden" aria-label="Kembali ke chat"><ArrowLeft className="h-4 w-4" /></button><Avatar name={selectedChat.name} size="md" /><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-100">{selectedChat.name}</p><p className="mt-1 truncate text-[10px] text-slate-500">{presenceLabel ? <span className={presenceLabel === 'offline' ? 'text-slate-600' : 'text-brand'}>{presenceLabel}</span> : selectedChat.isGroup ? 'Grup WhatsApp' : selectedChat.jid}</p></div></div>
            <div className="flex items-center gap-1"><button className="hidden rounded-lg p-2 text-slate-600 md:block" title="Status presence dari WhatsApp"><Wifi className="h-4 w-4" /></button><button className="rounded-lg p-2 text-slate-500 transition hover:bg-white/5 hover:text-slate-200" aria-label="Opsi"><MoreHorizontal className="h-4 w-4" /></button></div>
          </header>

          {session?.status !== 'connected' && <div className="flex items-center gap-2 border-b border-amber-400/15 bg-amber-400/[.045] px-4 py-2.5 text-[11px] text-amber-100/80"><Wifi className="h-3.5 w-3.5 shrink-0 text-amber-300" />Session sedang {session?.status === 'pairing' ? 'menunggu pairing' : session?.status === 'connecting' ? 'menghubungkan' : 'terputus'}. Pesan belum dapat dikirim.</div>}

          <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-5 sm:px-6">
            {loadingMessages ? <div className="flex h-full items-center justify-center text-xs text-slate-500"><LoaderCircle className="mr-2 h-4 w-4 animate-spin text-brand" /> Memuat riwayat pesan…</div>
            : messages.length === 0 ? <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-white/[.025] text-slate-600"><MessageSquareIcon /></div><p className="mt-4 text-sm font-semibold text-slate-300">Mulai percakapan</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-600">Pesan yang dikirim dan diterima akan muncul di sini secara real-time.</p></div>
            : <div className="mx-auto flex max-w-3xl flex-col gap-3">{messages.map((message) => <MessageBubble key={message.id} message={message} />)}<div ref={bottomRef} /></div>}
          </div>

          <div className="border-t border-border/70 bg-[#0c111a] p-3 sm:p-4">
            {media && <div className="mb-3 flex items-center gap-3 rounded-xl border border-border bg-white/[.025] p-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">{media.type.startsWith('image/') ? <ImageIcon className="h-4 w-4" /> : media.type.startsWith('video/') ? <Video className="h-4 w-4" /> : media.type.startsWith('audio/') ? <AudioLines className="h-4 w-4" /> : <FileText className="h-4 w-4" />}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-200">{media.name}</p><p className="mt-0.5 text-[10px] text-slate-500">{mediaKind} · {(media.size / (1024 * 1024)).toFixed(2)} MB</p></div>
              {media.type.startsWith('audio/') && <label className="flex items-center gap-1.5 text-[10px] text-slate-400"><input type="checkbox" className="accent-emerald-400" checked={ptt} onChange={(event) => setPtt(event.target.checked)} /> Voice note</label>}
              <button onClick={() => { setMedia(null); setPtt(false); }} className="rounded-lg p-1.5 text-slate-500 hover:bg-white/5 hover:text-white" aria-label="Hapus lampiran"><X className="h-4 w-4" /></button>
            </div>}
            {recording && <div className="mb-3 flex items-center justify-between rounded-xl border border-rose-400/20 bg-rose-500/[.06] px-3 py-2 text-xs text-rose-200"><span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-rose-400" /> Merekam voice note…</span><button onClick={stopRecording} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold text-rose-200 hover:bg-rose-400/10"><StopCircle className="h-3.5 w-3.5" /> Selesai</button></div>}
            <form onSubmit={(event) => void send(event)} className="flex items-end gap-2">
              <input ref={mediaInputRef} type="file" className="hidden" accept="image/*,video/mp4,video/3gpp,audio/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip" onChange={handleFileChange} />
              <button type="button" onClick={() => mediaInputRef.current?.click()} disabled={session?.status !== 'connected' || sending || recording} className="mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/[.05] hover:text-brand disabled:opacity-40" aria-label="Lampirkan media"><Paperclip className="h-[18px] w-[18px]" /></button>
              <button type="button" onClick={() => recording ? stopRecording() : void startRecording()} disabled={session?.status !== 'connected' || sending || Boolean(media && !media.type.startsWith('audio/'))} className={`mb-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition disabled:opacity-40 ${recording ? 'bg-rose-500/10 text-rose-300' : 'text-slate-500 hover:bg-white/[.05] hover:text-brand'}`} aria-label={recording ? 'Hentikan rekaman' : 'Rekam voice note'}>{recording ? <StopCircle className="h-[18px] w-[18px]" /> : <Mic className="h-[18px] w-[18px]" />}</button>
              <div className="relative flex-1"><textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleComposerKey} disabled={session?.status !== 'connected' || sending || recording} placeholder={session?.status === 'connected' ? 'Tulis pesan… (Enter untuk kirim)' : 'Session belum terhubung'} rows={1} className="max-h-32 min-h-10 w-full resize-y rounded-xl border border-border bg-[#080c13] px-3.5 py-2.5 pr-9 text-xs leading-5 text-slate-100 outline-none placeholder:text-slate-600 focus:border-brand/50 disabled:opacity-50" /><Smile className="pointer-events-none absolute right-3 top-3 h-3.5 w-3.5 text-slate-700" /></div>
              <Button type="submit" size="icon" className="mb-0.5 h-10 w-10 shrink-0 rounded-xl" disabled={sending || session?.status !== 'connected' || (!draft.trim() && !media) || recording} aria-label="Kirim pesan">{sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            </form>
            <p className="mt-2 pl-12 text-[9px] text-slate-700">Enter kirim · Shift + Enter baris baru · Maks. unggah {50} MB</p>
          </div>
        </> : <div className="flex flex-1 flex-col items-center justify-center px-6 text-center"><div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-white/[.025] text-slate-600"><MessageSquareIcon /></div><p className="mt-4 text-sm font-semibold text-slate-300">Pilih percakapan</p><p className="mt-1 text-xs text-slate-600">Pilih chat di sebelah kiri atau mulai chat baru.</p></div>}
      </section>
    </div>
  </div>;
}

function Avatar({ name, size = 'sm', online = false }: { name: string; size?: 'sm' | 'md'; online?: boolean }) {
  const sizeClass = size === 'md' ? 'h-10 w-10 text-xs' : 'h-10 w-10 text-[10px]';
  return <span className={`relative flex shrink-0 items-center justify-center rounded-xl border border-sky-300/10 bg-gradient-to-br from-sky-400/15 to-indigo-400/10 font-bold text-sky-100 ${sizeClass}`}>{initials(name)}{online && <span className="absolute -bottom-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-[#0c111a] bg-brand" />}</span>;
}

function MessageBubble({ message }: { message: WaMessage }) {
  const mediaSrc = assetUrl(message.mediaUrl);
  const isImage = message.messageType === 'image' || message.messageType === 'sticker';
  const isVideo = message.messageType === 'video';
  const isAudio = message.messageType === 'audio';
  const isDocument = message.messageType === 'document';
  const outgoing = message.fromMe;
  return <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
    <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 sm:max-w-[76%] ${outgoing ? 'rounded-br-md border border-emerald-400/10 bg-[#123528]' : 'rounded-bl-md border border-border/60 bg-[#141b26]'}`}>
      {mediaSrc && isImage && <a href={mediaSrc} target="_blank" rel="noreferrer"><img src={mediaSrc} alt={message.fileName ?? (message.messageType === 'sticker' ? 'Stiker' : 'Gambar')} className="mb-2 max-h-[320px] max-w-full rounded-xl object-cover" /></a>}
      {mediaSrc && isVideo && <video src={mediaSrc} controls className="mb-2 max-h-[320px] max-w-full rounded-xl" />}
      {mediaSrc && isAudio && <div className="mb-2 flex min-w-[190px] items-center gap-2"><AudioLines className="h-4 w-4 shrink-0 text-brand" /><audio src={mediaSrc} controls className="h-9 max-w-full" /></div>}
      {mediaSrc && isDocument && <a href={mediaSrc} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-2 rounded-xl border border-white/10 bg-black/15 p-3 text-xs text-slate-200 hover:bg-black/25"><FileText className="h-5 w-5 shrink-0 text-brand" /><span className="max-w-[210px] truncate">{message.fileName ?? 'Dokumen'}</span></a>}
      {!mediaSrc && ['image', 'video', 'audio', 'document', 'sticker'].includes(message.messageType) && <p className="mb-1 text-[10px] italic text-slate-500">Lampiran belum tersedia di penyimpanan.</p>}
      {message.text && <p className="whitespace-pre-wrap break-words text-[13px] leading-[1.55] text-slate-100">{message.text}</p>}
      {!message.text && !mediaSrc && message.messageType !== 'text' && <p className="text-xs text-slate-400">[{message.messageType}]</p>}
      <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-[9px] ${outgoing ? 'text-emerald-100/40' : 'text-slate-600'}`}><span>{formatTime(message.timestamp)}</span>{outgoing && (Number(message.status) >= 3 ? <CheckCheck className="h-3 w-3 text-sky-300" /> : <Check className="h-3 w-3" />)}</div>
    </div>
  </div>;
}

function MessageSquareIcon() {
  return <MessageSquare className="h-5 w-5" />;
}
