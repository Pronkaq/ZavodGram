import { useCallback } from 'react';

const REACTION_SET = ['👍', '❤️', '🔥', '👏', '😂', '😮', '😢', '😡'];

export function useMessageReactions({ activeChat, ws, setReactionPicker }) {
  const addReaction = useCallback((msgId, emoji) => {
    if (!activeChat) return;
    ws.reactMessage({ chatId: activeChat, messageId: msgId, emoji });
  }, [activeChat, ws]);

  const groupReactions = useCallback((msg) => {
    const grouped = {};
    (msg.reactions || []).forEach((r) => {
      if (!grouped[r.emoji]) grouped[r.emoji] = [];
      grouped[r.emoji].push(r.userId);
    });
    return grouped;
  }, []);

  const openReactionPicker = useCallback((x, y, msgId) => {
    setReactionPicker({ x: Math.min(x, window.innerWidth - 270), y: Math.min(y, window.innerHeight - 80), msgId });
  }, [setReactionPicker]);

  return {
    REACTION_SET,
    addReaction,
    groupReactions,
    openReactionPicker,
  };
}
