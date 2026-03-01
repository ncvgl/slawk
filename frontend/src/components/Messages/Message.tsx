import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Smile, MessageSquare, MoreHorizontal, Bookmark, Pencil, Trash2, FileIcon, Download, Pin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { MessageReactions } from './MessageReactions';
import { useMessageStore } from '@/stores/useMessageStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { pinMessage, unpinMessage } from '@/lib/api';
import type { Message as MessageType } from '@/lib/types';

function renderMessageContent(content: string): React.ReactNode {
  // Parse inline markdown: **bold**, *italic*, `code`, [text](url), @mentions
  const TOKEN = /(\*\*(.+?)\*\*)|(\*([^*\n]+?)\*)|(`([^`\n]+?)`)|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(@[\w][\w .'-]*[\w]|@\w+)/g;
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = TOKEN.exec(content)) !== null) {
    if (m.index > last) nodes.push(content.slice(last, m.index));
    if (m[1]) {
      nodes.push(<strong key={key++} className="font-bold">{m[2]}</strong>);
    } else if (m[3]) {
      nodes.push(<em key={key++} className="leading-[22px]">{m[4]}</em>);
    } else if (m[5]) {
      nodes.push(<code key={key++} className="rounded-[3px] bg-[rgba(29,28,29,0.08)] px-1 py-0.5 font-mono text-[0.875em]">{m[6]}</code>);
    } else if (m[7]) {
      nodes.push(<a key={key++} href={m[8]} target="_blank" rel="noopener noreferrer" className="text-[#1264A3] underline hover:text-[#0d4f8b]">{m[7]}</a>);
    } else if (m[9]) {
      nodes.push(<span key={key++} className="mention-highlight rounded bg-[#1d9bd11a] px-[2px] text-[#1264A3] font-medium cursor-pointer hover:bg-[#1d9bd133]">{m[9]}</span>);
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) nodes.push(content.slice(last));
  return nodes.length > 0 ? nodes : content;
}

interface MessageProps {
  message: MessageType;
  showAvatar: boolean;
  isCompact: boolean;
  onOpenThread?: (messageId: number) => void;
}

export function Message({ message, showAvatar, isCompact, onOpenThread }: MessageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const { addReaction, editMessage, deleteMessage } = useMessageStore();
  const currentUser = useAuthStore((s) => s.user);
  const { openProfile } = useProfileStore();
  const isOwner = currentUser?.id === message.userId;

  const formattedTime = format(message.createdAt, 'h:mm a');

  useEffect(() => {
    if (isEditing && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editContent.length, editContent.length);
    }
  }, [isEditing]);

  const handleEdit = () => {
    setIsEditing(true);
    setEditContent(message.content);
    setShowMoreMenu(false);
  };

  const handleSaveEdit = async () => {
    const trimmed = editContent.trim();
    if (trimmed && trimmed !== message.content) {
      await editMessage(message.id, trimmed);
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditContent(message.content);
  };

  const handleDelete = async () => {
    setShowMoreMenu(false);
    await deleteMessage(message.id);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const keepOpen = showEmojiPicker || showMoreMenu || isEditing;

  return (
    <div
      className={cn(
        'group relative flex px-5',
        message.isPinned ? 'bg-[#FEF9ED] hover:bg-[#FEF9ED]' : 'hover:bg-[#F8F8F8]',
        showAvatar ? 'pt-4 pb-2' : 'py-0.5'
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setShowMoreMenu(false);
      }}
    >
      {/* Fixed 36px left gutter column with 8px gap to content */}
      <div className="w-9 flex-shrink-0 mr-2">
        {showAvatar ? (
          <Avatar
            src={message.user.avatar}
            alt={message.user.name}
            fallback={message.user.name}
            size="md"
            className="mt-[5px]"
          />
        ) : (
          <span className="hidden text-[12px] text-[#616061] group-hover:inline leading-[22px]">
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
              className="text-[15px] font-bold text-[#1D1C1D] hover:underline"
            >
              {message.user.displayName || message.user.name}
            </button>
            <span className="text-[12px] font-normal text-[#616061] ml-1">{formattedTime}</span>
            {message.isEdited && (
              <span className="text-[12px] text-[#616061]">(edited)</span>
            )}
            {message.isPinned && (
              <span data-testid="pin-indicator" className="inline-flex items-center gap-0.5 text-[12px] text-[#E8912D] ml-1">
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
              onKeyDown={handleEditKeyDown}
              className="w-full rounded border border-[#1264A3] bg-white p-2 text-[15px] text-[#1D1C1D] leading-[22px] resize-none outline-none"
              rows={2}
            />
            <div className="mt-1 flex items-center gap-2 text-[12px]">
              <button
                onClick={handleCancelEdit}
                className="text-[#616061] hover:underline"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="rounded bg-[#007a5a] px-3 py-1 text-white hover:bg-[#005e46]"
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <div className="text-[15px] font-normal text-[#1D1C1D] leading-[22px] whitespace-pre-wrap break-words">
            {renderMessageContent(message.content)}
            {!showAvatar && message.isEdited && (
              <span className="text-[12px] text-[#616061] ml-1">(edited)</span>
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
                className="rounded-lg border border-gray-200 overflow-hidden"
              >
                {file.mimetype.startsWith('image/') ? (
                  <a href={file.url} target="_blank" rel="noopener noreferrer">
                    <img
                      src={file.url}
                      alt={file.originalName}
                      className="max-h-[200px] max-w-[300px] object-contain"
                    />
                  </a>
                ) : (
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
                  >
                    <FileIcon className="h-5 w-5 text-gray-500 flex-shrink-0" />
                    <span className="text-[13px] text-[#1264A3] hover:underline truncate max-w-[200px]">
                      {file.originalName}
                    </span>
                    <span className="text-[11px] text-gray-400 flex-shrink-0">
                      {formatFileSize(file.size)}
                    </span>
                    <Download className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  </a>
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
            className="mt-[6px] flex items-center gap-2 rounded px-1 py-0.5 text-[13px] text-[#1264A3] hover:bg-[#e8f5fa] -ml-1"
          >
            {/* Mini avatar stack */}
            <div data-testid="thread-avatars" className="flex -space-x-1">
              <Avatar
                src={message.user.avatar ?? undefined}
                alt={message.user.name}
                fallback={message.user.name}
                size="sm"
                className="border border-white"
              />
              {message.threadCount > 1 && (
                <Avatar
                  src={undefined}
                  alt="Thread participant"
                  fallback="?"
                  size="sm"
                  className="border border-white"
                />
              )}
            </div>
            <span className="font-normal">
              {message.threadCount} {message.threadCount === 1 ? 'reply' : 'replies'}
            </span>
          </button>
        )}
      </div>

      {/* Hover Actions */}
      {(isHovered || keepOpen) && (
        <div className="absolute -top-4 right-5 flex items-center gap-0.5 rounded-lg border border-[#E0E0E0] bg-white p-0.5 shadow-sm">
          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
          >
            <Smile className="h-4 w-4 text-[#616061]" />
          </button>
          <button
            onClick={() => onOpenThread?.(message.id)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
          >
            <MessageSquare className="h-4 w-4 text-[#616061]" />
          </button>
          <button
            onClick={() => setIsBookmarked(!isBookmarked)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
            title={isBookmarked ? 'Remove bookmark' : 'Bookmark this message'}
          >
            <Bookmark className={cn('h-4 w-4', isBookmarked ? 'text-yellow-500 fill-current' : 'text-[#616061]')} />
          </button>
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]"
          >
            <MoreHorizontal className="h-4 w-4 text-[#616061]" />
          </button>
        </div>
      )}

      {/* More actions dropdown */}
      {showMoreMenu && (
        <div className="absolute -top-4 right-5 mt-9 z-50 w-48 rounded-lg border border-[#E0E0E0] bg-white py-1 shadow-lg">
          <button
            onClick={async () => {
              setShowMoreMenu(false);
              try {
                if (message.isPinned) {
                  await unpinMessage(message.id);
                } else {
                  await pinMessage(message.id);
                }
                // Update the message in the store
                const { messages } = useMessageStore.getState();
                useMessageStore.setState({
                  messages: messages.map((m) =>
                    m.id === message.id ? { ...m, isPinned: !message.isPinned } : m
                  ),
                });
              } catch (err) {
                console.error('Failed to pin/unpin:', err);
              }
            }}
            className="flex w-full items-center gap-2 px-4 py-1.5 text-[14px] text-[#1D1C1D] hover:bg-[#F8F8F8]"
          >
            <Pin className="h-4 w-4" />
            {message.isPinned ? 'Unpin message' : 'Pin message'}
          </button>
          {isOwner && (
            <>
              <button
                onClick={handleEdit}
                className="flex w-full items-center gap-2 px-4 py-1.5 text-[14px] text-[#1D1C1D] hover:bg-[#F8F8F8]"
              >
                <Pencil className="h-4 w-4" />
                Edit message
              </button>
              <button
                onClick={handleDelete}
                className="flex w-full items-center gap-2 px-4 py-1.5 text-[14px] text-red-600 hover:bg-[#F8F8F8]"
              >
                <Trash2 className="h-4 w-4" />
                Delete message
              </button>
            </>
          )}
        </div>
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
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
