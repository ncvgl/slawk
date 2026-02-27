import { useState } from 'react';
import { format } from 'date-fns';
import { Smile, MessageSquare, MoreHorizontal, Bookmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { MessageReactions } from './MessageReactions';
import type { Message as MessageType } from '@/mocks/messages';

interface MessageProps {
  message: MessageType;
  showAvatar: boolean;
  isCompact: boolean;
}

export function Message({ message, showAvatar, isCompact }: MessageProps) {
  const [isHovered, setIsHovered] = useState(false);

  const formattedTime = format(message.createdAt, 'h:mm a');

  return (
    <div
      className={cn(
        'group relative flex gap-2 rounded px-2 py-1 hover:bg-gray-50',
        isCompact && 'pl-12'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Avatar or Time placeholder */}
      {showAvatar ? (
        <Avatar
          src={message.user.avatar}
          alt={message.user.name}
          fallback={message.user.name}
          size="md"
          className="mt-1 flex-shrink-0"
        />
      ) : (
        <span className="absolute left-2 top-1.5 hidden text-[11px] text-gray-500 group-hover:inline">
          {format(message.createdAt, 'h:mm')}
        </span>
      )}

      {/* Message Content */}
      <div className="min-w-0 flex-1">
        {showAvatar && (
          <div className="flex items-baseline gap-2">
            <button className="font-bold text-[#1d1c1d] hover:underline">
              {message.user.displayName || message.user.name}
            </button>
            <span className="text-xs text-gray-500">{formattedTime}</span>
            {message.isEdited && (
              <span className="text-xs text-gray-400">(edited)</span>
            )}
          </div>
        )}
        <div className="text-[15px] text-[#1d1c1d] whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <MessageReactions
            reactions={message.reactions}
            messageId={message.id}
          />
        )}

        {/* Thread indicator */}
        {message.threadCount > 0 && (
          <button className="mt-1 flex items-center gap-1 rounded px-2 py-1 text-[13px] text-[#1264a3] hover:bg-[#e8f5fa]">
            <MessageSquare className="h-4 w-4" />
            <span>
              {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
            </span>
          </button>
        )}
      </div>

      {/* Hover Actions */}
      {isHovered && (
        <div className="absolute -top-4 right-2 flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-md">
          <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
            <Smile className="h-4 w-4 text-gray-600" />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
            <MessageSquare className="h-4 w-4 text-gray-600" />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
            <Bookmark className="h-4 w-4 text-gray-600" />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
            <MoreHorizontal className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      )}
    </div>
  );
}
