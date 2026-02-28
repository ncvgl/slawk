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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useMessageStore } from '@/stores/useMessageStore';
import { EmojiPicker } from '@/components/ui/emoji-picker';

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
  const [canSend, setCanSend] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const { sendMessage } = useMessageStore();

  const handleSend = useCallback(async () => {
    const quill = quillRef.current;
    if (!quill) return;
    const text = quill.getText().trim();
    if (!text) return;
    quill.setText('');
    setCanSend(false);
    await sendMessage(channelId, text);
  }, [channelId, sendMessage]);

  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

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
                handleSendRef.current();
                return false;
              },
            },
          },
        },
      },
      placeholder: `Message #${channelName}`,
    });

    quill.on('text-change', () => {
      setCanSend(quill.getText().trim().length > 0);
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

        {/* Quill Editor */}
        <div ref={editorRef} />

        {/* Emoji Picker */}
        {showEmojiPicker && (
          <div className="absolute bottom-full left-0 mb-2 z-50">
            <EmojiPicker
              onEmojiSelect={handleEmojiSelect}
              onClickOutside={() => setShowEmojiPicker(false)}
            />
          </div>
        )}

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between px-[6px] py-1">
          <div className="flex items-center">
            <button className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]">
              <Plus className="h-[18px] w-[18px]" />
            </button>
            <button
              ref={emojiButtonRef}
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]"
            >
              <Smile className="h-[18px] w-[18px]" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-[#616061] hover:bg-[#F8F8F8] hover:text-[#1D1C1D]">
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
            disabled={!canSend}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded transition-colors',
              canSend
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
