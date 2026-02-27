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
        'flex w-full items-center gap-2 px-4 py-1 text-[15px] transition-colors',
        isActive
          ? 'bg-[#f9edff] text-[#1d1c1d] font-medium'
          : 'hover:bg-white/10'
      )}
    >
      <Icon className="h-4 w-4 flex-shrink-0" />
      <span className="truncate">{channel.name}</span>
      {channel.unreadCount > 0 && (
        <span
          className={cn(
            'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-medium',
            isActive ? 'bg-[#611f69] text-white' : 'bg-red-500 text-white'
          )}
        >
          {channel.unreadCount}
        </span>
      )}
    </button>
  );
}
