import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { AnyMessageContent } from '@whiskeysockets/baileys';
import { env } from '../config/env.js';
import { prisma } from '../services/prisma.js';
import { sessionManager } from '../services/baileys-manager.js';
import { messageService } from '../services/message-service.js';
import { AppError } from '../utils/errors.js';
import { allowedMimeTypes, createMediaFilename, extensionForMime, mediaPath, removeMediaFile } from '../utils/media.js';
import { logger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const sendSchema = z.object({
  sessionId: z.string().min(1).max(100),
  chatJid: z.string().min(1).max(200),
  text: z.string().max(4000).optional().default(''),
  ptt: z.union([z.literal('true'), z.literal('false'), z.boolean()]).optional().default(false)
});

function getOriginalName(originalname: string): string {
  const basename = path.basename(originalname).replace(/[\\/]/g, '_').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (basename || 'attachment').slice(0, 180);
}

export const uploadMedia = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, env.UPLOAD_DIR),
    filename: (_req, file, callback) => {
      const extension = extensionForMime(file.mimetype);
      callback(null, `${randomUUID()}${extension}`);
    }
  }),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype.toLowerCase().split(';')[0]?.trim() ?? '')) {
      callback(new AppError(`Tipe file ${file.mimetype || 'tidak dikenal'} tidak didukung.`, 415, 'UNSUPPORTED_MEDIA_TYPE'));
      return;
    }
    callback(null, true);
  }
});

function validDirectJid(jid: string): boolean {
  const match = /^(\d{7,15})@s\.whatsapp\.net$/.exec(jid);
  return Boolean(match && !match[1]?.startsWith('0'));
}

async function normalizeVoiceNote(file: Express.Multer.File): Promise<{ filename: string; mimeType: string }> {
  if (file.mimetype.toLowerCase().split(';')[0]?.trim() === 'audio/ogg' && file.path.toLowerCase().endsWith('.ogg')) {
    return { filename: path.basename(file.path), mimeType: 'audio/ogg; codecs=opus' };
  }
  const outputFilename = createMediaFilename('audio/ogg');
  const output = mediaPath(outputFilename);
  try {
    await execFileAsync('ffmpeg', [
      '-y', '-i', file.path, '-vn', '-c:a', 'libopus', '-b:a', '32k', '-vbr', 'on', '-ac', '1', '-ar', '48000', output
    ], { timeout: 90_000, maxBuffer: 2 * 1024 * 1024 });
    const filename = outputFilename;
    await removeMediaFile(path.basename(file.path));
    return { filename, mimeType: 'audio/ogg; codecs=opus' };
  } catch (error) {
    await removeMediaFile(path.basename(file.path));
    await removeMediaFile(path.basename(output));
    logger.warn({ err: error }, 'Konversi voice note gagal; pastikan ffmpeg tersedia.');
    throw new AppError('Konversi voice note gagal. Pastikan ffmpeg terpasang, atau unggah file OGG/Opus.', 422, 'VOICE_NOTE_CONVERSION_FAILED');
  }
}

