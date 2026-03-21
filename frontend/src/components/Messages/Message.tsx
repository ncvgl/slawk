import { useState } from 'react';
import { format } from 'date-fns';
import { FileIcon, Download, Pin, Mic } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { PortalEmojiPicker } from '@/components/ui/emoji-picker';
import { MessageReactions } from './MessageReactions';
import { ThreadIndicator } from './ThreadIndicator';
import { useMessageStore } from '@/stores/useMessageStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { useBookmarkStore } from '@/stores/useBookmarkStore';
import { useChannelStore } from '@/stores/useChannelStore';
import { useMessageActions } from '@/hooks/useMessageActions';
import { useMessageHover } from '@/hooks/useMessageHover';
import { useMessageEdit } from '@/hooks/useMessageEdit';
import type { Message as MessageType } from '@/lib/types';
import { getAuthFileUrl, getFileUrl, markChannelUnread } from '@/lib/api';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { ImageLightbox } from './ImageLightbox';
import { MessageToolbar } from './MessageToolbar';
import { MessageActionsMenu } from './MessageActionsMenu';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';

interface MessageProps {
  message: MessageType;
  showAvatar: boolean;
  isCompact: boolean;
  onOpenThread?: (messageId: number) => void;
  readOnly?: boolean;
  variant?: 'default' | 'thread';
  onEditMessage?: (id: number, content: string) => Promise<void>;
  onDeleteMessage?: (id: number) => Promise<void>;
  onAddReaction?: (id: number, emoji: string) => void;
  onRemoveReaction?: (id: number, emoji: string) => void;
}

