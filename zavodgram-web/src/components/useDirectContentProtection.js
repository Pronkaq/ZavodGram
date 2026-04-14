import { useCallback, useEffect, useState } from 'react';

export function useDirectContentProtection({
  activeChat,
  acd,
  chatsApi,
  loadChats,
}) {
  const [shieldActivationNotice, setShieldActivationNotice] = useState('');
  const isDirectChat = acd?.type === 'PRIVATE' || acd?.type === 'SECRET';
  const protectedDirectChat = isDirectChat && !!acd?.contentProtectionEnabled;
  const incomingProtectionRequest = isDirectChat
    && !acd?.contentProtectionEnabled
    && !!acd?.contentProtectionRequestedByPeer;

  const toggleDirectContentProtection = useCallback(async () => {
    if (!activeChat || !isDirectChat) return;
    try {
      const willEnableProtection = !acd?.contentProtectionRequestedByMe;
      const updated = await chatsApi.update(activeChat, { contentProtectionEnabled: willEnableProtection });
      await loadChats();
      if (willEnableProtection) {
        setShieldActivationNotice(updated?.contentProtectionEnabled
          ? 'Щит контента включён'
          : 'Запрос на щит отправлен — ждём подтверждение второй стороны');
      }
    } catch (err) {
      alert(err.message || 'Не удалось переключить защиту контента');
    }
  }, [activeChat, isDirectChat, acd?.contentProtectionRequestedByMe, chatsApi, loadChats]);

  const acceptDirectContentProtectionRequest = useCallback(async () => {
    if (!activeChat || !incomingProtectionRequest) return;
    try {
      const updated = await chatsApi.update(activeChat, { contentProtectionEnabled: true });
      await loadChats();
      setShieldActivationNotice(updated?.contentProtectionEnabled
        ? 'Щит контента включён у обоих участников'
        : 'Запрос принят, ожидаем вторую сторону');
    } catch (err) {
      alert(err.message || 'Не удалось принять запрос');
    }
  }, [activeChat, incomingProtectionRequest, chatsApi, loadChats]);

  const declineDirectContentProtectionRequest = useCallback(async () => {
    if (!activeChat || !incomingProtectionRequest) return;
    try {
      await chatsApi.update(activeChat, { contentProtectionEnabled: false });
      await loadChats();
      setShieldActivationNotice('Запрос на щит отклонён');
    } catch (err) {
      alert(err.message || 'Не удалось отклонить запрос');
    }
  }, [activeChat, incomingProtectionRequest, chatsApi, loadChats]);

  useEffect(() => {
    if (!shieldActivationNotice) return undefined;
    const timer = setTimeout(() => setShieldActivationNotice(''), 2200);
    return () => clearTimeout(timer);
  }, [shieldActivationNotice]);

  useEffect(() => {
    if (!protectedDirectChat) return undefined;
    const onKeyDown = (event) => {
      const key = (event.key || '').toLowerCase();
      const isPrintScreen = key === 'printscreen';
      const isWinSnip = event.ctrlKey && event.shiftKey && key === 's';
      const isWinSnipMeta = event.metaKey && event.shiftKey && key === 's';
      const isMacAreaShot = event.metaKey && event.shiftKey && key === '4';
      const isMacWindowShot = event.metaKey && event.shiftKey && key === '3';
      if (isPrintScreen || isWinSnip || isWinSnipMeta || isMacAreaShot || isMacWindowShot) {
        event.preventDefault();
        event.stopPropagation();
        alert('Скриншоты в защищённом личном чате запрещены');
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [protectedDirectChat]);

  return {
    protectedDirectChat,
    incomingProtectionRequest,
    shieldActivationNotice,
    toggleDirectContentProtection,
    acceptDirectContentProtectionRequest,
    declineDirectContentProtectionRequest,
  };
}
