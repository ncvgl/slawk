import { useRef, useEffect, useCallback, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { uploadFile, getUsers, type ApiFile, type AuthUser } from '@/lib/api';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

interface UseQuillEditorOptions {
  placeholder: string;
  onSendRef: React.MutableRefObject<() => void>;
  onTextChange?: () => void;
  dmParticipantIds?: number[];
  testId?: string;
  enableInlineCode?: boolean;
}

export function useQuillEditor({
  placeholder,
  onSendRef,
  onTextChange,
  dmParticipantIds,
  testId,
  enableInlineCode = false,
}: UseQuillEditorOptions) {
  const editorRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const lastSelectionRef = useRef<{ index: number; length: number }>({ index: 0, length: 0 });

  const { isRecording, duration: recordingDuration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder({
    onRecorded: (file) => setPendingFiles((prev) => [...prev, file]),
    onError: (msg) => {
      setUploadError(msg);
      setTimeout(() => setUploadError(null), 4000);
    },
  });

  // Stable refs for Quill keyboard bindings
  const mentionActiveRef = useRef(false);
  mentionActiveRef.current = showMentionDropdown;
  const mentionUsersRef = useRef(mentionUsers);
  mentionUsersRef.current = mentionUsers;
  const mentionSelectedIndexRef = useRef(mentionSelectedIndex);
  mentionSelectedIndexRef.current = mentionSelectedIndex;
  const insertMentionRef = useRef<(user: AuthUser) => void>(() => {});

  // Quill initialization
  useEffect(() => {
    if (!editorRef.current || quillRef.current) return;

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
      modules: {
        toolbar: false,
        clipboard: {
          matchers: [
            ['img', (_node: HTMLElement, delta: any) => { delta.ops = []; return delta; }],
          ],
        },
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
                onSendRef.current();
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
              handler: (range: any) => {
                if (mentionActiveRef.current) {
                  setMentionSelectedIndex((prev) =>
                    prev < mentionUsersRef.current.length - 1 ? prev + 1 : 0
                  );
                  return false;
                }
                // Escape code block at end of document
                const q = quillRef.current;
                if (q && range.index >= q.getLength() - 1 && range.length === 0) {
                  const fmt = q.getFormat(range.index);
                  if (fmt['code-block']) {
                    const len = q.getLength();
                    q.insertText(len - 1, '\n');
                    q.formatLine(len, 1, 'code-block', false);
                    q.setSelection(len);
                    return false;
                  }
                }
                return true;
              },
            },
            escapeCodeRight: {
              key: 'ArrowRight',
              handler: (range: any) => {
                const q = quillRef.current;
                if (!q || range.length !== 0) return true;
                const len = q.getLength();
                const idx = range.index;

                // End of document
                if (idx >= len - 1) {
                  const fmt = q.getFormat(idx);
                  if (fmt['code-block']) {
                    q.insertText(len - 1, '\n');
                    q.formatLine(len, 1, 'code-block', false);
                    q.setSelection(len);
                    return false;
                  }
                  if (fmt.code) {
                    q.format('code', false);
                    return false;
                  }
                  return true;
                }

                // Inline code right boundary: cursor has code format,
                // char at cursor is code, next char is NOT code → escape
                const cursorFmt = q.getFormat(idx);
                const thisCharCode = !!q.getFormat(idx, 1).code;
                const nextCharCode = idx + 1 < len ? !!q.getFormat(idx + 1, 1).code : false;
                if (cursorFmt.code && thisCharCode && !nextCharCode) {
                  q.setSelection(idx + 1);
                  q.format('code', false);
                  return false;
                }

                return true;
              },
            },
          },
        },
      },
      placeholder,
    });

    quill.on('selection-change', (range: any) => {
      if (!range) return;
      lastSelectionRef.current = range;
      // Clear sticky inline code format when cursor is not adjacent to any code characters
      if (range.length === 0) {
        const fmt = quill.getFormat(range.index);
        if (fmt.code) {
          const idx = range.index;
          const len = quill.getLength();
          const adjLeft = idx > 0 && !!quill.getFormat(idx - 1, 1).code;
          const adjRight = idx < len - 1 && !!quill.getFormat(idx, 1).code;
          if (!adjLeft && !adjRight) {
            quill.format('code', false);
          }
        }
      }
    });

    quill.on('text-change', (_delta: any, _oldDelta: any, source: string) => {
      setCanSend(quill.getText().trim().length > 0);
      onTextChange?.();

      // Markdown inline code shortcut
      if (enableInlineCode && source === 'user') {
        const sel = quill.getSelection();
        if (sel) {
          const cursorPos = sel.index;
          const fullText = quill.getText(0, cursorPos);
          if (fullText.endsWith('`') && fullText.length >= 3) {
            const beforeClose = fullText.slice(0, -1);
            const openIdx = beforeClose.lastIndexOf('`');
            if (openIdx >= 0) {
              const codeContent = beforeClose.slice(openIdx + 1);
              if (codeContent.length > 0 && codeContent.length <= 100 && !codeContent.includes('\n')) {
                quill.deleteText(openIdx, codeContent.length + 2);
                quill.insertText(openIdx, codeContent, { code: true });
                quill.insertText(openIdx + codeContent.length, ' ', { code: false });
                quill.setSelection(openIdx + codeContent.length + 1);
                return;
              }
            }
          }
        }
      }

      // Detect @mention trigger
      const selection = quill.getSelection();
      if (!selection) return;
      const cursorPos = selection.index;
      const text = quill.getText(0, cursorPos);
      const atIndex = text.lastIndexOf('@');
      if (atIndex >= 0) {
        const beforeAt = atIndex > 0 ? text[atIndex - 1] : ' ';
        const query = text.slice(atIndex + 1);
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

    if (testId) {
      quill.root.setAttribute('data-testid', testId);
    }

    // Handle image paste from clipboard
    quill.root.addEventListener('paste', (e: ClipboardEvent) => {
      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(clipboardData.items)) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        requestAnimationFrame(() => {
          quill.root.querySelectorAll('img[src^="data:"]').forEach((img) => img.remove());
        });
        (async () => {
          setIsUploading(true);
          setUploadError(null);
          try {
            for (const file of imageFiles) {
              const uploaded = await uploadFile(file);
              setPendingFiles((prev) => [...prev, uploaded]);
            }
          } catch (err: any) {
            const msg = err?.message || 'Failed to upload pasted image. Please try again.';
            setUploadError(msg);
            setTimeout(() => setUploadError(null), 5000);
          } finally {
            setIsUploading(false);
          }
        })();
      }
    });

    quillRef.current = quill;
  }, [placeholder, testId, enableInlineCode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update placeholder when it changes
  useEffect(() => {
    if (quillRef.current) {
      quillRef.current.root.dataset.placeholder = placeholder;
    }
  }, [placeholder]);

  const handleEmojiSelect = useCallback((emoji: { native: string }) => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection() ?? lastSelectionRef.current;
    quill.focus();
    quill.insertText(range.index, emoji.native);
    quill.setSelection(range.index + emoji.native.length);
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
        if (!cancelled) {
          const filtered = dmParticipantIds
            ? users.filter((u) => dmParticipantIds.includes(u.id))
            : users;
          setMentionUsers(filtered);
        }
      } catch {
        // ignore
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showMentionDropdown, mentionQuery, dmParticipantIds]);

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

  const handleMentionButtonClick = useCallback(() => {
    const quill = quillRef.current;
    if (!quill) return;
    const range = quill.getSelection(true);
    quill.insertText(range.index, '@');
    quill.setSelection(range.index + 1);
    quill.focus();
  }, []);

  const handleLinkSave = useCallback(() => {
    const quill = quillRef.current;
    const range = linkSavedRangeRef.current;
    if (!quill || !linkUrl.trim()) {
      setShowLinkModal(false);
      return;
    }
    let url = linkUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
      url = `https://${url}`;
    }
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) {
        setShowLinkModal(false);
        return;
      }
    } catch {
      setShowLinkModal(false);
      return;
    }
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

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file);
        setPendingFiles((prev) => [...prev, uploaded]);
      }
    } catch (err: any) {
      const msg = err?.message || 'Failed to upload file. Please try again.';
      setUploadError(msg);
      setTimeout(() => setUploadError(null), 5000);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, []);

  const removePendingFile = useCallback((fileId: number) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const applyFormat = useCallback((format: string, value?: string) => {
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
  }, []);

  const clearEditor = useCallback(() => {
    if (quillRef.current) {
      quillRef.current.setText('');
      setPendingFiles([]);
      setCanSend(false);
    }
  }, []);

  const getContent = useCallback(() => {
    return quillRef.current;
  }, []);

  return {
    // Refs for JSX
    editorRef,
    quillRef,
    fileInputRef,
    mentionDropdownRef,

    // State
    canSend,
    pendingFiles,
    isUploading,
    uploadError,
    setUploadError,
    showEmojiPicker,
    setShowEmojiPicker,
    showMentionDropdown,
    mentionUsers,
    mentionSelectedIndex,
    showLinkModal,
    linkUrl,
    linkText,
    setLinkUrl,
    setLinkText,
    setShowLinkModal,

    // Voice recorder
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    cancelRecording,

    // Handlers
    handleEmojiSelect,
    insertMention,
    handleMentionButtonClick,
    handleLinkSave,
    handleFileSelect,
    removePendingFile,
    applyFormat,
    clearEditor,
    getContent,
    setPendingFiles,
    setCanSend,
  };
}
