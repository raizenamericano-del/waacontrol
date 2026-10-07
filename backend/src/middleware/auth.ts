import type { RequestHandler } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

export interface AuthTokenPayload extends JwtPayload {
  username: string;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const cookieToken = req.cookies?.[env.AUTH_COOKIE_NAME] as string | undefined;
  const authorization = req.get('authorization');
  const bearerToken = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;
  const token = cookieToken || bearerToken;

  if (!token) {
    next(new AppError('Silakan login untuk melanjutkan.', 401, 'UNAUTHENTICATED'));
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET);
    if (typeof payload === 'string' || typeof payload.username !== 'string') {
      throw new Error('Token payload tidak valid.');
    }
    req.user = { username: payload.username };
    next();
  } catch {
    next(new AppError('Sesi login tidak valid atau sudah berakhir.', 401, 'UNAUTHENTICATED'));
  }
};
