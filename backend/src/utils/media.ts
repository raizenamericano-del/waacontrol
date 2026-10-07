import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { env } from '../config/env.js';

const SAFE_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'video/mp4': '.mp4',
  'video/3gpp': '.3gp',
  'audio/ogg': '.ogg',
  'audio/opus': '.opus',
  'audio/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'application/octet-stream': '.bin',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'application/zip': '.zip',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx'
};

export const allowedMimeTypes = new Set(Object.keys(SAFE_EXTENSIONS));

export function extensionForMime(mimeType: string): string {
  return SAFE_EXTENSIONS[mimeType.toLowerCase().split(';')[0]?.trim() ?? ''] ?? '.bin';
}

export async function ensureStorageDirectories(): Promise<void> {
  await Promise.all([
    mkdir(env.AUTH_DIR, { recursive: true, mode: 0o700 }),
    mkdir(env.UPLOAD_DIR, { recursive: true, mode: 0o700 })
  ]);
  await Promise.all([chmod(env.AUTH_DIR, 0o700), chmod(env.UPLOAD_DIR, 0o700)]).catch(() => undefined);
}

export function createMediaFilename(mimeType: string): string {
  return `${randomUUID()}${extensionForMime(mimeType)}`;
}

export function mediaPath(filename: string): string {
  return path.join(env.UPLOAD_DIR, filename);
}

export async function removeMediaFile(filename: string | null | undefined): Promise<void> {
  if (!filename || path.basename(filename) !== filename) return;
  await rm(mediaPath(filename), { force: true }).catch(() => undefined);
}
