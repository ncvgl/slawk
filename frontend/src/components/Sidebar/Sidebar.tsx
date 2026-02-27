import { useState } from 'react';
import {
  Home,
  MessageSquare,
  Bell,
  MoreHorizontal,
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
  { icon: Bell, label: 'Activity', id: 'activity', badge: 1 },
  { icon: FileText, label: 'Files', id: 'files' },
  { icon: MoreHorizontal, label: 'More', id: 'more' },
];

export function Sidebar() {
  const { channels, directMessages, activeChannelId, setActiveChannel, setActiveDM } =
    useChannelStore();
  const { user } = useAuthStore();
  const [channelsExpanded, setChannelsExpanded] = useState(true);
  const [dmsExpanded, setDmsExpanded] = useState(true);
  const [activeNav, setActiveNav] = useState('home');

  const publicChannels = channels.filter((ch) => !ch.isPrivate);
  const privateChannels = channels.filter((ch) => ch.isPrivate);

  return (
    <div className="flex h-full">
      {/* Nav Rail */}
      <div className="flex w-[70px] flex-col items-center bg-[#350d36] py-3 gap-1">
        {/* Workspace Icon */}
        <button className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#3F0E40] font-bold text-lg hover:rounded-xl transition-all">
          S
        </button>

        {/* Nav Items */}
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveNav(item.id)}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
              activeNav === item.id
                ? 'bg-[#3F0E40] text-white'
                : 'text-white/70 hover:bg-white/10 hover:text-white'
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.badge && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                {item.badge}
              </span>
            )}
          </button>
        ))}

        {/* Spacer */}
        <div className="flex-1" />

        {/* User Avatar */}
        {user && (
          <Avatar
            src={user.avatar}
            alt={user.name}
            fallback={user.name}
            size="md"
            status={user.status}
            className="cursor-pointer"
          />
        )}
      </div>

      {/* Channel Sidebar */}
      <div className="flex w-[260px] flex-col bg-[#3F0E40] text-[rgba(255,255,255,0.7)]">
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
          <div className="mb-3">
            <button
              onClick={() => setChannelsExpanded(!channelsExpanded)}
              className="flex w-full items-center gap-1 px-4 py-1 text-[13px] font-medium hover:bg-[rgba(88,66,124,1)]"
            >
              {channelsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Channels</span>
            </button>

            {channelsExpanded && (
              <div className="mt-1">
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
                <button className="flex w-full items-center gap-2 px-4 h-[28px] text-[15px] hover:bg-[rgba(88,66,124,1)]">
                  <Plus className="h-4 w-4" />
                  <span>Add channels</span>
                </button>
              </div>
            )}
          </div>

          {/* Direct Messages Section */}
          <div>
            <button
              onClick={() => setDmsExpanded(!dmsExpanded)}
              className="flex w-full items-center gap-1 px-4 py-1 text-[13px] font-medium hover:bg-[rgba(88,66,124,1)]"
            >
              {dmsExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              <span>Direct messages</span>
            </button>

            {dmsExpanded && (
              <div className="mt-1">
                {directMessages.map((dm) => (
                  <DirectMessageItem
                    key={dm.id}
                    dm={dm}
                    isActive={false}
                    onClick={() => setActiveDM(dm.id)}
                  />
                ))}
                <button className="flex w-full items-center gap-2 px-4 h-[28px] text-[15px] hover:bg-[rgba(88,66,124,1)]">
                  <Plus className="h-4 w-4" />
                  <span>Add teammates</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
