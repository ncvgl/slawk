import { useState, useEffect, useRef, useCallback } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Pin,
  FileText,
  X,
  Star,
  MessageSquare,
} from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDMStore } from '@/stores/useDMStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useMessageEdit } from '@/hooks/useMessageEdit';
import { useProfileStore } from '@/stores/useProfileStore';
import { useBookmarkStore } from '@/stores/useBookmarkStore';
import { MessageToolbar } from './MessageToolbar';
import { MessageActionsMenu } from './MessageActionsMenu';
import { MessageInput } from './MessageInput';
import { ThreadPanel } from './ThreadPanel';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { HeaderSearch } from './HeaderSearch';
import { HeaderNotifications } from './HeaderNotifications';
import { HeaderTabs } from './HeaderTabs';
import { renderMessageContent } from '@/lib/renderMessageContent';
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


const EMPTY_MESSAGES: DMMessage[] = [];

export function DMConversation({ userId, userName, userAvatar }: DMConversationProps) {
  const messages = useDMStore((s) => s.messages[userId]) ?? EMPTY_MESSAGES;
  const isLoading = useDMStore((s) => s.isLoading);
  const loadError = useDMStore((s) => s.loadError);
  const fetchConversation = useDMStore((s) => s.fetchConversation);
  const sendError = useDMStore((s) => s.sendError);
  const clearSendError = useDMStore((s) => s.clearSendError);
  const storeSendMessage = useDMStore((s) => s.sendMessage);
  const storeEditMessage = useDMStore((s) => s.editMessage);
  const storeDeleteMessage = useDMStore((s) => s.deleteMessage);
  const updateReplyCount = useDMStore((s) => s.updateReplyCount);

  const [activeThreadId, setActiveThreadId] = useState<number | null>(null);
  const [hoveredMessageId, setHoveredMessageId] = useState<number | null>(null);
  const [showMoreMenuId, setShowMoreMenuId] = useState<number | null>(null);
  const [showPins, setShowPins] = useState(false);
  const [showFiles, setShowFiles] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isStarred, setIsStarred] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hoverLeaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const currentUser = useAuthStore((s) => s.user);
  const isSelf = userId === currentUser?.id;
  const dmEntry = useChannelStore((s) => s.directMessages.find((d) => d.userId === userId));
  const openProfile = useProfileStore((s) => s.openProfile);
  const toggleBookmark = useBookmarkStore((s) => s.toggle);
  const bookmarkedIds = useBookmarkStore((s) => s.bookmarkedIds);
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

  const handleStartEdit = (msg: { id: number; content: string }) => {
    startEdit(msg.id, msg.content);
    setShowMoreMenuId(null);
  };

  const handleDelete = (msgId: number) => {
    setShowMoreMenuId(null);
    setDeleteConfirmId(msgId);
  };

  const confirmDelete = async () => {
    if (deleteConfirmId == null) return;
    setDeleteConfirmId(null);
    await storeDeleteMessage(deleteConfirmId, userId);
  };

  const keepToolbarOpen = (msgId: number) =>
    showMoreMenuId === msgId || editingId === msgId;

  const handleOpenThread = useCallback((messageId: number) => {
    setActiveThreadId(messageId);
    setShowPins(false);
    setShowFiles(false);
  }, []);

  const handleCloseThread = useCallback(() => {
    setActiveThreadId(null);
  }, []);

  const handleReplyCountChange = useCallback((messageId: number, count: number) => {
    updateReplyCount(messageId, userId, count);
  }, [updateReplyCount, userId]);

  // Close thread panel when switching conversations
  useEffect(() => {
    setActiveThreadId(null);
  }, [userId]);

  return (
    <div data-testid="dm-conversation" className="flex h-full flex-col">
      {/* Header */}
      <header className="flex flex-col border-b border-slack-border bg-white">
        {/* Top Row */}
        <div className="flex h-[49px] items-center justify-between px-4">
          {/* Left Section */}
          <div className="flex items-center gap-1">
            <button onClick={() => openProfile(userId)} disabled={isSelf} className={cn(!isSelf && 'cursor-pointer')}>
              <Avatar
                src={userAvatar || undefined}
                alt={userName}
                fallback={userName}
                size="md"
                status={dmEntry?.userStatus || 'offline'}
              />
            </button>
            <button
              onClick={() => openProfile(userId)}
              disabled={isSelf}
              className={cn('ml-2 text-[18px] font-bold text-slack-primary', !isSelf && 'cursor-pointer hover:underline')}
            >
              {userName}{isSelf && <span className="font-normal text-slack-hint"> (you)</span>}
            </button>
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
            <HeaderNotifications testIdPrefix="dm" />
            <div className="h-4 w-px bg-slack-border" />
            <HeaderSearch testIdPrefix="dm" />
          </div>
        </div>
        {/* Tabs Row */}
        <HeaderTabs
          showPins={showPins}
          showFiles={showFiles}
          onTogglePins={() => { setShowPins((prev) => !prev); setShowFiles(false); }}
          onToggleFiles={() => { setShowFiles((prev) => !prev); setShowPins(false); }}
          testIdPrefix="dm"
        />
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
                          {msg.replyCount > 0 && (
                            <button
                              data-testid={`dm-thread-count-${msg.id}`}
                              onClick={() => handleOpenThread(msg.id)}
                              className="mt-1 flex items-center gap-1 text-[12px] text-slack-link hover:underline"
                            >
                              <MessageSquare className="h-3.5 w-3.5" />
                              <span>{msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}</span>
                            </button>
                          )}
                        </div>

                        {/* Hover action toolbar */}
                        {(isHovered || keepToolbarOpen(msg.id)) && !isEditing && (
                          <MessageToolbar
                            className="absolute -top-4 right-2"
                            testIdPrefix="dm"
                            onBookmarkClick={() => toggleBookmark(msg.id)}
                            isBookmarked={bookmarkedIds.has(msg.id)}
                            onThreadClick={() => handleOpenThread(msg.id)}
                            onMoreClick={isOwner ? () =>
                              setShowMoreMenuId((prev) =>
                                prev === msg.id ? null : msg.id,
                              ) : undefined}
                          />
                        )}

                        {/* More actions dropdown */}
                        {showMoreMenuId === msg.id && (
                          <MessageActionsMenu
                            anchorClassName="absolute -top-4 right-2 mt-9"
                            onClose={() => setShowMoreMenuId(null)}
                            testIdPrefix="dm"
                            showOwnerActions={isOwner}
                            onEdit={() => handleStartEdit(msg)}
                            onDelete={() => handleDelete(msg.id)}
                          />
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
            dmParticipantIds={currentUser ? [currentUser.id, userId] : [userId]}
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

        {/* Thread Panel */}
        {activeThreadId && (
          <ThreadPanel
            messageId={activeThreadId}
            variant="dm"
            onClose={handleCloseThread}
            onReplyCountChange={handleReplyCountChange}
          />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      {deleteConfirmId !== null && (
        <DeleteConfirmDialog
          onCancel={() => setDeleteConfirmId(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
