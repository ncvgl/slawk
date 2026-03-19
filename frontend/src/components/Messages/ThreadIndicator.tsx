import { Avatar } from '@/components/ui/avatar';

interface ThreadParticipant {
  id: number;
  name: string;
  avatar: string | null;
}

interface ThreadIndicatorProps {
  replyCount: number;
  author?: ThreadParticipant;
  participants?: ThreadParticipant[];
  onClick: () => void;
  testId?: string;
}

export function ThreadIndicator({ replyCount, participants = [], onClick, testId }: ThreadIndicatorProps) {
  // Show only repliers (deduplicated) — author is already visible as message sender
  const seen = new Set<number>();
  const allParticipants: ThreadParticipant[] = [];
  for (const p of participants) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      allParticipants.push(p);
    }
  }

  return (
    <button
      data-testid={testId}
      onClick={onClick}
      onTouchStart={(e) => e.stopPropagation()}
      className="mt-[6px] flex items-center gap-2 rounded px-1 py-0.5 text-[13px] text-slack-link hover:bg-slack-highlight -ml-1"
    >
      <div data-testid="thread-avatars" className="flex -space-x-1">
        {allParticipants.slice(0, 3).map((p) => (
          <Avatar
            key={p.id}
            src={p.avatar ?? undefined}
            alt={p.name}
            fallback={p.name}
            size="sm"
            className="border border-white"
          />
        ))}
      </div>
      <span className="font-normal">
        {replyCount} {replyCount === 1 ? 'reply' : 'replies'}
      </span>
    </button>
  );
}
