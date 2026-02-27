import { useChannelStore } from '@/stores/useChannelStore';
import { MessageHeader } from './MessageHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';

export function MessageArea() {
  const { activeChannelId, getActiveChannel } = useChannelStore();
  const activeChannel = getActiveChannel();

  if (!activeChannel) {
    return (
      <div className="flex flex-1 items-center justify-center text-gray-500">
        Select a channel to start messaging
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <MessageHeader channel={activeChannel} />
      <MessageList channelId={activeChannelId!} />
      <MessageInput channelId={activeChannelId!} channelName={activeChannel.name} />
    </div>
  );
}
