import { io } from 'socket.io-client';
import { getAccessToken } from './client';

let socket = null;

// Комнаты чатов которые нужно восстанавливать после реконнекта
const joinedChatRooms = new Set();

export function connectSocket() {
  const token = getAccessToken();
  if (!token) return null;

  // Уже подключён — просто вернуть
  if (socket?.connected) return socket;

  // Сокет есть но не подключён — переподключить
  if (socket) {
    socket.connect();
    return socket;
  }

  socket = io(window.location.origin, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: Infinity, // в проде не сдаёмся
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected', socket.id);

    // После реконнекта бэкенд создаёт новый сокет-объект —
    // все комнаты теряются. Перезаходим в каждую явно.
    joinedChatRooms.forEach((chatId) => {
      socket.emit('chat:join', { chatId });
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[WS] Connect error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  joinedChatRooms.clear();
}

export function getSocket() {
  return socket;
}

// Подписаться на комнату чата (с автовосстановлением после реконнекта)
export function joinChatRoom(chatId) {
  if (!chatId) return;
  joinedChatRooms.add(chatId);
  socket?.emit('chat:join', { chatId });
}

export function leaveChatRoom(chatId) {
  joinedChatRooms.delete(chatId);
}

// Подписка на событие. Возвращает функцию отписки.
// НЕ дублирует слушатели — socket.io сам хранит подписки,
// нам нужно только зарегистрировать один раз и снять при cleanup.
export function onSocket(event, callback) {
  socket?.on(event, callback);
  return () => socket?.off(event, callback);
}

export function emitSocket(event, data) {
  if (!socket?.connected) {
    console.warn(`[WS] emit '${event}' dropped — not connected`);
    return;
  }
  socket.emit(event, data);
}

// Статус соединения для UI
export function isSocketConnected() {
  return socket?.connected ?? false;
}

// Подписка на изменение статуса соединения
export function onConnectionChange(callback) {
  if (!socket) return () => {};
  socket.on('connect', () => callback(true));
  socket.on('disconnect', () => callback(false));
  return () => {
    socket?.off('connect', () => callback(true));
    socket?.off('disconnect', () => callback(false));
  };
}

// ── Typed emitters ──
export const ws = {
  sendMessage: (data) => emitSocket('message:send', data),
  editMessage: (data) => emitSocket('message:edit', data),
  deleteMessage: (data) => emitSocket('message:delete', data),
  markRead: (data) => emitSocket('message:read', data),
  reactMessage: (data) => emitSocket('message:react', data),
  startTyping: (chatId) => emitSocket('typing:start', { chatId }),
  joinChat: (chatId) => joinChatRoom(chatId),
};
