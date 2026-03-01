import { useState, useEffect, useRef } from 'react';
import { X, SendHorizontal } from 'lucide-react';
import { format } from 'date-fns';
import { Avatar } from '@/components/ui/avatar';
import { getThread, replyToMessage, type ApiMessage } from '@/lib/api';
import { cn } from '@/lib/utils';

interface ThreadPanelProps {
  messageId: number;
  onClose: () => void;
  onReplyCountChange?: (messageId: number, count: number) => void;
}

interface ThreadMessage {
  id: number;
  content: string;
  userId: number;
  user: { id: number; name: string; email: string; avatar?: string | null };
  createdAt: Date;
}

export function ThreadPanel({ messageId, onClose, onReplyCountChange }: ThreadPanelProps) {
  const [parentMessage, setParentMessage] = useState<ThreadMessage | null>(null);
  const [replies, setReplies] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const repliesEndRef = useRef<HTMLDivElement>(null);

  const transformMessage = (msg: ApiMessage): ThreadMessage => ({
    id: msg.id,
    content: msg.content,
    userId: msg.userId,
    user: msg.user,
    createdAt: new Date(msg.createdAt),
  });

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    getThread(messageId)
      .then((data) => {
        if (cancelled) return;
        setParentMessage(transformMessage(data.parent));
        setReplies(data.replies.map(transformMessage));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [messageId]);

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  const handleSendReply = async () => {
    const text = replyText.trim();
    if (!text || isSending) return;

    setIsSending(true);
    try {
      const apiReply = await replyToMessage(messageId, text);
      const reply = transformMessage(apiReply);
      setReplies((prev) => [...prev, reply]);
      setReplyText('');
      onReplyCountChange?.(messageId, replies.length + 1);
    } catch (err) {
      console.error('Failed to send reply:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendReply();
    }
  };

  return (
    <div
      data-testid="thread-panel"
      className="flex w-[380px] flex-col border-l border-[#E0E0E0] bg-white"
    >
      {/* Header */}
      <div className="flex h-[49px] items-center justify-between border-b border-[#E0E0E0] px-4">
        <h3 className="text-[15px] font-bold text-[#1D1C1D]">Thread</h3>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
        >
          <X className="h-4 w-4 text-[#616061]" />
        </button>
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="text-center text-sm text-gray-500 py-4">Loading thread...</div>
        ) : (
          <>
            {/* Parent message */}
            {parentMessage && (
              <div className="mb-4 pb-3 border-b border-[#E0E0E0]">
                <div className="flex items-start gap-2">
                  <Avatar
                    alt={parentMessage.user.name}
                    fallback={parentMessage.user.name}
                    size="md"
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-bold text-[#1D1C1D]">
                        {parentMessage.user.name}
                      </span>
                      <span className="text-[12px] text-[#616061]">
                        {format(parentMessage.createdAt, 'h:mm a')}
                      </span>
                    </div>
                    <p className="text-[15px] text-[#1D1C1D] leading-[22px] whitespace-pre-wrap break-words">
                      {parentMessage.content}
                    </p>
                  </div>
                </div>
                {replies.length > 0 && (
                  <div className="mt-2 text-[12px] text-[#616061]">
                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                  </div>
                )}
              </div>
            )}

            {/* Replies */}
            {replies.map((reply) => (
              <div key={reply.id} className="mb-3">
                <div className="flex items-start gap-2">
                  <Avatar
                    alt={reply.user.name}
                    fallback={reply.user.name}
                    size="sm"
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[14px] font-bold text-[#1D1C1D]">
                        {reply.user.name}
                      </span>
                      <span className="text-[11px] text-[#616061]">
                        {format(reply.createdAt, 'h:mm a')}
                      </span>
                    </div>
                    <p className="text-[14px] text-[#1D1C1D] leading-[20px] whitespace-pre-wrap break-words">
                      {reply.content}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <div ref={repliesEndRef} />
          </>
        )}
      </div>

      {/* Reply input */}
      <div className="border-t border-[#E0E0E0] px-4 py-3">
        <div className="flex items-center gap-2 rounded-lg border border-[rgba(29,28,29,0.13)] px-3 py-2 focus-within:border-[#1264A3]">
          <input
            data-testid="thread-reply-input"
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Reply..."
            className="flex-1 text-[14px] text-[#1D1C1D] outline-none placeholder:text-[#616061]"
          />
          <button
            onClick={handleSendReply}
            disabled={!replyText.trim() || isSending}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-colors',
              replyText.trim()
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
