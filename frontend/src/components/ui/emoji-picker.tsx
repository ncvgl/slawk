import { useEffect, useRef, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Picker } from 'emoji-mart';
import data from '@emoji-mart/data';
import { cn } from '@/lib/utils';

interface EmojiPickerProps {
  onEmojiSelect: (emoji: { native: string; id: string }) => void;
  onClickOutside?: () => void;
}

export function EmojiPicker({ onEmojiSelect, onClickOutside }: EmojiPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onEmojiSelectRef = useRef(onEmojiSelect);
  const onClickOutsideRef = useRef(onClickOutside);

  onEmojiSelectRef.current = onEmojiSelect;
  onClickOutsideRef.current = onClickOutside;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Delay picker creation to avoid the opening click triggering onClickOutside
    const timer = setTimeout(() => {
      const picker = new Picker({
        data,
        onEmojiSelect: (emoji: { native: string; id: string }) => onEmojiSelectRef.current(emoji),
        onClickOutside: () => onClickOutsideRef.current?.(),
        set: 'native',
        theme: 'light',
        previewPosition: 'none',
        skinTonePosition: 'search',
        navPosition: 'top',
        perLine: 9,
        emojiSize: 24,
        emojiButtonSize: 32,
      });

      container.appendChild(picker as unknown as Node);
    }, 0);

    return () => {
      clearTimeout(timer);
      container.replaceChildren();
    };
  }, []);

  return <div ref={containerRef} />;
}

/**
 * Portal-rendered EmojiPicker that escapes overflow containers.
 * Uses an invisible anchor to measure position, then renders the picker
 * via createPortal with fixed positioning.
 */
interface PortalEmojiPickerProps extends EmojiPickerProps {
  anchorClassName?: string;
}

export function PortalEmojiPicker({
  onEmojiSelect,
  onClickOutside,
  anchorClassName,
}: PortalEmojiPickerProps) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const onClickOutsideRef = useRef(onClickOutside);
  onClickOutsideRef.current = onClickOutside;
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const anchorRect = anchor.getBoundingClientRect();
    // emoji-mart Picker renders at roughly 352x352 (v5.x, native set, perLine=9)
    const pickerHeight = 352;
    const pickerWidth = 352;

    let top = anchorRect.top;
    if (top + pickerHeight > window.innerHeight) {
      top = Math.max(0, anchorRect.top - pickerHeight);
    }

    let left = anchorRect.right - pickerWidth;
    if (left < 0) left = Math.max(0, anchorRect.left);

    setPos({ top, left });
  }, []);

  // Close on scroll so the picker doesn't float detached from its message
  useEffect(() => {
    const handleScroll = () => onClickOutsideRef.current?.();
    const timerId = setTimeout(() => {
      window.addEventListener('scroll', handleScroll, true);
    }, 0);
    return () => {
      clearTimeout(timerId);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, []);

  const pickerContent = (
    <div
      style={
        pos
          ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }
          : { position: 'fixed', visibility: 'hidden' as const, top: -9999, left: -9999 }
      }
    >
      <EmojiPicker onEmojiSelect={onEmojiSelect} onClickOutside={onClickOutside} />
    </div>
  );

  return (
    <>
      <div
        ref={anchorRef}
        className={cn('pointer-events-none', anchorClassName)}
        style={{ height: 0, overflow: 'hidden' }}
      />
      {createPortal(pickerContent, document.body)}
    </>
  );
}
