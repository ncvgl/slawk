import { useState, useEffect, useRef, useCallback } from 'react';
import { X, SendHorizontal, Plus, Smile, AtSign, Mic } from 'lucide-react';
import { format } from 'date-fns';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { Avatar } from '@/components/ui/avatar';
import { getThread, replyToMessage, uploadFile, getUsers, type ApiMessage, type ApiFile, type AuthUser } from '@/lib/api';
import { cn } from '@/lib/utils';
import { serializeDelta } from '@/lib/serializeDelta';
import { renderMessageContent } from '@/lib/renderMessageContent';
import { Button } from '@/components/ui/button';
import { FormatToolbar } from './FormatToolbar';
import { FilePreview } from './FilePreview';
import { MentionDropdown } from './MentionDropdown';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { LinkModal } from './LinkModal';

interface ThreadPanelProps {
  messageId: number;
  onClose: () => void;
  onReplyCountChange?: (messageId: number, count: number) => void;
}

interface ThreadMessage {
  id: number;
  content: string;
  userId: number;
  user: { id: number; name: string; email: string; avatar?: string | null };
  createdAt: Date;
}

export function ThreadPanel({ messageId, onClose, onReplyCountChange }: ThreadPanelProps) {
  const [parentMessage, setParentMessage] = useState<ThreadMessage | null>(null);
  const [replies, setReplies] = useState<ThreadMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [canSend, setCanSend] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<ApiFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<AuthUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const linkSavedRangeRef = useRef<{ index: number; length: number } | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const repliesEndRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transformMessage = (msg: ApiMessage): ThreadMessage => ({
    id: msg.id,
    content: msg.content,
    userId: msg.userId,
    user: msg.user,
    createdAt: new Date(msg.createdAt),
  });

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setLoadError(null);

    getThread(messageId)
      .then((data) => {
        if (cancelled) return;
        setParentMessage(transformMessage(data.parent));
        setReplies(data.replies.map(transformMessage));
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
  }, [messageId]);

  useEffect(() => {
    repliesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [replies]);

  const handleSendReply = useCallback(async () => {
    const quill = quillRef.current;
    if (!quill) return;
    const text = serializeDelta(quill);
    if (!text && pendingFiles.length === 0) return;
    const content = text || ' ';

    setIsSending(true);
    setReplyError(null);
    try {
      const apiReply = await replyToMessage(messageId, content);
      const reply = transformMessage(apiReply);
      setReplies((prev) => [...prev, reply]);
      quill.setText('');
      setPendingFiles([]);
      setCanSend(false);
      onReplyCountChange?.(messageId, replies.length + 1);
    } catch (err) {
      console.error('Failed to send reply:', err);
      setReplyError('Failed to send reply. Please try again.');
    } finally {
      setIsSending(false);
    }
  }, [messageId, onReplyCountChange, replies.length, pendingFiles]);

  const handleSendRef = useRef(handleSendReply);
  handleSendRef.current = handleSendReply;
  const mentionActiveRef = useRef(false);
  mentionActiveRef.current = showMentionDropdown;
  const mentionUsersRef = useRef(mentionUsers);
  mentionUsersRef.current = mentionUsers;
  const mentionSelectedIndexRef = useRef(mentionSelectedIndex);
  mentionSelectedIndexRef.current = mentionSelectedIndex;
  const insertMentionRef = useRef<(user: AuthUser) => void>(() => {});

  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: false,
        keyboard: {
          bindings: {
            enter: {
              key: 'Enter',
              handler: () => {
                if (mentionActiveRef.current) {
                  const users = mentionUsersRef.current;
                  const idx = mentionSelectedIndexRef.current;
                  if (users.length > 0 && idx < users.length) {
                    insertMentionRef.current(users[idx]);
                  }
                  return false;
                }
                handleSendRef.current();
                return false;
              },
            },
            escape: {
              key: 'Escape',
              handler: () => {
                if (mentionActiveRef.current) {
                  setShowMentionDropdown(false);
                  return false;
                }
                return true;
              },
            },
            arrowUp: {
              key: 'ArrowUp',
              handler: () => {
                if (mentionActiveRef.current) {
                  setMentionSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : mentionUsersRef.current.length - 1
                  );
                  return false;
                }
                return true;
              },
            },
            arrowDown: {
              key: 'ArrowDown',
              handler: () => {
                if (mentionActiveRef.current) {
                  setMentionSelectedIndex((prev) =>
                    prev < mentionUsersRef.current.length - 1 ? prev + 1 : 0
                  );
                  return false;
                }
                return true;
              },
            },
          },
        },
      },
      placeholder: 'Reply...',
    });

    quill.on('text-change', () => {
      setCanSend(quill.getText().trim().length > 0);
      setReplyError(null);
      const selection = quill.getSelection();
      if (!selection) return;
      const cursorPos = selection.index;
      const fullText = quill.getText(0, cursorPos);
      const atIndex = fullText.lastIndexOf('@');
      if (atIndex >= 0) {
        const beforeAt = atIndex > 0 ? fullText[atIndex - 1] : ' ';
        const query = fullText.slice(atIndex + 1);
        if ((atIndex === 0 || /\s/.test(beforeAt)) && !/\s/.test(query)) {
          setMentionStartIndex(atIndex);
          setMentionQuery(query);
          setShowMentionDropdown(true);
          setMentionSelectedIndex(0);
          return;
        }
      }
      setShowMentionDropdown(false);
    });

    quillRef.current = quill;
  }, []);

  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true);
    quill.insertText(range.index, emoji.native);
    quill.setSelection(range.index + emoji.native.length);
    setShowEmojiPicker(false);
    quill.focus();
  }, []);

  useEffect(() => {
    if (!showMentionDropdown) {
      setMentionUsers([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const users = await getUsers(mentionQuery || undefined);
        if (!cancelled) setMentionUsers(users);
      } catch {
        // ignore
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showMentionDropdown, mentionQuery]);

  const insertMention = useCallback(
    (user: AuthUser) => {
      const quill = quillRef.current;
      if (!quill || mentionStartIndex === null) return;
      const mentionText = `@${user.name}`;
      const deleteLength = mentionQuery.length + 1;
      quill.deleteText(mentionStartIndex, deleteLength);
      quill.insertText(mentionStartIndex, mentionText + ' ');
      quill.setSelection(mentionStartIndex + mentionText.length + 1);
      setShowMentionDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(null);
      quill.focus();
    },
    [mentionStartIndex, mentionQuery],
  );
  insertMentionRef.current = insertMention;

  const handleMentionButtonClick = () => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true);
    quill.insertText(range.index, '@');
    quill.setSelection(range.index + 1);
    quill.focus();
  };

  const handleLinkSave = useCallback(() => {
    const quill = quillRef.current;
    const range = linkSavedRangeRef.current;
    if (!quill || !linkUrl.trim()) {
      setShowLinkModal(false);
      return;
    }
    const url = linkUrl.trim().startsWith('http') ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    if (range && range.length > 0) {
      quill.formatText(range.index, range.length, 'link', url);
    } else {
      const insertText = linkText.trim() || url;
      const insertAt = range ? range.index : quill.getLength() - 1;
      quill.insertText(insertAt, insertText, 'link', url);
      quill.setSelection(insertAt + insertText.length);
    }
    setShowLinkModal(false);
    setLinkUrl('');
    setLinkText('');
    linkSavedRangeRef.current = null;
    quill.focus();
  }, [linkUrl, linkText]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file);
        setPendingFiles((prev) => [...prev, uploaded]);
      }
    } catch {
      setUploadError('Failed to upload file. Please try again.');
      setTimeout(() => setUploadError(null), 4000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const removePendingFile = (fileId: number) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const applyFormat = (format: string, value?: string) => {
    const quill = quillRef.current;
    if (!quill) return;

    if (format === 'link') {
      const range = quill.getSelection();
      if (range) {
        const currentFormat = quill.getFormat(range);
        if (currentFormat.link) {
          quill.format('link', false);
        } else {
          linkSavedRangeRef.current = { index: range.index, length: range.length };
          const selectedText = range.length > 0 ? quill.getText(range.index, range.length) : '';
          setLinkText(selectedText);
          setLinkUrl('');
          setShowLinkModal(true);
        }
      }
      return;
    }

    if (value) {
      const range = quill.getSelection();
      if (range) {
        const currentFormat = quill.getFormat(range);
        quill.format(format, currentFormat[format] === value ? false : value);
      }
    } else {
      const range = quill.getSelection();
      if (range) {
        const currentFormat = quill.getFormat(range);
        quill.format(format, !currentFormat[format]);
      }
    }
    quill.focus();
  };

  const hasContent = canSend || pendingFiles.length > 0;

  return (
    <div
      data-testid="thread-panel"
      className="flex w-[380px] flex-col border-l border-slack-border bg-white"
    >
      {/* Header */}
      <div className="flex h-[49px] items-center justify-between border-b border-slack-border px-4">
        <h3 className="text-[15px] font-bold text-slack-primary">Thread</h3>
        <Button variant="toolbar" size="icon-sm" onClick={onClose}>
          <X className="h-4 w-4 text-slack-secondary" />
        </Button>
      </div>

      {/* Thread messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {isLoading ? (
          <div className="text-center text-sm text-slack-hint py-4">Loading thread...</div>
        ) : loadError ? (
          <div data-testid="thread-load-error" className="text-center text-sm text-slack-error py-4">{loadError}</div>
        ) : (
          <>
            {/* Parent message */}
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
                    <p className="text-[15px] text-slack-primary leading-[22px] whitespace-pre-wrap break-words">
                      {renderMessageContent(parentMessage.content)}
                    </p>
                  </div>
                </div>
                {replies.length > 0 && (
                  <div className="mt-2 text-[12px] text-slack-secondary">
                    {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
                  </div>
                )}
              </div>
            )}

            {/* Replies */}
            {replies.map((reply) => (
              <div key={reply.id} className="mb-3">
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
                    </div>
                    <p className="text-[14px] text-slack-primary leading-[20px] whitespace-pre-wrap break-words">
                      {renderMessageContent(reply.content)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            <div ref={repliesEndRef} />
          </>
        )}
      </div>

      {/* Reply input */}
      <div className="relative border-t border-slack-border px-4 py-3">
        {replyError && (
          <p data-testid="thread-reply-error" className="mb-2 text-xs text-slack-error">{replyError}</p>
        )}
        {uploadError && (
          <p className="mb-2 text-xs text-slack-error">{uploadError}</p>
        )}
        <div data-testid="thread-reply-input" className="slawk-editor rounded-[8px] border border-slack-border-light">
          {/* Formatting Toolbar */}
          <FormatToolbar onApplyFormat={applyFormat} />

          {/* File preview area */}
          <FilePreview files={pendingFiles} onRemove={removePendingFile} />

          {/* Upload progress indicator */}
          {isUploading && (
            <div className="px-3 py-1 text-xs text-slack-hint">Uploading...</div>
          )}

          {/* Quill Editor */}
          <div ref={editorRef} />

          {/* Mention Dropdown */}
          {showMentionDropdown && (
            <MentionDropdown
              ref={mentionDropdownRef}
              users={mentionUsers}
              selectedIndex={mentionSelectedIndex}
              onSelect={insertMention}
            />
          )}

          {/* Emoji Picker */}
          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 z-50">
              <EmojiPicker
                onEmojiSelect={handleEmojiSelect}
                onClickOutside={() => setShowEmojiPicker(false)}
              />
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept="image/*,.pdf,.txt,.json,.zip"
            onChange={handleFileSelect}
          />

          {/* Bottom Toolbar */}
          <div className="flex items-center justify-between px-[6px] py-1">
            <div className="flex items-center">
              <Button
                data-testid="thread-attach-file-button"
                variant="toolbar"
                size="icon-sm"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file"
              >
                <Plus className="h-[18px] w-[18px]" />
              </Button>
              <Button
                variant="toolbar"
                size="icon-sm"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Emoji"
              >
                <Smile className="h-[18px] w-[18px]" />
              </Button>
              <Button
                data-testid="thread-mention-button"
                variant="toolbar"
                size="icon-sm"
                onClick={handleMentionButtonClick}
                title="Mention someone"
              >
                <AtSign className="h-[18px] w-[18px]" />
              </Button>
              <Button
                data-testid="thread-mic-button"
                variant="toolbar"
                size="icon-sm"
                title="Record voice clip"
              >
                <Mic className="h-[18px] w-[18px]" />
              </Button>
            </div>

            <button
              data-testid="thread-send-button"
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
          </div>
        </div>

        {/* Link Modal */}
        {showLinkModal && (
          <LinkModal
            linkUrl={linkUrl}
            linkText={linkText}
            onLinkUrlChange={setLinkUrl}
            onLinkTextChange={setLinkText}
            onSave={handleLinkSave}
            onClose={() => setShowLinkModal(false)}
          />
        )}
      </div>
    </div>
  );
}
