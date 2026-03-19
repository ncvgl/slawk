import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { PortalEmojiPicker } from '@/components/ui/emoji-picker';
import type { Reaction } from '@/lib/types';
import data from '@emoji-mart/data';

const SHORTCODE_ALIASES: Record<string, string> = {
  mind_blown: 'exploding_head',
};

function shortcodeToNative(emoji: string): string {
  const key = SHORTCODE_ALIASES[emoji] ?? emoji;
  const emojiData = (data as any).emojis?.[key];
  if (emojiData?.skins?.[0]?.native) return emojiData.skins[0].native;
  return emoji;
}

function ReactionPill({
  reaction,
  hasReacted,
  tooltip,
  onClick,
}: {
  reaction: Reaction;
  hasReacted: boolean;
  tooltip: string | undefined;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const handleMouseEnter = () => {
    if (!tooltip || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setPos({ top: rect.top - 6, left: rect.left + rect.width / 2 });
    setHovered(true);
  };

  const handleMouseLeave = () => {
    setHovered(false);
  };

  return (
    <>
      <button
        ref={ref}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          'inline-flex h-[22px] items-center gap-1 rounded-[12px] border px-[6px] text-[12px] transition-colors',
          hasReacted
            ? 'border-slack-link bg-slack-highlight text-slack-link'
            : 'border-slack-border bg-white text-slack-primary hover:bg-slack-hover'
        )}
      >
        <span data-testid="reaction-emoji" className="text-sm leading-none">{shortcodeToNative(reaction.emoji)}</span>
        <span className="text-[13px] font-medium">{reaction.count}</span>
      </button>
      {hovered && tooltip && pos && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg"
          style={{ top: pos.top, left: pos.left }}
        >
          {tooltip}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
        </div>,
        document.body
      )}
    </>
  );
}

interface MessageReactionsProps {
  reactions: Reaction[];
  messageId: number;
  onAddReaction: (messageId: number, emoji: string) => void;
  onRemoveReaction: (messageId: number, emoji: string) => void;
}

export function MessageReactions({ reactions, messageId, onAddReaction, onRemoveReaction }: MessageReactionsProps) {
  const user = useAuthStore((s) => s.user);
  const [showPicker, setShowPicker] = useState(false);
  const currentUserId = user?.id ?? -1;

  const handleReactionClick = (emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      onRemoveReaction(messageId, emoji);
    } else {
      onAddReaction(messageId, emoji);
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    onAddReaction(messageId, emoji.native);
    setShowPicker(false);
  };

  return (
    <div className="relative mt-[6px] inline-flex flex-wrap items-center gap-[4px]">
      {reactions.map((reaction) => {
        const hasReacted = reaction.userIds.includes(currentUserId);
        const names = reaction.userNames.filter(Boolean);
        const tooltip = names.length > 0
          ? `${names.join(', ')} reacted with ${shortcodeToNative(reaction.emoji)}`
          : undefined;
        return (
          <ReactionPill
            key={reaction.emoji}
            reaction={reaction}
            hasReacted={hasReacted}
            tooltip={tooltip}
            onClick={() => handleReactionClick(reaction.emoji, hasReacted)}
          />
        );
      })}
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[12px] border border-slack-border bg-white text-slack-secondary hover:bg-slack-hover"
      >
        <Plus className="h-[12px] w-[12px]" />
      </button>
      {showPicker && (
        <PortalEmojiPicker
          anchorClassName="absolute bottom-full left-0 mb-2"
          onEmojiSelect={handleEmojiSelect}
          onClickOutside={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
