import { create } from 'zustand';
import type { ApiUser } from '@/lib/types';

interface AuthState {
  user: ApiUser | null;
  setUser: (user: ApiUser | null) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user })
}));
