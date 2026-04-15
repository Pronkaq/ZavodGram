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
    && !!acd?.contentProtectionRequestedByPeer
    && !acd?.contentProtectionRequestedByMe;
  const incomingRequestType = acd?.contentProtectionEnabled ? 'DISABLE' : 'ENABLE';

  const toggleDirectContentProtection = useCallback(async () => {
    if (!activeChat || !isDirectChat) return;
    try {
      const willRequestEnable = !acd?.contentProtectionEnabled;
      const nextVote = acd?.contentProtectionEnabled
        ? !!acd?.contentProtectionRequestedByMe
        : !acd?.contentProtectionRequestedByMe;
      const updated = await chatsApi.update(activeChat, { contentProtectionEnabled: nextVote });
      await loadChats();
      if (willRequestEnable && nextVote) {
        setShieldActivationNotice(updated?.contentProtectionEnabled
          ? 'Щит контента включён'
          : 'Запрос на щит отправлен — ждём подтверждение второй стороны');
      } else if (!willRequestEnable && !nextVote) {
        setShieldActivationNotice(updated?.contentProtectionEnabled
          ? 'Запрос на отключение отправлен — ждём подтверждение второй стороны'
          : 'Щит контента отключён');
      } else if (!nextVote) {
        setShieldActivationNotice('Запрос на включение щита отменён');
      } else {
        setShieldActivationNotice('Запрос на отключение щита отменён');
      }
    } catch (err) {
      alert(err.message || 'Не удалось переключить защиту контента');
    }
  }, [activeChat, isDirectChat, acd?.contentProtectionEnabled, acd?.contentProtectionRequestedByMe, chatsApi, loadChats]);

  const acceptDirectContentProtectionRequest = useCallback(async () => {
    if (!activeChat || !incomingProtectionRequest) return;
    try {
      const nextVote = incomingRequestType === 'ENABLE';
      const updated = await chatsApi.update(activeChat, { contentProtectionEnabled: nextVote });
      await loadChats();
      setShieldActivationNotice(incomingRequestType === 'ENABLE'
        ? (updated?.contentProtectionEnabled ? 'Щит контента включён у обоих участников' : 'Запрос принят')
        : (updated?.contentProtectionEnabled ? 'Отключение отменено' : 'Щит контента отключён у обоих участников'));
    } catch (err) {
      alert(err.message || 'Не удалось принять запрос');
    }
  }, [activeChat, incomingProtectionRequest, incomingRequestType, chatsApi, loadChats]);

  const declineDirectContentProtectionRequest = useCallback(async () => {
    if (!activeChat || !incomingProtectionRequest) return;
    try {
      const nextVote = incomingRequestType !== 'ENABLE';
      await chatsApi.update(activeChat, { contentProtectionEnabled: nextVote });
      await loadChats();
      setShieldActivationNotice(incomingRequestType === 'ENABLE'
        ? 'Запрос на щит отклонён'
        : 'Запрос на отключение щита отклонён');
    } catch (err) {
      alert(err.message || 'Не удалось отклонить запрос');
    }
  }, [activeChat, incomingProtectionRequest, incomingRequestType, chatsApi, loadChats]);

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
    incomingRequestType,
    shieldActivationNotice,
    toggleDirectContentProtection,
    acceptDirectContentProtectionRequest,
    declineDirectContentProtectionRequest,
  };
}
