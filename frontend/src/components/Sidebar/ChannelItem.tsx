import { Hash, Lock } from 'lucide-react';
import type { Channel } from '@/lib/types';
import { SidebarItem } from './SidebarItem';

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
  const hasUnread = channel.unreadCount > 0;

  return (
    <SidebarItem
      isActive={isActive}
      hasUnread={hasUnread}
      unreadCount={channel.unreadCount}
      onClick={onClick}
      leftSlot={<Icon className="w-4 h-4 flex-shrink-0" />}
      label={channel.name}
    />
  );
}
