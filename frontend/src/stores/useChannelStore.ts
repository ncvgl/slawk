import { create } from 'zustand';
import * as api from '@/lib/api';
import type { Channel, DirectMessage } from '@/lib/types';

interface ChannelState {
  channels: Channel[];
  directMessages: DirectMessage[];
  activeChannelId: number | null;
  activeDMId: number | null;
  isLoading: boolean;

  fetchChannels: () => Promise<void>;
  createChannel: (name: string, isPrivate?: boolean) => Promise<void>;
  setActiveChannel: (channelId: number) => void;
  setActiveDM: (dmId: number) => void;
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

  fetchChannels: async () => {
    set({ isLoading: true });
    try {
      const apiChannels = await api.getChannels();
      const channels: Channel[] = apiChannels.map((ch) => ({
        id: ch.id,
        name: ch.name,
        isPrivate: ch.isPrivate,
        memberCount: ch._count.members,
        unreadCount: ch.unreadCount,
      }));
      set((state) => ({
        channels,
        isLoading: false,
        // Auto-select first channel if none selected
        activeChannelId: state.activeChannelId ?? channels[0]?.id ?? null,
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
