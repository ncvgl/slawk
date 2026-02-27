import { create } from 'zustand';
import { mockMessages, type Message } from '@/mocks/messages';
import { currentUser } from '@/mocks/users';

interface MessageState {
  messages: Message[];
  isLoading: boolean;

  getMessagesForChannel: (channelId: number) => Message[];
  sendMessage: (channelId: number, content: string) => void;
  addReaction: (messageId: number, emoji: string) => void;
  removeReaction: (messageId: number, emoji: string) => void;
}

export const useMessageStore = create<MessageState>((set, get) => ({
  messages: mockMessages,
  isLoading: false,

  getMessagesForChannel: (channelId: number) => {
    return get()
      .messages.filter((msg) => msg.channelId === channelId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  sendMessage: (channelId: number, content: string) => {
    const newMessage: Message = {
      id: Date.now(),
      content,
      userId: currentUser.id,
      user: currentUser,
      channelId,
      createdAt: new Date(),
      reactions: [],
      threadCount: 0,
    };

    set((state) => ({
      messages: [...state.messages, newMessage],
    }));
  },

  addReaction: (messageId: number, emoji: string) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;

        const existingReaction = msg.reactions.find((r) => r.emoji === emoji);
        if (existingReaction) {
          // Add user to existing reaction
          if (!existingReaction.userIds.includes(currentUser.id)) {
            return {
              ...msg,
              reactions: msg.reactions.map((r) =>
                r.emoji === emoji
                  ? {
                      ...r,
                      count: r.count + 1,
                      userIds: [...r.userIds, currentUser.id],
                    }
                  : r
              ),
            };
          }
          return msg;
        }

        // Add new reaction
        return {
          ...msg,
          reactions: [
            ...msg.reactions,
            { emoji, count: 1, userIds: [currentUser.id] },
          ],
        };
      }),
    }));
  },

  removeReaction: (messageId: number, emoji: string) => {
    set((state) => ({
      messages: state.messages.map((msg) => {
        if (msg.id !== messageId) return msg;

        return {
          ...msg,
          reactions: msg.reactions
            .map((r) => {
              if (r.emoji !== emoji) return r;
              const newUserIds = r.userIds.filter((id) => id !== currentUser.id);
              return {
                ...r,
                count: newUserIds.length,
                userIds: newUserIds,
              };
            })
            .filter((r) => r.count > 0),
        };
      }),
    }));
  },
}));
