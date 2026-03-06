import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Pin,
  FileText,
  X,
  Star,
  Bell,
  Search,
  MoreVertical,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDMStore } from '@/stores/useDMStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useMessageEdit } from '@/hooks/useMessageEdit';
import { useProfileStore } from '@/stores/useProfileStore';
import { MessageToolbar } from './MessageToolbar';
import { MessageActionsMenu } from './MessageActionsMenu';
import { MessageInput } from './MessageInput';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { searchMessages, type SearchResult } from '@/lib/api';
import type { DMMessage } from '@/stores/useDMStore';

interface DMConversationProps {
  userId: number;
  userName: string;
  userAvatar?: string;
}

function formatDateSeparator(date: Date): string {
  if (isToday(date)) return 'Today';
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'EEEE, MMMM d');
}

const dmHeaderTabs = [
  { id: 'files', label: 'Files', icon: FileText },
  { id: 'pins', label: 'Pins', icon: Pin },
];

const EMPTY_MESSAGES: DMMessage[] = [];

export function DMConversation({ userId, userName, userAvatar }: DMConversationProps) {
  const navigate = useNavigate();
  const messages = useDMStore((s) => s.messages[userId]) ?? EMPTY_MESSAGES;
  const isLoading = useDMStore((s) => s.isLoading);
  const loadError = useDMStore((s) => s.loadError);
  const fetchConversation = useDMStore((s) => s.fetchConversation);
  const sendError = useDMStore((s) => s.sendError);
  const clearSendError = useDMStore((s) => s.clearSendError);
  const storeSendMessage = useDMStore((s) => s.sendMessage);
  const storeEditMessage = useDMStore((s) => s.editMessage);
  const storeDeleteMessage = useDMStore((s) => s.deleteMessage);

  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [showMoreMenuId, setShowMoreMenuId] = useState<number | null>(null);
  const [showEmojiPickerId, setShowEmojiPickerId] = useState<number | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [isStarred, setIsStarred] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const searchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = userId === currentUser?.id;
  const channels = useChannelStore((s) => s.channels);
  const setActiveChannel = useChannelStore((s) => s.setActiveChannel);
  const dmEntry = useChannelStore((s) => s.directMessages.find((d) => d.userId === userId));
  const openProfile = useProfileStore((s) => s.openProfile);
  const {
    editingId, editContent, setEditContent, editInputRef,
    startEdit, cancelEdit, saveEdit, handleEditKeyDown,
  } = useMessageEdit({
    onSave: (id, content) => storeEditMessage(id, content, userId),
  });

  useEffect(() => {
    fetchConversation(userId);
  }, [userId, fetchConversation]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Close search results when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    }
    if (showSearchResults) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showSearchResults]);

  // Close notifications when clicking outside
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

  // Close header menu when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowHeaderMenu(false);
      }
    }
    if (showHeaderMenu) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [showHeaderMenu]);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = async (query?: string) => {
    const q = (query ?? searchQuery).trim();
    if (q.length < 2) {
      setShowSearchResults(false);
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    setShowSearchResults(true);
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
      setShowSearchResults(false);
      setSearchResults([]);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      handleSearch(value);
    }, 300);
  };

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
      setShowSearchResults(false);
      setSearchResults([]);
    }
  };

  const handleSearchResultClick = (result: SearchResult) => {
    if (result.channel) {
      setActiveChannel(result.channel.id, result.id);
    } else if (result.participant) {
      navigate(`/d/${result.participant.id}`);
    }
    setSearchQuery('');
    setShowSearchResults(false);
    setSearchResults([]);
  };

  const handleStartEdit = (msg: { id: number; content: string }) => {
    startEdit(msg.id, msg.content);
    setShowMoreMenuId(null);
  };

  const handleDelete = async (msgId: number) => {
    setShowMoreMenuId(null);
    await storeDeleteMessage(msgId, userId);
  };

  const keepToolbarOpen = (msgId: number) =>
    showMoreMenuId === msgId || showEmojiPickerId === msgId || editingId === msgId;

  return (
    <div data-testid="dm-conversation" className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-col border-b border-slack-border bg-white">
        {/* Top Row */}
        <div className="flex h-[49px] items-center justify-between px-4">
          {/* Left Section */}
          <div className="flex items-center gap-1">
            <Avatar
              src={userAvatar || undefined}
              alt={userName}
              fallback={userName}
              size="md"
              status={dmEntry?.userStatus || 'offline'}
            />
            <span className="ml-2 text-[18px] font-bold text-slack-primary">{userName}{isSelf && <span className="font-normal text-slack-hint"> (you)</span>}</span>
            <Button
              variant="toolbar"
              size="icon-xs"
              data-testid="dm-star-button"
              onClick={() => setIsStarred((v) => !v)}
              title={isStarred ? 'Remove from Starred' : 'Add to Starred'}
            >
              <Star className={cn('h-4 w-4', isStarred ? 'fill-yellow-400 text-yellow-400' : 'text-slack-secondary')} />
            </Button>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-2">
            <div className="relative" ref={notifRef}>
              <Button
                variant="toolbar"
                size="icon-xs"
                data-testid="dm-notification-bell"
                title="Notifications"
                onClick={() => setShowNotifications((v) => !v)}
              >
                <Bell className={cn('h-4 w-4', showNotifications ? 'text-slack-link' : 'text-slack-secondary')} />
              </Button>
              {showNotifications && (
                <div data-testid="dm-notifications-panel" className="absolute right-0 top-7 z-50 w-[300px] max-h-[360px] overflow-y-auto rounded-lg border border-slack-border bg-white shadow-lg">
                  <div className="px-3 py-2 border-b border-slack-border">
                    <h3 className="text-[13px] font-bold text-slack-primary">Activity</h3>
                  </div>
                  {(() => {
                    const unread = channels.filter((ch) => ch.unreadCount > 0);
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
              {showSearchResults && (
                <div data-testid="dm-search-results-dropdown" className="absolute right-0 top-8 z-50 w-[360px] max-h-[400px] overflow-y-auto rounded-lg border border-slack-border bg-white shadow-lg">
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
                          onClick={() => handleSearchResultClick(result)}
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
                                <span className="text-slack-disabled">{format(new Date(result.createdAt), 'h:mm a')}</span>
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
                data-testid="dm-header-menu"
                onClick={() => setShowHeaderMenu((v) => !v)}
              >
                <MoreVertical className="h-4 w-4 text-slack-secondary" />
              </Button>
              {showHeaderMenu && (
                <div className="absolute right-0 top-7 z-50 min-w-[160px] rounded-lg border border-slack-border bg-white shadow-lg py-1">
                  <p className="px-3 py-2 text-[13px] text-slack-hint">No actions available</p>
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Tabs Row */}
        <div className="flex items-center gap-0.5 px-4 pb-[6px]">
          {dmHeaderTabs.map((tab) => (
            <button
              key={tab.id}
              data-testid={`dm-header-tab-${tab.id}`}
              onClick={() => {
                if (tab.id === 'pins') {
                  setShowPins((prev) => !prev);
                  setShowFiles(false);
                } else if (tab.id === 'files') {
                  setShowFiles((prev) => !prev);
                  setShowPins(false);
                }
              }}
              className={cn(
                'flex items-center gap-1 rounded px-2 py-[3px] text-[13px] transition-colors',
                (tab.id === 'pins' && showPins) || (tab.id === 'files' && showFiles)
                  ? 'bg-slack-active-tab text-slack-primary font-medium'
                  : 'text-slack-secondary hover:bg-slack-hover hover:text-slack-primary',
              )}
            >
              <tab.icon className="h-[14px] w-[14px]" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Body: messages column + optional side panel */}
      <div className="flex min-h-0 flex-1">
        {/* Messages column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Messages list */}
          <div className="flex-1 overflow-y-auto bg-white px-5 pb-4 pt-5">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-slack-hint">
                Loading messages...
              </div>
            ) : loadError ? (
              <div className="flex h-full items-center justify-center text-sm text-slack-error">
                {loadError}
              </div>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-slack-hint">
                <p className="text-lg font-medium">
                  {isSelf ? 'This is your space. Draft messages, list your to-dos, or keep links and files handy.' : `Start of your conversation with ${userName}`}
                </p>
                <p className="text-sm">Send a message to begin.</p>
              </div>
            ) : (
              <>
                {messages.map((msg, i) => {
                  const prevMsg = messages[i - 1];
                  const showDate =
                    !prevMsg ||
                    (!isToday(prevMsg.createdAt) &&
                      format(msg.createdAt, 'yyyy-MM-dd') !==
                        format(prevMsg.createdAt, 'yyyy-MM-dd'));
                  const showAvatar = !prevMsg || prevMsg.fromUserId !== msg.fromUserId;
                  const isOwner = currentUser?.id === msg.fromUserId;
                  const isHovered = hoveredMessageId === msg.id;
                  const isEditing = editingId === msg.id;

                  return (
                    <div key={msg.id}>
                      {showDate && (
                        <div className="relative my-[10px] flex items-center">
                          <div className="flex-1 border-t border-slack-border-light" />
                          <span className="flex-shrink-0 rounded-full border border-slack-border-light bg-white px-3 py-[2px] text-[13px] font-semibold text-slack-primary">
                            {formatDateSeparator(msg.createdAt)}
                          </span>
                          <div className="flex-1 border-t border-slack-border-light" />
                        </div>
                      )}
                      <div
                        data-testid={`dm-message-${msg.id}`}
                        data-from={msg.fromUserId}
                        className={cn(
                          'group relative flex px-0 hover:bg-slack-hover',
                          showAvatar ? 'pb-2 pt-4' : 'py-0.5',
                        )}
                        onMouseEnter={() => {
                          clearTimeout(hoverLeaveTimer.current);
                          setHoveredMessageId(msg.id);
                        }}
                        onMouseLeave={() => {
                          hoverLeaveTimer.current = setTimeout(() => {
                            setHoveredMessageId(null);
                            setShowMoreMenuId(null);
                          }, 150);
                        }}
                      >
                        <div className="mr-2 w-9 flex-shrink-0">
                          {showAvatar ? (
                            <button
                              onClick={() => openProfile(msg.fromUserId)}
                            >
                              <Avatar
                                src={msg.fromUser.avatar || undefined}
                                alt={msg.fromUser.name}
                                fallback={msg.fromUser.name}
                                size="md"
                                className="mt-[5px]"
                              />
                            </button>
                          ) : (
                            <span className="hidden text-[12px] leading-[22px] text-slack-secondary group-hover:inline">
                              {format(msg.createdAt, 'h:mm')}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          {showAvatar && (
                            <div className="flex items-baseline gap-2">
                              <button
                                onClick={() => openProfile(msg.fromUserId)}
                                className="text-[15px] font-bold text-slack-primary hover:underline"
                              >
                                {msg.fromUser.name}
                              </button>
                              <span className="text-[12px] text-slack-secondary">
                                {format(msg.createdAt, 'h:mm a')}
                              </span>
                              {msg.editedAt && (
                                <span className="text-[12px] text-slack-secondary">(edited)</span>
                              )}
                            </div>
                          )}
                          {isEditing ? (
                            <div className="mt-1">
                              <textarea
                                ref={editInputRef}
                                data-testid="dm-edit-input"
                                value={editContent}
                                onChange={(e) => setEditContent(e.target.value)}
                                onKeyDown={(e) => handleEditKeyDown(e, msg.content)}
                                className="w-full resize-none rounded border border-slack-link bg-white p-2 text-[15px] leading-[22px] text-slack-primary outline-none"
                                rows={2}
                              />
                              <div className="mt-1 flex items-center gap-2 text-[12px]">
                                <button
                                  onClick={cancelEdit}
                                  className="text-slack-secondary hover:underline"
                                >
                                  Cancel
                                </button>
                                <button
                                  data-testid="dm-edit-save"
                                  onClick={() => saveEdit(msg.content)}
                                  className="rounded bg-slack-btn px-3 py-1 text-white hover:bg-slack-btn-hover"
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="whitespace-pre-wrap break-words text-[15px] leading-[22px] text-slack-primary">
                              {renderMessageContent(msg.content)}
                              {!showAvatar && msg.editedAt && (
                                <span className="ml-1 text-[12px] text-slack-secondary">(edited)</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Hover action toolbar */}
                        {(isHovered || keepToolbarOpen(msg.id)) && !isEditing && (
                          <MessageToolbar
                            className="absolute -top-4 right-2"
                            testIdPrefix="dm"
                            onEmojiClick={() =>
                              setShowEmojiPickerId((prev) =>
                                prev === msg.id ? null : msg.id,
                              )
                            }
                            onThreadClick={() => {
                              // Threads on DMs not supported yet
                            }}
                            onMoreClick={isOwner ? () =>
                              setShowMoreMenuId((prev) =>
                                prev === msg.id ? null : msg.id,
                              ) : undefined}
                          />
                        )}

                        {/* More actions dropdown */}
                        {showMoreMenuId === msg.id && (
                          <MessageActionsMenu
                            className="absolute -top-4 right-2 z-50 mt-9"
                            testIdPrefix="dm"
                            showOwnerActions={isOwner}
                            onEdit={() => handleStartEdit(msg)}
                            onDelete={() => handleDelete(msg.id)}
                          />
                        )}

                        {/* Emoji picker */}
                        {showEmojiPickerId === msg.id && (
                          <div className="absolute -top-4 right-2 z-50 mt-9">
                            <EmojiPicker
                              onEmojiSelect={(_emoji) => {
                                // Reactions on DMs not supported by backend yet
                                setShowEmojiPickerId(null);
                              }}
                              onClickOutside={() => setShowEmojiPickerId(null)}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <MessageInput
            placeholder={`Message ${userName}`}
            onSend={async (content) => { await storeSendMessage(userId, content); }}
            sendError={sendError}
            clearSendError={clearSendError}
            testIdPrefix="dm"
          />
        </div>

        {/* Pins Panel */}
        {showPins && (
          <div
            data-testid="dm-pins-panel"
            className="flex w-[300px] flex-col border-l border-slack-border bg-white"
          >
            <div className="flex h-[49px] items-center justify-between border-b border-slack-border px-4">
              <div className="flex items-center gap-1.5">
                <Pin className="h-4 w-4 text-slack-secondary" />
                <span className="text-[15px] font-bold text-slack-primary">Pinned messages</span>
              </div>
              <Button
                variant="toolbar"
                size="icon-sm"
                onClick={() => setShowPins(false)}
              >
                <X className="h-4 w-4 text-slack-secondary" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-center text-sm text-slack-hint">
              No pinned messages yet
            </div>
          </div>
        )}

        {/* Files Panel */}
        {showFiles && (
          <div
            data-testid="dm-files-panel"
            className="flex w-[300px] flex-col border-l border-slack-border bg-white"
          >
            <div className="flex h-[49px] items-center justify-between border-b border-slack-border px-4">
              <div className="flex items-center gap-1.5">
                <FileText className="h-4 w-4 text-slack-secondary" />
                <span className="text-[15px] font-bold text-slack-primary">Files</span>
              </div>
              <Button
                variant="toolbar"
                size="icon-sm"
                onClick={() => setShowFiles(false)}
              >
                <X className="h-4 w-4 text-slack-secondary" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-center text-sm text-slack-hint">
              No files shared yet
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