export async function sendMessage(req: Request, res: Response): Promise<void> {
  const input = sendSchema.parse(req.body);
  const text = input.text.trim();
  const isPtt = input.ptt === true || input.ptt === 'true';
  const uploaded = req.file;

  if (!text && !uploaded) throw new AppError('Pesan teks atau file media harus diisi.', 400, 'EMPTY_MESSAGE');
  if (isPtt && (!uploaded || !uploaded.mimetype.startsWith('audio/'))) {
    if (uploaded) await removeMediaFile(path.basename(uploaded.path));
    throw new AppError('Voice note memerlukan file audio.', 400, 'INVALID_VOICE_NOTE');
  }

  const session = await prisma.session.findUnique({ where: { id: input.sessionId } });
  if (!session) {
    if (uploaded) await removeMediaFile(path.basename(uploaded.path));
    throw new AppError('Session tidak ditemukan.', 404, 'SESSION_NOT_FOUND');
  }
  const socket = sessionManager.getSocket(input.sessionId);
  if (!socket) {
    if (uploaded) await removeMediaFile(path.basename(uploaded.path));
    throw new AppError('WhatsApp session belum terhubung.', 409, 'SESSION_NOT_CONNECTED');
  }

  const existingChat = await prisma.chat.findUnique({ where: { sessionId_jid: { sessionId: input.sessionId, jid: input.chatJid } } });
  if (!existingChat && !validDirectJid(input.chatJid)) {
    if (uploaded) await removeMediaFile(path.basename(uploaded.path));
    throw new AppError('Chat tidak valid. Nomor baru harus berupa JID WhatsApp personal yang valid.', 400, 'INVALID_CHAT');
  }

  let storedFilename = uploaded ? path.basename(uploaded.path) : null;
  let mimeType = uploaded?.mimetype ?? null;
  const safeFileName = uploaded ? getOriginalName(uploaded.originalname) : null;
  let content: AnyMessageContent;

  try {
    if (!uploaded) {
      content = { text };
    } else {
      if (isPtt) {
        const converted = await normalizeVoiceNote(uploaded);
        storedFilename = converted.filename;
        mimeType = converted.mimeType;
      }
      const filePath = mediaPath(storedFilename as string);
      const caption = text || undefined;
      if (mimeType?.startsWith('image/')) {
        content = { image: { url: filePath }, mimetype: mimeType, caption };
      } else if (mimeType?.startsWith('video/')) {
        content = { video: { url: filePath }, mimetype: mimeType, caption };
      } else if (mimeType?.startsWith('audio/')) {
        content = { audio: { url: filePath }, mimetype: mimeType, ptt: isPtt };
      } else {
        content = { document: { url: filePath }, mimetype: mimeType ?? 'application/octet-stream', fileName: safeFileName ?? 'attachment', caption };
      }
    }

    const waMessage = await socket.sendMessage(input.chatJid, content);
    if (!waMessage) throw new AppError('WhatsApp tidak mengembalikan pesan terkirim.', 502, 'WHATSAPP_SEND_FAILED');
    const message = await messageService.persistSentMessage(input.sessionId, waMessage, storedFilename, mimeType, safeFileName);
    res.status(201).json({ message });
  } catch (error) {
    if (storedFilename) await removeMediaFile(storedFilename);
    if (error instanceof AppError) throw error;
    logger.error({ err: error, sessionId: input.sessionId, chatJid: input.chatJid }, 'Gagal mengirim pesan WhatsApp');
    throw new AppError('Pesan gagal dikirim. Periksa koneksi WhatsApp lalu coba lagi.', 502, 'WHATSAPP_SEND_FAILED');
  }
}

const historyQuerySchema = z.object({
  chatJid: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  before: z.string().datetime().optional()
});

export async function getMessages(req: Request, res: Response): Promise<void> {
  const query = historyQuerySchema.parse(req.query);
  const session = await prisma.session.findUnique({ where: { id: req.params.sessionId }, select: { id: true } });
  if (!session) throw new AppError('Session tidak ditemukan.', 404, 'SESSION_NOT_FOUND');
  const messages = await prisma.message.findMany({
    where: {
      sessionId: session.id,
      ...(query.chatJid ? { chatJid: query.chatJid } : {}),
      ...(query.before ? { timestamp: { lt: new Date(query.before) } } : {})
    },
    orderBy: { timestamp: 'desc' },
    take: query.limit
  });
  if (query.chatJid) await messageService.markChatRead(session.id, query.chatJid);
  res.json({ messages: messages.reverse().map((message) => ({
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
  })) });
}

export async function getChats(req: Request, res: Response): Promise<void> {
  const session = await prisma.session.findUnique({ where: { id: req.params.sessionId }, select: { id: true } });
  if (!session) throw new AppError('Session tidak ditemukan.', 404, 'SESSION_NOT_FOUND');
  const chats = await prisma.chat.findMany({
    where: { sessionId: session.id },
    orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
    take: 500
  });
  res.json({ chats });
}
