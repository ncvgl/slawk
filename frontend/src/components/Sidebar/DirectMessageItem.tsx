import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import type { DirectMessage } from '@/mocks/channels';

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
      <Avatar
        src={dm.userAvatar}
        alt={dm.userName}
        fallback={dm.userName}
        size="sm"
        status={dm.userStatus}
      />
      <span className="truncate flex-1">{dm.userName}</span>
      {dm.unreadCount > 0 && (
        <span className="text-[12px] px-[6px] py-[2px] bg-white/20 rounded-full">
          {dm.unreadCount}
        </span>
      )}
    </button>
  );
}
