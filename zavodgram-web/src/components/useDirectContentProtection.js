import { useCallback, useEffect, useState } from 'react';

export function useDirectContentProtection({
  activeChat,
  acd,
  chatsApi,
  loadChats,
}) {
  const [shieldActivationNotice, setShieldActivationNotice] = useState('');
  const protectedDirectChat = (acd?.type === 'PRIVATE' || acd?.type === 'SECRET') && !!acd?.contentProtectionEnabled;

  const toggleDirectContentProtection = useCallback(async () => {
    const isDirect = acd?.type === 'PRIVATE' || acd?.type === 'SECRET';
    if (!activeChat || !isDirect) return;
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
  }, [activeChat, acd?.type, acd?.contentProtectionRequestedByMe, chatsApi, loadChats]);

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
    shieldActivationNotice,
    toggleDirectContentProtection,
  };
}
