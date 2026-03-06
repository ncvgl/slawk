import { useState } from 'react';
import { format } from 'date-fns';
import { FileIcon, Download, Pin, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { MessageReactions } from './MessageReactions';
import { useMessageStore } from '@/stores/useMessageStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { useBookmarkStore } from '@/stores/useBookmarkStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { useMessageActions } from '@/hooks/useMessageActions';
import { useMessageHover } from '@/hooks/useMessageHover';
import { useMessageEdit } from '@/hooks/useMessageEdit';
import type { Message as MessageType } from '@/lib/types';
import { getAuthFileUrl, getUsers, markChannelUnread } from '@/lib/api';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { ImageLightbox } from './ImageLightbox';
import { MessageToolbar } from './MessageToolbar';
import { MessageActionsMenu } from './MessageActionsMenu';

interface MessageProps {
  message: MessageType;
  showAvatar: boolean;
  isCompact: boolean;
  onOpenThread?: (messageId: number) => void;
}

export function Message({ message, showAvatar, isCompact, onOpenThread }: MessageProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState<string>('');
  const { addReaction, editMessage, deleteMessage } = useMessageStore();
  const currentUser = useAuthStore((s) => s.user);
  const { openProfile } = useProfileStore();
  const toggleBookmark = useBookmarkStore((s) => s.toggle);
  const isBookmarked = useBookmarkStore((s) => s.bookmarkedIds.has(message.id));
  const { togglePin } = useMessageActions();
  const setUnreadCount = useChannelStore((s) => s.setUnreadCount);
  const { isHovered, onMouseEnter, onMouseLeave } = useMessageHover();
  const {
    editingId, editContent, setEditContent, editInputRef,
    startEdit, cancelEdit, saveEdit, handleEditKeyDown,
  } = useMessageEdit({
    onSave: (id, content) => editMessage(id, content),
  });
  const isOwner = currentUser?.id === message.userId;
  const isEditing = editingId === message.id;

  const formattedTime = format(message.createdAt, 'h:mm a');

  const handleEdit = () => {
    startEdit(message.id, message.content);
    setShowMoreMenu(false);
  };

  const handleDelete = () => {
    setShowMoreMenu(false);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);
    await deleteMessage(message.id);
  };

  const keepOpen = showEmojiPicker || showMoreMenu || isEditing;

  return (
    <div
      className={cn(
        'group relative flex px-5',
        message.isPinned ? 'bg-slack-pinned hover:bg-slack-pinned' : 'hover:bg-slack-hover',
        showAvatar ? 'pt-4 pb-2' : 'py-0.5'
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={() => onMouseLeave(() => setShowMoreMenu(false))}
    >
      {/* Fixed 36px left gutter column with 8px gap to content */}
      <div className="w-9 flex-shrink-0 mr-2">
        {showAvatar ? (
          <button onClick={() => openProfile(message.userId)}>
            <Avatar
              src={message.user.avatar}
              alt={message.user.name}
              fallback={message.user.name}
              size="md"
              className="mt-[5px]"
            />
          </button>
        ) : (
          <span className="hidden text-[12px] text-slack-secondary group-hover:inline leading-[22px]" title={format(message.createdAt, 'EEEE, MMMM d, yyyy h:mm:ss a')}>
            {format(message.createdAt, 'h:mm')}
          </span>
        )}
      </div>

      {/* Flex-grow right content column */}
      <div className="flex-1 min-w-0">
        {showAvatar && (
          <div className="flex items-center gap-2">
            <button
              data-testid="sender-name"
              onClick={() => openProfile(message.userId)}
              className="text-[15px] font-bold text-slack-primary hover:underline"
            >
              {message.user.displayName || message.user.name}
            </button>
            <span className="text-[12px] font-normal text-slack-secondary ml-1" title={format(message.createdAt, 'EEEE, MMMM d, yyyy h:mm:ss a')}>{formattedTime}</span>
            {message.isEdited && (
              <span className="text-[12px] text-slack-secondary">(edited)</span>
            )}
            {message.isPinned && (
              <span data-testid="pin-indicator" className="inline-flex items-center gap-0.5 text-[12px] text-slack-pin-indicator ml-1">
                <Pin className="h-3 w-3" />
                Pinned
              </span>
            )}
          </div>
        )}

        {isEditing ? (
          <div className="mt-1">
            <textarea
              ref={editInputRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => handleEditKeyDown(e, message.content)}
              className="w-full rounded border border-slack-link bg-white p-2 text-[15px] text-slack-primary leading-[22px] resize-none outline-none"
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
                onClick={() => saveEdit(message.content)}
                className="rounded bg-slack-btn px-3 py-1 text-white hover:bg-slack-btn-hover"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div
            className="text-[15px] font-normal text-slack-primary leading-[22px] whitespace-pre-wrap break-words"
            onClick={async (e) => {
              const el = (e.target as HTMLElement).closest('[data-mention-name]');
              if (!el) return;
              const name = el.getAttribute('data-mention-name');
              if (!name) return;
              try {
                const users = await getUsers(name);
                const match = users.find((u) => u.name === name);
                if (match) openProfile(match.id);
              } catch { /* ignore */ }
            }}
          >
            {renderMessageContent(message.content)}
            {!showAvatar && message.isEdited && (
              <span className="text-[12px] text-slack-secondary ml-1">(edited)</span>
            )}
          </div>
        )}

        {/* File Attachments */}
        {message.files && message.files.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {message.files.map((file) => (
              <div
                key={file.id}
                data-testid="message-file"
                className="rounded-lg border border-slack-border overflow-hidden"
              >
                {file.mimetype.startsWith('audio/') ? (
                  <div className="flex items-center gap-3 px-3 py-2.5 min-w-[280px]">
                    <Mic className="h-5 w-5 text-slack-link flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <audio
                        controls
                        preload="metadata"
                        className="h-8 w-full max-w-[240px]"
                        src={getAuthFileUrl(file.url)}
                      />
                      <span className="block text-[11px] text-slack-disabled mt-0.5">
                        {file.originalName} &middot; {formatFileSize(file.size)}
                      </span>
                    </div>
                  </div>
                ) : file.mimetype.startsWith('image/') ? (
                  <div>
                    <button
                      data-testid="image-thumbnail"
                      onClick={() => { setLightboxSrc(getAuthFileUrl(file.url)); setLightboxAlt(file.originalName); }}
                      className="block cursor-zoom-in focus:outline-none"
                    >
                      <img
                        src={getAuthFileUrl(file.url)}
                        alt={file.originalName}
                        className="max-h-[200px] max-w-[300px] object-contain"
                      />
                    </button>
                    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-slack-border">
                      <span data-testid="image-filename" className="text-[13px] text-slack-link truncate max-w-[200px]">
                        {file.originalName}
                      </span>
                      <span data-testid="image-filesize" className="text-[11px] text-slack-disabled flex-shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                      <a
                        data-testid="image-download"
                        href={getAuthFileUrl(file.url)}
                        download={file.originalName}
                        className="ml-auto flex-shrink-0 text-slack-disabled hover:text-slack-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-3 py-2.5 border-l-4 border-slack-link">
                    <FileIcon className="h-8 w-8 text-slack-link flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <a
                        href={getAuthFileUrl(file.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-[13px] font-medium text-slack-link hover:underline truncate"
                      >
                        {file.originalName}
                      </a>
                      <span className="text-[11px] text-slack-disabled">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <a
                      href={getAuthFileUrl(file.url)}
                      download={file.originalName}
                      className="flex-shrink-0 text-slack-disabled hover:text-slack-primary"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <MessageReactions
            reactions={message.reactions}
            messageId={message.id}
          />
        )}

        {/* Thread indicator - 13px, Slack blue, with mini avatars */}
        {message.threadCount > 0 && (
          <button
            onClick={() => onOpenThread?.(message.id)}
            className="mt-[6px] flex items-center gap-2 rounded px-1 py-0.5 text-[13px] text-slack-link hover:bg-slack-highlight -ml-1"
          >
            {/* Mini avatar stack */}
            <div data-testid="thread-avatars" className="flex -space-x-1">
              {(() => {
                // Collect unique participants: message author + thread participants
                const seen = new Set<number>();
                const participants: { id: number; name: string; avatar: string | null }[] = [];
                // Add message author first
                seen.add(message.user.id);
                participants.push({ id: message.user.id, name: message.user.name, avatar: message.user.avatar });
                // Add thread participants (reply authors)
                for (const p of message.threadParticipants ?? []) {
                  if (!seen.has(p.id)) {
                    seen.add(p.id);
                    participants.push(p);
                  }
                }
                return participants.slice(0, 3).map((p) => (
                  <Avatar
                    key={p.id}
                    src={p.avatar ?? undefined}
                    alt={p.name}
                    fallback={p.name}
                    size="sm"
                    className="border border-white"
                  />
                ));
              })()}
            </div>
            <span className="font-normal">
              {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
            </span>
          </button>
        )}
      </div>

      {/* Hover Actions */}
      {(isHovered || keepOpen) && (
        <MessageToolbar
          className="absolute -top-4 right-5"
          onEmojiClick={() => setShowEmojiPicker(!showEmojiPicker)}
          onThreadClick={() => onOpenThread?.(message.id)}
          onBookmarkClick={() => toggleBookmark(message.id)}
          isBookmarked={isBookmarked}
          onMoreClick={() => setShowMoreMenu(!showMoreMenu)}
        />
      )}

      {/* More actions dropdown */}
      {showMoreMenu && (
        <MessageActionsMenu
          className="absolute -top-4 right-5 mt-9 z-50"
          onMarkUnread={() => {
            setShowMoreMenu(false);
            // Count this message and all subsequent messages as unread
            const allMessages = useMessageStore.getState().messages;
            const unreadCount = allMessages.filter(
              (m) => m.channelId === message.channelId && m.id >= message.id
            ).length;
            setUnreadCount(message.channelId, unreadCount);
            markChannelUnread(message.channelId, message.id).catch(() => {});
          }}
          onPin={() => {
            setShowMoreMenu(false);
            togglePin(message.id, message.isPinned);
          }}
          isPinned={message.isPinned}
          showOwnerActions={isOwner}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Emoji Picker from hover toolbar */}
      {showEmojiPicker && (
        <div className="absolute -top-4 right-5 mt-9 z-50">
          <EmojiPicker
            onEmojiSelect={(emoji) => {
              addReaction(message.id, emoji.native);
              setShowEmojiPicker(false);
            }}
            onClickOutside={() => setShowEmojiPicker(false)}
          />
        </div>
      )}

      {/* Image Lightbox */}
      {lightboxSrc && (
        <ImageLightbox
          src={lightboxSrc}
          alt={lightboxAlt}
          onClose={() => setLightboxSrc(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
          <div
            data-testid="delete-confirm-dialog"
            className="w-[400px] rounded-xl bg-white shadow-xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[17px] font-bold text-slack-primary mb-2">Delete message</h3>
            <p className="text-[14px] text-slack-secondary mb-4">
              Are you sure you want to delete this message? This can't be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                data-testid="delete-cancel-btn"
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-[14px] font-medium text-slack-primary rounded-md border border-slack-border hover:bg-slack-hover"
              >
                Cancel
              </button>
              <button
                data-testid="delete-confirm-btn"
                onClick={confirmDelete}
                className="px-4 py-2 text-[14px] font-medium text-white rounded-md bg-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
