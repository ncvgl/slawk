import { useState, useEffect, useCallback } from 'react';
import { Pin } from 'lucide-react';
import { format } from 'date-fns';
import { getPinnedMessages, type ApiMessage } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { Avatar } from '@/components/ui/avatar';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { PanelHeader } from './PanelHeader';

interface PinsPanelProps {
  channelId: number;
  onClose: () => void;
}

export function PinsPanel({ channelId, onClose }: PinsPanelProps) {
  const [pins, setPins] = useState<ApiMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPins = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    getPinnedMessages(channelId)
      .then((data) => setPins(data))
      .catch(() => setLoadError('Failed to load pinned messages.'))
      .finally(() => setIsLoading(false));
  }, [channelId]);

  useEffect(() => {
    fetchPins();
  }, [fetchPins]);

  // Listen for message:updated events — refresh pins when a message in this
  // channel is pinned or unpinned so the panel stays current without a reload.
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handleMessageUpdated = (msg: ApiMessage) => {
      if (msg.channelId !== channelId) return;
      // Re-fetch the canonical pin list from the server
      getPinnedMessages(channelId)
        .then((data) => setPins(data))
        .catch(() => { /* Non-critical refresh — stale pins are still usable */ });
    };

    socket.on('message:updated', handleMessageUpdated);
    return () => {
      socket.off('message:updated', handleMessageUpdated);
    };
  }, [channelId]);

  return (
    <div data-testid="pins-panel" className="flex w-full md:w-[300px] flex-col border-l border-slack-border bg-white absolute inset-0 md:static md:inset-auto z-30 md:z-auto">
      <PanelHeader icon={Pin} title="Pinned messages" onClose={onClose} />
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-slack-hint">Loading...</div>
        ) : loadError ? (
          <div className="p-4 text-center text-sm text-slack-error">{loadError}</div>
        ) : pins.length === 0 ? (
          <div className="p-4 text-center text-sm text-slack-hint">No pinned messages yet</div>
        ) : (
          pins.map((pin) => (
            <div key={pin.id} className="border-b border-slack-border-light px-4 py-3">
              <div className="flex items-center gap-2">
                <Avatar
                  src={pin.user.avatar}
                  alt={pin.user.name}
                  fallback={pin.user.name}
                  size="sm"
                />
                <span className="text-[13px] font-bold text-slack-primary">{pin.user.name}</span>
                <span className="text-[11px] text-slack-secondary">
                  {format(new Date(pin.createdAt), 'MMM d, h:mm a')}
                </span>
              </div>
              <div className="mt-1 text-[14px] text-slack-primary leading-[20px]">{renderMessageContent(pin.content)}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
