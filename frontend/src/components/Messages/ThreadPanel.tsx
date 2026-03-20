import { useState, useEffect, useRef, useCallback } from 'react';
import { SendHorizontal } from 'lucide-react';
import {
  getThread, replyToMessage, getDMThread, replyToDM,
  editMessage as apiEditMessage, deleteMessage as apiDeleteMessage,
  editDM, deleteDM,
  addReaction as apiAddReaction, removeReaction as apiRemoveReaction,
  addDMReaction, removeDMReaction,
  type ApiDirectMessage,
} from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';
import { getSocket } from '@/lib/socket';
import { serializeDelta } from '@/lib/serializeDelta';
import { FormatToolbar } from './FormatToolbar';
import { FilePreview } from './FilePreview';
import { MentionDropdown } from './MentionDropdown';
import { EmojiAutocomplete } from './EmojiAutocomplete';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { LinkModal } from './LinkModal';
import { PanelHeader } from './PanelHeader';
import { EditorToolbar } from './EditorToolbar';
import { useQuillEditor } from '@/hooks/useQuillEditor';
import { Message } from './Message';
import type { Message as MessageType, Reaction } from '@/lib/types';

interface ThreadPanelProps {
  messageId: number;
  onClose: () => void;
  onReplyCountChange?: (messageId: number, count: number, fromSelf?: boolean) => void;
  variant?: 'channel' | 'dm';
  readOnly?: boolean;
}

function normalizeToMessage(msg: any, isDM: boolean): MessageType {
  const user = msg.user ?? msg.fromUser;
  const reactionMap = new Map<string, Reaction>();
  for (const r of msg.reactions ?? []) {
    const userName = r.user?.name ?? '';
    const existing = reactionMap.get(r.emoji);
    if (existing) {
      existing.count++;
      existing.userIds.push(r.userId);
      existing.userNames.push(userName);
    } else {
      reactionMap.set(r.emoji, {
        emoji: r.emoji,
        count: 1,
        userIds: [r.userId],
        userNames: [userName],
      });
    }
  }
  return {
    id: msg.id,
    content: msg.content,
    userId: isDM ? msg.fromUserId : msg.userId,
    user: { id: user.id, name: user.name, avatar: user.avatar },
    channelId: msg.channelId ?? 0,
    createdAt: new Date(msg.createdAt),
    reactions: Array.from(reactionMap.values()),
    files: (msg.files ?? []).map((f: any) => ({
      id: f.id,
      filename: f.filename,
      originalName: f.originalName ?? f.filename,
      mimetype: f.mimetype,
      size: f.size,
      url: f.url,
    })),
    threadCount: 0,
    isEdited: !!msg.editedAt,
    isPinned: false,
  };
}

