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
    <div className="mt-1 inline-flex flex-wrap items-center gap-1">
      {reactions.map((reaction) => {
        const hasReacted = reaction.userIds.includes(currentUser.id);
        return (
          <button
            key={reaction.emoji}
            onClick={() => handleReactionClick(reaction.emoji, hasReacted)}
            className={cn(
              'inline-flex items-center gap-1 rounded-[12px] border px-1.5 py-0.5 text-[12px] transition-colors',
              hasReacted
                ? 'border-[#1264A3] bg-[#e8f5fa] text-[#1264A3]'
                : 'border-[#E0E0E0] bg-white text-gray-700 hover:bg-[#F8F8F8]'
            )}
          >
            <span className="text-[16px]">{reaction.emoji}</span>
            <span className="font-medium">{reaction.count}</span>
          </button>
        );
      })}
      <button className="inline-flex h-6 w-6 items-center justify-center rounded-[12px] border border-[#E0E0E0] bg-white text-gray-500 hover:bg-[#F8F8F8]">
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}
