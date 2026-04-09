import { io } from 'socket.io-client';
import { getAccessToken } from './client';

let socket = null;
const listeners = new Map();

export function connectSocket() {
  const token = getAccessToken();
  if (!token) return null;

  if (socket) {
    if (!socket.connected) socket.connect();
    return socket;
  }

  socket = io(window.location.origin, {
    auth: (cb) => cb({ token: getAccessToken() }),
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('[WS] Connected');
    // Re-attach all listeners after reconnect
    listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => socket.on(event, cb));
    });
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('[WS] Error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    listeners.clear();
  }
}

export function getSocket() {
  return socket;
}

// ── Event helpers ──
export function onSocket(event, callback) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(callback);
  socket?.on(event, callback);

  // Return cleanup function
  return () => {
    listeners.get(event)?.delete(callback);
    socket?.off(event, callback);
  };
}

export function emitSocket(event, data) {
  socket?.emit(event, data);
}

// ── Typed emitters ──
export const ws = {
  sendMessage: (data) => emitSocket('message:send', data),
  editMessage: (data) => emitSocket('message:edit', data),
  deleteMessage: (data) => emitSocket('message:delete', data),
  markRead: (data) => emitSocket('message:read', data),
  reactMessage: (data) => emitSocket('message:react', data),
  startTyping: (chatId) => emitSocket('typing:start', { chatId }),
  joinChat: (chatId) => emitSocket('chat:join', { chatId }),
};
