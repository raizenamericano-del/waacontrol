import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

export const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 500,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Terlalu banyak request. Coba lagi beberapa saat.' } }
});

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'LOGIN_RATE_LIMITED', message: 'Terlalu banyak percobaan login. Coba lagi dalam 15 menit.' } }
});

export const sendRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.username ?? ipKeyGenerator(req.ip ?? 'unknown'),
  message: { error: { code: 'SEND_RATE_LIMITED', message: 'Batas pengiriman tercapai. Tunggu sebentar sebelum mengirim lagi.' } }
});
