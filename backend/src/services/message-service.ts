import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { Prisma } from '@prisma/client';
import {
  downloadMediaMessage,
  getContentType,
  normalizeMessageContent,
  type WAMessage,
  type WASocket
} from '@whiskeysockets/baileys';
import { env } from '../config/env.js';
import { prisma } from './prisma.js';
import { baileysLogger, logger } from '../utils/logger.js';
import { createMediaFilename, mediaPath, removeMediaFile } from '../utils/media.js';
import { emitToAdmin } from '../socket/index.js';
import type { MessageDto } from '../types/index.js';

const CONTENT_TYPE_MAP: Record<string, string> = {
  conversation: 'text',
  extendedTextMessage: 'text',
  imageMessage: 'image',
  videoMessage: 'video',
  documentMessage: 'document',
  audioMessage: 'audio',
  stickerMessage: 'sticker',
  contactMessage: 'contact',
  contactsArrayMessage: 'contact',
  locationMessage: 'location',
  liveLocationMessage: 'location',
  pollCreationMessage: 'poll'
};

interface ContentDetails {
  type: string;
  text: string | null;
  mimeType: string | null;
  fileName: string | null;
}

function extractDetails(message: WAMessage): ContentDetails {
  const normalized = normalizeMessageContent(message.message);
  const contentType = getContentType(normalized);
  const data = normalized as unknown as Record<string, unknown> | undefined;
  const payload = contentType && data?.[contentType] && typeof data[contentType] === 'object'
    ? data[contentType] as Record<string, unknown>
    : undefined;
  const type = contentType ? CONTENT_TYPE_MAP[contentType] ?? 'other' : 'text';

  const textCandidates = [
    typeof data?.conversation === 'string' ? data.conversation : null,
    typeof payload?.text === 'string' ? payload.text : null,
    typeof payload?.caption === 'string' ? payload.caption : null,
    typeof payload?.title === 'string' ? payload.title : null,
    typeof payload?.selectedDisplayText === 'string' ? payload.selectedDisplayText : null
  ];
  const text = textCandidates.find((candidate) => candidate !== null) ?? null;
  const mimeType = typeof payload?.mimetype === 'string' ? payload.mimetype : null;
  const fileName = typeof payload?.fileName === 'string' ? payload.fileName : null;

  return { type, text, mimeType, fileName };
}

function toDto(message: {
  id: string;
  sessionId: string;
  chatJid: string;
  waMessageId: string;
  fromMe: boolean;
  senderJid: string | null;
  messageType: string;
  text: string | null;
  mediaFilename: string | null;
  mimeType: string | null;
  fileName: string | null;
  status: string;
  timestamp: Date;
}): MessageDto {
  return {
    id: message.id,
    sessionId: message.sessionId,
    chatJid: message.chatJid,
    waMessageId: message.waMessageId,
    fromMe: message.fromMe,
    senderJid: message.senderJid,
    messageType: message.messageType,
    text: message.text,
    mediaUrl: message.mediaFilename ? `/api/media/${encodeURIComponent(message.mediaFilename)}` : null,
    mimeType: message.mimeType,
    fileName: message.fileName,
    status: message.status,
    timestamp: message.timestamp
  };
}

function timestampToDate(value: WAMessage['messageTimestamp']): Date {
  if (value === undefined || value === null) return new Date();
  const seconds = Number(value.toString());
  return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000) : new Date();
}

function safeChatName(candidate: string | null | undefined, jid: string): string {
  const clean = candidate?.trim().slice(0, 120);
  return clean || jid;
}

async function upsertChat(
  sessionId: string,
  jid: string,
  name?: string | null,
  lastMessageAt?: Date,
  preview?: string | null,
  incrementUnread = false
) {
  const nextName = safeChatName(name, jid);
  const isGroup = jid.endsWith('@g.us');
  return prisma.chat.upsert({
    where: { sessionId_jid: { sessionId, jid } },
    create: {
      sessionId,
      jid,
      name: nextName,
      isGroup,
      lastMessageAt: lastMessageAt ?? null,
      lastMessagePreview: preview ?? null,
      unreadCount: incrementUnread ? 1 : 0
    },
    update: {
      ...(nextName !== jid ? { name: nextName } : {}),
      ...(lastMessageAt ? { lastMessageAt } : {}),
      ...(preview !== undefined ? { lastMessagePreview: preview } : {}),
      ...(incrementUnread ? { unreadCount: { increment: 1 } } : {})
    }
  });
}

