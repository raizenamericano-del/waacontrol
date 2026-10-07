export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'pairing';

export interface WaSession {
  id: string;
  phoneNumber: string;
  status: SessionStatus;
  lastConnectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaChat {
  id: string;
  sessionId: string;
  jid: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  updatedAt: string;
}

export interface WaMessage {
  id: string;
  sessionId: string;
  chatJid: string;
  waMessageId: string;
  fromMe: boolean;
  senderJid: string | null;
  messageType: string;
  text: string | null;
  mediaUrl: string | null;
  mimeType: string | null;
  fileName: string | null;
  status: string;
  timestamp: string;
}

export interface ApiUser {
  username: string;
}
