import type { Request, Response } from 'express';
import path from 'node:path';
import { stat } from 'node:fs/promises';
import { prisma } from '../services/prisma.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

const FILENAME_PATTERN = /^[a-f0-9-]{36}\.(?:jpg|png|webp|mp4|3gp|ogg|opus|webm|mp3|m4a|wav|pdf|txt|csv|zip|doc|docx|xls|xlsx|ppt|pptx|bin)$/i;

export async function getMedia(req: Request, res: Response): Promise<void> {
  const filename = req.params.filename;
  if (!FILENAME_PATTERN.test(filename) || path.basename(filename) !== filename) {
    throw new AppError('File tidak ditemukan.', 404, 'MEDIA_NOT_FOUND');
  }
  const message = await prisma.message.findFirst({ where: { mediaFilename: filename }, select: { mimeType: true, fileName: true } });
  if (!message) throw new AppError('File tidak ditemukan.', 404, 'MEDIA_NOT_FOUND');
  const fullPath = path.join(env.UPLOAD_DIR, filename);
  await stat(fullPath).catch(() => { throw new AppError('File tidak ditemukan.', 404, 'MEDIA_NOT_FOUND'); });
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=3600');
  const mimeType = message.mimeType ?? 'application/octet-stream';
  const inline = mimeType.startsWith('image/') || mimeType.startsWith('audio/') || mimeType.startsWith('video/');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encodeURIComponent(message.fileName ?? filename)}"`);
  res.type(mimeType);
  res.sendFile(fullPath);
}
