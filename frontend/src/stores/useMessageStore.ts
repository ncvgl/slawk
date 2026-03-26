import { create } from 'zustand';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Message, Reaction } from '@/lib/types';

function transformApiMessage(msg: api.ApiMessage): Message {
  // Group raw reaction rows into { emoji, count, userIds[] }
  const reactionMap = new Map<string, Reaction>();
  for (const r of msg.reactions ?? []) {
    const existing = reactionMap.get(r.emoji);
    const userName = (r as any).user?.name ?? '';
    if (existing) {
      existing.count++;
      existing.userIds.push(r.userId);
      existing.userNames.push(userName);
    } else {
      reactionMap.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        userIds: [r.userId],
        userNames: [userName],
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
    threadParticipants: msg.threadParticipants ?? [],
    isEdited: !!msg.editedAt,
    isPinned: msg.isPinned ?? false,
  };
}

interface MessageState {
  messages: Message[];
  isLoading: boolean;
  loadError: string | null;
  loadedChannelId: number | null;
  sendError: string | null;

  fetchMessages: (channelId: number, around?: number) => Promise<void>;
  getMessagesForChannel: (channelId: number) => Message[];
  sendMessage: (channelId: number, content: string, fileIds?: number[]) => Promise<void>;
  editMessage: (messageId: number, content: string) => Promise<void>;
  deleteMessage: (messageId: number) => Promise<void>;
  addReaction: (messageId: number, emoji: string) => void;
  removeReaction: (messageId: number, emoji: string) => void;
  clearSendError: () => void;
  updateUserInMessages: (userId: number, updates: { name?: string; avatar?: string }) => void;
  // Socket event handlers
  onMessageNew: (msg: api.ApiMessage) => void;
  onMessageUpdated: (msg: api.ApiMessage) => void;
  onMessageDeleted: (data: { messageId: number; threadId?: number | null }) => void;
  onReactionAdded: (data: { messageId: number; reaction: { emoji: string; userId: number; user: { name: string } } }) => void;
  onReactionRemoved: (data: { messageId: number; emoji: string; userId: number }) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: [],
  isLoading: false,
  loadError: null,
  loadedChannelId: null,
  sendError: null,

  fetchMessages: async (channelId: number, around?: number) => {
    set({ isLoading: true, loadError: null, loadedChannelId: channelId });
    try {
      const data = await api.getMessages(channelId, undefined, 50, around);
      // Discard stale response if the user already switched to another channel
      if (get().loadedChannelId !== channelId) return;
      const messages = data.messages.map(transformApiMessage);
      // API returns desc order (or chronological for around), reverse if not around
      if (!around) messages.reverse();
      set({ messages, isLoading: false, loadedChannelId: channelId });
    } catch {
      if (get().loadedChannelId !== channelId) return;
      set({ isLoading: false, loadError: 'Failed to load messages.' });
    }
  },

  getMessagesForChannel: (channelId: number) => {
    return get().messages.filter((msg) => msg.channelId === channelId);
  },

  sendMessage: async (channelId: number, content: string, fileIds?: number[]) => {
    const socket = getSocket();
    if (socket?.connected) {
      // Send via socket with ack callback so we can detect errors
      return new Promise<void>((resolve, reject) => {
        // Fallback timeout — reject if no ack in 10s so failures aren't silently swallowed
        const timeout = setTimeout(() => {
          set({ sendError: 'Message send timed out. Please try again.' });
          reject(new Error('Message send timed out'));
        }, 10000);
        socket.emit('message:send', { channelId, content, fileIds }, (response: { error?: string }) => {
          clearTimeout(timeout);
          if (response?.error) {
            set({ sendError: response.error });
            reject(new Error(response.error));
          } else {
            set({ sendError: null });
            resolve();
          }
        });
      });
    } else {
      // Fallback to REST if socket not connected
      try {
        const apiMsg = await api.sendMessage(channelId, content, fileIds);
        const message = transformApiMessage(apiMsg);
        set((state) => ({
          messages: [...state.messages, message],
          sendError: null,
        }));
      } catch (err: any) {
        const msg = err?.message || 'Message failed to send. Please try again.';
        set({ sendError: msg });
        throw err;
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
      throw err;
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
      throw err;
    }
  },

  clearSendError: () => set({ sendError: null }),

  updateUserInMessages: (userId, updates) => {
    set({
      messages: get().messages.map((msg) => {
        const isAuthor = msg.userId === userId;
        const hasParticipant = msg.threadParticipants?.some((p) => p.id === userId);
        if (!isAuthor && !hasParticipant) return msg;
        return {
          ...msg,
          user: isAuthor ? { ...msg.user, ...updates } : msg.user,
          threadParticipants: hasParticipant
            ? msg.threadParticipants.map((p) =>
                p.id === userId ? { ...p, ...updates } : p
              )
            : msg.threadParticipants,
        };
      }),
    });
  },

  // Socket event handlers — called when we receive a broadcast from the server
  onMessageNew: (msg: api.ApiMessage) => {
    // Avoid duplicates (we already added it locally when we sent via REST)
    if (get().messages.some((m) => m.id === msg.id)) return;
    const message = transformApiMessage(msg);
    // Only add to messages list if it belongs to the currently loaded channel
    if (message.channelId === get().loadedChannelId) {
      // If this is a reply, update the parent message's threadCount and threadParticipants
      if (msg.threadId) {
        const currentUserId = getUserId();
        const isOwnReply = msg.userId === currentUserId;
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== msg.threadId) return m;
            const participant = { id: msg.user.id, name: msg.user.name, avatar: msg.user.avatar ?? null };
            const alreadyParticipant = m.threadParticipants?.some((p) => p.id === participant.id);
            return {
              ...m,
              // Only increment count for other users' replies — own count is updated via onReplyCountChange
              threadCount: isOwnReply ? m.threadCount : m.threadCount + 1,
              threadParticipants: alreadyParticipant
                ? m.threadParticipants
                : [...(m.threadParticipants ?? []), participant],
            };
          }),
        }));
      } else {
        set((state) => ({ messages: [...state.messages, message] }));
      }
    }
  },

  onMessageUpdated: (msg: api.ApiMessage) => {
    const updated = transformApiMessage(msg);
    set({
      messages: get().messages.map((m) => (m.id === updated.id ? updated : m)),
    });
  },

  onMessageDeleted: (data: { messageId: number; threadId?: number | null }) => {
    if (data.threadId) {
      // A thread reply was deleted — decrement the parent message's threadCount
      set({
        messages: get().messages.map((m) =>
          m.id === data.threadId
            ? { ...m, threadCount: Math.max(0, m.threadCount - 1) }
            : m,
        ),
      });
    } else {
      // A top-level message was deleted — remove it from the list
      set({
        messages: get().messages.filter((m) => m.id !== data.messageId),
      });
    }
  },

  onReactionAdded: (data) => {
    const currentUserId = getUserId();
    // Skip if this is our own reaction (already applied optimistically)
    if (data.reaction.userId === currentUserId) return;

    set({
      messages: get().messages.map((msg) => {
        if (msg.id !== data.messageId) return msg;
        const existing = msg.reactions.find((r) => r.emoji === data.reaction.emoji);
        if (existing) {
          if (existing.userIds.includes(data.reaction.userId)) return msg;
          return {
            ...msg,
            reactions: msg.reactions.map((r) =>
              r.emoji === data.reaction.emoji
                ? { ...r, count: r.count + 1, userIds: [...r.userIds, data.reaction.userId], userNames: [...r.userNames, data.reaction.user.name] }
                : r,
            ),
          };
        }
        return {
          ...msg,
          reactions: [...msg.reactions, { emoji: data.reaction.emoji, count: 1, userIds: [data.reaction.userId], userNames: [data.reaction.user.name] }],
        };
      }),
    });
  },

  onReactionRemoved: (data) => {
    const currentUserId = getUserId();
    // Skip if this is our own reaction (already applied optimistically)
    if (data.userId === currentUserId) return;

    set({
      messages: get().messages.map((msg) => {
        if (msg.id !== data.messageId) return msg;
        return {
          ...msg,
          reactions: msg.reactions
            .map((r) => {
              if (r.emoji !== data.emoji) return r;
              const idx = r.userIds.indexOf(data.userId);
              const newUserIds = r.userIds.filter((id) => id !== data.userId);
              const newUserNames = r.userNames.filter((_, i) => i !== idx);
              return { ...r, count: newUserIds.length, userIds: newUserIds, userNames: newUserNames };
            })
            .filter((r) => r.count > 0),
        };
      }),
    });
  },

  addReaction: async (messageId: number, emoji: string) => {
    const state = get();
    const userId = getUserId();
    if (!userId) return;
    // Check if reaction already exists to prevent double-click race
    const msg = state.messages.find((m) => m.id === messageId);
    if (msg?.reactions.some((r) => r.emoji === emoji && r.userIds.includes(userId))) return;
    // Capture channel ID at time of optimistic update for correct revert
    const channelAtUpdate = state.loadedChannelId;

    // Optimistic update
    set({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        const existing = m.reactions.find((r) => r.emoji === emoji);
        if (existing) {
          return {
            ...m,
            reactions: m.reactions.map((r) =>
              r.emoji === emoji
                ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId], userNames: [...r.userNames, 'You'] }
                : r,
            ),
          };
        }
        return {
          ...m,
          reactions: [...m.reactions, { emoji, count: 1, userIds: [userId], userNames: ['You'] }],
        };
      }),
    });

    try {
      await api.addReaction(messageId, emoji);
    } catch {
      if (channelAtUpdate) get().fetchMessages(channelAtUpdate);
    }
  },

  removeReaction: async (messageId: number, emoji: string) => {
    const state = get();
    const userId = getUserId();
    if (!userId) return;
    const channelAtUpdate = state.loadedChannelId;

    // Optimistic update
    set({
      messages: state.messages.map((m) => {
        if (m.id !== messageId) return m;
        return {
          ...m,
          reactions: m.reactions
            .map((r) => {
              if (r.emoji !== emoji) return r;
              const idx = r.userIds.indexOf(userId);
              const newUserIds = r.userIds.filter((id) => id !== userId);
              const newUserNames = r.userNames.filter((_, i) => i !== idx);
              return { ...r, count: newUserIds.length, userIds: newUserIds, userNames: newUserNames };
            })
            .filter((r) => r.count > 0),
        };
      }),
    });

    try {
      await api.removeReaction(messageId, emoji);
    } catch {
      if (channelAtUpdate) get().fetchMessages(channelAtUpdate);
    }
  },
}));

function getUserId(): number | null {
  return useAuthStore.getState().user?.id ?? null;
}
