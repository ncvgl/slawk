import { useState, useEffect } from 'react';
import { X, Pin } from 'lucide-react';
import { format } from 'date-fns';
import { getPinnedMessages, type ApiMessage } from '@/lib/api';
import { Avatar } from '@/components/ui/avatar';

interface PinsPanelProps {
  channelId: number;
  onClose: () => void;
}

export function PinsPanel({ channelId, onClose }: PinsPanelProps) {
  const [pins, setPins] = useState<ApiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    getPinnedMessages(channelId)
      .then((data) => setPins(data))
      .catch((err) => console.error('Failed to fetch pins:', err))
      .finally(() => setIsLoading(false));
  }, [channelId]);

  return (
    <div data-testid="pins-panel" className="flex w-[300px] flex-col border-l border-[#E0E0E0] bg-white">
      <div className="flex h-[49px] items-center justify-between border-b border-[#E0E0E0] px-4">
        <div className="flex items-center gap-1.5">
          <Pin className="h-4 w-4 text-[#616061]" />
          <span className="text-[15px] font-bold text-[#1D1C1D]">Pinned messages</span>
        </div>
        <button
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
        >
          <X className="h-4 w-4 text-[#616061]" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-gray-500">Loading...</div>
        ) : pins.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">No pinned messages yet</div>
        ) : (
          pins.map((pin) => (
            <div key={pin.id} className="border-b border-gray-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Avatar
                  src={pin.user.avatar}
                  alt={pin.user.name}
                  fallback={pin.user.name}
                  size="sm"
                />
                <span className="text-[13px] font-bold text-[#1D1C1D]">{pin.user.name}</span>
                <span className="text-[11px] text-[#616061]">
                  {format(new Date(pin.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <p className="mt-1 text-[14px] text-[#1D1C1D] leading-[20px]">{pin.content}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
