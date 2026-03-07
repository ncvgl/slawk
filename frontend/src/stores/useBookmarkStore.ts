import { create } from 'zustand';
import { getBookmarks, addBookmark, removeBookmark } from '@/lib/api';

interface BookmarkState {
  bookmarkedIds: Set<number>;
  loaded: boolean;
  load: () => Promise<void>;
  toggle: (messageId: number) => Promise<void>;
  isBookmarked: (messageId: number) => boolean;
}

export const useBookmarkStore = create<BookmarkState>((set, get) => ({
  bookmarkedIds: new Set(),
  loaded: false,

  load: async () => {
    try {
      const bookmarks = await getBookmarks();
      set({ bookmarkedIds: new Set(bookmarks.map((b) => b.messageId)), loaded: true });
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    }
  },

  toggle: async (messageId: number) => {
    const { bookmarkedIds } = get();
    const isCurrentlyBookmarked = bookmarkedIds.has(messageId);

    // Optimistic update
    const next = new Set(bookmarkedIds);
    if (isCurrentlyBookmarked) {
      next.delete(messageId);
    } else {
      next.add(messageId);
    }
    set({ bookmarkedIds: next });

    try {
      if (isCurrentlyBookmarked) {
        await removeBookmark(messageId);
      } else {
        await addBookmark(messageId);
      }
    } catch {
      // Granular revert: only undo this specific toggle, not the entire set
      const current = get().bookmarkedIds;
      const reverted = new Set(current);
      if (isCurrentlyBookmarked) {
        reverted.add(messageId);
      } else {
        reverted.delete(messageId);
      }
      set({ bookmarkedIds: reverted });
    }
  },

  isBookmarked: (messageId: number) => {
    return get().bookmarkedIds.has(messageId);
  },
}));
