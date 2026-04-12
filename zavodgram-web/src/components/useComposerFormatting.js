import { useState, useEffect, useCallback } from 'react';
import { sanitizeRichHtml } from './chatRichText';

export function useComposerFormatting({
  composerRef,
  input,
  setInput,
  activeChat,
  activeTopicId,
  acd,
  userId,
  typingTimer,
  startTyping,
}) {
  const [composerToolbar, setComposerToolbar] = useState(null);

  useEffect(() => {
    const editor = composerRef.current;
    if (!editor) return;
    const safe = sanitizeRichHtml(input);
    if (editor.innerHTML !== safe) editor.innerHTML = safe;
  }, [composerRef, input]);

  const refreshComposerSelection = useCallback(() => {
    const editor = composerRef.current;
    if (!editor || document.activeElement !== editor) {
      setComposerToolbar(null);
      return;
    }
    const sel = window.getSelection?.();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setComposerToolbar(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) {
      setComposerToolbar(null);
      return;
    }
    setComposerToolbar({
      top: rect.top + window.scrollY - 40,
      left: rect.left + window.scrollX + rect.width / 2,
    });
  }, [composerRef]);

  const applyComposerFormat = useCallback((command) => {
    const editor = composerRef.current;
    if (!editor) return;
    editor.focus();
    document.execCommand(command, false);
    const html = sanitizeRichHtml(editor.innerHTML);
    editor.innerHTML = html;
    setInput(html);
    setTimeout(refreshComposerSelection, 0);
  }, [composerRef, setInput, refreshComposerSelection]);

  const applyComposerLink = useCallback(() => {
    const editor = composerRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection?.();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const link = window.prompt('Вставьте ссылку (https://...)');
    if (!link) return;
    const normalized = link.trim();
    if (!/^https?:\/\//i.test(normalized)) return;
    document.execCommand('createLink', false, normalized);
    const html = sanitizeRichHtml(editor.innerHTML);
    editor.innerHTML = html;
    setInput(html);
    setTimeout(refreshComposerSelection, 0);
  }, [composerRef, setInput, refreshComposerSelection]);

  const syncComposerInput = useCallback(() => {
    const editor = composerRef.current;
    if (!editor) return;
    const html = sanitizeRichHtml(editor.innerHTML);
    if (editor.innerHTML !== html) editor.innerHTML = html;
    setInput(html);
    if (!activeChat) return;
    if (acd?.type === 'GROUP' && acd?.topicsEnabled && !activeTopicId) return;
    const roleInChat = acd?.myRole || acd?.members?.find(m => m.userId === userId)?.role || 'MEMBER';
    if (acd?.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(roleInChat)) return;
    clearTimeout(typingTimer.current);
    startTyping(activeChat);
    typingTimer.current = setTimeout(() => {}, 3000);
  }, [composerRef, setInput, activeChat, acd, activeTopicId, userId, typingTimer, startTyping]);

  return {
    composerToolbar,
    setComposerToolbar,
    refreshComposerSelection,
    applyComposerFormat,
    applyComposerLink,
    syncComposerInput,
  };
}
