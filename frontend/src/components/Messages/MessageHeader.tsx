import { useState } from 'react';
import { Hash, Star, ChevronDown, Users, Bell, Pin, Search, MoreVertical, MessageSquare, FileText, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Channel } from '@/mocks/channels';

interface MessageHeaderProps {
  channel: Channel;
}

const headerTabs = [
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'canvas', label: 'Canvas', icon: StickyNote },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'pins', label: 'Pins', icon: Pin },
];

export function MessageHeader({ channel }: MessageHeaderProps) {
  const [activeTab, setActiveTab] = useState('messages');

  return (
    <header className="flex flex-col border-b border-[#DDDDDD] bg-white">
      {/* Top Row - Channel name and actions */}
      <div className="flex h-[49px] items-center justify-between px-4">
        {/* Left Section */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 rounded px-2 py-1 hover:bg-[#F8F8F8]">
            <Hash className="h-[18px] w-[18px] text-[#616061]" />
            <span className="text-[18px] font-black text-[#1D1C1D]">{channel.name}</span>
            <ChevronDown className="h-[18px] w-[18px] text-[#616061]" />
          </button>
          <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]">
            <Star className="h-[18px] w-[18px] text-[#616061]" />
          </button>
        </div>

        {/* Right Section - 18px icons, 12px spacing */}
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-1 rounded px-2 py-1 text-sm text-[#616061] hover:bg-[#F8F8F8]">
            <Users className="h-[18px] w-[18px]" />
            <span>{channel.memberCount}</span>
          </button>
          <div className="h-5 w-px bg-[#DDDDDD]" />
          <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]">
            <Bell className="h-[18px] w-[18px] text-[#616061]" />
          </button>
          <div className="h-5 w-px bg-[#DDDDDD]" />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[#616061]" />
            <input
              type="text"
              placeholder="Search"
              className="h-7 w-32 rounded bg-[#F8F8F8] pl-8 pr-2 text-sm placeholder:text-[#616061] focus:outline-none focus:ring-2 focus:ring-[#1264A3]"
            />
          </div>
          <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]">
            <MoreVertical className="h-[18px] w-[18px] text-[#616061]" />
          </button>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-1 px-4 pb-2">
        {headerTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium transition-colors',
              activeTab === tab.id
                ? 'bg-[#F8F8F8] text-[#1D1C1D]'
                : 'text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]'
            )}
          >
            <tab.icon className="h-4 w-4" />
            <span>{tab.label}</span>
          </button>
        ))}
        <button className="flex h-6 w-6 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8]">
          <span className="text-lg">+</span>
        </button>
      </div>
    </header>
  );
}
