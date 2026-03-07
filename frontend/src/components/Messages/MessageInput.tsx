import { useRef, useEffect, useCallback, useState } from 'react';
import {
  SendHorizontal,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PortalEmojiPicker } from '@/components/ui/emoji-picker';
import { scheduleMessage } from '@/lib/api';
import { serializeDelta } from '@/lib/serializeDelta';
import { LinkModal } from './LinkModal';
import { ScheduleModal } from './ScheduleModal';
import { ScheduleMenu } from './ScheduleMenu';
import { FormatToolbar } from './FormatToolbar';
import { FilePreview } from './FilePreview';
import { MentionDropdown } from './MentionDropdown';
import { EditorToolbar } from './EditorToolbar';
import { useQuillEditor } from '@/hooks/useQuillEditor';
import { useClickOutside } from '@/hooks/useClickOutside';
import { ErrorBanner, SuccessBanner } from '@/components/ui/ErrorBanner';

interface MessageInputProps {
  placeholder: string;
  onSend: (content: string, fileIds?: number[]) => Promise<void>;
  sendError: string | null;
  clearSendError: () => void;
  channelId?: number;
  dmParticipantIds?: number[];
  testIdPrefix?: string;
}

export function MessageInput({ placeholder, onSend, sendError, clearSendError, channelId, dmParticipantIds, testIdPrefix }: MessageInputProps) {
  const prefix = testIdPrefix ? `${testIdPrefix}-` : '';

  // Schedule message state
  const [showScheduleMenu, setShowScheduleMenu] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleConfirm, setScheduleConfirm] = useState<string | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const scheduleMenuRef = useRef<HTMLDivElement>(null);

  const handleSendRef = useRef<() => void>(() => {});

  const editor = useQuillEditor({
    placeholder,
    onSendRef: handleSendRef,
    dmParticipantIds,
    testId: testIdPrefix ? `${testIdPrefix}-message-input` : undefined,
    enableInlineCode: true,
  });

  const handleSend = useCallback(async () => {
    const quill = editor.quillRef.current;
    if (!quill) return;
    const text = serializeDelta(quill);
    if (!text && editor.pendingFiles.length === 0) return;
    const content = text || '';
    const fileIds = editor.pendingFiles.map((f) => f.id);
    editor.clearEditor();
    await onSend(content, fileIds.length > 0 ? fileIds : undefined);
  }, [onSend, editor]);

  handleSendRef.current = handleSend;

  const handleSchedule = useCallback(
    async (scheduledAt: Date) => {
      const quill = editor.quillRef.current;
      if (!quill || !channelId) return;
      const text = serializeDelta(quill);
      if (!text) return;

      setIsScheduling(true);
      setScheduleError(null);
      try {
        await scheduleMessage(channelId, text, scheduledAt);
        editor.clearEditor();
        setShowScheduleMenu(false);
        setShowScheduleModal(false);

        const formatted = scheduledAt.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        setScheduleConfirm(`Scheduled for ${formatted}`);
        setTimeout(() => setScheduleConfirm(null), 4000);
      } catch {
        setScheduleError('Failed to schedule message. Please try again.');
        setTimeout(() => setScheduleError(null), 4000);
      } finally {
        setIsScheduling(false);
      }
    },
    [channelId, editor],
  );

  // Close schedule menu on outside click
  const closeScheduleMenu = useCallback(() => setShowScheduleMenu(false), []);
  useClickOutside(scheduleMenuRef, closeScheduleMenu, showScheduleMenu);

  // Clear editor content when switching channels
  useEffect(() => {
    if (channelId !== undefined) {
      editor.clearEditor();
    }
  }, [channelId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCustomSchedule = () => {
    setShowScheduleMenu(false);
    setShowScheduleModal(true);
  };

  const hasContent = editor.canSend || editor.pendingFiles.length > 0;

  return (
    <div className="relative px-5 pb-6 pt-4 bg-white">
      <div className="slawk-editor rounded-[8px] border border-slack-border-light">
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
          <PortalEmojiPicker
            anchorClassName="absolute bottom-full left-0 mb-2"
            onEmojiSelect={editor.handleEmojiSelect}
            onClickOutside={() => editor.setShowEmojiPicker(false)}
          />
        )}

        <input
          ref={editor.fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,audio/*,.pdf,.txt,.json,.zip"
          onChange={editor.handleFileSelect}
        />

        <EditorToolbar
          testIdPrefix={prefix}
          onAttach={() => editor.fileInputRef.current?.click()}
          onEmojiToggle={() => editor.setShowEmojiPicker(!editor.showEmojiPicker)}
          onMention={editor.handleMentionButtonClick}
          isRecording={editor.isRecording}
          recordingDuration={editor.recordingDuration}
          onStartRecording={editor.startRecording}
          onStopRecording={editor.stopRecording}
          onCancelRecording={editor.cancelRecording}
        >
          {/* Send button group with schedule dropdown */}
          <div className="flex items-center relative" ref={scheduleMenuRef}>
            <button
              data-testid={`${prefix}send-button`}
              onClick={handleSend}
              disabled={!hasContent}
              className={cn(
                'flex h-7 items-center justify-center rounded-l px-2 transition-colors',
                hasContent
                  ? 'bg-slack-btn text-white hover:bg-slack-btn-hover'
                  : 'text-slack-disabled',
              )}
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
            <button
              data-testid={`${prefix}schedule-button`}
              onClick={() => hasContent && setShowScheduleMenu((v) => !v)}
              disabled={!hasContent}
              className={cn(
                'flex h-7 w-5 items-center justify-center rounded-r border-l transition-colors',
                hasContent
                  ? 'bg-slack-btn text-white hover:bg-slack-btn-hover border-slack-btn-hover'
                  : 'text-slack-disabled border-slack-border',
              )}
              title="Schedule message"
            >
              <ChevronDown className="h-3 w-3" />
            </button>

            {showScheduleMenu && (
              <ScheduleMenu
                onSchedule={handleSchedule}
                onCustom={handleCustomSchedule}
                isScheduling={isScheduling}
              />
            )}
          </div>
        </EditorToolbar>
      </div>

      <p className="mt-1 text-xs text-slack-hint">
        <kbd className="rounded bg-slack-active-tab px-1 py-0.5 text-[10px] font-medium">Enter</kbd>{' '}
        to send,{' '}
        <kbd className="rounded bg-slack-active-tab px-1 py-0.5 text-[10px] font-medium">
          Shift + Enter
        </kbd>{' '}
        for new line
      </p>

      {sendError && <ErrorBanner message={sendError} onDismiss={clearSendError} />}
      {editor.uploadError && <ErrorBanner message={editor.uploadError} onDismiss={() => editor.setUploadError(null)} />}
      {scheduleError && <ErrorBanner message={scheduleError} onDismiss={() => setScheduleError(null)} />}
      {scheduleConfirm && <SuccessBanner message={scheduleConfirm} data-testid="schedule-confirm" />}

      {showScheduleModal && (
        <ScheduleModal
          onSchedule={handleSchedule}
          onClose={() => setShowScheduleModal(false)}
          isScheduling={isScheduling}
        />
      )}

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
    </div>
  );
}
