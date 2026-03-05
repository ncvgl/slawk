import { useState, useEffect, useCallback } from 'react';
import { Bookmark, Hash } from 'lucide-react';
import { format } from 'date-fns';
import { getBookmarks, removeBookmark } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { useBookmarkStore } from '@/stores/useBookmarkStore';
import { useNavigate } from 'react-router-dom';

interface BookmarkedMessage {
  messageId: number;
  createdAt: string;
  message: {
    id: number;
    content: string;
    createdAt: string;
    user: { id: number; name: string; email: string; avatar?: string | null };
    channel: { id: number; name: string };
  };
}

export function LaterPage() {
  const [bookmarks, setBookmarks] = useState<BookmarkedMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toggle = useBookmarkStore((s) => s.toggle);
  const navigate = useNavigate();

  const fetchBookmarks = useCallback(() => {
    setIsLoading(true);
    getBookmarks()
      .then((data) => {
        setBookmarks(data as BookmarkedMessage[]);
        setLoadError(null);
      })
      .catch(() => setLoadError('Failed to load saved messages.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const handleRemove = async (messageId: number) => {
    try {
      await removeBookmark(messageId);
      toggle(messageId);
      setBookmarks((prev) => prev.filter((b) => b.messageId !== messageId));
    } catch {
      // ignore
    }
  };

  return (
    <div data-testid="later-page" className="flex h-full flex-col">
      <div className="flex h-[49px] items-center border-b border-slack-border px-5">
        <Bookmark className="h-5 w-5 text-slack-secondary mr-2" />
        <span className="text-[18px] font-bold text-slack-primary">Saved</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center text-sm text-slack-hint">Loading...</div>
        ) : loadError ? (
          <div className="text-center text-sm text-slack-error">{loadError}</div>
        ) : bookmarks.length === 0 ? (
          <div className="text-center text-sm text-slack-hint py-8">
            No saved messages yet. Click the bookmark icon on any message to save it.
          </div>
        ) : (
          <div className="space-y-1">
            {bookmarks.map((bm) => (
              <div
                key={bm.messageId}
                className="flex items-start gap-3 rounded-lg p-3 hover:bg-slack-hover cursor-pointer group"
                onClick={() => navigate(`/c/${bm.message.channel.id}`)}
              >
                <Avatar
                  src={bm.message.user.avatar ?? undefined}
                  alt={bm.message.user.name}
                  fallback={bm.message.user.name}
                  size="md"
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-slack-primary">
                      {bm.message.user.name}
                    </span>
                    <span className="text-[12px] text-slack-secondary">
                      {format(new Date(bm.message.createdAt), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <div className="text-[15px] text-slack-primary leading-[22px] whitespace-pre-wrap break-words line-clamp-3">
                    {renderMessageContent(bm.message.content)}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[12px] text-slack-hint">
                    <Hash className="h-3 w-3" />
                    <span>{bm.message.channel.name}</span>
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(bm.messageId);
                  }}
                  className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded hover:bg-slack-border-light transition-opacity"
                  title="Remove from Saved"
                >
                  <Bookmark className="h-4 w-4 text-slack-warning fill-slack-warning" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
