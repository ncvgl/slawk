import { Hash, Star, ChevronDown, Users, Bell, Pin, Search, MoreVertical } from 'lucide-react';
import type { Channel } from '@/mocks/channels';

interface MessageHeaderProps {
  channel: Channel;
}

export function MessageHeader({ channel }: MessageHeaderProps) {
  return (
    <header className="flex h-[49px] items-center justify-between border-b border-gray-200 px-4">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        <button className="flex items-center gap-1 rounded px-2 py-1 hover:bg-gray-100">
          <Hash className="h-4 w-4 text-gray-600" />
          <span className="text-lg font-bold text-[#1d1c1d]">{channel.name}</span>
          <ChevronDown className="h-4 w-4 text-gray-600" />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
          <Star className="h-4 w-4 text-gray-500" />
        </button>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-1">
        <button className="flex items-center gap-1 rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">
          <Users className="h-4 w-4" />
          <span>{channel.memberCount}</span>
        </button>
        <div className="mx-2 h-5 w-px bg-gray-200" />
        <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
          <Bell className="h-4 w-4 text-gray-500" />
        </button>
        <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
          <Pin className="h-4 w-4 text-gray-500" />
        </button>
        <div className="mx-2 h-5 w-px bg-gray-200" />
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search"
            className="h-7 w-32 rounded bg-gray-100 pl-8 pr-2 text-sm placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-[#1264a3]"
          />
        </div>
        <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-gray-100">
          <MoreVertical className="h-4 w-4 text-gray-500" />
        </button>
      </div>
    </header>
  );
}