export function Message({ message, showAvatar, isCompact, onOpenThread, readOnly, variant = 'default', onEditMessage, onDeleteMessage, onAddReaction, onRemoveReaction }: MessageProps) {
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [lightboxAlt, setLightboxAlt] = useState<string>('');
  const { addReaction, removeReaction, editMessage, deleteMessage } = useMessageStore();
  const currentUser = useAuthStore((s) => s.user);
  const { openProfile } = useProfileStore();
  const toggleBookmark = useBookmarkStore((s) => s.toggle);
  const isBookmarked = useBookmarkStore((s) => s.bookmarkedIds.has(message.id));
  const { togglePin } = useMessageActions();
  const setUnreadCount = useChannelStore((s) => s.setUnreadCount);
  const { isHovered, setIsHovered, onMouseEnter, onMouseLeave, onTouchStart } = useMessageHover();
  const isThread = variant === 'thread';
  const effectiveAddReaction = onAddReaction ?? addReaction;
  const effectiveRemoveReaction = onRemoveReaction ?? removeReaction;
  const {
    editingId, editContent, setEditContent, editInputRef,
    startEdit, cancelEdit, saveEdit, handleEditKeyDown,
  } = useMessageEdit({
    onSave: onEditMessage ?? ((id, content) => editMessage(id, content)),
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
    await (onDeleteMessage ?? deleteMessage)(message.id);
  };

  const keepOpen = showEmojiPicker || showMoreMenu || isEditing;

  return (
    <div
      className={cn(
        'group relative flex px-5',
        message.isPinned ? 'bg-slack-pinned hover:bg-slack-pinned' : 'hover:bg-slack-hover',
        showAvatar ? 'pt-2 pb-px' : 'py-px'
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={() => onMouseLeave(() => setShowMoreMenu(false))}
      onTouchStart={onTouchStart}
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
          <span className="text-[12px] text-slack-secondary opacity-0 group-hover:opacity-100 leading-[22px] select-none" title={format(message.createdAt, 'EEEE, MMMM d, yyyy h:mm:ss a')}>
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
            onClick={(e) => {
              const el = (e.target as HTMLElement).closest('[data-mention-id]');
              if (!el) return;
              const id = el.getAttribute('data-mention-id');
              if (id) openProfile(Number(id));
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
                {file.mimetype.startsWith('audio/') || (file.mimetype === 'video/webm' && file.originalName.startsWith('voice-message')) ? (
                  <div className="px-3 py-2.5">
                    <audio
                      controls
                      controlsList="nodownload noplaybackrate"
                      preload="metadata"
                      className="h-8"
                      src={getFileUrl(file.id)}
                    />
                  </div>
                ) : file.mimetype.startsWith('video/') ? (
                  <div>
                    <video
                      controls
                      preload="metadata"
                      className="max-h-[300px] max-w-full"
                      src={getFileUrl(file.id)}
                    />
                    <div className="flex items-center gap-2 px-3 py-1.5 border-t border-slack-border">
                      <span className="text-[13px] text-slack-link truncate max-w-[200px]">
                        {file.originalName}
                      </span>
                      <span className="text-[11px] text-slack-disabled flex-shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                      <a
                        href={getAuthFileUrl(`/files/${file.id}/download`, { download: true })}
                        download={file.originalName.replace(/[/\\:\0]/g, '_')} rel="noopener"
                        className="ml-auto flex-shrink-0 text-slack-disabled hover:text-slack-primary"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </div>
                  </div>
                ) : file.mimetype.startsWith('image/') ? (
                  <div>
                    <button
                      data-testid="image-thumbnail"
                      onClick={() => { setLightboxSrc(getFileUrl(file.id)); setLightboxAlt(file.originalName); }}
                      className="block cursor-zoom-in focus:outline-none"
                    >
                      <img
                        src={getFileUrl(file.id)}
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
                        href={getAuthFileUrl(`/files/${file.id}/download`, { download: true })}
                        download={file.originalName.replace(/[/\\:\0]/g, '_')} rel="noopener"
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
                        href={getAuthFileUrl(`/files/${file.id}/download`, { download: true })}
                        download={file.originalName.replace(/[/\\:\0]/g, '_')} rel="noopener"
                        className="block text-[13px] font-medium text-slack-link hover:underline truncate"
                      >
                        {file.originalName}
                      </a>
                      <span className="text-[11px] text-slack-disabled">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <a
                      href={getAuthFileUrl(`/files/${file.id}/download`, { download: true })}
                      download={file.originalName.replace(/[/\\:\0]/g, '_')} rel="noopener"
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
            onAddReaction={effectiveAddReaction}
            onRemoveReaction={effectiveRemoveReaction}
          />
        )}

        {/* Thread indicator */}
        {message.threadCount > 0 && (
          <ThreadIndicator
            replyCount={message.threadCount}
            author={{ id: message.user.id, name: message.user.name, avatar: message.user.avatar }}
            participants={message.threadParticipants}
            onClick={() => onOpenThread?.(message.id)}
          />
        )}
      </div>

      {/* Hover Actions */}
      {!readOnly && (isHovered || keepOpen) && (
        <MessageToolbar
          className="absolute -top-4 right-5"
          onEmojiClick={() => setShowEmojiPicker(!showEmojiPicker)}
          onThreadClick={!isThread ? () => onOpenThread?.(message.id) : undefined}
          onBookmarkClick={!isThread ? () => toggleBookmark(message.id) : undefined}
          isBookmarked={!isThread ? isBookmarked : undefined}
          onMoreClick={() => setShowMoreMenu(!showMoreMenu)}
        />
      )}

      {/* More actions dropdown */}
      {showMoreMenu && (
        <MessageActionsMenu
          anchorClassName="absolute -top-4 right-5 mt-9"
          onClose={() => setShowMoreMenu(false)}
          onMarkUnread={!isThread ? () => {
            setShowMoreMenu(false);
            const allMessages = useMessageStore.getState().messages;
            const unreadCount = allMessages.filter(
              (m) => m.channelId === message.channelId && m.id >= message.id
            ).length;
            setUnreadCount(message.channelId, unreadCount);
            markChannelUnread(message.channelId, message.id).catch(() => {});
          } : undefined}
          onPin={!isThread ? () => {
            setShowMoreMenu(false);
            togglePin(message.id, message.isPinned);
          } : undefined}
          isPinned={message.isPinned}
          showOwnerActions={isOwner}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Emoji Picker from hover toolbar */}
      {showEmojiPicker && (
        <PortalEmojiPicker
          anchorClassName="absolute -top-4 right-5 mt-9"
          onEmojiSelect={(emoji) => {
            effectiveAddReaction(message.id, emoji.native);
            setShowEmojiPicker(false);
          }}
          onClickOutside={() => setShowEmojiPicker(false)}
        />
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
        <DeleteConfirmDialog
          onCancel={() => setShowDeleteConfirm(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
