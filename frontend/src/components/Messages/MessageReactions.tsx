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
      <button className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-[12px] border border-[#E0E0E0] bg-white text-[#616061] hover:bg-[#F8F8F8]">
        <Plus className="h-[12px] w-[12px]" />
      </button>
    </div>
  );
}
