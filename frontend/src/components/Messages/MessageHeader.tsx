import { useState, useRef, useEffect } from 'react';
import { Hash, Star, ChevronDown, Bell, Pin, Search, MoreVertical, FileText, LogOut } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { searchMessages, getChannelMembers, type SearchResult, type ChannelMember } from '@/lib/api';
import { useChannelStore } from '@/stores/useChannelStore';
import type { Channel } from '@/lib/types';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

interface MessageHeaderProps {
  channel: Channel;
  showMembers?: boolean;
  onToggleMembers?: () => void;
  onTogglePins?: () => void;
  showPins?: boolean;
  onToggleFiles?: () => void;
  showFiles?: boolean;
}

const headerTabs = [
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'pins', label: 'Pins', icon: Pin },
];

export function MessageHeader({ channel, showMembers, onToggleMembers, onTogglePins, showPins, onToggleFiles, showFiles }: MessageHeaderProps) {
  const toggleStar = useChannelStore((s) => s.toggleStar);
  const leaveChannel = useChannelStore((s) => s.leaveChannel);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const channels = useChannelStore((s) => s.channels);
  const [activeTab, setActiveTab] = useState('files');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [previewMembers, setPreviewMembers] = useState<ChannelMember[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

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

  // Close notifications dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setShowNotifications(false);
      }
    }
    if (showNotifications) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showNotifications]);

  // Fetch up to 3 member avatars for preview in the header
  useEffect(() => {
    let cancelled = false;
    getChannelMembers(channel.id)
      .then((data) => {
        if (!cancelled) setPreviewMembers(data.slice(0, 3));
      })
      .catch(() => { /* Non-critical preview — header still usable without avatars */ });
    return () => {
      cancelled = true;
    };
  }, [channel.id]);

  const [leaveError, setLeaveError] = useState<string | null>(null);

  const handleLeaveChannel = async () => {
    setShowMenu(false);
    setLeaveError(null);
    try {
      await leaveChannel(channel.id);
    } catch {
      setLeaveError('Cannot leave channel — you are the last member.');
    }
  };

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (query?: string) => {
    const q = (query ?? searchQuery).trim();
    if (q.length < 2) {
      setShowResults(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setShowResults(true);
    try {
      const data = await searchMessages(q);
      setSearchResults(data.results);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (value.trim().length < 2) {
      setShowResults(false);
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      handleSearch(value);
    }, 300);
  };

  // Clean up debounce timer
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      handleSearch();
    } else if (e.key === 'Escape') {
      setSearchQuery('');
      setShowResults(false);
      setSearchResults([]);
    }
  };

  const handleResultClick = (result: SearchResult) => {
    if (result.channel) {
      setActiveChannel(result.channel.id, result.id);
    }
    setSearchQuery('');
    setShowResults(false);
    setSearchResults([]);
  };

  return (
    <header className="flex flex-col border-b border-slack-border bg-white">
      {/* Top Row - Channel name and actions */}
      <div className="flex h-[49px] items-center justify-between px-4">
        {/* Left Section */}
        <div className="flex items-center gap-1">
          <div
            data-testid="channel-name-button"
            className="flex items-center gap-1 px-1.5 py-0.5"
          >
            <Hash className="h-[16px] w-[16px] text-slack-secondary" />
            <span className="text-[18px] font-black text-slack-primary">{channel.name}</span>
          </div>
          <Button
            variant="toolbar"
            size="icon-xs"
            data-testid="star-channel-button"
            onClick={() => toggleStar(channel.id)}
            title={channel.isStarred ? 'Remove from Starred' : 'Add to Starred'}
          >
            <Star className={cn('h-4 w-4', channel.isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-slack-secondary')} />
          </Button>
        </div>

        {/* Right Section */}
        <div className="flex items-center gap-2">
          <button
            data-testid="member-avatars-button"
            onClick={onToggleMembers}
            className={cn(
              'flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[13px] hover:bg-slack-hover',
              showMembers ? 'text-slack-link bg-slack-highlight' : 'text-slack-secondary'
            )}
          >
            {previewMembers.length > 0 ? (
              <div className="flex items-center">
                {previewMembers.map((member, index) => (
                  <div
                    key={member.user.id}
                    className="relative"
                    style={{ marginLeft: index === 0 ? 0 : -6, zIndex: previewMembers.length - index }}
                  >
                    <Avatar
                      src={member.user.avatar ?? undefined}
                      alt={member.user.name}
                      fallback={member.user.name}
                      size="sm"
                      className="h-[18px] w-[18px] ring-1 ring-white"
                    />
                  </div>
                ))}
              </div>
            ) : null}
            <span>{channel.memberCount}</span>
          </button>
          <div className="h-4 w-px bg-slack-border" />
          <div className="relative" ref={notifRef}>
            <Button
              variant="toolbar"
              size="icon-xs"
              data-testid="notification-bell"
              title="Notifications"
              onClick={() => setShowNotifications((v) => !v)}
            >
              <Bell className={cn('h-4 w-4', showNotifications ? 'text-slack-link' : 'text-slack-secondary')} />
            </Button>
            {showNotifications && (
              <div data-testid="notifications-panel" className="absolute right-0 top-7 z-50 w-[300px] max-h-[360px] overflow-y-auto rounded-lg border border-slack-border bg-white shadow-lg">
                <div className="px-3 py-2 border-b border-slack-border">
                  <h3 className="text-[13px] font-bold text-slack-primary">Activity</h3>
                </div>
                {(() => {
                  const unread = channels.filter((ch) => ch.unreadCount > 0 && ch.id !== channel.id);
                  if (unread.length === 0) {
                    return <p className="px-3 py-6 text-center text-[13px] text-slack-hint">No new notifications</p>;
                  }
                  return unread.map((ch) => (
                    <button
                      key={ch.id}
                      onClick={() => { setActiveChannel(ch.id); setShowNotifications(false); }}
                      className="w-full text-left px-3 py-2 hover:bg-slack-hover border-b border-slack-border-light last:border-b-0"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-medium text-slack-primary">#{ch.name}</span>
                        <span className="text-[12px] bg-slack-badge text-white rounded-full px-1.5 min-w-[20px] text-center">{ch.unreadCount}</span>
                      </div>
                      <p className="text-[12px] text-slack-hint mt-0.5">{ch.unreadCount} unread message{ch.unreadCount !== 1 ? 's' : ''}</p>
                    </button>
                  ));
                })()}
              </div>
            )}
          </div>
          <div className="h-4 w-px bg-slack-border" />
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-2 top-1/2 h-[14px] w-[14px] -translate-y-1/2 text-slack-secondary" />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyDown={handleSearchKeyDown}
              className="h-[26px] w-[140px] rounded-md border border-slack-border bg-white pl-7 pr-2 text-[13px] placeholder:text-slack-secondary focus:outline-none focus:border-slack-link focus:w-[240px] transition-all"
            />
            {/* Search Results Dropdown */}
            {showResults && (
              <div data-testid="search-results-dropdown" className="absolute right-0 top-8 z-50 w-[360px] max-h-[400px] overflow-y-auto rounded-lg border border-slack-border bg-white shadow-lg">
                {isSearching ? (
                  <div className="p-4 text-center text-sm text-slack-hint">Searching...</div>
                ) : searchResults.length === 0 ? (
                  <div className="p-4 text-center text-sm text-slack-hint">No results found</div>
                ) : (
                  <div>
                    <div className="px-3 py-2 text-xs font-medium text-slack-hint border-b">
                      {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                    </div>
                    {searchResults.map((result) => (
                      <button
                        key={`${result.type}-${result.id}`}
                        data-testid="search-result-item"
                        onClick={() => handleResultClick(result)}
                        className="w-full text-left px-3 py-2 hover:bg-slack-hover border-b border-slack-border-light last:border-b-0"
                      >
                        <div className="flex items-start gap-2">
                          <Avatar
                            src={result.user.avatar ?? undefined}
                            alt={result.user.name}
                            fallback={result.user.name}
                            size="sm"
                            className="flex-shrink-0 mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 text-xs text-slack-hint">
                              <span className="font-medium text-slack-primary">{result.user.name}</span>
                              <span data-testid="search-result-timestamp" className="text-slack-disabled">
                                {format(new Date(result.createdAt), 'h:mm a')}
                              </span>
                              {result.channel && (
                                <>
                                  <span>in</span>
                                  <span className="font-medium">#{result.channel.name}</span>
                                </>
                              )}
                            </div>
                            <p className="mt-0.5 text-sm text-slack-primary line-clamp-2">{renderMessageContent(result.content)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="relative" ref={menuRef}>
            <Button
              variant="toolbar"
              size="icon-xs"
              data-testid="channel-header-menu"
              onClick={() => setShowMenu((v) => !v)}
            >
              <MoreVertical className="h-4 w-4 text-slack-secondary" />
            </Button>
            {showMenu && (
              <div className="absolute right-0 top-7 z-50 min-w-[160px] rounded-lg border border-slack-border bg-white shadow-lg py-1">
                <Button
                  variant="menu-item-danger"
                  onClick={handleLeaveChannel}
                >
                  <LogOut className="h-4 w-4" />
                  Leave channel
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Leave channel error banner */}
      {leaveError && (
        <div data-testid="leave-error" className="flex items-center justify-between bg-red-50 border-b border-red-200 px-4 py-2 text-sm text-red-700">
          <span>{leaveError}</span>
          <button onClick={() => setLeaveError(null)} className="ml-2 text-red-500 hover:text-red-700 font-medium">Dismiss</button>
        </div>
      )}

      {/* Tabs Row */}
      <div className="flex items-center gap-0.5 px-4 pb-[6px]">
        {headerTabs.map((tab) => (
          <button
            key={tab.id}
            data-testid={`header-tab-${tab.id}`}
            onClick={() => {
              setActiveTab(tab.id);
              if (tab.id === 'pins') onTogglePins?.();
              if (tab.id === 'files') onToggleFiles?.();
            }}
            className={cn(
              'flex items-center gap-1 rounded px-2 py-[3px] text-[13px] transition-colors',
              (tab.id === 'pins' && showPins) || (tab.id === 'files' && showFiles)
                ? 'bg-slack-active-tab text-slack-primary font-medium'
                : 'text-slack-secondary hover:bg-slack-hover hover:text-slack-primary'
            )}
          >
            <tab.icon className="h-[14px] w-[14px]" />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    </header>
  );
}
