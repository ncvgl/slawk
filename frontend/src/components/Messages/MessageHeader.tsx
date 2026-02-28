import { useState } from 'react';
import { Hash, Star, ChevronDown, Users, Bell, Pin, Search, MoreVertical, MessageSquare, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Channel } from '@/mocks/channels';

interface MessageHeaderProps {
  channel: Channel;
}

const headerTabs = [
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'pins', label: 'Pins', icon: Pin },
];

export function MessageHeader({ channel }: MessageHeaderProps) {
  const [activeTab, setActiveTab] = useState('messages');

  return (
    <header className="flex flex-col border-b border-[#E0E0E0] bg-white">
      {/* Top Row - Channel name and actions */}
      <div className="flex h-[49px] items-center justify-between px-4">
        {/* Left Section */}
        <div className="flex items-center gap-1">
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-[#F8F8F8]">
            <Hash className="h-[16px] w-[16px] text-[#616061]" />
            <span className="text-[18px] font-black text-[#1D1C1D]">{channel.name}</span>
            <ChevronDown className="h-4 w-4 text-[#616061]" />
          </button>
          <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#F8F8F8]">
            <Star className="h-4 w-4 text-[#616061]" />
          </button>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] text-[#616061] hover:bg-[#F8F8F8]">
            <Users className="h-4 w-4" />
            <span>{channel.memberCount}</span>
          </button>
          <div className="h-4 w-px bg-[#E0E0E0]" />
          <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#F8F8F8]">
            <Bell className="h-4 w-4 text-[#616061]" />
          </button>
          <div className="h-4 w-px bg-[#E0E0E0]" />
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#616061]" />
            <input
              type="text"
              placeholder="Search"
              className="h-[26px] w-[140px] rounded-md border border-[#E0E0E0] bg-white pl-7 pr-2 text-[13px] placeholder:text-[#616061] focus:outline-none focus:border-[#1264A3]"
            />
          </div>
          <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#F8F8F8]">
            <MoreVertical className="h-4 w-4 text-[#616061]" />
          </button>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-0.5 px-4 pb-[6px]">
        {headerTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-[3px] text-[13px] transition-colors',
              activeTab === tab.id
                ? 'bg-[#F0F0F0] text-[#1D1C1D] font-medium'
                : 'text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]'
            )}
          >
            <tab.icon className="h-[14px] w-[14px]" />
            <span>{tab.label}</span>
          </button>
        ))}
        <button className="flex h-5 w-5 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8]">
          <span className="text-sm leading-none">+</span>
        </button>
      </div>
    </header>
  );
}
