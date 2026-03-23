import { useState, useRef, useEffect } from 'react';

interface UseMessageEditOptions {
  onSave: (messageId: number, content: string) => Promise<void>;
}

/**
 * Shared edit state and handlers for message editing (used by Message and DMConversation).
 */
export function useMessageEdit({ onSave }: UseMessageEditOptions) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editError, setEditError] = useState<string | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.setSelectionRange(editContent.length, editContent.length);
    }
  }, [editingId]);

  const startEdit = (messageId: number, content: string) => {
    setEditingId(messageId);
    setEditError(null);
    // Convert <@id|name> mention tokens to readable @name for editing
    setEditContent(content.replace(/<@\d+\|([^>]+)>/g, '@$1'));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
    setEditError(null);
  };

  const saveEdit = async (originalContent?: string) => {
    if (editingId === null) return;
    const trimmed = editContent.trim();
    if (!trimmed) {
      setEditError('Message cannot be empty.');
      return;
    }
    if (trimmed !== originalContent) {
      await onSave(editingId, trimmed);
    }
    setEditError(null);
    setEditingId(null);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, originalContent?: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEdit(originalContent);
    }
    if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  return {
    editingId,
    editContent,
    editError,
    setEditContent,
    editInputRef,
    startEdit,
    cancelEdit,
    saveEdit,
    handleEditKeyDown,
  };
}
