import { useState, useCallback } from 'react';
import { useChannelStore } from '@/stores/useChannelStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { MessageHeader } from './MessageHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { MembersPanel } from './MembersPanel';
import { ThreadPanel } from './ThreadPanel';

export function MessageArea() {
  const { activeChannelId, getActiveChannel } = useChannelStore();
  const activeChannel = getActiveChannel();
  const [showMembers, setShowMembers] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);

  const handleOpenThread = useCallback((messageId: number) => {
    setActiveThreadId(messageId);
    setShowMembers(false);
  }, []);

  const handleCloseThread = useCallback(() => {
    setActiveThreadId(null);
  }, []);

  const handleReplyCountChange = useCallback((messageId: number, count: number) => {
    // Update thread count in the message store
    const { messages } = useMessageStore.getState();
    const updated = messages.map((m) =>
      m.id === messageId ? { ...m, threadCount: count } : m
    );
    useMessageStore.setState({ messages: updated });
  }, []);

  if (!activeChannel) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        Select a channel to start messaging
      </div>
    );
  }

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col min-w-0">
        <MessageHeader
          channel={activeChannel}
          showMembers={showMembers}
          onToggleMembers={() => {
            setShowMembers(!showMembers);
            if (!showMembers) setActiveThreadId(null);
          }}
        />
        <MessageList channelId={activeChannelId!} onOpenThread={handleOpenThread} />
        <MessageInput channelId={activeChannelId!} channelName={activeChannel.name} />
      </div>
      {showMembers && (
        <MembersPanel
          channelId={activeChannelId!}
          onClose={() => setShowMembers(false)}
        />
      )}
      {activeThreadId && (
        <ThreadPanel
          messageId={activeThreadId}
          onClose={handleCloseThread}
          onReplyCountChange={handleReplyCountChange}
        />
      )}
    </div>
  );
}
