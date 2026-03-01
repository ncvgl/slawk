import { create } from 'zustand';
import * as api from '@/lib/api';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (name: string, email: string, password: string) => Promise<void>;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { user, token } = await api.login(email, password);
      localStorage.setItem('token', token);
      set({
        user: { ...user, status: 'online' },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    set({ user: null, isAuthenticated: false });
  },

  register: async (name: string, email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { user, token } = await api.register(name, email, password);
      localStorage.setItem('token', token);
      set({
        user: { ...user, status: 'online' },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  hydrate: () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        // Set initial state from token
        set({
          user: {
            id: payload.userId,
            email: payload.email,
            name: payload.email.split('@')[0],
          },
          isAuthenticated: true,
        });
        // Fetch full profile to get actual name
        api.getMyProfile().then((profile) => {
          set({
            user: {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              avatar: profile.avatar,
              status: profile.status as any,
            },
          });
        }).catch(() => {
          // If profile fetch fails, token may be expired
        });
      } catch {
        localStorage.removeItem('token');
        set({ user: null, isAuthenticated: false });
      }
    }
  },
}));
