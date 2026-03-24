import { useState, useEffect, useCallback } from 'react';
import { Inbox, Hash, Menu } from 'lucide-react';
import { format } from 'date-fns';
import { getUnreadMessages, type ApiMessage } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { useNavigate } from 'react-router-dom';
import { useMobileStore } from '@/stores/useMobileStore';

export function UnreadsPage() {
  const [messages, setMessages] = useState<ApiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchUnreads = useCallback(() => {
    setIsLoading(true);
    getUnreadMessages()
      .then((data) => {
        setMessages(data.messages);
        setLoadError(null);
      })
      .catch(() => setLoadError('Failed to load unread messages.'))
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    fetchUnreads();
  }, [fetchUnreads]);

  return (
    <div data-testid="unreads-page" className="flex h-full flex-col">
      <div className="flex flex-col flex-shrink-0 border-b border-slack-border pt-[env(safe-area-inset-top)]">
        <div className="flex h-[49px] items-center px-5">
          <button
            onClick={useMobileStore.getState().openSidebar}
            className="mr-2 flex h-8 w-8 items-center justify-center rounded hover:bg-slack-hover md:hidden"
          >
            <Menu className="h-5 w-5 text-slack-secondary" />
          </button>
          <Inbox className="h-5 w-5 text-slack-secondary mr-2" />
          <span className="text-[18px] font-bold text-slack-primary">Unreads</span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center text-sm text-slack-hint">Loading...</div>
        ) : loadError ? (
          <div className="text-center text-sm text-slack-error">{loadError}</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-slack-hint py-8">
            No unread messages. You're all caught up! 🎉
          </div>
        ) : (
          <div className="space-y-1">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className="flex items-start gap-3 rounded-lg p-3 hover:bg-slack-hover cursor-pointer group"
                onClick={() => navigate(`/c/${msg.channel.id}`, { state: { scrollToMessageId: msg.id } })}
              >
                <Avatar
                  src={msg.user.avatar ?? undefined}
                  alt={msg.user.name}
                  fallback={msg.user.name}
                  size="md"
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-slack-primary">
                      {msg.user.name}
                    </span>
                    <span className="text-[12px] text-slack-secondary">
                      {format(new Date(msg.createdAt), 'MMM d, h:mm a')}
                    </span>
                  </div>
                  <div className="text-[15px] text-slack-primary leading-[22px] whitespace-pre-wrap break-words line-clamp-3">
                    {renderMessageContent(msg.content)}
                  </div>
                  <div className="flex items-center gap-1 mt-1 text-[12px] text-slack-hint">
                    <Hash className="h-3 w-3" />
                    <span>{msg.channel.name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
