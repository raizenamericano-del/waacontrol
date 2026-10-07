import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let io: Server | null = null;
const originSet = new Set(env.CORS_ORIGINS);

function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator < 0) continue;
    if (segment.slice(0, separator).trim() === name) {
      return decodeURIComponent(segment.slice(separator + 1).trim());
    }
  }
  return undefined;
}

export function attachSocket(server: HttpServer): Server {
  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || originSet.has(origin.replace(/\/$/, ''))) callback(null, true);
        else callback(new Error('Socket origin tidak diizinkan.'));
      },
      credentials: true,
      methods: ['GET', 'POST']
    },
    maxHttpBufferSize: 1e6,
    transports: ['websocket', 'polling']
  });

  io.use((socket: Socket, next) => {
    const origin = socket.handshake.headers.origin;
    if (origin && !originSet.has(origin.replace(/\/$/, ''))) {
      next(new Error('Origin tidak diizinkan.'));
      return;
    }
    const token = readCookie(socket.handshake.headers.cookie, env.AUTH_COOKIE_NAME);
    if (!token) {
      next(new Error('UNAUTHENTICATED'));
      return;
    }
    try {
      const payload = jwt.verify(token, env.JWT_SECRET);
      if (typeof payload === 'string' || typeof payload.username !== 'string') {
        next(new Error('UNAUTHENTICATED'));
        return;
      }
      socket.data.username = payload.username;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  });

  io.on('connection', (socket) => {
    socket.join('admin');
    logger.info({ socketId: socket.id, username: socket.data.username }, 'Socket client connected');
    socket.emit('realtime:ready', { connectedAt: new Date().toISOString() });
    socket.on('disconnect', (reason) => {
      logger.info({ socketId: socket.id, reason }, 'Socket client disconnected');
    });
  });

  return io;
}

export function emitToAdmin(event: string, payload: unknown): void {
  io?.to('admin').emit(event, payload);
}

export function getSocketServer(): Server | null {
  return io;
}