export function ThreadPanel({ messageId, onClose, onReplyCountChange, variant = 'channel', readOnly }: ThreadPanelProps) {
  const isDM = variant === 'dm';
  const testPrefix = isDM ? 'dm-thread' : 'thread';

  const [parentMessage, setParentMessage] = useState<MessageType | null>(null);
  const [replies, setReplies] = useState<MessageType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const repliesEndRef = useRef<HTMLDivElement>(null);

  const handleSendRef = useRef<() => void>(() => {});

  const editor = useQuillEditor({
    placeholder: 'Reply...',
    onSendRef: handleSendRef,
    onTextChange: () => setReplyError(null),
  });

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    const fetchFn = isDM ? getDMThread(messageId) : getThread(messageId);
    fetchFn
      .then((data) => {
        if (cancelled) return;
        setParentMessage(normalizeToMessage(data.parent, isDM));
        setReplies(data.replies.map((r: any) => normalizeToMessage(r, isDM)));
      })
      .catch(() => {
        if (!cancelled) setLoadError('Failed to load thread. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => { cancelled = true; };
  }, [messageId, isDM]);

  // Listen for real-time thread replies via WebSocket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    if (isDM) {
      const handleDMReply = (reply: ApiDirectMessage & { threadId: number }) => {
        if (reply.threadId !== messageId) return;
        const normalized = normalizeToMessage(reply, true);
        setReplies((prev) => {
          if (prev.some((r) => r.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      };
      socket.on('dm:reply', handleDMReply);
      return () => { socket.off('dm:reply', handleDMReply); };
    } else {
      const handleNewMessage = (msg: any) => {
        if (msg.threadId !== messageId) return;
        const normalized = normalizeToMessage(msg, false);
        setReplies((prev) => {
          if (prev.some((r) => r.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      };
      const handleDeletedMessage = (data: { messageId: number; threadId?: number | null }) => {
        if (data.threadId !== messageId) return;
        setReplies((prev) => prev.filter((r) => r.id !== data.messageId));
      };
      socket.on('message:new', handleNewMessage);
      socket.on('message:deleted', handleDeletedMessage);
      return () => {
        socket.off('message:new', handleNewMessage);
        socket.off('message:deleted', handleDeletedMessage);
      };
    }
  }, [messageId, isDM]);

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  // Notify parent of reply count changes
  const onReplyCountChangeRef = useRef(onReplyCountChange);
  onReplyCountChangeRef.current = onReplyCountChange;
  const hasLoadedReplies = useRef(false);
  const didSendReply = useRef(false);
  useEffect(() => {
    if (!hasLoadedReplies.current && replies.length === 0) return;
    hasLoadedReplies.current = true;
    onReplyCountChangeRef.current?.(messageId, replies.length, didSendReply.current);
    didSendReply.current = false;
  }, [replies.length, messageId]);

  // --- Callbacks for Message component ---

  const handleEditMessage = useCallback(async (msgId: number, content: string) => {
    if (isDM) {
      const updated = await editDM(msgId, content);
      const normalized = normalizeToMessage(updated, true);
      if (parentMessage && msgId === parentMessage.id) {
        setParentMessage(normalized);
      } else {
        setReplies((prev) => prev.map((r) => r.id === msgId ? normalized : r));
      }
    } else {
      const updated = await apiEditMessage(msgId, content);
      // Edit endpoint returns user + reactions but not files — preserve existing data
      const updateMsg = (existing: MessageType): MessageType => ({
        ...existing,
        content: updated.content,
        isEdited: !!updated.editedAt,
      });
      if (parentMessage && msgId === parentMessage.id) {
        setParentMessage((prev) => prev ? updateMsg(prev) : prev);
      } else {
        setReplies((prev) => prev.map((r) => r.id === msgId ? updateMsg(r) : r));
      }
    }
  }, [isDM, parentMessage]);

  const handleDeleteMessage = useCallback(async (msgId: number) => {
    if (isDM) {
      await deleteDM(msgId);
    } else {
      await apiDeleteMessage(msgId);
    }
    if (parentMessage && msgId === parentMessage.id) {
      onClose();
    } else {
      setReplies((prev) => prev.filter((r) => r.id !== msgId));
    }
  }, [isDM, parentMessage, onClose]);

  const handleAddReaction = useCallback((msgId: number, emoji: string) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    const addToMsg = (msg: MessageType): MessageType => {
      const existing = msg.reactions.find((r) => r.emoji === emoji);
      if (existing) {
        if (existing.userIds.includes(userId)) return msg;
        return {
          ...msg,
          reactions: msg.reactions.map((r) =>
            r.emoji === emoji
              ? { ...r, count: r.count + 1, userIds: [...r.userIds, userId], userNames: [...r.userNames, 'You'] }
              : r
          ),
        };
      }
      return {
        ...msg,
        reactions: [...msg.reactions, { emoji, count: 1, userIds: [userId], userNames: ['You'] }],
      };
    };

    if (parentMessage && msgId === parentMessage.id) {
      setParentMessage((prev) => prev ? addToMsg(prev) : prev);
    } else {
      setReplies((prev) => prev.map((r) => r.id === msgId ? addToMsg(r) : r));
    }

    (isDM ? addDMReaction(msgId, emoji) : apiAddReaction(msgId, emoji)).catch(() => {});
  }, [isDM, parentMessage]);

  const handleRemoveReaction = useCallback((msgId: number, emoji: string) => {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;

    const removeFromMsg = (msg: MessageType): MessageType => ({
      ...msg,
      reactions: msg.reactions
        .map((r) => {
          if (r.emoji !== emoji) return r;
          const idx = r.userIds.indexOf(userId);
          const newUserIds = r.userIds.filter((id) => id !== userId);
          const newUserNames = r.userNames.filter((_, i) => i !== idx);
          return { ...r, count: newUserIds.length, userIds: newUserIds, userNames: newUserNames };
        })
        .filter((r) => r.count > 0),
    });

    if (parentMessage && msgId === parentMessage.id) {
      setParentMessage((prev) => prev ? removeFromMsg(prev) : prev);
    } else {
      setReplies((prev) => prev.map((r) => r.id === msgId ? removeFromMsg(r) : r));
    }

    (isDM ? removeDMReaction(msgId, emoji) : apiRemoveReaction(msgId, emoji)).catch(() => {});
  }, [isDM, parentMessage]);

  // --- Send reply ---

  const handleSendReply = useCallback(async () => {
    const quill = editor.quillRef.current;
    if (!quill) return;
    const text = serializeDelta(quill);
    if (!text && editor.pendingFiles.length === 0) return;
    const content = text || ' ';

    setIsSending(true);
    setReplyError(null);
    didSendReply.current = true;
    try {
      let apiReply;
      const fileIds = editor.pendingFiles.map((f) => f.id);
      const fileIdsParam = fileIds.length > 0 ? fileIds : undefined;
      if (isDM) {
        apiReply = await replyToDM(messageId, content, fileIdsParam);
      } else {
        apiReply = await replyToMessage(messageId, content, fileIdsParam);
      }
      const reply = normalizeToMessage(apiReply, isDM);
      setReplies((prev) => {
        if (prev.some((r) => r.id === reply.id)) return prev;
        return [...prev, reply];
      });
      editor.clearEditor();
    } catch (err) {
      didSendReply.current = false;
      console.error('Failed to send reply:', err);
      setReplyError('Failed to send reply. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [messageId, editor, isDM]);

  handleSendRef.current = handleSendReply;

  const hasContent = editor.canSend || editor.pendingFiles.length > 0;

  return (
    <div
      data-testid={`${testPrefix}-panel`}
      className="flex w-full md:w-[380px] flex-col border-l border-slack-border bg-white absolute inset-0 md:static md:inset-auto z-30 md:z-auto"
    >
      <PanelHeader title="Thread" onClose={onClose} />

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto py-3">
        {isLoading ? (
          <div className="text-center text-sm text-slack-hint py-4">Loading thread...</div>
        ) : loadError ? (
          <div data-testid={`${testPrefix}-load-error`} className="text-center text-sm text-slack-error py-4">{loadError}</div>
        ) : (
          <>
            {parentMessage && (
              <div className="mb-2 pb-3 border-b border-slack-border">
                <Message
                  message={parentMessage}
                  showAvatar={true}
                  isCompact={false}
                  variant="thread"
                  readOnly={readOnly}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onAddReaction={handleAddReaction}
                  onRemoveReaction={handleRemoveReaction}
                />
                {replies.length > 0 && (
                  <div className="mt-2 px-5 text-[12px] text-slack-secondary">
                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                  </div>
                )}
              </div>
            )}

            {replies.map((reply) => (
              <Message
                key={reply.id}
                message={reply}
                showAvatar={true}
                isCompact={false}
                variant="thread"
                readOnly={readOnly}
                onEditMessage={handleEditMessage}
                onDeleteMessage={handleDeleteMessage}
                onAddReaction={handleAddReaction}
                onRemoveReaction={handleRemoveReaction}
              />
            ))}
            <div ref={repliesEndRef} />
          </>
        )}
      </div>

      {/* Reply input */}
      <div className="relative border-t border-slack-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {readOnly ? (
          <div className="flex items-center justify-center py-3 text-[13px] text-slack-secondary">
            Join the channel to reply in threads
          </div>
        ) : (<>
        {replyError && (
          <p data-testid={`${testPrefix}-reply-error`} className="mb-2 text-xs text-slack-error">{replyError}</p>
        )}
        {editor.uploadError && (
          <p className="mb-2 text-xs text-slack-error">{editor.uploadError}</p>
        )}
        <div data-testid={`${testPrefix}-reply-input`} className="slawk-editor rounded-[8px] border border-slack-border-light">
          <FormatToolbar onApplyFormat={editor.applyFormat} />
          <FilePreview files={editor.pendingFiles} onRemove={editor.removePendingFile} />

          {editor.isUploading && (
            <div className="px-3 py-1 text-xs text-slack-hint">Uploading...</div>
          )}

          <div ref={editor.editorRef} />

          {editor.showEmojiAutocomplete && editor.filteredEmojis.length > 0 && (
            <EmojiAutocomplete
              ref={editor.emojiAutocompleteRef}
              emojis={editor.filteredEmojis}
              selectedIndex={editor.emojiSelectedIndex}
              query={editor.emojiQuery}
              onSelect={editor.insertEmojiFromAutocomplete}
            />
          )}

          {editor.showMentionDropdown && (
            <MentionDropdown
              ref={editor.mentionDropdownRef}
              users={editor.mentionUsers}
              selectedIndex={editor.mentionSelectedIndex}
              onSelect={editor.insertMention}
            />
          )}

          {editor.showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 z-50">
              <EmojiPicker
                onEmojiSelect={editor.handleEmojiSelect}
                onClickOutside={() => editor.setShowEmojiPicker(false)}
              />
            </div>
          )}

          <input
            ref={editor.fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,audio/*,video/*,.pdf,.txt,.json,.zip"
            onChange={editor.handleFileSelect}
          />

          <EditorToolbar
            testIdPrefix={`${testPrefix}-`}
            onAttach={() => editor.fileInputRef.current?.click()}
            onEmojiToggle={() => editor.setShowEmojiPicker(!editor.showEmojiPicker)}
            onMention={editor.handleMentionButtonClick}
            isRecording={editor.isRecording}
            recordingDuration={editor.recordingDuration}
            onStartRecording={editor.startRecording}
            onStopRecording={editor.stopRecording}
            onCancelRecording={editor.cancelRecording}
          >
            <button
              data-testid={`${testPrefix}-send-button`}
              onClick={() => handleSendRef.current()}
              disabled={!hasContent || isSending}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded transition-colors',
                hasContent
                  ? 'bg-slack-btn text-white hover:bg-slack-btn-hover'
                  : 'text-slack-disabled',
              )}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </EditorToolbar>
        </div>

        {editor.showLinkModal && (
          <LinkModal
            linkUrl={editor.linkUrl}
            linkText={editor.linkText}
            onLinkUrlChange={editor.setLinkUrl}
            onLinkTextChange={editor.setLinkText}
            onSave={editor.handleLinkSave}
            onClose={() => editor.setShowLinkModal(false)}
          />
        )}
        </>)}
      </div>
    </div>
  );
}
