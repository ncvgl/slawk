import { useState } from 'react';
import { useChannelStore } from '@/stores/useChannelStore';
import { MessageHeader } from './MessageHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { MembersPanel } from './MembersPanel';

export function MessageArea() {
  const { activeChannelId, getActiveChannel } = useChannelStore();
  const activeChannel = getActiveChannel();
  const [showMembers, setShowMembers] = useState(false);

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
          onToggleMembers={() => setShowMembers(!showMembers)}
        />
        <MessageList channelId={activeChannelId!} />
        <MessageInput channelId={activeChannelId!} channelName={activeChannel.name} />
      </div>
      {showMembers && (
        <MembersPanel
          channelId={activeChannelId!}
          onClose={() => setShowMembers(false)}
        />
      )}
    </div>
  );
}
