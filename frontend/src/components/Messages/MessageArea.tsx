import { useState, useCallback } from 'react';
import { useChannelStore } from '@/stores/useChannelStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { MessageHeader } from './MessageHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { MembersPanel } from './MembersPanel';
import { ThreadPanel } from './ThreadPanel';
import { DMConversation } from './DMConversation';
import { PinsPanel } from './PinsPanel';

export function MessageArea() {
  const { activeChannelId, activeDMId, getActiveChannel, getActiveDM } = useChannelStore();
  const activeChannel = getActiveChannel();
  const activeDM = getActiveDM();
  const [showMembers, setShowMembers] = useState(false);
  const [showPins, setShowPins] = useState(false);
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

  // Show DM conversation if a DM is active
  if (activeDMId && activeDM) {
    return <DMConversation userId={activeDM.userId} userName={activeDM.userName} />;
  }

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
          showPins={showPins}
          onToggleMembers={() => {
            setShowMembers(!showMembers);
            if (!showMembers) {
              setActiveThreadId(null);
              setShowPins(false);
            }
          }}
          onTogglePins={() => {
            setShowPins(!showPins);
            if (!showPins) {
              setShowMembers(false);
              setActiveThreadId(null);
            }
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
      {showPins && (
        <PinsPanel
          channelId={activeChannelId!}
          onClose={() => setShowPins(false)}
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
