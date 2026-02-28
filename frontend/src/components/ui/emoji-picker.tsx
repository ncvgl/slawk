import { useEffect, useRef } from 'react';
import { Picker } from 'emoji-mart';
import data from '@emoji-mart/data';

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
      container.innerHTML = '';
    };
  }, []);

  return <div ref={containerRef} />;
}
