import type { ApiUser, WaChat, WaMessage, WaSession } from './types';

const rawApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:4000';
export const API_BASE = rawApiUrl.replace(/\/$/, '');

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!isFormData && options.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE}${path.startsWith('/') ? path : `/${path}`}`, {
    ...options,
    headers,
    credentials: 'include',
    cache: 'no-store'
  });

  if (response.status === 204) return undefined as T;
  const payload = await response.json().catch(() => ({})) as {
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    throw new ApiError(payload.error?.message ?? `Request gagal (${response.status}).`, response.status, payload.error?.code);
  }
  return payload as T;
}

export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${API_BASE}${path}`;
}

export const api = {
  me: () => apiFetch<{ user: ApiUser }>('/api/auth/me'),
  login: (username: string, password: string) => apiFetch<{ user: ApiUser }>('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password })
  }),
  logout: () => apiFetch<void>('/api/auth/logout', { method: 'POST' }),
  sessions: () => apiFetch<{ sessions: WaSession[] }>('/api/sessions'),
  sessionStatus: (id: string) => apiFetch<{ session: WaSession }>(`/api/sessions/${encodeURIComponent(id)}/status`),
  createSession: (phoneNumber: string) => apiFetch<{ session: WaSession }>('/api/sessions', {
    method: 'POST', body: JSON.stringify({ phoneNumber })
  }),
  requestPairing: (id: string) => apiFetch<{ pairingCode: string; status: WaSession['status']; session: WaSession }>(`/api/sessions/${encodeURIComponent(id)}/pairing`, { method: 'POST' }),
  verifyPairing: (id: string, pairingCode?: string) => apiFetch<{ valid: boolean; connected: boolean; status: WaSession['status']; session: WaSession; message: string }>(`/api/sessions/${encodeURIComponent(id)}/verify`, {
    method: 'POST', body: JSON.stringify(pairingCode ? { pairingCode } : {})
  }),
  deleteSession: (id: string) => apiFetch<void>(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  chats: (sessionId: string) => apiFetch<{ chats: WaChat[] }>(`/api/chats/${encodeURIComponent(sessionId)}`),
  messages: (sessionId: string, chatJid?: string) => {
    const query = chatJid ? `?chatJid=${encodeURIComponent(chatJid)}&limit=100` : '?limit=100';
    return apiFetch<{ messages: WaMessage[] }>(`/api/messages/${encodeURIComponent(sessionId)}${query}`);
  }
};
