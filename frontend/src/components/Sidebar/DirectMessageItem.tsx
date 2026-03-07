import { Avatar } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/useAuthStore';
import type { DirectMessage } from '@/lib/types';
import { SidebarItem } from './SidebarItem';

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
    <SidebarItem
      data-testid="dm-list-item"
      isActive={isActive}
      hasUnread={hasUnread}
      unreadCount={dm.unreadCount}
      onClick={onClick}
      leftSlot={
        <Avatar
          src={dm.userAvatar}
          alt={dm.userName}
          fallback={dm.userName}
          size="sm"
          status={dm.userStatus}
        />
      }
      label={<>{dm.userName}{isSelf && <span className="opacity-60"> (you)</span>}</>}
    />
  );
}
