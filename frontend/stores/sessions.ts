import { create } from 'zustand';
import type { WaSession } from '@/lib/types';

interface SessionStore {
  sessions: WaSession[];
  setSessions: (sessions: WaSession[]) => void;
  upsertSession: (session: WaSession) => void;
  removeSession: (sessionId: string) => void;
}

export const useSessionStore = create<SessionStore>((set) => ({
  sessions: [],
  setSessions: (sessions) => set({ sessions }),
  upsertSession: (session) => set((state) => ({
    sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  })),
  removeSession: (sessionId) => set((state) => ({ sessions: state.sessions.filter((item) => item.id !== sessionId) }))
}));
