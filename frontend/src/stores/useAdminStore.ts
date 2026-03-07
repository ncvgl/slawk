import { create } from 'zustand';
import * as api from '@/lib/api';
import type { AdminUser, AdminChannel, AdminInvite } from '@/lib/api';

interface AdminState {
  users: AdminUser[];
  channels: AdminChannel[];
  invites: AdminInvite[];
  isLoading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  fetchChannels: () => Promise<void>;
  fetchInvites: () => Promise<void>;
  updateUserRole: (userId: number, role: 'ADMIN' | 'MEMBER' | 'GUEST') => Promise<void>;
  deactivateUser: (userId: number) => Promise<void>;
  reactivateUser: (userId: number) => Promise<void>;
  createInvite: (data: { role?: string; maxUses?: number | null; expiresAt?: string | null }) => Promise<void>;
  deleteInvite: (inviteId: number) => Promise<void>;
  deleteChannel: (channelId: number) => Promise<void>;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  users: [],
  channels: [],
  invites: [],
  isLoading: false,
  error: null,

  fetchUsers: async () => {
    try {
      const users = await api.adminGetUsers();
      set({ users });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch users' });
    }
  },

  fetchChannels: async () => {
    try {
      const channels = await api.adminGetChannels();
      set({ channels });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch channels' });
    }
  },

  fetchInvites: async () => {
    try {
      const invites = await api.adminGetInvites();
      set({ invites });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch invites' });
    }
  },

  updateUserRole: async (userId, role) => {
    const prev = get().users;
    set({ users: prev.map((u) => (u.id === userId ? { ...u, role } : u)) });
    try {
      const updated = await api.adminUpdateUserRole(userId, role);
      set({ users: get().users.map((u) => (u.id === userId ? updated : u)) });
    } catch (err) {
      set({ users: prev, error: err instanceof Error ? err.message : 'Failed to update role' });
    }
  },

  deactivateUser: async (userId) => {
    const prev = get().users;
    set({ users: prev.map((u) => (u.id === userId ? { ...u, deactivatedAt: new Date().toISOString() } : u)) });
    try {
      const updated = await api.adminDeactivateUser(userId);
      set({ users: get().users.map((u) => (u.id === userId ? updated : u)) });
    } catch (err) {
      set({ users: prev, error: err instanceof Error ? err.message : 'Failed to deactivate user' });
    }
  },

  reactivateUser: async (userId) => {
    const prev = get().users;
    set({ users: prev.map((u) => (u.id === userId ? { ...u, deactivatedAt: null } : u)) });
    try {
      const updated = await api.adminReactivateUser(userId);
      set({ users: get().users.map((u) => (u.id === userId ? updated : u)) });
    } catch (err) {
      set({ users: prev, error: err instanceof Error ? err.message : 'Failed to reactivate user' });
    }
  },

  createInvite: async (data) => {
    try {
      const invite = await api.adminCreateInvite(data);
      set({ invites: [invite, ...get().invites] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create invite' });
    }
  },

  deleteInvite: async (inviteId) => {
    const prev = get().invites;
    set({ invites: prev.filter((i) => i.id !== inviteId) });
    try {
      await api.adminDeleteInvite(inviteId);
    } catch (err) {
      set({ invites: prev, error: err instanceof Error ? err.message : 'Failed to delete invite' });
    }
  },

  deleteChannel: async (channelId) => {
    const prev = get().channels;
    set({ channels: prev.filter((c) => c.id !== channelId) });
    try {
      await api.adminDeleteChannel(channelId);
    } catch (err) {
      set({ channels: prev, error: err instanceof Error ? err.message : 'Failed to delete channel' });
    }
  },
}));
