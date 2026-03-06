import { create } from 'zustand';
import { getConversation, sendDM, editDM, deleteDM, type ApiDirectMessage } from '@/lib/api';

export interface DMMessage {
  id: number;
  content: string;
  fromUserId: number;
  fromUser: { id: number; name: string; avatar?: string | null };
  createdAt: Date;
  editedAt?: Date | null;
  threadId?: number | null;
  replyCount: number;
}

function transformDM(dm: ApiDirectMessage): DMMessage {
  return {
    id: dm.id,
    content: dm.content,
    fromUserId: dm.fromUserId,
    fromUser: dm.fromUser,
    createdAt: new Date(dm.createdAt),
    editedAt: dm.editedAt ? new Date(dm.editedAt) : null,
    threadId: dm.threadId ?? null,
    replyCount: dm._count?.replies ?? 0,
  };
}

interface DMState {
  messages: Record<number, DMMessage[]>;
  isLoading: boolean;
  loadError: string | null;
  isSending: boolean;
  sendError: string | null;

  fetchConversation: (userId: number) => Promise<void>;
  sendMessage: (userId: number, content: string) => Promise<void>;
  editMessage: (messageId: number, content: string, userId: number) => Promise<void>;
  deleteMessage: (messageId: number, userId: number) => Promise<void>;
  addIncomingMessage: (dm: ApiDirectMessage, currentUserId: number) => void;
  updateReplyCount: (messageId: number, userId: number, count: number) => void;
  clearConversation: (userId: number) => void;
  clearSendError: () => void;
}

export const useDMStore = create<DMState>((set, get) => ({
  messages: {},
  isLoading: false,
  loadError: null,
  isSending: false,
  sendError: null,

  fetchConversation: async (userId: number) => {
    set({ isLoading: true, loadError: null });
    try {
      const data = await getConversation(userId);
      const msgs = data.messages.map(transformDM);
      msgs.reverse(); // API returns DESC, we want ASC
      set((state) => ({
        messages: { ...state.messages, [userId]: msgs },
        isLoading: false,
        loadError: null,
      }));
    } catch {
      set({ isLoading: false, loadError: 'Failed to load messages.' });
    }
  },

  sendMessage: async (userId: number, content: string) => {
    set({ isSending: true, sendError: null });
    try {
      const dm = await sendDM(userId, content);
      const message = transformDM(dm);
      set((state) => ({
        messages: {
          ...state.messages,
          [userId]: [...(state.messages[userId] ?? []), message],
        },
        isSending: false,
      }));
    } catch {
      set({ isSending: false, sendError: 'Message failed to send. Please try again.' });
    }
  },

  editMessage: async (messageId: number, content: string, userId: number) => {
    try {
      const updated = await editDM(messageId, content);
      const message = transformDM(updated);
      set((state) => ({
        messages: {
          ...state.messages,
          [userId]: (state.messages[userId] ?? []).map((m) =>
            m.id === messageId ? message : m,
          ),
        },
      }));
    } catch (err) {
      console.error('Failed to edit DM:', err);
      throw err;
    }
  },

  deleteMessage: async (messageId: number, userId: number) => {
    try {
      await deleteDM(messageId);
      set((state) => ({
        messages: {
          ...state.messages,
          [userId]: (state.messages[userId] ?? []).filter((m) => m.id !== messageId),
        },
      }));
    } catch (err) {
      console.error('Failed to delete DM:', err);
      throw err;
    }
  },

  clearSendError: () => set({ sendError: null }),

  updateReplyCount: (messageId: number, userId: number, count: number) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [userId]: (state.messages[userId] ?? []).map((m) =>
          m.id === messageId ? { ...m, replyCount: count } : m,
        ),
      },
    }));
  },

  addIncomingMessage: (dm: ApiDirectMessage, currentUserId: number) => {
    // Thread replies don't appear in the main conversation
    if (dm.threadId) return;
    const otherUserId = dm.fromUserId === currentUserId ? dm.toUserId : dm.fromUserId;
    const state = get();
    // Only add if we have this conversation loaded and the message isn't already there
    if (!state.messages[otherUserId]) return;
    if (state.messages[otherUserId].some((m) => m.id === dm.id)) return;
    const message = transformDM(dm);
    set({
      messages: {
        ...state.messages,
        [otherUserId]: [...state.messages[otherUserId], message],
      },
    });
  },

  clearConversation: (userId: number) => {
    set((state) => {
      const { [userId]: _, ...rest } = state.messages;
      return { messages: rest };
    });
  },
}));