async function downloadIncomingMedia(message: WAMessage, socket: WASocket, mimeType: string | null): Promise<string | null> {
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;
  let filename: string | null = null;
  try {
    const stream = await downloadMediaMessage(
      message,
      'stream',
      {},
      { logger: baileysLogger, reuploadRequest: (msg) => socket.updateMediaMessage(msg) }
    );
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      totalBytes += buffer.length;
      if (totalBytes > maxBytes) {
        stream.destroy(new Error('Media exceeds configured size limit'));
        throw new Error(`Media masuk melebihi batas ${env.MAX_UPLOAD_MB} MB.`);
      }
      chunks.push(buffer);
    }
    if (chunks.length === 0) return null;
    const actualMime = mimeType ?? 'application/octet-stream';
    filename = createMediaFilename(actualMime);
    await mkdir(env.UPLOAD_DIR, { recursive: true, mode: 0o700 });
    await writeFile(mediaPath(filename), Buffer.concat(chunks), { mode: 0o600 });
    return filename;
  } catch (error) {
    if (filename) await removeMediaFile(filename);
    logger.warn({ err: error, messageId: message.key.id }, 'Media pesan masuk tidak dapat diunduh');
    return null;
  }
}

export class MessageService {
  async handleUpsert(sessionId: string, socket: WASocket, messages: WAMessage[], upsertType: string): Promise<void> {
    for (const waMessage of messages) {
      try {
        const remoteJid = waMessage.key.remoteJid ?? waMessage.key.remoteJidAlt;
        if (!remoteJid || remoteJid === 'status@broadcast' || !waMessage.message) continue;
        const details = extractDetails(waMessage);
        const isMedia = ['image', 'video', 'document', 'audio', 'sticker'].includes(details.type);
        const mediaFilename = isMedia && !waMessage.key.fromMe
          ? await downloadIncomingMedia(waMessage, socket, details.mimeType)
          : null;
        await this.persistMessage(sessionId, waMessage, details, mediaFilename, details.mimeType, details.fileName, upsertType === 'notify');
      } catch (error) {
        logger.error({ err: error, sessionId, messageId: waMessage.key.id }, 'Gagal menyimpan pesan Baileys');
      }
    }
  }

  async persistSentMessage(
    sessionId: string,
    message: WAMessage,
    mediaFilename: string | null,
    mimeType: string | null,
    fileName: string | null
  ): Promise<MessageDto> {
    const details = extractDetails(message);
    const stored = await this.persistMessage(sessionId, message, details, mediaFilename, mimeType ?? details.mimeType, fileName ?? details.fileName, false);
    return toDto(stored);
  }

  private async persistMessage(
    sessionId: string,
    waMessage: WAMessage,
    details: ContentDetails,
    mediaFilename: string | null,
    mimeType: string | null,
    fileName: string | null,
    incrementUnread: boolean
  ) {
    const chatJid = waMessage.key.remoteJid ?? waMessage.key.remoteJidAlt;
    if (!chatJid) throw new Error('Pesan tanpa remote JID tidak dapat disimpan.');
    const waMessageId = waMessage.key.id ?? `local-${randomUUID()}`;
    const fromMe = Boolean(waMessage.key.fromMe);
    const timestamp = timestampToDate(waMessage.messageTimestamp);
    const senderJid = waMessage.key.participant ?? (fromMe ? null : chatJid);
    const name = fromMe ? null : waMessage.pushName;
    const preview = details.text || `[${details.type}]`;

    await upsertChat(sessionId, chatJid, name, timestamp, preview, incrementUnread && !fromMe);

    let stored;
    let isNew = false;
    try {
      const existing = await prisma.message.findUnique({ where: { sessionId_waMessageId: { sessionId, waMessageId } } });
      if (existing) {
        stored = await prisma.message.update({
          where: { id: existing.id },
          data: {
            ...(mediaFilename && !existing.mediaFilename ? { mediaFilename } : {}),
            ...(mimeType ? { mimeType } : {}),
            ...(fileName ? { fileName } : {}),
            ...(details.text && !existing.text ? { text: details.text } : {}),
            status: fromMe ? 'sent' : existing.status
          }
        });
        if (mediaFilename && existing.mediaFilename) await removeMediaFile(mediaFilename);
      } else {
        stored = await prisma.message.create({
          data: {
            sessionId,
            chatJid,
            waMessageId,
            fromMe,
            senderJid,
            messageType: details.type,
            text: details.text,
            mediaFilename,
            mimeType,
            fileName,
            status: fromMe ? 'sent' : 'received',
            timestamp
          }
        });
        isNew = true;
      }
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await prisma.message.findUnique({ where: { sessionId_waMessageId: { sessionId, waMessageId } } });
        if (!existing) throw error;
        stored = existing;
        if (mediaFilename) await removeMediaFile(mediaFilename);
      } else {
        if (mediaFilename) await removeMediaFile(mediaFilename);
        throw error;
      }
    }

