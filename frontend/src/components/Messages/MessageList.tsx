import { useEffect, useRef, useState } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { useMessageStore } from '@/stores/useMessageStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { markChannelRead } from '@/lib/api';
import { Message } from './Message';
import type { Message as MessageType } from '@/lib/types';

interface MessageListProps {
  channelId: number;
  onOpenThread?: (messageId: number) => void;
  readOnly?: boolean;
}

function formatDateSeparator(date: Date): string {
  if (isToday(date)) {
    return 'Today';
  }
  if (isYesterday(date)) {
    return 'Yesterday';
  }
  return format(date, 'EEEE, MMMM d');
}

function shouldShowDateSeparator(
  currentMessage: MessageType,
  previousMessage: MessageType | undefined
): boolean {
  if (!previousMessage) return true;
  return !isSameDay(currentMessage.createdAt, previousMessage.createdAt);
}

function shouldShowAvatar(
  currentMessage: MessageType,
  previousMessage: MessageType | undefined
): boolean {
  if (!previousMessage) return true;
  if (!isSameDay(currentMessage.createdAt, previousMessage.createdAt)) return true;
  if (currentMessage.userId !== previousMessage.userId) return true;
  // Show avatar if more than 5 minutes apart
  const timeDiff =
    currentMessage.createdAt.getTime() - previousMessage.createdAt.getTime();
  return timeDiff > 5 * 60 * 1000;
}

export function MessageList({ channelId, onOpenThread, readOnly }: MessageListProps) {
  const { getMessagesForChannel, fetchMessages, isLoading, loadError } = useMessageStore();
  const { markChannelAsRead } = useChannelStore();
  const scrollToMessageId = useChannelStore((s) => s.scrollToMessageId);
  const messages = getMessagesForChannel(channelId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const didScrollToTarget = useRef(false);

  // Clear stale refs and fetch messages when channel changes
  useEffect(() => {
    messageRefs.current = new Map();
    fetchMessages(channelId);
  }, [channelId, fetchMessages]);

  // After messages load, persist the read state to the backend so the
  // unread badge does not reappear on page reload.
  useEffect(() => {
    if (readOnly || messages.length === 0) return;
    const lastMessage = messages[messages.length - 1];
    // Update in-memory unread count immediately
    markChannelAsRead(channelId);
    // Persist to the server (fire-and-forget; errors are non-critical)
    markChannelRead(channelId, lastMessage.id).catch(() => {
      // Silently ignore errors (e.g. if the user isn't a member)
    });
  }, [channelId, messages.length, markChannelAsRead, readOnly]);

  // Scroll to target message from search result
  useEffect(() => {
    if (!scrollToMessageId || messages.length === 0) return;
    const el = messageRefs.current.get(scrollToMessageId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedId(scrollToMessageId);
      didScrollToTarget.current = true;
      useChannelStore.setState({ scrollToMessageId: null });
    }
  }, [scrollToMessageId, messages.length]);

  // Auto-clear highlight after 2s
  useEffect(() => {
    if (!highlightedId) return;
    const timer = setTimeout(() => setHighlightedId(null), 2000);
    return () => clearTimeout(timer);
  }, [highlightedId]);

  // Auto-scroll to bottom on new messages (only when not targeting a specific message)
  useEffect(() => {
    if (scrollToMessageId) return;
    if (didScrollToTarget.current) {
      didScrollToTarget.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, scrollToMessageId]);

  if (isLoading && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-slack-hint">
        <p className="text-sm">Loading messages...</p>
      </div>
    );
  }

  if (loadError && messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-slack-error">{loadError}</p>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-slack-hint">
        <p className="text-lg font-medium">No messages yet</p>
        <p className="text-sm">{readOnly ? 'This channel has no messages.' : 'Be the first to send a message!'}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pt-5 pb-4 bg-white">
      {messages.map((message, index) => {
        const previousMessage = messages[index - 1];
        const showDateSeparator = shouldShowDateSeparator(message, previousMessage);
        const showAvatar = shouldShowAvatar(message, previousMessage);

        return (
          <div
            key={message.id}
            ref={(el) => {
              if (el) messageRefs.current.set(message.id, el);
              else messageRefs.current.delete(message.id);
            }}
            className={highlightedId === message.id ? 'transition-colors duration-700 bg-yellow-100' : ''}
          >
            {showDateSeparator && (
              <div className="relative my-[10px] flex items-center">
                <div className="flex-1 border-t border-slack-border-light" />
                <button className="flex-shrink-0 rounded-full border border-slack-border-light bg-white px-3 py-[2px] text-[13px] font-semibold text-slack-primary hover:bg-slack-hover transition-colors">
                  {formatDateSeparator(message.createdAt)}
                </button>
                <div className="flex-1 border-t border-slack-border-light" />
              </div>
            )}
            <Message
              message={message}
              showAvatar={showAvatar}
              isCompact={!showAvatar}
              onOpenThread={onOpenThread}
              readOnly={readOnly}
            />
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
