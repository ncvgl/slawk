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
      className={cn(
        'flex w-full items-center gap-2 px-4 py-1 text-[15px] transition-colors',
        isActive
          ? 'bg-[#f9edff] text-[#1d1c1d] font-medium'
          : 'hover:bg-white/10'
      )}
    >
      <Avatar
        src={dm.userAvatar}
        alt={dm.userName}
        fallback={dm.userName}
        size="sm"
        status={dm.userStatus}
      />
      <span className="truncate">{dm.userName}</span>
      {dm.unreadCount > 0 && (
        <span
          className={cn(
            'ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-medium',
            isActive ? 'bg-[#611f69] text-white' : 'bg-red-500 text-white'
          )}
        >
          {dm.unreadCount}
        </span>
      )}
    </button>
  );
}
