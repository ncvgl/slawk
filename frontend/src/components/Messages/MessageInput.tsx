import { useRef, useEffect, useCallback, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import {
  Bold,
  Italic,
  Strikethrough,
  Link,
  ListOrdered,
  List,
  Code,
  Quote,
  Plus,
  AtSign,
  Smile,
  Video,
  Mic,
  SendHorizontal,
  X,
  FileIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMessageStore } from '@/stores/useMessageStore';
import { EmojiPicker } from '@/components/ui/emoji-picker';
import { uploadFile, getUsers, type ApiFile, type AuthUser } from '@/lib/api';

interface MessageInputProps {
  channelId: number;
  channelName: string;
}

const formatButtons = [
  { icon: Bold, label: 'Bold', format: 'bold' },
  { icon: Italic, label: 'Italic', format: 'italic' },
  { icon: Strikethrough, label: 'Strikethrough', format: 'strike' },
  { icon: Link, label: 'Link', format: 'link' },
  { icon: ListOrdered, label: 'Ordered List', format: 'list', value: 'ordered' },
  { icon: List, label: 'Bullet List', format: 'list', value: 'bullet' },
  { icon: Code, label: 'Code', format: 'code-block' },
  { icon: Quote, label: 'Quote', format: 'blockquote' },
];

export function MessageInput({ channelId, channelName }: MessageInputProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [canSend, setCanSend] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<ApiFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionUsers, setMentionUsers] = useState<AuthUser[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionStartIndex, setMentionStartIndex] = useState<number | null>(null);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const { sendMessage } = useMessageStore();

  const handleSend = useCallback(async () => {
    const quill = quillRef.current;
    if (!quill) return;
    const text = quill.getText().trim();
    if (!text && pendingFiles.length === 0) return;
    const content = text || ' ';
    const fileIds = pendingFiles.map((f) => f.id);
    quill.setText('');
    setPendingFiles([]);
    setCanSend(false);
    await sendMessage(channelId, content, fileIds.length > 0 ? fileIds : undefined);
  }, [channelId, sendMessage, pendingFiles]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;
  const mentionActiveRef = useRef(false);
  mentionActiveRef.current = showMentionDropdown;

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
                // Don't send if mention dropdown is open
                if (mentionActiveRef.current) return true;
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
          },
        },
      },
      placeholder: `Message #${channelName}`,
    });

    quill.on('text-change', () => {
      setCanSend(quill.getText().trim().length > 0);
      // Detect @mention trigger
      const selection = quill.getSelection();
      if (!selection) return;
      const cursorPos = selection.index;
      const text = quill.getText(0, cursorPos);
      const atIndex = text.lastIndexOf('@');
      if (atIndex >= 0) {
        const beforeAt = atIndex > 0 ? text[atIndex - 1] : ' ';
        const query = text.slice(atIndex + 1);
        // Only trigger if @ is at start or preceded by whitespace, and query has no spaces
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

    quill.root.addEventListener('focus', () => setIsFocused(true));
    quill.root.addEventListener('blur', () => setIsFocused(false));

    quillRef.current = quill;
  }, [channelName]);

  useEffect(() => {
    if (quillRef.current) {
      quillRef.current.root.dataset.placeholder = `Message #${channelName}`;
    }
  }, [channelName]);

  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true);
    quill.insertText(range.index, emoji.native);
    quill.setSelection(range.index + emoji.native.length);
    setShowEmojiPicker(false);
    quill.focus();
  }, []);

  // Fetch users for mention autocomplete
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
    return () => { cancelled = true; clearTimeout(timer); };
  }, [showMentionDropdown, mentionQuery]);

  const insertMention = useCallback((user: AuthUser) => {
    const quill = quillRef.current;
    if (!quill || mentionStartIndex === null) return;
    const mentionText = `@${user.name}`;
    // Delete the @query text and insert mention
    const deleteLength = mentionQuery.length + 1; // +1 for @
    quill.deleteText(mentionStartIndex, deleteLength);
    quill.insertText(mentionStartIndex, mentionText + ' ');
    quill.setSelection(mentionStartIndex + mentionText.length + 1);
    setShowMentionDropdown(false);
    setMentionQuery('');
    setMentionStartIndex(null);
    quill.focus();
  }, [mentionStartIndex, mentionQuery]);

  const handleMentionButtonClick = () => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true);
    quill.insertText(range.index, '@');
    quill.setSelection(range.index + 1);
    quill.focus();
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file);
        setPendingFiles((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      console.error('Failed to upload file:', err);
    } finally {
      setIsUploading(false);
      // Reset file input
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
      if (range && range.length > 0) {
        const currentFormat = quill.getFormat(range);
        if (currentFormat.link) {
          quill.format('link', false);
        } else {
          const url = prompt('Enter URL:');
          if (url) quill.format('link', url);
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
    <div className="relative px-5 pb-6 pt-4 bg-white">
      <div
        className={cn(
          'slawk-editor rounded-[8px] border transition-all',
          isFocused ? 'border-[#1264A3] border-2' : 'border-[rgba(29,28,29,0.13)]'
        )}
      >
        {/* Formatting Toolbar */}
        <div className="flex items-center gap-0.5 bg-[#F8F8F8] rounded-t-[8px] px-1 py-1">
          {formatButtons.map((button) => (
            <button
              key={button.label}
              onClick={() => applyFormat(button.format, button.value)}
              className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#e8e8e8] hover:text-[#1D1C1D]"
              title={button.label}
            >
              <button.icon className="h-[18px] w-[18px]" />
            </button>
          ))}
        </div>

        {/* File preview area */}
        {pendingFiles.length > 0 && (
          <div data-testid="file-preview" className="flex flex-wrap gap-2 px-3 py-2 border-b border-[rgba(29,28,29,0.13)]">
            {pendingFiles.map((file) => (
              <div
                key={file.id}
                className="relative flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm"
              >
                {file.mimetype.startsWith('image/') ? (
                  <img
                    src={file.url}
                    alt={file.originalName}
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : (
                  <FileIcon className="h-5 w-5 text-gray-500" />
                )}
                <span className="max-w-[120px] truncate text-[13px] text-[#1D1C1D]">
                  {file.originalName}
                </span>
                <button
                  onClick={() => removePendingFile(file.id)}
                  className="ml-1 flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 hover:bg-gray-300"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Upload progress indicator */}
        {isUploading && (
          <div className="px-3 py-1 text-xs text-gray-500">Uploading...</div>
        )}

        {/* Quill Editor */}
        <div ref={editorRef} />

        {/* Mention Dropdown */}
        {showMentionDropdown && mentionUsers.length > 0 && (
          <div
            data-testid="mention-dropdown"
            ref={mentionDropdownRef}
            className="absolute bottom-full left-0 mb-1 w-[280px] max-h-[200px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg z-50"
          >
            {mentionUsers.map((user, index) => (
              <button
                key={user.id}
                onClick={() => insertMention(user)}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#1264A3] hover:text-white',
                  index === mentionSelectedIndex ? 'bg-[#1264A3] text-white' : 'text-[#1D1C1D]'
                )}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded bg-[#611f69] text-white text-xs font-medium flex-shrink-0">
                  {user.name.charAt(0).toUpperCase()}
                </div>
                <span className="truncate font-medium">{user.name}</span>
              </button>
            ))}
          </div>
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
            <button
              data-testid="attach-file-button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]"
              title="Attach file"
            >
              <Plus className="h-[18px] w-[18px]" />
            </button>
            <button
              ref={emojiButtonRef}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]"
            >
              <Smile className="h-[18px] w-[18px]" />
            </button>
            <button
              data-testid="mention-button"
              onClick={handleMentionButtonClick}
              className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]"
            >
              <AtSign className="h-[18px] w-[18px]" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]">
              <Video className="h-[18px] w-[18px]" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]">
              <Mic className="h-[18px] w-[18px]" />
            </button>
          </div>

          <button
            onClick={handleSend}
            disabled={!hasContent}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-colors',
              hasContent
                ? 'bg-[#007a5a] text-white hover:bg-[#005e46]'
                : 'text-gray-400'
            )}
          >
            <SendHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      <p className="mt-1 text-xs text-gray-500">
        <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium">
          Enter
        </kbd>{' '}
        to send,{' '}
        <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium">
          Shift + Enter
        </kbd>{' '}
        for new line
      </p>
    </div>
  );
}
