import { useState, useEffect, useRef, useCallback } from 'react';
import { SendHorizontal, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { Avatar } from '@/components/ui/avatar';
import { getThread, replyToMessage, getDMThread, replyToDM, getAuthFileUrl, deleteMessage, type ApiDirectMessage } from '@/lib/api';
import { useAuthStore } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';
import { getSocket } from '@/lib/socket';
import { serializeDelta } from '@/lib/serializeDelta';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { FormatToolbar } from './FormatToolbar';
import { FilePreview } from './FilePreview';
import { MentionDropdown } from './MentionDropdown';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { LinkModal } from './LinkModal';
import { PanelHeader } from './PanelHeader';
import { EditorToolbar } from './EditorToolbar';
import { useQuillEditor } from '@/hooks/useQuillEditor';

interface ThreadPanelProps {
  messageId: number;
  onClose: () => void;
  onReplyCountChange?: (messageId: number, count: number) => void;
  variant?: 'channel' | 'dm';
  readOnly?: boolean;
}

interface ThreadMessage {
  id: number;
  content: string;
  user: { id: number; name: string; avatar?: string | null };
  createdAt: Date;
  files?: { id: number; filename: string; originalName: string; mimetype: string; size: number; url: string }[];
}

export function ThreadPanel({ messageId, onClose, onReplyCountChange, variant = 'channel', readOnly }: ThreadPanelProps) {
  const isDM = variant === 'dm';
  const testPrefix = isDM ? 'dm-thread' : 'thread';

  const [parentMessage, setParentMessage] = useState<ThreadMessage | null>(null);
  const [replies, setReplies] = useState<ThreadMessage[]>([]);
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

  function normalizeMessage(msg: any): ThreadMessage {
    return {
      id: msg.id,
      content: msg.content,
      user: msg.user ?? msg.fromUser,
      createdAt: new Date(msg.createdAt),
      files: msg.files,
    };
  }

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    const fetchFn = isDM ? getDMThread(messageId) : getThread(messageId);
    fetchFn
      .then((data) => {
        if (cancelled) return;
        setParentMessage(normalizeMessage(data.parent));
        setReplies(data.replies.map(normalizeMessage));
      })
      .catch(() => {
        if (!cancelled) setLoadError('Failed to load thread. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [messageId, isDM]);

  // Listen for real-time thread replies via WebSocket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    if (isDM) {
      const handleDMReply = (reply: ApiDirectMessage & { threadId: number }) => {
        if (reply.threadId !== messageId) return;
        const normalized = normalizeMessage(reply);
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
        const normalized = normalizeMessage(msg);
        setReplies((prev) => {
          if (prev.some((r) => r.id === normalized.id)) return prev;
          return [...prev, normalized];
        });
      };
      socket.on('message:new', handleNewMessage);
      return () => { socket.off('message:new', handleNewMessage); };
    }
  }, [messageId, isDM]);

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  const handleSendReply = useCallback(async () => {
    const quill = editor.quillRef.current;
    if (!quill) return;
    const text = serializeDelta(quill);
    if (!text && editor.pendingFiles.length === 0) return;
    const content = text || ' ';

    setIsSending(true);
    setReplyError(null);
    try {
      let apiReply;
      if (isDM) {
        apiReply = await replyToDM(messageId, content);
      } else {
        const fileIds = editor.pendingFiles.map((f) => f.id);
        apiReply = await replyToMessage(messageId, content, fileIds.length > 0 ? fileIds : undefined);
      }
      const reply = normalizeMessage(apiReply);
      let newCount = 0;
      setReplies((prev) => {
        const next = [...prev, reply];
        newCount = next.length;
        return next;
      });
      editor.clearEditor();
      onReplyCountChange?.(messageId, newCount);
    } catch (err) {
      console.error('Failed to send reply:', err);
      setReplyError('Failed to send reply. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [messageId, onReplyCountChange, editor, isDM]);

  handleSendRef.current = handleSendReply;

  const hasContent = editor.canSend || editor.pendingFiles.length > 0;

  const renderFiles = (files?: ThreadMessage['files']) => {
    if (!files || files.length === 0) return null;
    return (
      <div className="mt-1 flex flex-wrap gap-2">
        {files.map((file) => (
          <div key={file.id} className="rounded-lg border border-slack-border overflow-hidden">
            {file.mimetype.startsWith('image/') ? (
              <img
                src={getAuthFileUrl(file.url)}
                alt={file.originalName}
                className="max-w-[200px] max-h-[150px] object-cover"
              />
            ) : (
              <a
                href={getAuthFileUrl(file.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 text-[13px] text-slack-link hover:underline"
              >
                {file.originalName}
              </a>
            )}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div
      data-testid={`${testPrefix}-panel`}
      className="flex w-full md:w-[380px] flex-col border-l border-slack-border bg-white absolute inset-0 md:static md:inset-auto z-30 md:z-auto"
    >
      <PanelHeader title="Thread" onClose={onClose} />

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="text-center text-sm text-slack-hint py-4">Loading thread...</div>
        ) : loadError ? (
          <div data-testid={`${testPrefix}-load-error`} className="text-center text-sm text-slack-error py-4">{loadError}</div>
        ) : (
          <>
            {parentMessage && (
              <div className="mb-4 pb-3 border-b border-slack-border">
                <div className="flex items-start gap-2">
                  <Avatar
                    src={parentMessage.user.avatar ?? undefined}
                    alt={parentMessage.user.name}
                    fallback={parentMessage.user.name}
                    size="md"
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-bold text-slack-primary">
                        {parentMessage.user.name}
                      </span>
                      <span className="text-[12px] text-slack-secondary">
                        {format(parentMessage.createdAt, 'h:mm a')}
                      </span>
                    </div>
                    <div className="text-[15px] text-slack-primary leading-[22px] whitespace-pre-wrap break-words">
                      {renderMessageContent(parentMessage.content)}
                    </div>
                    {renderFiles(parentMessage.files)}
                  </div>
                </div>
                {replies.length > 0 && (
                  <div className="mt-2 text-[12px] text-slack-secondary">
                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                  </div>
                )}
              </div>
            )}

            {replies.map((reply) => {
              const currentUser = useAuthStore.getState().user;
              const isOwn = currentUser?.id === reply.user.id;
              return (
              <div key={reply.id} className="group mb-3">
                <div className="flex items-start gap-2">
                  <Avatar
                    src={reply.user.avatar ?? undefined}
                    alt={reply.user.name}
                    fallback={reply.user.name}
                    size="sm"
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[14px] font-bold text-slack-primary">
                        {reply.user.name}
                      </span>
                      <span className="text-[11px] text-slack-secondary">
                        {format(reply.createdAt, 'h:mm a')}
                      </span>
                      {isOwn && !readOnly && (
                        <button
                          onClick={async () => {
                            try {
                              await deleteMessage(reply.id);
                              setReplies((prev) => prev.filter((r) => r.id !== reply.id));
                              onReplyCountChange?.(messageId, replies.length - 1);
                            } catch { /* ignore */ }
                          }}
                          className="ml-auto opacity-0 group-hover:opacity-100 text-slack-secondary hover:text-slack-error transition-opacity"
                          title="Delete reply"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="text-[14px] text-slack-primary leading-[20px] whitespace-pre-wrap break-words">
                      {renderMessageContent(reply.content)}
                    </div>
                    {renderFiles(reply.files)}
                  </div>
                </div>
              </div>
            );
            })}
            <div ref={repliesEndRef} />
          </>
        )}
      </div>

      {/* Reply input */}
      <div className="relative border-t border-slack-border px-4 py-3">
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
