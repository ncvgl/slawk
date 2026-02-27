import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMessageStore } from '@/stores/useMessageStore';
import { currentUser } from '@/mocks/users';
import type { Reaction } from '@/mocks/messages';

interface MessageReactionsProps {
  reactions: Reaction[];
  messageId: number;
}

export function MessageReactions({ reactions, messageId }: MessageReactionsProps) {
  const { addReaction, removeReaction } = useMessageStore();

  const handleReactionClick = (emoji: string, hasReacted: boolean) => {
    if (hasReacted) {
      removeReaction(messageId, emoji);
    } else {
      addReaction(messageId, emoji);
    }
  };

  return (
    <div className="mt-[4px] inline-flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => {
        const hasReacted = reaction.userIds.includes(currentUser.id);
        return (
          <button
            key={reaction.emoji}
            onClick={() => handleReactionClick(reaction.emoji, hasReacted)}
            className={cn(
              'inline-flex items-center gap-[4px] rounded-full border h-[24px] px-[6px] text-[12px] transition-colors',
              hasReacted
                ? 'border-[#1264A3] bg-[#e8f5fa] text-[#1264A3]'
                : 'border-[rgba(29,28,29,0.13)] bg-white text-[#1D1C1D] hover:bg-[#F8F8F8]'
            )}
          >
            <span className="text-[15px] leading-none">{reaction.emoji}</span>
            <span className="font-normal text-[12px]">{reaction.count}</span>
          </button>
        );
      })}
      <button className="inline-flex h-[24px] w-[24px] items-center justify-center rounded-full border border-[rgba(29,28,29,0.13)] bg-white text-[#616061] hover:bg-[#F8F8F8]">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
