import { useState } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMessageStore } from '@/stores/useMessageStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import type { Reaction } from '@/lib/types';

interface MessageReactionsProps {
  reactions: Reaction[];
  messageId: number;
}

export function MessageReactions({ reactions, messageId }: MessageReactionsProps) {
  const { addReaction, removeReaction } = useMessageStore();
  const user = useAuthStore((s) => s.user);
  const [showPicker, setShowPicker] = useState(false);
  const currentUserId = user?.id ?? -1;

  const handleReactionClick = (emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  };

  const handleEmojiSelect = (emoji: { native: string }) => {
    addReaction(messageId, emoji.native);
    setShowPicker(false);
  };

  return (
    <div className="relative mt-[6px] inline-flex flex-wrap items-center gap-[4px]">
      {reactions.map((reaction) => {
        const hasReacted = reaction.userIds.includes(currentUserId);
        return (
          <button
            key={reaction.emoji}
            onClick={() => handleReactionClick(reaction.emoji, hasReacted)}
            className={cn(
              'inline-flex items-center gap-1 rounded-[12px] border px-[6px] py-[2px] text-[12px] transition-colors',
              hasReacted
                ? 'border-[#1264A3] bg-[#E8F5FA] text-[#1264A3]'
                : 'border-[#E0E0E0] bg-white text-[#1D1C1D] hover:bg-[#F8F8F8]'
            )}
          >
            <span className="w-4 h-4 flex items-center justify-center">{reaction.emoji}</span>
            <span className="font-normal">{reaction.count}</span>
          </button>
        );
      })}
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[12px] border border-[#E0E0E0] bg-white text-[#616061] hover:bg-[#F8F8F8]"
      >
        <Plus className="h-[12px] w-[12px]" />
      </button>
      {showPicker && (
        <div className="absolute bottom-full left-0 mb-2 z-50">
          <EmojiPicker
            onEmojiSelect={handleEmojiSelect}
            onClickOutside={() => setShowPicker(false)}
          />
        </div>
      )}
    </div>
  );
}
