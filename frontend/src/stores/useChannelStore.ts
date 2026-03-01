import { create } from 'zustand';
import * as api from '@/lib/api';
import type { Channel, DirectMessage } from '@/lib/types';

const STARRED_KEY = 'slawk:starred_channels';

function loadStarred(): Set<number> {
  try {
    const raw = localStorage.getItem(STARRED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

function saveStarred(ids: Set<number>): void {
  localStorage.setItem(STARRED_KEY, JSON.stringify(Array.from(ids)));
}

interface ChannelState {
  channels: Channel[];
  directMessages: DirectMessage[];
  activeChannelId: number | null;
  activeDMId: number | null;
  isLoading: boolean;

  fetchChannels: () => Promise<void>;
  fetchDirectMessages: () => Promise<void>;
  createChannel: (name: string, isPrivate?: boolean) => Promise<void>;
  joinChannel: (channelId: number) => Promise<void>;
  toggleStar: (channelId: number) => void;
  setActiveChannel: (channelId: number) => void;
  setActiveDM: (dmId: number) => void;
  startDM: (userId: number, userName: string, userAvatar?: string) => void;
  addOrUpdateDM: (userId: number, userName: string, userAvatar?: string) => void;
  incrementUnread: (channelId: number) => void;
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
  isLoading: false,

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
    } catch (err) {
      console.error('Failed to fetch DMs:', err);
    }
  },

  fetchChannels: async () => {
    set({ isLoading: true });
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
      const memberChannels = channels.filter((ch) => ch.isMember);
      set((state) => ({
        channels,
        isLoading: false,
        // Auto-select first member channel if none selected
        activeChannelId: state.activeChannelId ?? memberChannels[0]?.id ?? null,
      }));
    } catch (err) {
      console.error('Failed to fetch channels:', err);
      set({ isLoading: false });
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
        activeChannelId: channel.id,
        activeDMId: null,
      }));
    } catch (err) {
      console.error('Failed to create channel:', err);
    }
  },

  joinChannel: async (channelId: number) => {
    try {
      await api.joinChannel(channelId);
      set((state) => ({
        channels: state.channels.map((ch) =>
          ch.id === channelId ? { ...ch, isMember: true, memberCount: ch.memberCount + 1 } : ch,
        ),
        activeChannelId: channelId,
        activeDMId: null,
      }));
    } catch (err) {
      console.error('Failed to join channel:', err);
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

  setActiveChannel: (channelId: number) => {
    set({ activeChannelId: channelId, activeDMId: null });
    get().markChannelAsRead(channelId);
  },

  setActiveDM: (dmId: number) => {
    set({ activeDMId: dmId, activeChannelId: null });
    get().markDMAsRead(dmId);
  },

  incrementUnread: (channelId: number) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: ch.unreadCount + 1 } : ch,
      ),
    }));
  },

  markChannelAsRead: (channelId: number) => {
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
