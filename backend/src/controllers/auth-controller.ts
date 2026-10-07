import type { Request, Response } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import { createAuthToken, verifyAdminCredentials } from '../services/auth-service.js';
import { AppError } from '../utils/errors.js';

const loginSchema = z.object({
  username: z.string().min(1).max(100),
  password: z.string().min(1).max(500)
});

function cookieMaxAge(value: string): number {
  const match = /^(\d+)([smhd])$/i.exec(value);
  if (!match) return 12 * 60 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2]?.toLowerCase();
  const multiplier = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
  return Math.min(amount * multiplier, 365 * 86_400_000);
}

const cookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  sameSite: env.COOKIE_SAME_SITE,
  path: '/',
  maxAge: cookieMaxAge(env.JWT_EXPIRES_IN)
} as const;

export async function login(req: Request, res: Response): Promise<void> {
  const credentials = loginSchema.parse(req.body);
  const username = await verifyAdminCredentials(credentials.username, credentials.password);
  const token = createAuthToken(username);
  res.cookie(env.AUTH_COOKIE_NAME, token, cookieOptions);
  res.json({ user: { username } });
}

export function logout(_req: Request, res: Response): void {
  res.clearCookie(env.AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: env.COOKIE_SAME_SITE,
    path: '/'
  });
  res.status(204).end();
}

export function me(req: Request, res: Response): void {
  if (!req.user) throw new AppError('Sesi login tidak ditemukan.', 401, 'UNAUTHENTICATED');
  res.json({ user: req.user });
}
