import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import Quill, { Delta } from 'quill';
import 'quill/dist/quill.snow.css';
import { uploadFile, getUsers, type ApiFile, type AuthUser } from '@/lib/api';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import emojiData from '@emoji-mart/data';
import type { EmojiOption } from '@/components/Messages/EmojiAutocomplete';

// Register a custom mention embed blot so @mentions are distinct from plain text
const Embed = Quill.import('blots/embed') as any;
class MentionBlot extends Embed {
  static blotName = 'mention';
  static tagName = 'span';
  static className = 'ql-mention';

  static create(data: { id: number; name: string }) {
    const node = super.create() as HTMLElement;
    node.setAttribute('data-mention-id', String(data.id));
    node.setAttribute('data-mention-name', data.name);
    node.textContent = `@${data.name}`;
    const isHere = data.id === -1 && data.name === 'here';
    node.style.cssText = isHere
      ? 'background:rgba(255,183,77,0.3);color:#b25e00;border-radius:3px;padding:0 2px;font-weight:500;cursor:pointer;'
      : 'background:rgba(29,155,209,0.1);color:#1264a3;border-radius:3px;padding:0 2px;font-weight:500;cursor:pointer;';
    node.contentEditable = 'false';
    return node;
  }

  static value(node: HTMLElement) {
    return {
      id: Number(node.getAttribute('data-mention-id')),
      name: node.getAttribute('data-mention-name') || '',
    };
  }
}
Quill.register(MentionBlot);

// Build searchable emoji list from emoji-mart data
function buildEmojiIndex(): EmojiOption[] {
  const emojis = (emojiData as any).emojis;
  const aliases = (emojiData as any).aliases || {};
  const results: EmojiOption[] = [];
  for (const [id, entry] of Object.entries(emojis) as any[]) {
    const native = entry.skins?.[0]?.native;
    if (!native) continue;
    results.push({ id, native, name: entry.name });
  }
  // Add aliases as separate entries pointing to the same emoji
  for (const [alias, target] of Object.entries(aliases) as [string, string][]) {
    const entry = emojis[target];
    if (!entry?.skins?.[0]?.native) continue;
    results.push({ id: alias, native: entry.skins[0].native, name: entry.name });
  }
  return results;
}

