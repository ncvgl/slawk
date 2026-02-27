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
        'group relative flex gap-2 px-5 py-[4px] hover:bg-[#F8F8F8]',
        isCompact && 'pl-[56px] py-[2px]'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Avatar or Time placeholder - Avatar is 36x36 with 8px margin-right */}
      {showAvatar ? (
        <Avatar
          src={message.user.avatar}
          alt={message.user.name}
          fallback={message.user.name}
          size="md"
          className="mt-[2px] flex-shrink-0 mr-2"
        />
      ) : (
        <span className="absolute left-5 top-[9px] hidden text-[12px] text-[#616061] group-hover:inline">
          {format(message.createdAt, 'h:mm')}
        </span>
      )}

      {/* Message Content */}
      <div className="min-w-0 flex-1">
        {showAvatar && (
          <div className="flex items-baseline gap-2">
            <button className="text-[15px] font-black text-[#1D1C1D] hover:underline">
              {message.user.displayName || message.user.name}
            </button>
            <span className="text-[12px] font-normal text-[#616061] ml-1">{formattedTime}</span>
            {message.isEdited && (
              <span className="text-[12px] text-[#616061]">(edited)</span>
            )}
          </div>
        )}
        <div className="text-[15px] font-normal text-[#1D1C1D] leading-[1.46668] whitespace-pre-wrap break-words">
          {message.content}
        </div>

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <MessageReactions
            reactions={message.reactions}
            messageId={message.id}
          />
        )}

        {/* Thread indicator - 13px, Slack blue, with mini avatars */}
        {message.threadCount > 0 && (
          <button className="mt-1 flex items-center gap-2 rounded px-1 py-0.5 text-[13px] text-[#1264A3] hover:bg-[#e8f5fa] -ml-1">
            {/* Mini avatar stack */}
            <div className="flex -space-x-1">
              <div className="h-5 w-5 rounded-[4px] bg-[#e8e8e8] border border-white" />
              {message.threadCount > 1 && (
                <div className="h-5 w-5 rounded-[4px] bg-[#d8d8d8] border border-white" />
              )}
            </div>
            <span className="font-normal">
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
