import type { ErrorRequestHandler } from 'express';
import multer from 'multer';
import path from 'node:path';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../utils/errors.js';
import { removeMediaFile } from '../utils/media.js';
import { logger } from '../utils/logger.js';

export const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
  if (req.file?.path) void removeMediaFile(path.basename(req.file.path));
  if (res.headersSent) return;

  if (error instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Data yang dikirim tidak valid.', details: error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })) }
    });
    return;
  }

  if (error instanceof SyntaxError && 'status' in error && (error as SyntaxError & { status?: number }).status === 400) {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Body JSON tidak valid.' } });
    return;
  }

  if (error instanceof multer.MulterError) {
    const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    res.status(status).json({ error: { code: error.code, message: error.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file melebihi batas unggah.' : error.message } });
    return;
  }

  if (error instanceof AppError) {
    if (error.statusCode >= 500) logger.error({ err: error, method: req.method, path: req.path }, 'Request gagal');
    res.status(error.statusCode).json({ error: { code: error.code, message: error.expose ? error.message : 'Terjadi kesalahan internal.' } });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      res.status(409).json({ error: { code: 'CONFLICT', message: 'Data dengan nilai tersebut sudah ada.' } });
      return;
    }
    if (error.code === 'P2025') {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Data tidak ditemukan.' } });
      return;
    }
  }

  logger.error({ err: error, method: req.method, path: req.path }, 'Unhandled request error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan internal pada server.' } });
};