    const chat = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid: chatJid } } });
    const dto = toDto(stored);
    if (isNew) emitToAdmin('message:new', { sessionId, chatJid, message: dto, chat });
    else if (mediaFilename) emitToAdmin('message:update', { sessionId, chatJid, message: dto });
    emitToAdmin('chat:update', { sessionId, chat });
    return stored;
  }

  async handleMessageUpdates(sessionId: string, updates: Array<{ key: { id?: string | null }; update: { status?: number | null } }>): Promise<void> {
    for (const update of updates) {
      const waMessageId = update.key.id;
      if (!waMessageId || update.update.status === undefined || update.update.status === null) continue;
      const status = String(update.update.status);
      const message = await prisma.message.findFirst({ where: { sessionId, waMessageId } }).catch(() => null);
      if (!message) continue;
      await prisma.message.update({ where: { id: message.id }, data: { status } });
      emitToAdmin('message:update', { sessionId, chatJid: message.chatJid, waMessageId, status });
    }
  }

  async handleChatsUpsert(sessionId: string, chats: Array<{ id?: string | null; name?: string | null; subject?: string | null }>): Promise<void> {
    for (const chat of chats) {
      if (!chat.id || chat.id === 'status@broadcast') continue;
      const name = chat.name ?? chat.subject ?? chat.id;
      const saved = await upsertChat(sessionId, chat.id, name);
      emitToAdmin('chat:update', { sessionId, chat: saved });
    }
  }

  async handleChatUpdates(sessionId: string, updates: Array<{ id?: string | null; name?: string | null; subject?: string | null; unreadCount?: number | null }>): Promise<void> {
    for (const update of updates) {
      if (!update.id) continue;
      const chat = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid: update.id } } });
      if (!chat) continue;
      const saved = await prisma.chat.update({
        where: { id: chat.id },
        data: {
          ...(update.name || update.subject ? { name: safeChatName(update.name ?? update.subject, update.id) } : {}),
          ...(typeof update.unreadCount === 'number' ? { unreadCount: update.unreadCount } : {})
        }
      });
      emitToAdmin('chat:update', { sessionId, chat: saved });
    }
  }

  async handleContactsUpsert(sessionId: string, contacts: Array<{ id?: string | null; name?: string | null; notify?: string | null; verifiedName?: string | null }>): Promise<void> {
    for (const contact of contacts) {
      if (!contact.id) continue;
      const chat = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid: contact.id } } });
      if (!chat) continue;
      const saved = await prisma.chat.update({
        where: { id: chat.id },
        data: { name: safeChatName(contact.name ?? contact.notify ?? contact.verifiedName, contact.id) }
      });
      emitToAdmin('chat:update', { sessionId, chat: saved });
    }
  }

  async markChatRead(sessionId: string, jid: string): Promise<void> {
    const chat = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId, jid } } });
    if (!chat || chat.unreadCount === 0) return;
    const updated = await prisma.chat.update({ where: { id: chat.id }, data: { unreadCount: 0 } });
    emitToAdmin('chat:update', { sessionId, chat: updated });
  }
}

export const messageService = new MessageService();
