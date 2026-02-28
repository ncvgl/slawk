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
      data-active={isActive}
      className={cn(
        'flex w-full items-center gap-2 h-[28px] text-[15px] font-normal transition-all rounded-[6px]',
        'mx-2 w-[calc(100%-16px)] px-4',
        isActive
          ? 'bg-[rgba(88,66,124,1)] text-white'
          : 'text-white/70 hover:bg-[rgba(88,66,124,1)] hover:text-white'
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      <span className="truncate flex-1">{channel.name}</span>
      {channel.unreadCount > 0 && (
        <span className="text-[12px] px-[6px] py-[2px] bg-white/20 rounded-full">
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}
