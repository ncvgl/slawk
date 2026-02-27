import { Hash, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Channel } from '@/mocks/channels';

interface ChannelItemProps {
  channel: Channel;
  isActive: boolean;
  isPrivate?: boolean;
  onClick: () => void;
}

export function ChannelItem({
  channel,
  isActive,
  isPrivate,
  onClick,
}: ChannelItemProps) {
  const Icon = isPrivate ? Lock : Hash;

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 px-4 h-[28px] text-[15px] font-normal transition-colors mx-2 rounded-md',
        'w-[calc(100%-16px)]',
        isActive
          ? 'bg-[rgba(88,66,124,1)] text-white font-medium'
          : 'text-[rgba(255,255,255,0.7)] hover:bg-[rgba(88,66,124,1)] hover:text-white'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{channel.name}</span>
      {channel.unreadCount > 0 && (
        <span
          className={cn(
            'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-medium',
            isActive ? 'bg-[#3F0E40] text-white' : 'bg-red-500 text-white'
          )}
        >
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}
