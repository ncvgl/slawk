import { create } from 'zustand';
import {
  mockChannels,
  mockDirectMessages,
  type Channel,
  type DirectMessage,
} from '@/mocks/channels';

interface ChannelState {
  channels: Channel[];
  directMessages: DirectMessage[];
  activeChannelId: number | null;
  activeDMId: number | null;

  setActiveChannel: (channelId: number) => void;
  setActiveDM: (dmId: number) => void;
  markChannelAsRead: (channelId: number) => void;
  markDMAsRead: (dmId: number) => void;
  getActiveChannel: () => Channel | undefined;
  getActiveDM: () => DirectMessage | undefined;
}

export const useChannelStore = create<ChannelState>((set, get) => ({
  channels: mockChannels,
  directMessages: mockDirectMessages,
  activeChannelId: 1, // Default to general channel
  activeDMId: null,

  setActiveChannel: (channelId: number) => {
    set({ activeChannelId: channelId, activeDMId: null });
    // Auto mark as read when switching
    get().markChannelAsRead(channelId);
  },

  setActiveDM: (dmId: number) => {
    set({ activeDMId: dmId, activeChannelId: null });
    get().markDMAsRead(dmId);
  },

  markChannelAsRead: (channelId: number) => {
    set((state) => ({
      channels: state.channels.map((ch) =>
        ch.id === channelId ? { ...ch, unreadCount: 0 } : ch
      ),
    }));
  },

  markDMAsRead: (dmId: number) => {
    set((state) => ({
      directMessages: state.directMessages.map((dm) =>
        dm.id === dmId ? { ...dm, unreadCount: 0 } : dm
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
