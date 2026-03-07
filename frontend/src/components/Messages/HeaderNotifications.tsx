import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChannelStore } from '@/stores/useChannelStore';
import { Button } from '@/components/ui/button';
import { useClickOutside } from '@/hooks/useClickOutside';

interface HeaderNotificationsProps {
  excludeChannelId?: number;
  testIdPrefix?: string;
}

export function HeaderNotifications({ excludeChannelId, testIdPrefix = '' }: HeaderNotificationsProps) {
  const navigate = useNavigate();
  const channels = useChannelStore((s) => s.channels);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const closeNotifications = useCallback(() => setShowNotifications(false), []);
  useClickOutside(notifRef, closeNotifications, showNotifications);

  const prefix = testIdPrefix ? `${testIdPrefix}-` : '';
  const unread = channels.filter((ch) => ch.unreadCount > 0 && (excludeChannelId === undefined || ch.id !== excludeChannelId));

  return (
    <div className="relative" ref={notifRef}>
      <Button
        variant="toolbar"
        size="icon-xs"
        data-testid={`${prefix}notification-bell`}
        title="Notifications"
        onClick={() => setShowNotifications((v) => !v)}
      >
        <Bell className={cn('h-4 w-4', showNotifications ? 'text-slack-link' : 'text-slack-secondary')} />
      </Button>
      {showNotifications && (
        <div data-testid={`${prefix}notifications-panel`} className="absolute right-0 top-7 z-50 w-[300px] max-h-[360px] overflow-y-auto rounded-lg border border-slack-border bg-white shadow-lg">
          <div className="px-3 py-2 border-b border-slack-border">
            <h3 className="text-[13px] font-bold text-slack-primary">Activity</h3>
          </div>
          {unread.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-slack-hint">No new notifications</p>
          ) : (
            unread.map((ch) => (
              <button
                key={ch.id}
                onClick={() => { navigate(`/c/${ch.id}`); setShowNotifications(false); }}
                className="w-full text-left px-3 py-2 hover:bg-slack-hover border-b border-slack-border-light last:border-b-0"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium text-slack-primary">#{ch.name}</span>
                  <span className="text-[12px] bg-slack-badge text-white rounded-full px-1.5 min-w-[20px] text-center">{ch.unreadCount}</span>
                </div>
                <p className="text-[12px] text-slack-hint mt-0.5">{ch.unreadCount} unread message{ch.unreadCount !== 1 ? 's' : ''}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
