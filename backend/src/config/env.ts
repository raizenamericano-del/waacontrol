import path from 'node:path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Resolve from this module so paths stay correct whether launched via npm workspace or directly.
const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../');
// Load the repo-level .env for monorepo use, then allow backend/.env to fill missing values.
dotenv.config({ path: path.resolve(backendRoot, '../.env'), override: false });
dotenv.config({ path: path.resolve(backendRoot, '.env'), override: false });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DB_PROVIDER: z.enum(['sqlite', 'postgresql', 'postgres']).default('sqlite'),
  DATABASE_URL: z.string().min(1).default('file:../data/dev.db'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET harus memiliki minimal 32 karakter.'),
  JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/i, 'JWT_EXPIRES_IN harus berformat seperti 30m, 12h, atau 7d.').default('12h'),
  ADMIN_USERNAME: z.string().min(1).default('admin'),
  ADMIN_PASSWORD: z.string().min(12, 'ADMIN_PASSWORD harus memiliki minimal 12 karakter.'),
  AUTH_COOKIE_NAME: z.string().min(1).default('wa_admin'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),
  AUTH_DIR: z.string().default('./data/auth'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(250).default(50),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  BAILEYS_LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('warn')
}).superRefine((data, context) => {
  if (data.NODE_ENV !== 'production') return;
  if (data.DB_PROVIDER === 'sqlite') context.addIssue({ code: z.ZodIssueCode.custom, path: ['DB_PROVIDER'], message: 'Production wajib memakai PostgreSQL (DB_PROVIDER=postgresql).' });
  if (data.JWT_SECRET.toLowerCase().includes('replace-this')) context.addIssue({ code: z.ZodIssueCode.custom, path: ['JWT_SECRET'], message: 'Ganti JWT_SECRET contoh dengan secret acak yang unik.' });
  if (data.ADMIN_PASSWORD === 'ChangeThisLocalPassword123!') context.addIssue({ code: z.ZodIssueCode.custom, path: ['ADMIN_PASSWORD'], message: 'Ganti password contoh sebelum production.' });
  if (!data.CORS_ORIGINS.trim() || data.CORS_ORIGINS.split(',').some((origin) => origin.trim().includes('localhost'))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['CORS_ORIGINS'], message: 'Atur CORS_ORIGINS ke origin frontend HTTPS production.' });
  }
  if (!path.isAbsolute(data.AUTH_DIR)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['AUTH_DIR'], message: 'AUTH_DIR harus berupa path absolut persistent volume.' });
  if (!path.isAbsolute(data.UPLOAD_DIR)) context.addIssue({ code: z.ZodIssueCode.custom, path: ['UPLOAD_DIR'], message: 'UPLOAD_DIR harus berupa path absolut persistent volume.' });
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `- ${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Konfigurasi environment tidak valid:\n${details}`);
}

const raw = parsed.data;
const resolveDir = (value: string) => path.isAbsolute(value) ? value : path.resolve(backendRoot, value);

export const env = {
  ...raw,
  DB_PROVIDER: raw.DB_PROVIDER === 'postgres' ? 'postgresql' as const : raw.DB_PROVIDER,
  AUTH_DIR: resolveDir(raw.AUTH_DIR),
  UPLOAD_DIR: resolveDir(raw.UPLOAD_DIR),
  CORS_ORIGINS: raw.CORS_ORIGINS.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean),
  COOKIE_SECURE: raw.NODE_ENV === 'production' || raw.COOKIE_SAME_SITE === 'none'
};

export type AppEnv = typeof env;
