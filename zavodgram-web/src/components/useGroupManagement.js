import { useMemo, useCallback } from 'react';

export function useGroupManagement({
  acd,
  userId,
  activeChat,
  editGroupName,
  editGroupDesc,
  editTopicsEnabled,
  editContentProtection,
  newTopicTitle,
  setEditGroupName,
  setEditGroupDesc,
  setEditTopicsEnabled,
  setEditContentProtection,
  setGroupSettingsModal,
  setNewTopicTitle,
  setTopicError,
  setActiveTopicId,
  setAddMemberSearch,
  setAddMemberResults,
  chatsApi,
  usersApi,
  mediaApi,
  loadChats,
  loadTopics,
}) {
  const myRole = useMemo(() => acd?.myRole || acd?.members?.find((m) => m.userId === userId)?.role || 'MEMBER', [acd, userId]);
  const isOwnerOrAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const isOwner = myRole === 'OWNER';
  const isGroupOrChannel = acd?.type === 'GROUP' || acd?.type === 'CHANNEL';

  const openGroupSettings = useCallback(() => {
    if (!acd || !isGroupOrChannel) return;
    setEditGroupName(acd.name || '');
    setEditGroupDesc(acd.description || '');
    setEditTopicsEnabled(!!acd.topicsEnabled);
    setEditContentProtection(!!acd.contentProtectionEnabled);
    setGroupSettingsModal(true);
  }, [acd, isGroupOrChannel, setEditGroupName, setEditGroupDesc, setEditTopicsEnabled, setEditContentProtection, setGroupSettingsModal]);

  const saveGroupSettings = useCallback(async () => {
    if (!activeChat) return;
    try {
      await chatsApi.update(activeChat, {
        name: editGroupName,
        description: editGroupDesc,
        ...(acd?.type === 'GROUP' ? { topicsEnabled: editTopicsEnabled } : {}),
        contentProtectionEnabled: editContentProtection,
      });
      await loadChats();
      setGroupSettingsModal(false);
    } catch (err) { console.error(err); }
  }, [activeChat, chatsApi, editGroupName, editGroupDesc, acd?.type, editTopicsEnabled, editContentProtection, loadChats, setGroupSettingsModal]);

  const createTopic = useCallback(async () => {
    if (!activeChat || !newTopicTitle.trim()) return;
    try {
      const created = await chatsApi.createTopic(activeChat, newTopicTitle.trim());
      setNewTopicTitle('');
      setTopicError('');
      await loadTopics(activeChat);
      setActiveTopicId(created.id);
    } catch (err) {
      setTopicError(err.message || 'Не удалось создать тему');
    }
  }, [activeChat, newTopicTitle, chatsApi, setNewTopicTitle, setTopicError, loadTopics, setActiveTopicId]);

  const handleGroupAvatarUpload = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;
    try {
      const media = await mediaApi.upload(file);
      const avatarRef = `media:${media.id}`;
      await chatsApi.update(activeChat, { avatar: avatarRef });
      await loadChats();
    } catch (err) { console.error(err); }
  }, [activeChat, mediaApi, chatsApi, loadChats]);

  const handleSetRole = useCallback(async (targetId, role) => {
    if (!activeChat) return;
    try {
      await chatsApi.setMemberRole(activeChat, targetId, role);
      await loadChats();
    } catch (err) { console.error(err); }
  }, [activeChat, chatsApi, loadChats]);

  const handleKickMember = useCallback(async (targetId) => {
    if (!activeChat) return;
    try {
      await chatsApi.removeMember(activeChat, targetId);
      await loadChats();
    } catch (err) { console.error(err); }
  }, [activeChat, chatsApi, loadChats]);

  const handleTransferOwnership = useCallback(async (targetId) => {
    if (!activeChat || !confirm('Передать права создателя? Это действие нельзя отменить.')) return;
    try {
      await chatsApi.transferOwnership(activeChat, targetId);
      await loadChats();
    } catch (err) { console.error(err); }
  }, [activeChat, chatsApi, loadChats]);

  const handleAddMember = useCallback(async (targetId) => {
    if (!activeChat) return;
    try {
      await chatsApi.addMember(activeChat, targetId);
      await loadChats();
      setAddMemberSearch('');
      setAddMemberResults([]);
    } catch (err) { console.error(err); }
  }, [activeChat, chatsApi, loadChats, setAddMemberSearch, setAddMemberResults]);

  const searchAddMember = useCallback(async (q) => {
    setAddMemberSearch(q);
    if (q.length < 2) {
      setAddMemberResults([]);
      return;
    }
    try { setAddMemberResults(await usersApi.search(q)); } catch {}
  }, [setAddMemberSearch, setAddMemberResults, usersApi]);

  return {
    myRole,
    isOwnerOrAdmin,
    isOwner,
    isGroupOrChannel,
    openGroupSettings,
    saveGroupSettings,
    createTopic,
    handleGroupAvatarUpload,
    handleSetRole,
    handleKickMember,
    handleTransferOwnership,
    handleAddMember,
    searchAddMember,
  };
}
