import { Hash, Star, ChevronDown, Users, Bell, Pin, Search, MoreVertical } from 'lucide-react';
import type { Channel } from '@/mocks/channels';

interface MessageHeaderProps {
  channel: Channel;
}

export function MessageHeader({ channel }: MessageHeaderProps) {
  return (
    <header className="flex h-[49px] items-center justify-between border-b border-[#E0E0E0] px-4 bg-white">
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
        <div className="h-5 w-px bg-[#E0E0E0]" />
        <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]">
          <Bell className="h-[18px] w-[18px] text-[#616061]" />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]">
          <Pin className="h-[18px] w-[18px] text-[#616061]" />
        </button>
        <div className="h-5 w-px bg-[#E0E0E0]" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[#616061]" />
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
    </header>
  );
}
