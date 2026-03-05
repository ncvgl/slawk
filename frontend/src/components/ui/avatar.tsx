import * as React from 'react';
import { cn } from '@/lib/utils';

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: 'sm' | 'md' | 'lg';
  status?: 'online' | 'away' | 'dnd' | 'offline';
}

const sizeClasses = {
  sm: 'h-5 w-5 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-12 w-12 text-base',
};

const statusColors = {
  online: 'bg-green-500',
  away: 'bg-yellow-500',
  dnd: 'bg-red-500',
  offline: 'bg-gray-400',
};

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, fallback, size = 'md', status, ...props }, ref) => {
    const [imageError, setImageError] = React.useState(false);

    // Reset error state when src changes
    React.useEffect(() => {
      setImageError(false);
    }, [src]);

    const initials = fallback
      ? fallback
          .split(' ')
          .map((n) => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : '?';

    return (
      <div className="relative inline-block" ref={ref} {...props}>
        <div
          className={cn(
            'relative flex shrink-0 overflow-hidden bg-gray-200',
            size === 'sm' ? 'rounded-[4px]' : 'rounded-lg',
            sizeClasses[size],
            className
          )}
        >
          {src && !imageError ? (
            <img
              src={src}
              alt={alt || 'Avatar'}
              className="aspect-square h-full w-full object-cover"
              onError={() => setImageError(true)}
            />
          ) : (
            <span className="flex h-full w-full items-center justify-center bg-slack-aubergine text-white font-medium">
              {initials}
            </span>
          )}
        </div>
        {status && (
          <span
            className={cn(
              'absolute bottom-0 right-0 block rounded-full ring-2 ring-white',
              statusColors[status],
              size === 'sm' ? 'h-2 w-2' : size === 'md' ? 'h-3 w-3' : 'h-4 w-4'
            )}
          />
        )}
      </div>
    );
  }
);
Avatar.displayName = 'Avatar';

export { Avatar };
