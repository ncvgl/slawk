import { useState, useRef, useEffect } from 'react';
import { Hash, Star, ChevronDown, Users, Bell, Pin, Search, MoreVertical, MessageSquare, FileText, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { searchMessages, type SearchResult } from '@/lib/api';
import { useChannelStore } from '@/stores/useChannelStore';
import type { Channel } from '@/lib/types';

interface MessageHeaderProps {
  channel: Channel;
  showMembers?: boolean;
  onToggleMembers?: () => void;
  onTogglePins?: () => void;
  showPins?: boolean;
}

const headerTabs = [
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'pins', label: 'Pins', icon: Pin },
];

export function MessageHeader({ channel, showMembers, onToggleMembers, onTogglePins, showPins }: MessageHeaderProps) {
  const toggleStar = useChannelStore((s) => s.toggleStar);
  const leaveChannel = useChannelStore((s) => s.leaveChannel);
  const [activeTab, setActiveTab] = useState('messages');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close search results when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    if (showResults) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showResults]);

  // Close channel menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    }
    if (showMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showMenu]);

  const handleLeaveChannel = async () => {
    setShowMenu(false);
    await leaveChannel(channel.id);
  };

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    setIsSearching(true);
    try {
      const data = await searchMessages(q);
      setSearchResults(data.results);
      setShowResults(true);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setShowResults(false);
      setSearchResults([]);
    }
  };

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
          <button
            data-testid="star-channel-button"
            onClick={() => toggleStar(channel.id)}
            className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#F8F8F8]"
            title={channel.isStarred ? 'Remove from Starred' : 'Add to Starred'}
          >
            <Star className={cn('h-4 w-4', channel.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-[#616061]')} />
          </button>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          <button
            onClick={onToggleMembers}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-[13px] hover:bg-[#F8F8F8]',
              showMembers ? 'text-[#1264A3] bg-[#E8F5FA]' : 'text-[#616061]'
            )}
          >
            <Users className="h-4 w-4" />
            <span>{channel.memberCount}</span>
          </button>
          <div className="h-4 w-px bg-[#E0E0E0]" />
          <button className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#F8F8F8]">
            <Bell className="h-4 w-4 text-[#616061]" />
          </button>
          <div className="h-4 w-px bg-[#E0E0E0]" />
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-2 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-[#616061]" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="h-[26px] w-[140px] rounded-md border border-[#E0E0E0] bg-white pl-7 pr-2 text-[13px] placeholder:text-[#616061] focus:outline-none focus:border-[#1264A3] focus:w-[240px] transition-all"
            />
            {/* Search Results Dropdown */}
            {showResults && (
              <div className="absolute right-0 top-8 z-50 w-[360px] max-h-[400px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {isSearching ? (
                  <div className="p-4 text-center text-sm text-gray-500">Searching...</div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-sm text-gray-500">No results found</div>
                ) : (
                  <div>
                    <div className="px-3 py-2 text-xs font-medium text-gray-500 border-b">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </div>
                    {searchResults.map((result) => (
                      <div
                        key={`${result.type}-${result.id}`}
                        className="px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                          <span className="font-medium text-gray-700">{result.user.name}</span>
                          {result.channel && (
                            <>
                              <span>in</span>
                              <span className="font-medium">#{result.channel.name}</span>
                            </>
                          )}
                        </div>
                        <p className="mt-0.5 text-sm text-gray-900 line-clamp-2">{result.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={menuRef}>
            <button
              data-testid="channel-header-menu"
              onClick={() => setShowMenu((v) => !v)}
              className="flex h-6 w-6 items-center justify-center rounded hover:bg-[#F8F8F8]"
            >
              <MoreVertical className="h-4 w-4 text-[#616061]" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-7 z-50 min-w-[160px] rounded-lg border border-gray-200 bg-white shadow-lg py-1">
                <button
                  onClick={handleLeaveChannel}
                  className="flex w-full items-center gap-2 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  Leave channel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-0.5 px-4 pb-[6px]">
        {headerTabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'pins') onTogglePins?.();
            }}
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
