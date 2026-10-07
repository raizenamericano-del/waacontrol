import type { RequestHandler } from 'express';
import { env } from '../config/env.js';

const allowedOrigins = new Set(env.CORS_ORIGINS);

export const originGuard: RequestHandler = (req, res, next) => {
  const origin = req.get('origin');
  if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
    next();
    return;
  }
  res.status(403).json({ error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin tidak diizinkan.' } });
};
