import path from 'node:path';
import { chmod, mkdir, readdir, rm } from 'node:fs/promises';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { messageService } from './message-service.js';
import { emitToAdmin } from '../socket/index.js';
import { AppError, errorMessage } from '../utils/errors.js';
import { logger, baileysLogger } from '../utils/logger.js';
import type { SafeSession, SessionStatus } from '../types/index.js';

interface SessionRuntime {
  id: string;
  phoneNumber: string;
  socket: WASocket | null;
  status: SessionStatus;
  pairingCode: string | null;
  reconnectAttempts: number;
  reconnectTimer: NodeJS.Timeout | null;
  starting: boolean;
  disposed: boolean;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeSession(session: {
  id: string;
  phoneNumber: string;
  status: string;
  lastConnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): SafeSession {
  return {
    id: session.id,
    phoneNumber: session.phoneNumber,
    status: session.status as SessionStatus,
    lastConnectedAt: session.lastConnectedAt,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt
  };
}

export class BaileysSessionManager {
  private readonly runtimes = new Map<string, SessionRuntime>();
  private shuttingDown = false;

  async start(sessionId: string): Promise<void> {
    this.shuttingDown = false;
    const existing = this.runtimes.get(sessionId);
    if (existing) return;

    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('Session tidak ditemukan.', 404, 'SESSION_NOT_FOUND');

    const runtime: SessionRuntime = {
      id: session.id,
      phoneNumber: session.phoneNumber,
      socket: null,
      status: session.status as SessionStatus,
      pairingCode: null,
      reconnectAttempts: 0,
      reconnectTimer: null,
      starting: false,
      disposed: false
    };
    this.runtimes.set(sessionId, runtime);
    await this.openSocket(runtime);
  }

  private async openSocket(runtime: SessionRuntime): Promise<void> {
    if (runtime.disposed || runtime.starting || this.shuttingDown) return;
    runtime.starting = true;
    try {
      const authPath = path.join(env.AUTH_DIR, runtime.id);
      await mkdir(authPath, { recursive: true, mode: 0o700 });
      await chmod(authPath, 0o700).catch(() => undefined);
      await this.secureAuthFiles(authPath);
      const { state, saveCreds } = await useMultiFileAuthState(authPath);
      const socket = makeWASocket({
        auth: state,
        logger: baileysLogger,
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        emitOwnEvents: true,
        fireInitQueries: true
      });
      runtime.socket = socket;
      runtime.starting = false;
      await chmod(authPath, 0o700).catch(() => undefined);
      logger.info({ sessionId: runtime.id }, 'Baileys socket dibuat');

      socket.ev.on('creds.update', () => {
        void saveCreds().then(() => chmod(path.join(authPath, 'creds.json'), 0o600)).catch((error: unknown) => logger.error({ err: error, sessionId: runtime.id }, 'Gagal menyimpan auth state'));
      });
      socket.ev.on('connection.update', (update) => {
        void this.handleConnectionUpdate(runtime, socket, update).catch((error: unknown) => logger.error({ err: error, sessionId: runtime.id }, 'Gagal memproses connection.update'));
      });
      socket.ev.on('messages.upsert', ({ messages, type }) => {
        void messageService.handleUpsert(runtime.id, socket, messages, type).catch((error: unknown) => logger.error({ err: error, sessionId: runtime.id }, 'Gagal memproses messages.upsert'));
      });
      socket.ev.on('messages.update', (updates) => {
        void messageService.handleMessageUpdates(runtime.id, updates).catch((error: unknown) => logger.error({ err: error, sessionId: runtime.id }, 'Gagal memproses messages.update'));
      });
      socket.ev.on('presence.update', (presence) => {
        emitToAdmin('presence:update', { sessionId: runtime.id, ...presence });
      });
      socket.ev.on('chats.upsert', (chats) => {
        void messageService.handleChatsUpsert(runtime.id, chats).catch((error: unknown) => logger.error({ err: error, sessionId: runtime.id }, 'Gagal memproses chats.upsert'));
      });
      socket.ev.on('chats.update', (updates) => {
        void messageService.handleChatUpdates(runtime.id, updates).catch((error: unknown) => logger.error({ err: error, sessionId: runtime.id }, 'Gagal memproses chats.update'));
      });
      socket.ev.on('contacts.upsert', (contacts) => {
        void messageService.handleContactsUpsert(runtime.id, contacts).catch((error: unknown) => logger.error({ err: error, sessionId: runtime.id }, 'Gagal memproses contacts.upsert'));
      });
    } catch (error) {
      runtime.starting = false;
      runtime.socket = null;
      logger.error({ err: error, sessionId: runtime.id }, 'Gagal memulai Baileys socket');
      await this.setStatus(runtime, 'disconnected');
      this.scheduleReconnect(runtime);
    }
  }

  private async secureAuthFiles(authPath: string): Promise<void> {
    const entries = await readdir(authPath, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => chmod(path.join(authPath, entry.name), 0o600).catch(() => undefined)));
  }

  private async handleConnectionUpdate(
    runtime: SessionRuntime,
    socket: WASocket,
    update: { connection?: 'open' | 'connecting' | 'close'; lastDisconnect?: { error: Boom | Error | undefined } }
  ): Promise<void> {
    if (runtime.disposed || runtime.socket !== socket) return;

    if (update.connection === 'connecting') {
      await this.setStatus(runtime, runtime.pairingCode ? 'pairing' : 'connecting');
      return;
    }

    if (update.connection === 'open') {
      runtime.reconnectAttempts = 0;
      if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
      await prisma.session.update({ where: { id: runtime.id }, data: { status: 'connected', lastConnectedAt: new Date() } });
      runtime.status = 'connected';
      await this.emitSession(runtime.id);
      logger.info({ sessionId: runtime.id }, 'WhatsApp session connected');
      return;
    }

    if (update.connection === 'close') {
      const error = update.lastDisconnect?.error;
      const statusCode = error instanceof Boom
        ? error.output.statusCode
        : typeof error === 'object' && error !== null && 'output' in error
          ? Number((error as { output?: { statusCode?: number } }).output?.statusCode)
          : undefined;
      runtime.socket = null;
      const shouldReconnect = !this.shuttingDown && !runtime.disposed && statusCode !== DisconnectReason.loggedOut && statusCode !== DisconnectReason.badSession && statusCode !== DisconnectReason.connectionReplaced && statusCode !== DisconnectReason.forbidden && statusCode !== DisconnectReason.multideviceMismatch;
      if (shouldReconnect) {
        await this.setStatus(runtime, runtime.pairingCode ? 'pairing' : 'connecting');
        logger.warn({ sessionId: runtime.id, statusCode, error: errorMessage(error) }, 'WhatsApp terputus; reconnect dijadwalkan');
        this.scheduleReconnect(runtime);
      } else {
        runtime.pairingCode = null;
        await this.setStatus(runtime, 'disconnected');
        logger.warn({ sessionId: runtime.id, statusCode, error: errorMessage(error) }, 'WhatsApp session disconnected');
      }
    }
  }

  private scheduleReconnect(runtime: SessionRuntime): void {
    if (runtime.disposed || this.shuttingDown || runtime.reconnectTimer) return;
    runtime.reconnectAttempts += 1;
    const waitMs = Math.min(1000 * (2 ** Math.min(runtime.reconnectAttempts - 1, 5)), 30_000);
    runtime.reconnectTimer = setTimeout(() => {
      runtime.reconnectTimer = null;
      if (this.runtimes.get(runtime.id) === runtime && !runtime.disposed && !this.shuttingDown) {
        void this.openSocket(runtime);
      }
    }, waitMs);
    runtime.reconnectTimer.unref?.();
  }

  private async setStatus(runtime: SessionRuntime, status: SessionStatus): Promise<void> {
    runtime.status = status;
    await prisma.session.updateMany({ where: { id: runtime.id }, data: { status } }).catch((error: unknown) => {
      logger.warn({ err: error, sessionId: runtime.id }, 'Status session tidak dapat disimpan');
    });
    await this.emitSession(runtime.id);
  }

  private async emitSession(sessionId: string): Promise<void> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } }).catch(() => null);
    if (!session) return;
    const runtime = this.runtimes.get(sessionId);
    emitToAdmin('session:update', {
      session: { ...sanitizeSession(session), status: runtime?.status ?? session.status }
    });
  }

  async requestPairingCode(sessionId: string): Promise<{ pairingCode: string; status: SessionStatus }> {
    let runtime = this.runtimes.get(sessionId);
    if (!runtime) {
      await this.start(sessionId);
      runtime = this.runtimes.get(sessionId);
    }
    if (!runtime) throw new AppError('Socket session belum siap.', 503, 'SESSION_NOT_READY');
    if (runtime.status === 'connected') throw new AppError('Nomor ini sudah terhubung.', 409, 'ALREADY_CONNECTED');
    if (runtime.pairingCode) return { pairingCode: runtime.pairingCode, status: runtime.status };
    if (!runtime.socket && runtime.status === 'disconnected' && !runtime.starting && !runtime.reconnectTimer) {
      runtime.disposed = true;
      this.runtimes.delete(sessionId);
      await rm(path.join(env.AUTH_DIR, sessionId), { recursive: true, force: true }).catch(() => undefined);
      await prisma.session.updateMany({ where: { id: sessionId }, data: { status: 'connecting' } });
      await this.start(sessionId);
      runtime = this.runtimes.get(sessionId);
      if (!runtime) throw new AppError('Socket session gagal dibuat ulang.', 503, 'SESSION_NOT_READY');
    }
    if (!runtime.socket) {
      await this.waitForSocket(runtime, 15_000);
    }
    const socket = runtime.socket;
    if (!socket) throw new AppError('Koneksi WhatsApp belum siap. Coba generate pairing code lagi.', 503, 'SESSION_NOT_READY');

    try {
      await socket.waitForSocketOpen();
      const pairingCode = await socket.requestPairingCode(runtime.phoneNumber);
      runtime.pairingCode = pairingCode;
      await this.setStatus(runtime, 'pairing');
      logger.info({ sessionId, phoneNumber: runtime.phoneNumber }, 'Pairing code berhasil diminta');
      return { pairingCode, status: runtime.status };
    } catch (error) {
      logger.warn({ err: error, sessionId }, 'Permintaan pairing code gagal');
      throw new AppError(`Tidak dapat meminta pairing code: ${errorMessage(error)}`, 502, 'PAIRING_REQUEST_FAILED');
    }
  }

  private async waitForSocket(runtime: SessionRuntime, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!runtime.socket && Date.now() < deadline && !runtime.disposed) await delay(150);
  }

  async verifyPairing(sessionId: string, submittedCode?: string): Promise<{ valid: boolean; status: SessionStatus; connected: boolean }> {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime) throw new AppError('Session tidak aktif di server ini.', 404, 'SESSION_NOT_FOUND');
    if (submittedCode) {
      const normalized = submittedCode.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const expected = runtime.pairingCode?.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!expected || normalized !== expected) throw new AppError('Kode konfirmasi tidak cocok dengan pairing code yang dibuat.', 400, 'PAIRING_CODE_MISMATCH');
    }
    return { valid: true, status: runtime.status, connected: runtime.status === 'connected' };
  }

  getSocket(sessionId: string): WASocket | null {
    const runtime = this.runtimes.get(sessionId);
    if (!runtime || runtime.status !== 'connected' || !runtime.socket) return null;
    return runtime.socket;
  }

  async getStatus(sessionId: string): Promise<SafeSession> {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError('Session tidak ditemukan.', 404, 'SESSION_NOT_FOUND');
    const runtime = this.runtimes.get(sessionId);
    return { ...sanitizeSession(session), status: runtime?.status ?? session.status as SessionStatus };
  }

  async stop(sessionId: string, unlink = false): Promise<void> {
    const runtime = this.runtimes.get(sessionId);
    if (runtime) {
      runtime.disposed = true;
      if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
      this.runtimes.delete(sessionId);
      const socket = runtime.socket;
      runtime.socket = null;
      if (socket) {
        try {
          if (unlink) await socket.logout();
          else await socket.end(undefined);
        } catch (error) {
          logger.warn({ err: error, sessionId }, 'Penutupan socket mengembalikan error');
        }
      }
    }
    await rm(path.join(env.AUTH_DIR, sessionId), { recursive: true, force: true }).catch(() => undefined);
    if (!unlink) await prisma.session.updateMany({ where: { id: sessionId }, data: { status: 'disconnected' } });
    emitToAdmin('session:deleted', { sessionId });
  }

  async restorePersistedSessions(): Promise<void> {
    const sessions = await prisma.session.findMany({ orderBy: { createdAt: 'asc' } });
    for (const session of sessions) {
      void this.start(session.id).catch((error: unknown) => logger.error({ err: error, sessionId: session.id }, 'Restore session gagal'));
    }
    logger.info({ count: sessions.length }, 'Restore session tersimpan dijadwalkan');
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    const runtimes = [...this.runtimes.values()];
    for (const runtime of runtimes) {
      runtime.disposed = true;
      if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
      try {
        await runtime.socket?.end(undefined);
      } catch (error) {
        logger.warn({ err: error, sessionId: runtime.id }, 'Socket shutdown error');
      }
    }
    this.runtimes.clear();
  }
}

export const sessionManager = new BaileysSessionManager();
