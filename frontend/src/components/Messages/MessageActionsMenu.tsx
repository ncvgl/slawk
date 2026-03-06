import { useRef, useLayoutEffect, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pin, Pencil, Trash2, MailOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface MessageActionsMenuProps {
  onPin?: () => void;
  isPinned?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onMarkUnread?: () => void;
  onClose: () => void;
  showOwnerActions: boolean;
  /** Classes applied to the invisible positioning anchor (e.g. absolute -top-4 right-5 mt-9) */
  anchorClassName?: string;
  testIdPrefix?: string;
}

export function MessageActionsMenu({
  onPin,
  isPinned,
  onEdit,
  onDelete,
  onMarkUnread,
  onClose,
  showOwnerActions,
  anchorClassName,
  testIdPrefix,
}: MessageActionsMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Initial position measurement
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const menu = menuRef.current;
    if (!anchor || !menu) return;

    const anchorRect = anchor.getBoundingClientRect();
    const menuHeight = menu.offsetHeight;
    const menuWidth = menu.offsetWidth;

    let top = anchorRect.top;
    if (top + menuHeight > window.innerHeight) {
      top = Math.max(0, anchorRect.top - menuHeight);
    }

    setPos({ top, left: Math.max(0, anchorRect.right - menuWidth) });
  }, []);

  // Close on scroll (matches Slack behavior) and click outside
  useEffect(() => {
    const handleScroll = () => onCloseRef.current();
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    // Delay listeners to avoid catching the opening click/scroll
    const timerId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside, true);
      window.addEventListener('scroll', handleScroll, true);
    }, 0);
    return () => {
      clearTimeout(timerId);
      document.removeEventListener('click', handleClickOutside, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const hasAnyAction = onPin || showOwnerActions || onMarkUnread;

  const menuContent = (
    <div
      ref={menuRef}
      data-testid={testIdPrefix ? `${testIdPrefix}-more-menu` : undefined}
      className="w-48 rounded-lg border border-slack-border bg-white py-1 shadow-lg"
      style={
        pos
          ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }
          : { position: 'fixed', visibility: 'hidden' as const, top: -9999, left: -9999 }
      }
    >
      {!hasAnyAction ? (
        <div className="px-4 py-1.5 text-[13px] text-slack-secondary">
          No actions available
        </div>
      ) : (
        <>
          {onMarkUnread && (
            <Button variant="menu-item" onClick={onMarkUnread}>
              <MailOpen className="h-4 w-4" />
              Mark as unread
            </Button>
          )}
          {onPin && (
            <Button variant="menu-item" onClick={onPin}>
              <Pin className="h-4 w-4" />
              {isPinned ? 'Unpin message' : 'Pin message'}
            </Button>
          )}
          {showOwnerActions && onEdit && (
            <Button
              variant="menu-item"
              data-testid={testIdPrefix ? `${testIdPrefix}-edit-btn` : undefined}
              onClick={onEdit}
            >
              <Pencil className="h-4 w-4" />
              Edit message
            </Button>
          )}
          {showOwnerActions && onDelete && (
            <Button
              variant="menu-item-danger"
              data-testid={testIdPrefix ? `${testIdPrefix}-delete-btn` : undefined}
              onClick={onDelete}
            >
              <Trash2 className="h-4 w-4" />
              Delete message
            </Button>
          )}
        </>
      )}
    </div>
  );

  return (
    <>
      {/* Invisible anchor to measure where the menu should appear */}
      <div ref={anchorRef} className={cn('pointer-events-none', anchorClassName)} style={{ height: 0, overflow: 'hidden' }} />
      {createPortal(menuContent, document.body)}
    </>
  );
}
