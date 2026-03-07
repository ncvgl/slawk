import { create } from 'zustand';
import * as api from '@/lib/api';
import { clearDownloadToken } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import type { User } from '@/lib/types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isHydrating: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (name: string, email: string, password: string, inviteCode?: string) => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  hydrate: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('token'),
  isHydrating: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { user, token } = await api.login(email, password);
      localStorage.setItem('token', token);
      set({
        user: { ...user, status: 'online', role: user.role },
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
    clearDownloadToken();
    disconnectSocket();
    // Hard reload to wipe all in-memory Zustand state (messages, DMs, channels, bookmarks)
    window.location.href = '/login';
  },

  register: async (name: string, email: string, password: string, inviteCode?: string) => {
    set({ isLoading: true, error: null });
    try {
      const { user, token } = await api.register(name, email, password, inviteCode);
      localStorage.setItem('token', token);
      set({
        user: { ...user, status: 'online', role: user.role },
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registration failed';
      set({ isLoading: false, error: message });
      throw err;
    }
  },

  updateUser: (updates) => {
    const current = get().user;
    if (current) set({ user: { ...current, ...updates } });
  },

  hydrate: () => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        // Untrusted hint from JWT payload -- used only until server confirms
        const payload = JSON.parse(atob(token.split('.')[1]));
        set({
          user: {
            id: payload.userId,
            email: payload.email,
            name: payload.email.split('@')[0],
          },
          isAuthenticated: true,
          isHydrating: true,
        });
        api.getMyProfile().then((profile) => {
          set({
            user: {
              id: profile.id,
              email: profile.email,
              name: profile.name,
              avatar: profile.avatar,
              role: profile.role,
              status: profile.status as any,
            },
            isHydrating: false,
          });
        }).catch(() => {
          localStorage.removeItem('token');
          set({ user: null, isAuthenticated: false, isHydrating: false });
        });
      } catch {
        localStorage.removeItem('token');
        set({ user: null, isAuthenticated: false, isHydrating: false });
      }
    } else {
      set({ isHydrating: false });
    }

    // Cross-tab session sync: detect logout from another tab
    window.addEventListener('storage', (e) => {
      if (e.key === 'token' && e.newValue === null) {
        disconnectSocket();
        window.location.href = '/login';
      }
    });
  },
}));
