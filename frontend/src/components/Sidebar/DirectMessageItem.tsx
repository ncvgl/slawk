import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/useAuthStore';
import type { DirectMessage } from '@/lib/types';

interface DirectMessageItemProps {
  dm: DirectMessage;
  isActive: boolean;
  onClick: () => void;
}

export function DirectMessageItem({
  dm,
  isActive,
  onClick,
}: DirectMessageItemProps) {
  const hasUnread = dm.unreadCount > 0;
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = dm.userId === currentUser?.id;

  return (
    <button
      data-testid="dm-list-item"
      onClick={onClick}
      data-active={isActive}
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
      <Avatar
        src={dm.userAvatar}
        alt={dm.userName}
        fallback={dm.userName}
        size="sm"
        status={dm.userStatus}
      />
      <span className="truncate">{dm.userName}{isSelf && <span className="opacity-60"> (you)</span>}</span>
      {hasUnread && (
        <span className={cn(
          'text-[12px] ml-1 min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5',
          isActive ? 'bg-slack-primary text-white' : 'bg-slack-badge text-white'
        )}>
          {dm.unreadCount}
        </span>
      )}
    </button>
  );
}
