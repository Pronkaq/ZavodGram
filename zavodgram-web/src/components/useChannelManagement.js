import { useMemo, useCallback } from 'react';

export function useChannelManagement({
  activeChat,
  acd,
  isOwner,
  channelManageModal,
  channelSlugEdit,
  editGroupName,
  editGroupDesc,
  setChannelSlugEdit,
  setChannelSlugError,
  setChannelInfoModal,
  setBansLoading,
  setBannedUsers,
  setEditGroupName,
  setEditGroupDesc,
  setChannelManageTab,
  setChannelManageModal,
  chatsApi,
  loadChats,
}) {
  const normalizedSlug = useCallback((slug) => (slug || '').trim().toLowerCase(), []);

  const channelPublicLink = useMemo(() => {
    if (!acd?.channelSlug) return '';
    return `${window.location.origin}/${acd.channelSlug}`;
  }, [acd?.channelSlug]);

  const openChannelInfo = useCallback(() => {
    if (!acd || acd.type !== 'CHANNEL') return;
    setChannelSlugEdit(acd.channelSlug || '');
    setChannelSlugError('');
    setChannelInfoModal(true);
  }, [acd, setChannelSlugEdit, setChannelSlugError, setChannelInfoModal]);

  const shareChannelLink = useCallback(async () => {
    if (!channelPublicLink) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: acd?.name || 'Канал', url: channelPublicLink });
      } else {
        await navigator.clipboard?.writeText(channelPublicLink);
      }
    } catch {}
  }, [channelPublicLink, acd?.name]);

  const saveChannelSlug = useCallback(async () => {
    if (!activeChat || !acd || acd.type !== 'CHANNEL') return;
    const slug = normalizedSlug(channelSlugEdit);
    if (!/^[a-z0-9._-]{3,64}$/i.test(slug)) {
      setChannelSlugError('3-64 символа: буквы, цифры, ., _, -');
      return;
    }
    try {
      await chatsApi.update(activeChat, { channelSlug: slug });
      await loadChats();
      setChannelSlugError('');
      setChannelInfoModal(false);
    } catch (err) {
      setChannelSlugError(err.message || 'Не удалось сохранить ссылку');
    }
  }, [activeChat, acd, normalizedSlug, channelSlugEdit, setChannelSlugError, chatsApi, loadChats, setChannelInfoModal]);

  const loadChannelBans = useCallback(async () => {
    if (!activeChat) return;
    setBansLoading(true);
    try {
      const bans = await chatsApi.listBans(activeChat);
      setBannedUsers(bans || []);
    } catch (err) {
      setBannedUsers([]);
      alert(err.message || 'Не удалось загрузить список заблокированных');
    } finally {
      setBansLoading(false);
    }
  }, [activeChat, setBansLoading, chatsApi, setBannedUsers]);

  const openChannelManagement = useCallback(async () => {
    if (!acd || acd.type !== 'CHANNEL' || !isOwner) return;
    setEditGroupName(acd.name || '');
    setEditGroupDesc(acd.description || '');
    setChannelSlugEdit(acd.channelSlug || '');
    setChannelSlugError('');
    setChannelManageTab('main');
    setChannelManageModal(true);
    await loadChannelBans();
  }, [acd, isOwner, setEditGroupName, setEditGroupDesc, setChannelSlugEdit, setChannelSlugError, setChannelManageTab, setChannelManageModal, loadChannelBans]);

  const saveChannelManagement = useCallback(async () => {
    if (!activeChat || !acd || acd.type !== 'CHANNEL' || !isOwner) return;
    const slug = normalizedSlug(channelSlugEdit);
    if (!/^[a-z0-9._-]{3,64}$/i.test(slug)) {
      setChannelSlugError('3-64 символа: буквы, цифры, ., _, -');
      return;
    }
    try {
      await chatsApi.update(activeChat, { name: editGroupName.trim(), description: editGroupDesc, channelSlug: slug });
      await loadChats();
      setChannelManageModal(false);
    } catch (err) {
      setChannelSlugError(err.message || 'Не удалось сохранить настройки канала');
    }
  }, [activeChat, acd, isOwner, normalizedSlug, channelSlugEdit, setChannelSlugError, chatsApi, editGroupName, editGroupDesc, loadChats, setChannelManageModal]);

  const handleBanMember = useCallback(async (targetId) => {
    if (!activeChat || !targetId) return;
    try {
      await chatsApi.banMember(activeChat, targetId);
      await loadChats();
      if (channelManageModal) await loadChannelBans();
    } catch (err) {
      alert(err.message || 'Не удалось заблокировать пользователя');
    }
  }, [activeChat, chatsApi, loadChats, channelManageModal, loadChannelBans]);

  const handleUnbanMember = useCallback(async (targetId) => {
    if (!activeChat || !targetId) return;
    try {
      await chatsApi.unbanMember(activeChat, targetId);
      await loadChannelBans();
    } catch (err) {
      alert(err.message || 'Не удалось разблокировать пользователя');
    }
  }, [activeChat, chatsApi, loadChannelBans]);

  return {
    loadChannelBans,
    channelPublicLink,
    openChannelInfo,
    shareChannelLink,
    saveChannelSlug,
    openChannelManagement,
    saveChannelManagement,
    handleBanMember,
    handleUnbanMember,
  };
}
