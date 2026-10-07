export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'pairing';

export interface SafeSession {
  id: string;
  phoneNumber: string;
  status: SessionStatus;
  lastConnectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MessageDto {
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
  timestamp: Date;
}
