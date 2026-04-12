import { useCallback } from 'react';

export function usePostCommentsFlow({
  cms,
  activeChat,
  isOwnerOrAdmin,
  postCommentsModal,
  postCommentDraft,
  postCommentReplyTo,
  setPostCommentsModal,
  setPostCommentDraft,
  setPostCommentReplyTo,
  sendMessage,
  deleteMessage,
  chatsApi,
  loadChats,
}) {
  const getPostComments = useCallback((msg) => {
    if (!msg?.id) return [];
    const children = new Map();
    cms.forEach((m) => {
      if (m.deleted || !m.replyToId) return;
      if (!children.has(m.replyToId)) children.set(m.replyToId, []);
      children.get(m.replyToId).push(m);
    });

    const result = [];
    const walk = (parentId, depth = 0) => {
      const list = (children.get(parentId) || []).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
      list.forEach((item) => {
        result.push({ ...item, depth });
        walk(item.id, depth + 1);
      });
    };

    walk(msg.id, 0);
    return result;
  }, [cms]);

  const openPostComments = useCallback((msg) => {
    if (!msg) return;
    setPostCommentsModal(msg);
    setPostCommentDraft('');
    setPostCommentReplyTo(null);
  }, [setPostCommentsModal, setPostCommentDraft, setPostCommentReplyTo]);

  const sendPostComment = useCallback(async () => {
    if (!postCommentsModal) return;
    const commentsAllowed = Boolean(postCommentsModal.commentsEnabled) || isOwnerOrAdmin;
    if (!commentsAllowed) return;
    const text = postCommentDraft.trim();
    if (!text) return;
    sendMessage(activeChat, text, postCommentReplyTo?.id || postCommentsModal.id, null);
    setPostCommentDraft('');
    setPostCommentReplyTo(null);
  }, [activeChat, isOwnerOrAdmin, postCommentDraft, postCommentReplyTo, postCommentsModal, sendMessage, setPostCommentDraft, setPostCommentReplyTo]);

  const handleModerateComment = useCallback(async (comment, action) => {
    if (!activeChat || !comment) return;
    try {
      if (action === 'delete') {
        deleteMessage(activeChat, comment.id);
      }
      if (action === 'mute') {
        await chatsApi.muteComments(activeChat, comment.fromId || comment.from?.id, true);
        await loadChats();
      }
      if (action === 'unmute') {
        await chatsApi.muteComments(activeChat, comment.fromId || comment.from?.id, false);
        await loadChats();
      }
    } catch (err) {
      alert(err.message || 'Не удалось выполнить действие');
    }
  }, [activeChat, deleteMessage, chatsApi, loadChats]);

  return {
    getPostComments,
    openPostComments,
    sendPostComment,
    handleModerateComment,
  };
}
