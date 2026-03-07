import { Plus, AtSign, Smile, Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EditorToolbarProps {
  testIdPrefix: string;
  onAttach: () => void;
  onEmojiToggle: () => void;
  onMention: () => void;
  isRecording: boolean;
  recordingDuration: number;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancelRecording: () => void;
  children?: React.ReactNode;
}

export function EditorToolbar({
  testIdPrefix,
  onAttach,
  onEmojiToggle,
  onMention,
  isRecording,
  recordingDuration,
  onStartRecording,
  onStopRecording,
  onCancelRecording,
  children,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center justify-between px-[6px] py-1">
      <div className="flex items-center">
        <Button
          data-testid={`${testIdPrefix}attach-file-button`}
          variant="toolbar"
          size="icon-sm"
          onClick={onAttach}
          title="Attach file"
        >
          <Plus className="h-[18px] w-[18px]" />
        </Button>
        <Button
          variant="toolbar"
          size="icon-sm"
          onClick={onEmojiToggle}
          title="Emoji"
        >
          <Smile className="h-[18px] w-[18px]" />
        </Button>
        <Button
          data-testid={`${testIdPrefix}mention-button`}
          variant="toolbar"
          size="icon-sm"
          onClick={onMention}
          title="Mention someone"
        >
          <AtSign className="h-[18px] w-[18px]" />
        </Button>
        {isRecording ? (
          <div className="flex items-center gap-1.5 ml-1">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[12px] text-red-600 font-medium tabular-nums">
              {Math.floor(recordingDuration / 60)}:{String(recordingDuration % 60).padStart(2, '0')}
            </span>
            <Button
              data-testid={`${testIdPrefix}mic-stop-button`}
              variant="toolbar"
              size="icon-sm"
              onClick={onStopRecording}
              title="Stop recording"
            >
              <Square className="h-3.5 w-3.5 fill-red-500 text-red-500" />
            </Button>
            <button
              onClick={onCancelRecording}
              className="text-[11px] text-slack-secondary hover:text-slack-primary"
            >
              Cancel
            </button>
          </div>
        ) : (
          <Button
            data-testid={`${testIdPrefix}mic-button`}
            variant="toolbar"
            size="icon-sm"
            onClick={onStartRecording}
            title="Record voice clip"
          >
            <Mic className="h-[18px] w-[18px]" />
          </Button>
        )}
      </div>

      {children}
    </div>
  );
}
