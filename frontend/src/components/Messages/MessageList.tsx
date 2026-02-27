import { useEffect, useRef } from 'react';
import { format, isToday, isYesterday, isSameDay } from 'date-fns';
import { useMessageStore } from '@/stores/useMessageStore';
import { Message } from './Message';
import type { Message as MessageType } from '@/mocks/messages';

interface MessageListProps {
  channelId: number;
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

export function MessageList({ channelId }: MessageListProps) {
  const { getMessagesForChannel } = useMessageStore();
  const messages = getMessagesForChannel(channelId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center text-gray-500">
        <p className="text-lg font-medium">No messages yet</p>
        <p className="text-sm">Be the first to send a message!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto pt-5 pb-2 bg-white">
      {messages.map((message, index) => {
        const previousMessage = messages[index - 1];
        const showDateSeparator = shouldShowDateSeparator(message, previousMessage);
        const showAvatar = shouldShowAvatar(message, previousMessage);

        return (
          <div key={message.id}>
            {showDateSeparator && (
              <div className="relative my-3 flex items-center px-5">
                <div className="flex-1 border-t border-[rgba(29,28,29,0.13)]" />
                <button className="mx-3 flex-shrink-0 rounded-full border border-[rgba(29,28,29,0.13)] bg-white px-3 py-[2px] text-[13px] font-semibold text-[#1D1C1D] hover:bg-[#F8F8F8] transition-colors">
                  {formatDateSeparator(message.createdAt)}
                </button>
                <div className="flex-1 border-t border-[rgba(29,28,29,0.13)]" />
              </div>
            )}
            <Message
              message={message}
              showAvatar={showAvatar}
              isCompact={!showAvatar}
            />
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}
