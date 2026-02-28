import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { Smile, MessageSquare, MoreHorizontal, Bookmark, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { MessageReactions } from './MessageReactions';
import { useMessageStore } from '@/stores/useMessageStore';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Message as MessageType } from '@/lib/types';

interface MessageProps {
  message: MessageType;
  showAvatar: boolean;
  isCompact: boolean;
}

export function Message({ message, showAvatar, isCompact }: MessageProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const [isBookmarked, setIsBookmarked] = useState(false);
  const editInputRef = useRef<HTMLTextAreaElement>(null);
  const { addReaction, editMessage, deleteMessage } = useMessageStore();
  const currentUser = useAuthStore((s) => s.user);
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
        'group relative flex px-5 hover:bg-[#F8F8F8]',
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
          <div className="flex items-baseline gap-2">
            <button className="text-[15px] font-black text-[#1D1C1D] hover:underline">
              {message.user.displayName || message.user.name}
            </button>
            <span className="text-[12px] font-normal text-[#616061] ml-1">{formattedTime}</span>
            {message.isEdited && (
              <span className="text-[12px] text-[#616061]">(edited)</span>
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
            {message.content}
            {!showAvatar && message.isEdited && (
              <span className="text-[12px] text-[#616061] ml-1">(edited)</span>
            )}
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
          <button className="mt-[6px] flex items-center gap-2 rounded px-1 py-0.5 text-[13px] text-[#1264A3] hover:bg-[#e8f5fa] -ml-1">
            {/* Mini avatar stack */}
            <div className="flex -space-x-1">
              <div className="h-5 w-5 rounded-[4px] bg-[#e8e8e8] border border-white" />
              {message.threadCount > 1 && (
                <div className="h-5 w-5 rounded-[4px] bg-[#d8d8d8] border border-white" />
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
          <button className="flex h-7 w-7 items-center justify-center rounded hover:bg-[#F8F8F8]">
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
      {showMoreMenu && isOwner && (
        <div className="absolute -top-4 right-5 mt-9 z-50 w-48 rounded-lg border border-[#E0E0E0] bg-white py-1 shadow-lg">
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
