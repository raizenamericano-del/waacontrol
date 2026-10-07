import { AppError } from './errors.js';

export function normalizePhoneNumber(input: unknown): string {
  if (typeof input !== 'string') throw new AppError('Nomor WhatsApp wajib diisi.', 400, 'INVALID_PHONE');
  const digits = input.replace(/[^0-9]/g, '');
  if (!/^[1-9]\d{6,14}$/.test(digits)) {
    throw new AppError('Gunakan nomor internasional 7–15 digit, tanpa tanda +. Contoh: 6281234567890.', 400, 'INVALID_PHONE');
  }
  return digits;
}
