import type { Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma.js';
import { sessionManager } from '../services/baileys-manager.js';
import { AppError } from '../utils/errors.js';
import { normalizePhoneNumber } from '../utils/phone.js';
import { emitToAdmin } from '../socket/index.js';
import { removeMediaFile } from '../utils/media.js';

const phoneSchema = z.object({ phoneNumber: z.string().min(1).max(40) });
const verifySchema = z.object({ pairingCode: z.string().trim().max(32).optional() });

export async function listSessions(_req: Request, res: Response): Promise<void> {
  const sessions = await prisma.session.findMany({ orderBy: { createdAt: 'desc' } });
  const live = await Promise.all(sessions.map((session) => sessionManager.getStatus(session.id)));
  res.json({ sessions: live });
}

export async function createSession(req: Request, res: Response): Promise<void> {
  const input = phoneSchema.parse(req.body);
  const phoneNumber = normalizePhoneNumber(input.phoneNumber);
  const existing = await prisma.session.findUnique({ where: { phoneNumber } });
  if (existing) throw new AppError('Nomor ini sudah terdaftar sebagai session.', 409, 'SESSION_EXISTS');

  const session = await prisma.session.create({ data: { phoneNumber, status: 'connecting' } });
  try {
    await sessionManager.start(session.id);
  } catch (error) {
    await prisma.session.update({ where: { id: session.id }, data: { status: 'disconnected' } }).catch(() => undefined);
    throw error;
  }
  const fresh = await sessionManager.getStatus(session.id);
  emitToAdmin('session:update', { session: fresh });
  res.status(201).json({ session: fresh });
}

export async function requestPairingCode(req: Request, res: Response): Promise<void> {
  const result = await sessionManager.requestPairingCode(req.params.id);
  const session = await sessionManager.getStatus(req.params.id);
  res.json({ pairingCode: result.pairingCode, status: result.status, session });
}

export async function verifyPairing(req: Request, res: Response): Promise<void> {
  const input = verifySchema.parse(req.body ?? {});
  const result = await sessionManager.verifyPairing(req.params.id, input.pairingCode);
  const session = await sessionManager.getStatus(req.params.id);
  res.json({ ...result, session, message: result.connected ? 'Session WhatsApp sudah terhubung.' : 'Kode diterima. Menunggu WhatsApp mengonfirmasi tautan perangkat.' });
}

export async function getSessionStatus(req: Request, res: Response): Promise<void> {
  const session = await sessionManager.getStatus(req.params.id);
  res.json({ session });
}

export async function deleteSession(req: Request, res: Response): Promise<void> {
  const session = await prisma.session.findUnique({ where: { id: req.params.id } });
  if (!session) throw new AppError('Session tidak ditemukan.', 404, 'SESSION_NOT_FOUND');
  const media = await prisma.message.findMany({ where: { sessionId: session.id }, select: { mediaFilename: true } });
  await sessionManager.stop(session.id, true);
  await Promise.all(media.map((item) => removeMediaFile(item.mediaFilename)));
  await prisma.session.delete({ where: { id: session.id } });
  res.status(204).end();
}
