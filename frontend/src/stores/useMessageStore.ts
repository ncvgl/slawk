import { create } from 'zustand';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Message, Reaction } from '@/lib/types';

function transformApiMessage(msg: api.ApiMessage): Message {
  // Group raw reaction rows into { emoji, count, userIds[] }
  const reactionMap = new Map<string, Reaction>();
  for (const r of msg.reactions ?? []) {
    const existing = reactionMap.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.userId);
    } else {
      reactionMap.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        userIds: [r.userId],
      });
    }
  }

  return {
    id: msg.id,
    content: msg.content,
    userId: msg.userId,
    user: {
      id: msg.user.id,
      name: msg.user.name,
      email: msg.user.email,
      avatar: msg.user.avatar,
    },
    channelId: msg.channelId,
    createdAt: new Date(msg.createdAt),
    updatedAt: msg.updatedAt ? new Date(msg.updatedAt) : undefined,
    reactions: Array.from(reactionMap.values()),
    files: (msg.files ?? []).map((f) => ({
      id: f.id,
      filename: f.filename,
      originalName: (f as any).originalName ?? f.filename,
      mimetype: f.mimetype,
      size: f.size,
      url: f.url,
    })),
    threadCount: msg._count?.replies ?? 0,
    isEdited: msg.updatedAt !== msg.createdAt,
    isPinned: msg.isPinned ?? false,
  };
}

interface MessageState {
  messages: Message[];
  isLoading: boolean;
  loadedChannelId: number | null;

  fetchMessages: (channelId: number) => Promise<void>;
  getMessagesForChannel: (channelId: number) => Message[];
  sendMessage: (channelId: number, content: string, fileIds?: number[]) => Promise<void>;
  editMessage: (messageId: number, content: string) => Promise<void>;
  deleteMessage: (messageId: number) => Promise<void>;
  addReaction: (messageId: number, emoji: string) => void;
  removeReaction: (messageId: number, emoji: string) => void;
  // Socket event handlers
  onMessageNew: (msg: api.ApiMessage) => void;
  onMessageUpdated: (msg: api.ApiMessage) => void;
  onMessageDeleted: (data: { messageId: number }) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoading: false,
  loadedChannelId: null,

  fetchMessages: async (channelId: number) => {
    set({ isLoading: true });
    try {
      const data = await api.getMessages(channelId);
      const messages = data.messages.map(transformApiMessage);
      // API returns desc order, reverse to asc for display
      messages.reverse();
      set({ messages, isLoading: false, loadedChannelId: channelId });
    } catch (err) {
      console.error('Failed to fetch messages:', err);
      set({ isLoading: false });
    }
  },

  getMessagesForChannel: (channelId: number) => {
    return get().messages.filter((msg) => msg.channelId === channelId);
  },

  sendMessage: async (channelId: number, content: string, fileIds?: number[]) => {
    const socket = getSocket();
    if (socket?.connected) {
      // Send via socket so the backend broadcasts to all users in the channel
      socket.emit('message:send', { channelId, content, fileIds });
    } else {
      // Fallback to REST if socket not connected
      try {
        const apiMsg = await api.sendMessage(channelId, content);
        const message = transformApiMessage(apiMsg);
        set((state) => ({
          messages: [...state.messages, message],
        }));
      } catch (err) {
        console.error('Failed to send message:', err);
      }
    }
  },

  editMessage: async (messageId: number, content: string) => {
    try {
      const apiMsg = await api.editMessage(messageId, content);
      const updated = transformApiMessage(apiMsg);
      set({
        messages: get().messages.map((msg) =>
          msg.id === messageId ? updated : msg,
        ),
      });
    } catch (err) {
      console.error('Failed to edit message:', err);
    }
  },

  deleteMessage: async (messageId: number) => {
    try {
      await api.deleteMessage(messageId);
      set({
        messages: get().messages.filter((msg) => msg.id !== messageId),
      });
    } catch (err) {
      console.error('Failed to delete message:', err);
    }
  },

  // Socket event handlers — called when we receive a broadcast from the server
  onMessageNew: (msg: api.ApiMessage) => {
    // Avoid duplicates (we already added it locally when we sent via REST)
    if (get().messages.some((m) => m.id === msg.id)) return;
    const message = transformApiMessage(msg);
    // Only add to messages list if it belongs to the currently loaded channel
    if (message.channelId === get().loadedChannelId) {
      set((state) => ({ messages: [...state.messages, message] }));
    }
  },

  onMessageUpdated: (msg: api.ApiMessage) => {
    const updated = transformApiMessage(msg);
    set({
      messages: get().messages.map((m) => (m.id === updated.id ? updated : m)),
    });
  },

  onMessageDeleted: (data: { messageId: number }) => {
    set({
      messages: get().messages.filter((m) => m.id !== data.messageId),
    });
  },

  addReaction: async (messageId: number, emoji: string) => {
    const state = get();
    const userId = getUserId();
    if (!userId) return;

    // Optimistic update
    set({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        const existing = msg.reactions.find((r) => r.emoji === emoji);
        if (existing) {
          if (existing.userIds.includes(userId)) return msg;
          return {
            ...msg,
            reactions: msg.reactions.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId] }
                : r,
            ),
          };
        }
        return {
          ...msg,
          reactions: [...msg.reactions, { emoji, count: 1, userIds: [userId] }],
        };
      }),
    });

    try {
      await api.addReaction(messageId, emoji);
    } catch {
      // Revert on failure - refetch
      const currentChannel = get().loadedChannelId;
      if (currentChannel) get().fetchMessages(currentChannel);
    }
  },

  removeReaction: async (messageId: number, emoji: string) => {
    const state = get();
    const userId = getUserId();
    if (!userId) return;

    // Optimistic update
    set({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;
        return {
          ...msg,
          reactions: msg.reactions
            .map((r) => {
              if (r.emoji !== emoji) return r;
              const newUserIds = r.userIds.filter((id) => id !== userId);
              return { ...r, count: newUserIds.length, userIds: newUserIds };
            })
            .filter((r) => r.count > 0),
        };
      }),
    });

    try {
      await api.removeReaction(messageId, emoji);
    } catch {
      const currentChannel = get().loadedChannelId;
      if (currentChannel) get().fetchMessages(currentChannel);
    }
  },
}));

function getUserId(): number | null {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.userId;
  } catch {
    return null;
  }
}
