import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
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

interface MessageInputProps {
  channelId: number;
  channelName: string;
}

const formatButtons = [
  { icon: Bold, label: 'Bold' },
  { icon: Italic, label: 'Italic' },
  { icon: Strikethrough, label: 'Strikethrough' },
  { icon: Link, label: 'Link' },
  { icon: ListOrdered, label: 'Ordered List' },
  { icon: List, label: 'Bullet List' },
  { icon: Code, label: 'Code' },
  { icon: Quote, label: 'Quote' },
];

export function MessageInput({ channelId, channelName }: MessageInputProps) {
  const [message, setMessage] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { sendMessage } = useMessageStore();

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [message]);

  const handleSend = () => {
    const trimmedMessage = message.trim();
    if (!trimmedMessage) return;

    sendMessage(channelId, trimmedMessage);
    setMessage('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const canSend = message.trim().length > 0;

  return (
    <div className="border-t border-gray-200 px-4 py-3">
      <div
        className={cn(
          'rounded-lg border transition-colors',
          isFocused ? 'border-[#1264a3]' : 'border-gray-300'
        )}
      >
        {/* Formatting Toolbar */}
        <div className="flex items-center gap-0.5 border-b border-gray-200 px-2 py-1">
          {formatButtons.map((button) => (
            <button
              key={button.label}
              className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              title={button.label}
            >
              <button.icon className="h-4 w-4" />
            </button>
          ))}
        </div>

        {/* Input Area */}
        <div className="px-3 py-2">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={`Message #${channelName}`}
            className="w-full resize-none bg-transparent text-[15px] placeholder:text-gray-500 focus:outline-none"
            rows={1}
          />
        </div>

        {/* Bottom Toolbar */}
        <div className="flex items-center justify-between border-t border-gray-200 px-2 py-1">
          <div className="flex items-center gap-0.5">
            <button className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700">
              <Plus className="h-4 w-4" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700">
              <Smile className="h-4 w-4" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700">
              <AtSign className="h-4 w-4" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700">
              <Video className="h-4 w-4" />
            </button>
            <button className="flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700">
              <Mic className="h-4 w-4" />
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
