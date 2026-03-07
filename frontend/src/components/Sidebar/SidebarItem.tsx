import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { UnreadBadge } from './UnreadBadge';

interface SidebarItemProps {
  isActive: boolean;
  hasUnread: boolean;
  unreadCount: number;
  onClick: () => void;
  leftSlot: ReactNode;
  label: ReactNode;
  'data-testid'?: string;
}

export function SidebarItem({
  isActive,
  hasUnread,
  unreadCount,
  onClick,
  leftSlot,
  label,
  'data-testid': testId,
}: SidebarItemProps) {
  return (
    <button
      onClick={onClick}
      data-active={isActive}
      data-testid={testId}
      className={cn(
        'flex w-full items-center gap-2 h-[28px] text-[15px] transition-all rounded-[6px] text-left',
        'mx-2 w-[calc(100%-16px)] px-4',
        isActive
          ? 'bg-white text-slack-primary font-bold'
          : hasUnread
            ? 'text-white font-bold hover:bg-white/10'
            : 'text-white/70 font-normal hover:bg-white/10'
      )}
    >
      {leftSlot}
      <span className="truncate">{label}</span>
      <UnreadBadge count={unreadCount} isActive={isActive} />
    </button>
  );
}
