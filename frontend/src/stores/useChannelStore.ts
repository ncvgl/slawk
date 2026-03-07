import { create } from 'zustand';
import * as api from '@/lib/api';
import type { Channel, DirectMessage } from '@/lib/types';

function getStarredKey(): string {
  try {
    const token = localStorage.getItem('token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.userId) return `slawk:starred_channels:${payload.userId}`;
    }
  } catch { /* ignore */ }
  return 'slawk:starred_channels';
}

function loadStarred(): Set<number> {
  try {
    const raw = localStorage.getItem(getStarredKey());
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveStarred(ids: Set<number>): void {
  localStorage.setItem(getStarredKey(), JSON.stringify(Array.from(ids)));
}

interface ChannelState {
  channels: Channel[];
  directMessages: DirectMessage[];
  activeChannelId: number | null;
  activeDMId: number | null;
  scrollToMessageId: number | null;
  isLoading: boolean;
  loadError: string | null;

  fetchChannels: () => Promise<void>;
  fetchDirectMessages: () => Promise<void>;
  createChannel: (name: string, isPrivate?: boolean) => Promise<number>;
  joinChannel: (channelId: number) => Promise<void>;
  leaveChannel: (channelId: number) => Promise<number | null>;
  toggleStar: (channelId: number) => void;
  setActiveChannel: (channelId: number, scrollToMessageId?: number) => void;
  setActiveDM: (dmId: number) => void;
  startDM: (userId: number, userName: string, userAvatar?: string) => void;
  addOrUpdateDM: (userId: number, userName: string, userAvatar?: string) => void;
  updateDMUser: (userId: number, updates: Partial<Pick<DirectMessage, 'userName' | 'userAvatar'>>) => void;
  updateDMStatus: (userId: number, status: DirectMessage['userStatus']) => void;
  updateMemberCount: (channelId: number, memberCount: number) => void;
  incrementUnread: (channelId: number) => void;
  setUnreadCount: (channelId: number, count: number) => void;
  incrementDMUnread: (userId: number) => void;
  markChannelAsRead: (channelId: number) => void;
  markDMAsRead: (dmId: number) => void;
  getActiveChannel: () => Channel | undefined;
  getActiveDM: () => DirectMessage | undefined;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: [],
  directMessages: [],
  activeChannelId: null,
  activeDMId: null,
  scrollToMessageId: null,
  isLoading: false,
  loadError: null,

  fetchDirectMessages: async () => {
    try {
      const conversations = await api.getDirectMessages();
      const dms: DirectMessage[] = conversations.filter((c) => c?.otherUser).map((c) => ({
        id: c.otherUser.id,
        userId: c.otherUser.id,
        userName: c.otherUser.name,
        userAvatar: c.otherUser.avatar || '',
        userStatus: (c.otherUser.status as DirectMessage['userStatus']) || 'offline',
        unreadCount: c.unreadCount,
      }));
      set({ directMessages: dms });
    } catch {
      set({ loadError: 'Failed to load conversations.' });
    }
  },

  fetchChannels: async () => {
    set({ isLoading: true, loadError: null });
    try {
      const starred = loadStarred();
      const apiChannels = await api.getChannels();
      const channels: Channel[] = apiChannels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        isPrivate: ch.isPrivate,
        memberCount: ch._count.members,
        unreadCount: ch.unreadCount,
        isMember: ch.isMember,
        isStarred: starred.has(ch.id),
      }));
      set({
        channels,
        isLoading: false,
      });
    } catch {
      set({ isLoading: false, loadError: 'Failed to load channels.' });
    }
  },

  createChannel: async (name: string, isPrivate = false) => {
    try {
      const ch = await api.createChannel(name, isPrivate);
      const channel: Channel = {
        id: ch.id,
        name: ch.name,
        isPrivate: ch.isPrivate,
        memberCount: ch._count?.members ?? 1,
        unreadCount: 0,
        isMember: true,
      };
      set((state) => ({
        channels: [...state.channels, channel],
      }));
      return channel.id;
    } catch (err) {
      console.error('Failed to create channel:', err);
      throw err;
    }
  },

  joinChannel: async (channelId: number) => {
    try {
      await api.joinChannel(channelId);
      set((state) => ({
        channels: state.channels.map((ch) =>
          ch.id === channelId ? { ...ch, isMember: true, memberCount: ch.memberCount + 1 } : ch,
        ),
      }));
    } catch (err) {
      console.error('Failed to join channel:', err);
      throw err;
    }
  },

  leaveChannel: async (channelId: number) => {
    try {
      await api.leaveChannel(channelId);
      let nextChannelId: number | null = null;
      set((state) => {
        const updated = state.channels.map((ch) =>
          ch.id === channelId ? { ...ch, isMember: false, memberCount: Math.max(0, ch.memberCount - 1) } : ch
        );
        if (state.activeChannelId === channelId) {
          nextChannelId = updated.find((ch) => ch.isMember)?.id ?? null;
        }
        return { channels: updated };
      });
      return nextChannelId;
    } catch (err) {
      console.error('Failed to leave channel:', err);
      throw err;
    }
  },

  toggleStar: (channelId: number) => {
    const starred = loadStarred();
    if (starred.has(channelId)) {
      starred.delete(channelId);
    } else {
      starred.add(channelId);
    }
    saveStarred(starred);
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, isStarred: starred.has(channelId) } : ch,
      ),
    }));
  },

  startDM: (userId: number, userName: string, userAvatar?: string) => {
    const state = get();
    // Add to DM list if not already there
    if (!state.directMessages.find((dm) => dm.userId === userId)) {
      set({
        directMessages: [
          ...state.directMessages,
          {
            id: userId,
            userId,
            userName,
            userAvatar: userAvatar || '',
            userStatus: 'online',
            unreadCount: 0,
          },
        ],
      });
    }
    set({ activeDMId: userId, activeChannelId: null });
  },

  addOrUpdateDM: (userId: number, userName: string, userAvatar?: string) => {
    const state = get();
    const existing = state.directMessages.find((dm) => dm.userId === userId);
    if (existing) return;
    set({
      directMessages: [
        ...state.directMessages,
        {
          id: userId,
          userId,
          userName,
          userAvatar: userAvatar || '',
          userStatus: 'online',
          unreadCount: 0,
        },
      ],
    });
  },

  updateDMUser: (userId: number, updates: Partial<Pick<DirectMessage, 'userName' | 'userAvatar'>>) => {
    set((state) => ({
      directMessages: state.directMessages.map((dm) =>
        dm.userId === userId ? { ...dm, ...updates } : dm
      ),
    }));
  },

  updateDMStatus: (userId: number, status: DirectMessage['userStatus']) => {
    set((state) => ({
      directMessages: state.directMessages.map((dm) =>
        dm.userId === userId ? { ...dm, userStatus: status } : dm
      ),
    }));
  },

  setActiveChannel: (channelId: number, scrollToMessageId?: number) => {
    set({ activeChannelId: channelId, activeDMId: null, scrollToMessageId: scrollToMessageId ?? null });
    const channel = get().channels.find((ch) => ch.id === channelId);
    if (channel?.isMember) {
      get().markChannelAsRead(channelId);
    }
  },

  setActiveDM: (dmId: number) => {
    set({ activeDMId: dmId, activeChannelId: null });
    get().markDMAsRead(dmId);
  },

  updateMemberCount: (channelId: number, memberCount: number) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, memberCount } : ch,
      ),
    }));
  },

  incrementUnread: (channelId: number) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: ch.unreadCount + 1 } : ch,
      ),
    }));
  },

  setUnreadCount: (channelId: number, count: number) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: count } : ch,
      ),
    }));
  },

  incrementDMUnread: (userId: number) => {
    set((state) => ({
      directMessages: state.directMessages.map((dm) =>
        dm.userId === userId ? { ...dm, unreadCount: dm.unreadCount + 1 } : dm,
      ),
    }));
  },

  markChannelAsRead: (channelId: number) => {
    const existing = get().channels.find((ch) => ch.id === channelId);
    if (!existing || existing.unreadCount === 0) return;
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: 0 } : ch,
      ),
    }));
  },

  markDMAsRead: (dmId: number) => {
    set((state) => ({
      directMessages: state.directMessages.map((dm) =>
        dm.id === dmId ? { ...dm, unreadCount: 0 } : dm,
      ),
    }));
  },

  getActiveChannel: () => {
    const state = get();
    return state.channels.find((ch) => ch.id === state.activeChannelId);
  },

  getActiveDM: () => {
    const state = get();
    return state.directMessages.find((dm) => dm.id === state.activeDMId);
  },
}));
