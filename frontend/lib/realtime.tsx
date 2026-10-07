'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_BASE, api } from './api';
import { useSessionStore } from '@/stores/sessions';
import type { WaSession } from './types';

const SocketContext = createContext<Socket | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null);
  const setSessions = useSessionStore((state) => state.setSessions);
  const upsertSession = useSessionStore((state) => state.upsertSession);
  const removeSession = useSessionStore((state) => state.removeSession);

  useEffect(() => {
    let alive = true;
    void api.sessions().then(({ sessions }) => { if (alive) setSessions(sessions); }).catch(() => undefined);
    const connection = io(API_BASE, { withCredentials: true, transports: ['websocket', 'polling'], reconnection: true });
    setSocket(connection);
    connection.on('session:update', (payload: { session?: WaSession }) => {
      if (payload.session) upsertSession(payload.session);
    });
    connection.on('session:deleted', (payload: { sessionId?: string }) => {
      if (payload.sessionId) removeSession(payload.sessionId);
    });
    connection.on('connect_error', (error) => {
      // Auth can still be resolving at first render; Socket.IO retries automatically.
      if (process.env.NODE_ENV === 'development') console.debug('Socket.IO:', error.message);
    });
    return () => {
      alive = false;
      connection.removeAllListeners();
      connection.disconnect();
      setSocket(null);
    };
  }, [setSessions, upsertSession, removeSession]);

  const value = useMemo(() => socket, [socket]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useRealtimeSocket(): Socket | null {
  return useContext(SocketContext);
}
