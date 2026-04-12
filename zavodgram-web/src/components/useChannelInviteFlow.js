import { useCallback, useEffect, useRef, useState } from 'react';

export function useChannelInviteFlow({ chats, selectChat, loadChats, chatsApi, setShowMobileChat }) {
  const [inviteChannel, setInviteChannel] = useState(null);
  const [joiningInvite, setJoiningInvite] = useState(false);
  const handledSlugRef = useRef(null);

  useEffect(() => {
    const slug = window.location.pathname.replace(/^\/+/, '').trim();
    if (!slug || ['auth', 'login'].includes(slug.toLowerCase())) return;
    if (slug.includes('/')) return;
    if (handledSlugRef.current === slug) return;
    handledSlugRef.current = slug;

    let cancelled = false;
    (async () => {
      try {
        const channel = await chatsApi.getBySlug(slug);
        if (cancelled) return;
        const existing = chats.find((c) => c.id === channel.id);
        if (existing) {
          selectChat(existing.id);
          setShowMobileChat(true);
          window.history.replaceState({}, '', '/');
          return;
        }
        setInviteChannel(channel);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [chats, selectChat, chatsApi, setShowMobileChat]);

  const joinInviteChannel = useCallback(async () => {
    if (!inviteChannel?.channelSlug) return;
    setJoiningInvite(true);
    try {
      const joined = await chatsApi.joinBySlug(inviteChannel.channelSlug);
      await loadChats();
      selectChat(joined.id);
      setShowMobileChat(true);
      setInviteChannel(null);
      window.history.replaceState({}, '', '/');
    } catch (err) {
      alert(err.message || 'Не удалось подписаться');
    } finally {
      setJoiningInvite(false);
    }
  }, [inviteChannel, chatsApi, loadChats, selectChat, setShowMobileChat]);

  return {
    inviteChannel,
    joiningInvite,
    setInviteChannel,
    joinInviteChannel,
  };
}
