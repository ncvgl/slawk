import { cn } from '@/lib/utils';

interface UnreadBadgeProps {
  count: number;
  isActive: boolean;
}

export function UnreadBadge({ count, isActive }: UnreadBadgeProps) {
  if (count <= 0) return null;
  return (
    <span className={cn(
      'text-[12px] ml-1 min-w-[20px] h-5 flex items-center justify-center rounded-full px-1.5',
      isActive ? 'bg-slack-primary text-white' : 'bg-slack-badge text-white'
    )}>
      {count}
    </span>
  );
}
