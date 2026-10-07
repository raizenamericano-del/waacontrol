import { timingSafeEqual } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function verifyAdminCredentials(username: unknown, password: unknown): Promise<string> {
  if (typeof username !== 'string' || typeof password !== 'string') {
    throw new AppError('Username dan password wajib diisi.', 400, 'INVALID_CREDENTIALS');
  }
  const usernameMatches = constantTimeEqual(username, env.ADMIN_USERNAME);
  const configuredPassword = env.ADMIN_PASSWORD;
  let passwordMatches = false;
  if (configuredPassword.startsWith('$2a$') || configuredPassword.startsWith('$2b$') || configuredPassword.startsWith('$2y$')) {
    passwordMatches = await bcrypt.compare(password, configuredPassword);
  } else {
    passwordMatches = constantTimeEqual(password, configuredPassword);
  }
  if (!usernameMatches || !passwordMatches) throw new AppError('Username atau password salah.', 401, 'INVALID_CREDENTIALS');
  return username;
}

export function createAuthToken(username: string): string {
  return jwt.sign({ username }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN.toLowerCase() as jwt.SignOptions['expiresIn'] });
}