const EMOJI_INDEX = buildEmojiIndex();
const EMOJI_MAP = new Map<string, EmojiOption>();
for (const e of EMOJI_INDEX) {
  if (!EMOJI_MAP.has(e.id)) EMOJI_MAP.set(e.id, e);
}

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
  const [showEmojiAutocomplete, setShowEmojiAutocomplete] = useState(false);
  const [emojiQuery, setEmojiQuery] = useState('');
  const [emojiStartIndex, setEmojiStartIndex] = useState<number | null>(null);
  const [emojiSelectedIndex, setEmojiSelectedIndex] = useState(0);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const linkSavedRangeRef = useRef<{ index: number; length: number } | null>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const emojiAutocompleteRef = useRef<HTMLDivElement>(null);
  const lastSelectionRef = useRef<{ index: number; length: number }>({ index: 0, length: 0 });

  const { isRecording, duration: recordingDuration, startRecording, stopRecording, cancelRecording } = useVoiceRecorder({
    onRecorded: (file) => setPendingFiles((prev) => [...prev, file]),
    onError: (msg) => {
      setUploadError(msg);
      setTimeout(() => setUploadError(null), 4000);
    },
  });

  // Filter emojis based on query (memoized)
  const filteredEmojis = useMemo(() => {
    if (!showEmojiAutocomplete || emojiQuery.length < 2) return [];
    const q = emojiQuery.toLowerCase();
    const results = EMOJI_INDEX.filter((e) => e.id.includes(q));
    // Sort: exact start match first, then by id length (shorter = more relevant)
    results.sort((a, b) => {
      const aStarts = a.id.startsWith(q) ? 0 : 1;
      const bStarts = b.id.startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.id.length - b.id.length;
    });
    return results.slice(0, 8);
  }, [showEmojiAutocomplete, emojiQuery]);

  // Stable refs for Quill keyboard bindings
  const mentionActiveRef = useRef(false);
  mentionActiveRef.current = showMentionDropdown;
  const emojiActiveRef = useRef(false);
  emojiActiveRef.current = showEmojiAutocomplete && filteredEmojis.length > 0;
  const mentionUsersRef = useRef(mentionUsers);
  mentionUsersRef.current = mentionUsers;
  const mentionSelectedIndexRef = useRef(mentionSelectedIndex);
  mentionSelectedIndexRef.current = mentionSelectedIndex;
  const filteredEmojisRef = useRef(filteredEmojis);
  filteredEmojisRef.current = filteredEmojis;
  const emojiSelectedIndexRef = useRef(emojiSelectedIndex);
  emojiSelectedIndexRef.current = emojiSelectedIndex;
  const insertMentionRef = useRef<(user: AuthUser) => void>(() => {});
  const insertEmojiAutocompleteRef = useRef<(emoji: EmojiOption) => void>(() => {});

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
                if (emojiActiveRef.current) {
                  const emojis = filteredEmojisRef.current;
                  const idx = emojiSelectedIndexRef.current;
                  if (emojis.length > 0 && idx < emojis.length) {
                    insertEmojiAutocompleteRef.current(emojis[idx]);
                  }
                  return false;
                }
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
                if (emojiActiveRef.current) {
                  setShowEmojiAutocomplete(false);
                  return false;
                }
                if (mentionActiveRef.current) {
                  setShowMentionDropdown(false);
                  return false;
                }
                return true;
              },
            },
            arrowUp: {
              key: 'ArrowUp',
              handler: (range: any) => {
                if (emojiActiveRef.current) {
                  setEmojiSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : filteredEmojisRef.current.length - 1
                  );
                  return false;
                }
                if (mentionActiveRef.current) {
                  setMentionSelectedIndex((prev) =>
                    prev > 0 ? prev - 1 : mentionUsersRef.current.length - 1
                  );
                  return false;
                }
                // Escape code block at start of document
                const q = quillRef.current;
                if (q && range.length === 0) {
                  const fmt = q.getFormat(range.index);
                  if (fmt['code-block'] && !q.getText(0, range.index).includes('\n')) {
                    q.insertText(0, '\n');
                    q.formatLine(0, 1, 'code-block', false);
                    q.setSelection(0);
                    return false;
                  }
                }
                return true;
              },
            },
            arrowDown: {
              key: 'ArrowDown',
              handler: (range: any) => {
                if (emojiActiveRef.current) {
                  setEmojiSelectedIndex((prev) =>
                    prev < filteredEmojisRef.current.length - 1 ? prev + 1 : 0
                  );
                  return false;
                }
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
            escapeCodeBlockLeft: {
              key: 'ArrowLeft',
              handler: (range: any) => {
                const q = quillRef.current;
                if (!q || range.length !== 0 || range.index !== 0) return true;
                const fmt = q.getFormat(0);
                if (fmt['code-block']) {
                  q.insertText(0, '\n');
                  q.formatLine(0, 1, 'code-block', false);
                  q.setSelection(0);
                  return false;
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

      // Detect :emoji shortcode trigger (only on user input, not programmatic changes)
      if (source !== 'user') {
        setShowEmojiAutocomplete(false);
      }
      const sel2 = source === 'user' ? quill.getSelection() : null;
      if (sel2) {
        // Skip emoji detection inside code or code blocks
        const fmt = quill.getFormat(sel2.index);
        if (fmt.code || fmt['code-block']) {
          setShowEmojiAutocomplete(false);
        } else {
        const cPos = sel2.index;
        const txt = quill.getText(0, cPos);

        // Check for closing colon auto-convert: :shortcode:
        if (txt.endsWith(':') && txt.length >= 4) {
          const beforeClose = txt.slice(0, -1);
          const openColon = beforeClose.lastIndexOf(':');
          if (openColon >= 0) {
            const beforeOpen = openColon > 0 ? txt[openColon - 1] : ' ';
            const shortcode = beforeClose.slice(openColon + 1).toLowerCase();
            if ((openColon === 0 || /\s/.test(beforeOpen)) && shortcode.length >= 2 && !/\s/.test(shortcode)) {
              const match = EMOJI_MAP.get(shortcode);
              if (match) {
                const delta = new Delta()
                  .retain(openColon)
                  .delete(shortcode.length + 2)
                  .insert(match.native);
                quill.updateContents(delta, 'api');
                quill.setSelection(openColon + match.native.length);
                setShowEmojiAutocomplete(false);
                return;
              }
            }
          }
        }

        // Find the last colon for autocomplete trigger
        const colonIdx = txt.lastIndexOf(':');
        if (colonIdx >= 0) {
          const beforeColon = colonIdx > 0 ? txt[colonIdx - 1] : ' ';
          const afterColon = txt.slice(colonIdx + 1);
          if ((colonIdx === 0 || /\s/.test(beforeColon)) && !/\s/.test(afterColon) && afterColon.length >= 2) {
            setEmojiStartIndex(colonIdx);
            setEmojiQuery(afterColon.toLowerCase());
            setShowEmojiAutocomplete(true);
            setEmojiSelectedIndex(0);
          } else {
            setShowEmojiAutocomplete(false);
          }
        } else {
          setShowEmojiAutocomplete(false);
        }
        } // end code-block guard else
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

    // Handle image paste from clipboard — use capture phase to intercept before Quill
    const handlePaste = (e: ClipboardEvent) => {
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
        e.stopImmediatePropagation();
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
    };
    quill.root.addEventListener('paste', handlePaste, { capture: true });

    // Handle file drop from drag-and-drop
    const handleDragOver = (e: DragEvent) => {
      // Required to allow drop — only if dragging files
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const files = e.dataTransfer?.files;
      if (!files || files.length === 0) return;

      (async () => {
        setIsUploading(true);
        setUploadError(null);
        try {
          for (const file of Array.from(files)) {
            const uploaded = await uploadFile(file);
            setPendingFiles((prev) => [...prev, uploaded]);
          }
        } catch (err: any) {
          const msg = err?.message || 'Failed to upload dropped file. Please try again.';
          setUploadError(msg);
          setTimeout(() => setUploadError(null), 5000);
        } finally {
          setIsUploading(false);
        }
      })();
    };

    quill.root.addEventListener('dragover', handleDragOver as any);
    quill.root.addEventListener('drop', handleDrop as any);

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
    const fetchUsers = async () => {
      try {
        const users = await getUsers(mentionQuery || undefined);
        if (!cancelled) {
          const filtered = dmParticipantIds
            ? users.filter((u) => dmParticipantIds.includes(u.id))
            : users;
          // Add @here special option (filtered by query) — only in channels, not DMs
          const hereOption: AuthUser = { id: -1, name: 'here', avatar: null };
          const q = mentionQuery.toLowerCase();
          const showHere = !dmParticipantIds && (!q || 'here'.startsWith(q));
          const withHere = showHere ? [hereOption, ...filtered] : filtered;
          setMentionUsers(withHere);
        }
      } catch {
        // ignore
      }
    };
    // No debounce for empty query (initial '@') so dropdown appears instantly
    if (!mentionQuery) {
      fetchUsers();
      return () => { cancelled = true; };
    }
    const timer = setTimeout(fetchUsers, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [showMentionDropdown, mentionQuery, dmParticipantIds]);

  const insertMention = useCallback(
    (user: AuthUser) => {
      const quill = quillRef.current;
      if (!quill || mentionStartIndex === null) return;
      const deleteLength = mentionQuery.length + 1; // +1 for the '@'
      quill.deleteText(mentionStartIndex, deleteLength);
      if (user.id === -1 && user.name === 'here') {
        // @here special mention — insert as styled embed
        quill.insertEmbed(mentionStartIndex, 'mention', { id: -1, name: 'here' }, 'user');
      } else {
        quill.insertEmbed(mentionStartIndex, 'mention', { id: user.id, name: user.name }, 'user');
      }
      quill.insertText(mentionStartIndex + 1, ' ', 'user');
      quill.setSelection(mentionStartIndex + 2);
      setShowMentionDropdown(false);
      setMentionQuery('');
      setMentionStartIndex(null);
      quill.focus();
    },
    [mentionStartIndex, mentionQuery],
  );
  insertMentionRef.current = insertMention;

  const insertEmojiFromAutocomplete = useCallback(
    (emoji: EmojiOption) => {
      const quill = quillRef.current;
      if (!quill || emojiStartIndex === null) return;
      const deleteLength = emojiQuery.length + 1; // +1 for the leading ':'
      quill.deleteText(emojiStartIndex, deleteLength);
      quill.insertText(emojiStartIndex, emoji.native);
      quill.setSelection(emojiStartIndex + emoji.native.length);
      setShowEmojiAutocomplete(false);
      setEmojiQuery('');
      setEmojiStartIndex(null);
      quill.focus();
    },
    [emojiStartIndex, emojiQuery],
  );
  insertEmojiAutocompleteRef.current = insertEmojiFromAutocomplete;

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

    const LINE_FORMATS = ['blockquote', 'list', 'header', 'code-block'];

    if (value) {
      const range = quill.getSelection();
      if (range) {
        const currentFormat = quill.getFormat(range);
        if (LINE_FORMATS.includes(format)) {
          quill.formatLine(range.index, range.length || 1, format, currentFormat[format] === value ? false : value);
        } else {
          quill.format(format, currentFormat[format] === value ? false : value);
        }
      }
    } else {
      const range = quill.getSelection();
      if (range) {
        const currentFormat = quill.getFormat(range);
        if (LINE_FORMATS.includes(format)) {
          quill.formatLine(range.index, range.length || 1, format, !currentFormat[format]);
        } else {
          quill.format(format, !currentFormat[format]);
        }
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
    emojiAutocompleteRef,

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
    showEmojiAutocomplete,
    filteredEmojis,
    emojiSelectedIndex,
    emojiQuery,
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
    insertEmojiFromAutocomplete,
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
