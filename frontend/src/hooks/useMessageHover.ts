import { useState, useRef, useCallback } from 'react';

// Module-level: only one message toolbar should be visible at a time.
// When a new message is hovered, dismiss the previous one immediately.
let dismissActiveHover: (() => void) | null = null;

/**
 * Shared hover-with-delay behavior for message rows.
 * Provides a 150ms leave delay so menus/pickers stay visible.
 * On mobile (touch), tapping a message toggles the toolbar.
 * Only one message toolbar can be visible at a time.
 */
export function useMessageHover() {
  const [isHovered, setIsHovered] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const isTouchRef = useRef(false);

  // Stable dismiss function for this instance (always references current refs)
  const dismissRef = useRef<() => void>(() => {});
  dismissRef.current = () => {
    clearTimeout(leaveTimer.current);
    setIsHovered(false);
  };

  const onMouseEnter = useCallback(() => {
    if (isTouchRef.current) return;
    clearTimeout(leaveTimer.current);
    // Immediately dismiss the previously hovered message's toolbar
    if (dismissActiveHover) dismissActiveHover();
    dismissActiveHover = () => dismissRef.current();
    setIsHovered(true);
  }, []);

  const onMouseLeave = useCallback((onLeave?: () => void) => {
    if (isTouchRef.current) return;
    leaveTimer.current = setTimeout(() => {
      setIsHovered(false);
      onLeave?.();
    }, 150);
  }, []);

  const onTouchStart = useCallback(() => {
    isTouchRef.current = true;
    if (dismissActiveHover) dismissActiveHover();
    dismissActiveHover = () => dismissRef.current();
    setIsHovered((prev) => !prev);
  }, []);

  return { isHovered, setIsHovered, onMouseEnter, onMouseLeave, onTouchStart };
}
