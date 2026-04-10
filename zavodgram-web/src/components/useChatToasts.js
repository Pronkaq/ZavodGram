import { useCallback, useEffect, useState } from 'react';

export function useChatToasts(notifications) {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    if (notifications.length === 0) return;
    const latest = notifications[0];
    setToasts((prev) => {
      if (prev.some((toast) => toast.id === latest.id)) return prev;
      return [latest, ...prev].slice(0, 3);
    });
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== latest.id));
    }, 4000);
    return () => clearTimeout(timer);
  }, [notifications]);

  const dismissToast = useCallback((toastId) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== toastId));
  }, []);

  return { toasts, dismissToast };
}
