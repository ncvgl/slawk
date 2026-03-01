import { useState, useEffect, useRef } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { SendHorizontal, Smile, MessageSquare, MoreHorizontal } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { getConversation, sendDM, type ApiDirectMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

interface DMConversationProps {
  userId: number;
  userName: string;
  userAvatar?: string;
}

interface DMMessage {
  id: number;
  content: string;
  fromUserId: number;
  fromUser: { id: number; name: string; avatar?: string | null };
  createdAt: Date;
}

function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMMM d');
}

export function DMConversation({ userId, userName, userAvatar }: DMConversationProps) {
  const [messages, setMessages] = useState<DMMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUser = useAuthStore((s) => s.user);

  const transformDM = (dm: ApiDirectMessage): DMMessage => ({
    id: dm.id,
    content: dm.content,
    fromUserId: dm.fromUserId,
    fromUser: dm.fromUser,
    createdAt: new Date(dm.createdAt),
  });

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setMessages([]);

    getConversation(userId)
      .then((data) => {
        if (cancelled) return;
        const msgs = data.messages.map(transformDM);
        msgs.reverse(); // API returns DESC, we want ASC
        setMessages(msgs);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSend = async () => {
    const text = messageText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      const dm = await sendDM(userId, text);
      setMessages((prev) => [...prev, transformDM(dm)]);
      setMessageText('');
    } catch (err) {
      console.error('Failed to send DM:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div data-testid="dm-conversation" className="flex h-full flex-col">
      {/* Header */}
      <header className="flex h-[49px] items-center border-b border-[#E0E0E0] bg-white px-4">
        <Avatar
          src={userAvatar || undefined}
          alt={userName}
          fallback={userName}
          size="md"
          status="online"
        />
        <span className="ml-2 text-[18px] font-bold text-[#1D1C1D]">{userName}</span>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 pt-5 pb-4 bg-white">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            Loading messages...
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <p className="text-lg font-medium">Start of your conversation with {userName}</p>
            <p className="text-sm">Send a message to begin.</p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const prevMsg = messages[i - 1];
              const showDate = !prevMsg || !isToday(prevMsg.createdAt) && format(msg.createdAt, 'yyyy-MM-dd') !== format(prevMsg.createdAt, 'yyyy-MM-dd');
              const showAvatar = !prevMsg || prevMsg.fromUserId !== msg.fromUserId;

              return (
                <div key={msg.id}>
                  {showDate && (
                    <div className="relative my-[10px] flex items-center">
                      <div className="flex-1 border-t border-[rgba(29,28,29,0.13)]" />
                      <span className="flex-shrink-0 rounded-full border border-[rgba(29,28,29,0.13)] bg-white px-3 py-[2px] text-[13px] font-semibold text-[#1D1C1D]">
                        {formatDateSeparator(msg.createdAt)}
                      </span>
                      <div className="flex-1 border-t border-[rgba(29,28,29,0.13)]" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'group relative flex px-0 hover:bg-[#F8F8F8]',
                      showAvatar ? 'pt-4 pb-2' : 'py-0.5'
                    )}
                    onMouseEnter={() => setHoveredMessageId(msg.id)}
                    onMouseLeave={() => setHoveredMessageId(null)}
                  >
                    <div className="w-9 flex-shrink-0 mr-2">
                      {showAvatar ? (
                        <Avatar
                          src={msg.fromUser.avatar || undefined}
                          alt={msg.fromUser.name}
                          fallback={msg.fromUser.name}
                          size="md"
                          className="mt-[5px]"
                        />
                      ) : (
                        <span className="hidden text-[12px] text-[#616061] group-hover:inline leading-[22px]">
                          {format(msg.createdAt, 'h:mm')}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      {showAvatar && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-[15px] font-black text-[#1D1C1D]">
                            {msg.fromUser.name}
                          </span>
                          <span className="text-[12px] text-[#616061]">
                            {format(msg.createdAt, 'h:mm a')}
                          </span>
                        </div>
                      )}
                      <p className="text-[15px] text-[#1D1C1D] leading-[22px] whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    </div>

                    {/* Hover action toolbar */}
                    {hoveredMessageId === msg.id && (
                      <div
                        data-testid="dm-message-toolbar"
                        className="absolute -top-4 right-2 flex items-center gap-0.5 rounded-lg border border-[#E0E0E0] bg-white p-0.5 shadow-sm"
                      >
                        <button
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
                          title="Add reaction"
                        >
                          <Smile className="h-4 w-4 text-[#616061]" />
                        </button>
                        <button
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
                          title="Reply in thread"
                        >
                          <MessageSquare className="h-4 w-4 text-[#616061]" />
                        </button>
                        <button
                          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
                          title="More actions"
                        >
                          <MoreHorizontal className="h-4 w-4 text-[#616061]" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="px-5 pb-6 pt-4 bg-white">
        <div className="flex items-center gap-2 rounded-lg border border-[rgba(29,28,29,0.13)] px-3 py-2 focus-within:border-[#1264A3] focus-within:border-2">
          <input
            data-testid="dm-message-input"
            type="text"
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${userName}`}
            className="flex-1 text-[15px] text-[#1D1C1D] outline-none placeholder:text-[#616061]"
          />
          <button
            onClick={handleSend}
            disabled={!messageText.trim() || isSending}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-colors',
              messageText.trim()
                ? 'bg-[#007a5a] text-white hover:bg-[#005e46]'
                : 'text-gray-400'
            )}
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
