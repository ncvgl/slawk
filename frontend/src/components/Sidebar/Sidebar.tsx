import { useState } from 'react';
import {
  Home,
  MessageSquare,
  FileText,
  ChevronDown,
  ChevronRight,
  Plus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChannelStore } from '@/stores/useChannelStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { Avatar } from '@/components/ui/avatar';
import { ChannelItem } from './ChannelItem';
import { DirectMessageItem } from './DirectMessageItem';

const navItems = [
  { icon: Home, label: 'Home', id: 'home' },
  { icon: MessageSquare, label: 'DMs', id: 'dms' },
  { icon: FileText, label: 'Files', id: 'files' },
];

export function Sidebar() {
  const { channels, directMessages, activeChannelId, setActiveChannel, setActiveDM, createChannel } =
    useChannelStore();
  const { user } = useAuthStore();
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);
  const [activeNav, setActiveNav] = useState('home');
  const [showCreateChannel, setShowCreateChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');

  const publicChannels = channels.filter((ch) => !ch.isPrivate);
  const privateChannels = channels.filter((ch) => ch.isPrivate);

  return (
    <div className="flex h-full">
      {/* Nav Rail - 70px wide, darker purple */}
      <div className="flex w-[70px] flex-col items-center bg-[#39063A] pt-2 gap-0">
        {/* Workspace Icon - 36x36px */}
        <button className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#3F0E40] font-bold text-lg hover:rounded-xl transition-all">
          S
        </button>

        {/* Nav Items - 52x68px each with icon + label */}
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            className={cn(
              'relative flex flex-col h-[68px] w-[52px] items-center justify-center gap-1 rounded-lg transition-colors',
              activeNav === item.id
                ? 'bg-[#58427C]/50 text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-[11px] font-medium">{item.label}</span>
            {item.badge && (
              <span className="absolute top-2 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] text-white">
                {item.badge}
              </span>
            )}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Avatar */}
        {user && (
          <div className="mb-3">
            <Avatar
              src={user.avatar}
              alt={user.name}
              fallback={user.name}
              size="md"
              status={user.status}
              className="cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* Channel Sidebar - lighter/warmer purple with overlay effect */}
      <div className="flex w-[260px] flex-col bg-[#4A154B] text-[rgba(255,255,255,0.7)]">
        {/* Workspace Header - 44px height, 6px 16px padding */}
        <div className="flex h-[44px] items-center justify-between border-b border-white/10 px-4 py-[6px]">
          <button className="flex items-center gap-1 font-bold text-white hover:bg-[rgba(88,66,124,1)] rounded px-2 py-1 -ml-2">
            <span className="text-[18px] font-bold">Slawk</span>
            <ChevronDown className="h-4 w-4" />
          </button>
          <button className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content - 0 0 16px 0 padding */}
        <div className="flex-1 overflow-y-auto pb-4">
          {/* Channels Section */}
          <div className="mb-3 mt-3">
            <button
              onClick={() => setChannelsExpanded(!channelsExpanded)}
              className="flex w-full items-center gap-1.5 pl-4 pr-2 py-[6px] text-[15px] hover:bg-[rgba(88,66,124,0.7)]"
            >
              {channelsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Channels</span>
            </button>

            {channelsExpanded && (
              <div>
                {publicChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    onClick={() => setActiveChannel(channel.id)}
                  />
                ))}
                {privateChannels.map((channel) => (
                  <ChannelItem
                    key={channel.id}
                    channel={channel}
                    isActive={activeChannelId === channel.id}
                    onClick={() => setActiveChannel(channel.id)}
                    isPrivate
                  />
                ))}
                <button
                  onClick={() => setShowCreateChannel(true)}
                  className="flex items-center gap-2 mx-2 w-[calc(100%-16px)] px-4 h-[28px] text-[15px] rounded-[6px] text-left text-white/70 hover:bg-[rgba(88,66,124,1)] hover:text-white"
                >
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span>Add channels</span>
                </button>
              </div>
            )}
          </div>

          {/* Direct Messages Section */}
          <div>
            <button
              onClick={() => setDmsExpanded(!dmsExpanded)}
              className="flex w-full items-center gap-1.5 pl-4 pr-2 py-[6px] text-[15px] hover:bg-[rgba(88,66,124,0.7)]"
            >
              {dmsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Direct messages</span>
            </button>

            {dmsExpanded && (
              <div>
                {directMessages.map((dm) => (
                  <DirectMessageItem
                    key={dm.id}
                    dm={dm}
                    isActive={false}
                    onClick={() => setActiveDM(dm.id)}
                  />
                ))}
                <button className="flex items-center gap-2 mx-2 w-[calc(100%-16px)] px-4 h-[28px] text-[15px] rounded-[6px] text-left text-white/70 hover:bg-[rgba(88,66,124,1)] hover:text-white">
                  <Plus className="w-4 h-4 flex-shrink-0" />
                  <span>Add teammates</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Create Channel Dialog */}
      {showCreateChannel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-[480px] rounded-lg bg-white p-6 shadow-xl">
            <h2 className="text-[22px] font-bold text-[#1D1C1D] mb-4">Create a channel</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const name = newChannelName.trim();
                if (!name) return;
                await createChannel(name);
                setNewChannelName('');
                setShowCreateChannel(false);
              }}
            >
              <label className="block text-[14px] font-medium text-[#1D1C1D] mb-1">
                Channel name
              </label>
              <input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value)}
                placeholder="e.g. plan-budget"
                autoFocus
                className="w-full rounded border border-gray-300 px-3 py-2 text-[15px] text-[#1D1C1D] outline-none focus:border-[#1264A3] focus:ring-1 focus:ring-[#1264A3]"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateChannel(false);
                    setNewChannelName('');
                  }}
                  className="rounded px-4 py-2 text-[14px] font-medium text-[#1D1C1D] hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newChannelName.trim()}
                  className="rounded bg-[#007a5a] px-4 py-2 text-[14px] font-medium text-white hover:bg-[#005e46] disabled:opacity-50"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
