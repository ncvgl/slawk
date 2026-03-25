import { create } from 'zustand';
import * as api from '@/lib/api';
import type { AdminUser, AdminChannel, AdminInvite, AuditLogEntry, AdminWebhook } from '@/lib/api';

interface AdminState {
  users: AdminUser[];
  channels: AdminChannel[];
  invites: AdminInvite[];
  webhooks: AdminWebhook[];
  auditLog: AuditLogEntry[];
  auditLogTotal: number;
  isLoading: boolean;
  error: string | null;
  fetchUsers: () => Promise<void>;
  fetchChannels: () => Promise<void>;
  fetchInvites: () => Promise<void>;
  fetchWebhooks: () => Promise<void>;
  fetchAuditLog: (limit?: number, offset?: number) => Promise<void>;
  updateUserRole: (userId: number, role: 'ADMIN' | 'MEMBER' | 'GUEST') => Promise<void>;
  transferOwnership: (userId: number) => Promise<void>;
  deactivateUser: (userId: number) => Promise<void>;
  reactivateUser: (userId: number) => Promise<void>;
  createInvite: (data: { role?: string; maxUses?: number | null; expiresAt?: string | null }) => Promise<void>;
  deleteInvite: (inviteId: number) => Promise<void>;
  createWebhook: (data: { name: string; channelId: number }) => Promise<void>;
  deleteWebhook: (webhookId: number) => Promise<void>;
  deleteChannel: (channelId: number) => Promise<void>;
  archiveChannel: (channelId: number) => Promise<void>;
  unarchiveChannel: (channelId: number) => Promise<void>;
  editChannel: (channelId: number, data: { name?: string; isPrivate?: boolean }) => Promise<void>;
  removeChannelMember: (channelId: number, userId: number) => Promise<void>;
}

export const useAdminStore = create<AdminState>((set, get) => ({
  users: [],
  channels: [],
  invites: [],
  webhooks: [],
  auditLog: [],
  auditLogTotal: 0,
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

  transferOwnership: async (userId) => {
    try {
      await api.adminTransferOwnership(userId);
      // Refresh users to reflect the role changes
      await get().fetchUsers();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to transfer ownership' });
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

  fetchWebhooks: async () => {
    try {
      const webhooks = await api.adminGetWebhooks();
      set({ webhooks });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch webhooks' });
    }
  },

  createWebhook: async (data) => {
    try {
      const webhook = await api.adminCreateWebhook(data);
      set({ webhooks: [webhook, ...get().webhooks] });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create webhook' });
    }
  },

  deleteWebhook: async (webhookId) => {
    const prev = get().webhooks;
    set({ webhooks: prev.filter((w) => w.id !== webhookId) });
    try {
      await api.adminDeleteWebhook(webhookId);
    } catch (err) {
      set({ webhooks: prev, error: err instanceof Error ? err.message : 'Failed to delete webhook' });
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

  archiveChannel: async (channelId) => {
    const prev = get().channels;
    set({
      channels: prev.map((c) =>
        c.id === channelId ? { ...c, archivedAt: new Date().toISOString() } : c
      ),
    });
    try {
      const updated = await api.adminArchiveChannel(channelId);
      set({ channels: get().channels.map((c) => (c.id === channelId ? updated : c)) });
    } catch (err) {
      set({ channels: prev, error: err instanceof Error ? err.message : 'Failed to archive channel' });
    }
  },

  unarchiveChannel: async (channelId) => {
    const prev = get().channels;
    set({
      channels: prev.map((c) =>
        c.id === channelId ? { ...c, archivedAt: null } : c
      ),
    });
    try {
      const updated = await api.adminUnarchiveChannel(channelId);
      set({ channels: get().channels.map((c) => (c.id === channelId ? updated : c)) });
    } catch (err) {
      set({ channels: prev, error: err instanceof Error ? err.message : 'Failed to unarchive channel' });
    }
  },

  editChannel: async (channelId, data) => {
    const prev = get().channels;
    try {
      const updated = await api.adminEditChannel(channelId, data);
      set({ channels: get().channels.map((c) => (c.id === channelId ? updated : c)) });
    } catch (err) {
      set({ channels: prev, error: err instanceof Error ? err.message : 'Failed to edit channel' });
    }
  },

  removeChannelMember: async (channelId, userId) => {
    try {
      await api.adminRemoveChannelMember(channelId, userId);
      // Member count will be updated via WebSocket channel:member-left event
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove channel member' });
      throw err;
    }
  },

  fetchAuditLog: async (limit = 50, offset = 0) => {
    try {
      const data = await api.adminGetAuditLog(limit, offset);
      set({
        auditLog: offset > 0 ? [...get().auditLog, ...data.entries] : data.entries,
        auditLogTotal: data.total,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch audit log' });
    }
  },
}));
