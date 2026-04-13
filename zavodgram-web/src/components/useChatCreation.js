import { useCallback } from 'react';

export function useChatCreation({
  userId,
  chats,
  newChatMode,
  groupName,
  groupDesc,
  groupMembers,
  setNewChatSearch,
  setNewChatResults,
  setShowMobileChat,
  setPostCommentsModal,
  setPostCommentReplyTo,
  setNewChatModal,
  setNewChatMode,
  setGroupName,
  setGroupDesc,
  setGroupMembers,
  chatsApi,
  usersApi,
  loadChats,
  selectChat,
}) {
  const handleNewChat = useCallback(async (otherUserId, type = 'PRIVATE') => {
    try {
      const chat = await chatsApi.create({ type, memberIds: [otherUserId] });
      await loadChats();
      selectChat(chat.id);
      setShowMobileChat(true);
      setNewChatModal(false);
      setNewChatMode('search');
    } catch (err) { console.error(err); }
  }, [chatsApi, loadChats, selectChat, setShowMobileChat, setNewChatModal, setNewChatMode]);

  const openDirectChatWithUser = useCallback(async (targetUser) => {
    const targetId = targetUser?.id;
    if (!targetId || targetId === userId) return;

    const existingDirect = chats.find((chat) => {
      if (chat.type !== 'PRIVATE' && chat.type !== 'SECRET') return false;
      if (chat.peer?.id) return chat.peer.id === targetId;
      const memberIds = new Set((chat.members || []).map((member) => member.userId));
      return memberIds.has(userId) && memberIds.has(targetId);
    });

    if (existingDirect) {
      selectChat(existingDirect.id);
      setShowMobileChat(true);
      setPostCommentsModal(null);
      setPostCommentReplyTo(null);
      return;
    }

    try {
      const chat = await chatsApi.create({ type: 'PRIVATE', memberIds: [targetId] });
      await loadChats();
      selectChat(chat.id);
      setShowMobileChat(true);
      setPostCommentsModal(null);
      setPostCommentReplyTo(null);
    } catch (err) {
      console.error(err);
    }
  }, [userId, chats, selectChat, setShowMobileChat, setPostCommentsModal, setPostCommentReplyTo, chatsApi, loadChats]);

  const createGroupOrChannel = useCallback(async () => {
    if (!groupName.trim()) return;
    try {
      const chat = await chatsApi.create({ type: newChatMode, name: groupName, description: groupDesc, memberIds: groupMembers.map(m => m.id) });
      await loadChats();
      selectChat(chat.id);
      setShowMobileChat(true);
      setNewChatModal(false);
      setNewChatMode('search');
      setGroupName('');
      setGroupDesc('');
      setGroupMembers([]);
    } catch (err) { console.error(err); }
  }, [groupName, chatsApi, newChatMode, groupDesc, groupMembers, loadChats, selectChat, setShowMobileChat, setNewChatModal, setNewChatMode, setGroupName, setGroupDesc, setGroupMembers]);

  const searchNewChat = useCallback(async (q) => {
    setNewChatSearch(q);
    if (q.length < 2) {
      setNewChatResults([]);
      return;
    }
    try { setNewChatResults(await usersApi.search(q)); } catch {}
  }, [setNewChatSearch, setNewChatResults, usersApi]);

  return {
    handleNewChat,
    openDirectChatWithUser,
    createGroupOrChannel,
    searchNewChat,
  };
}
