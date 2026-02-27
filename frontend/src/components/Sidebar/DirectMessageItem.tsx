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
        'flex w-full items-center gap-2 h-[28px] text-[15px] transition-all rounded-md',
        'ml-[8px] mr-[8px] w-[calc(100%-16px)] pl-[20px] pr-[8px]',
        isActive
          ? 'bg-[#F9EDFF]/95 text-[#3D0E3F]'
          : 'text-[rgba(255,255,255,0.85)] hover:bg-[rgba(255,255,255,0.1)] hover:text-white'
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
