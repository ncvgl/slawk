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
    <div className="mt-[4px] inline-flex flex-wrap items-center gap-[4px]">
      {reactions.map((reaction) => {
        const hasReacted = reaction.userIds.includes(currentUser.id);
        return (
          <button
            key={reaction.emoji}
            onClick={() => handleReactionClick(reaction.emoji, hasReacted)}
            className={cn(
              'inline-flex items-center gap-[3px] rounded-full border h-[20px] px-[5px] text-[11px] transition-colors',
              hasReacted
                ? 'border-[#1264A3]/50 bg-[#e8f5fa] text-[#1264A3]'
                : 'border-[rgba(29,28,29,0.1)] bg-[#F8F8F8] text-[#1D1C1D] hover:border-[rgba(29,28,29,0.2)]'
            )}
          >
            <span className="text-[13px] leading-none">{reaction.emoji}</span>
            <span className="font-normal">{reaction.count}</span>
          </button>
        );
      })}
      <button className="inline-flex h-[20px] w-[20px] items-center justify-center rounded-full border border-[rgba(29,28,29,0.1)] bg-[#F8F8F8] text-[#616061] hover:border-[rgba(29,28,29,0.2)]">
        <Plus className="h-[10px] w-[10px]" />
      </button>
    </div>
  );
}
