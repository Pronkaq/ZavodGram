import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { chatsApi, messagesApi } from '../api/client';
import { onSocket, ws, getSocket } from '../api/socket';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [notifications, setNotifications] = useState([]);
  const typingTimers = useRef({});
  const activeChatRef = useRef(activeChat);

  // Keep ref in sync
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);

  // ── Load chats ──
  const loadChats = useCallback(async () => {
    if (!user) return;
    try {
      const data = await chatsApi.list();
      setChats(data);
    } catch (e) {
      console.error('Failed to load chats', e);
    }
  }, [user]);

  useEffect(() => { loadChats(); }, [loadChats]);

  // ── Load messages for a chat ──
  const loadMessages = useCallback(async (chatId) => {
    try {
      const data = await messagesApi.list(chatId);
      setMessages((prev) => ({ ...prev, [chatId]: data.messages }));
      return data;
    } catch (e) {
      console.error('Failed to load messages', e);
    }
  }, []);

  // ── WebSocket listeners ──
  useEffect(() => {
    if (!user) return;

    const cleanups = [
      // New message from others
      onSocket('message:new', (msg) => {
        const chatId = msg.chatId;

        setMessages((prev) => {
          const existing = prev[chatId] || [];
          // Don't add duplicates
          if (existing.some((m) => m.id === msg.id)) return prev;
          return { ...prev, [chatId]: [...existing, msg] };
        });

        // Update chat list
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === chatId);
          if (idx === -1) {
            // New chat we don't have yet — reload chat list
            loadChats();
            return prev;
          }
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            messages: [msg],
            updatedAt: new Date().toISOString(),
            unreadCount: (updated[idx].unreadCount || 0) + (msg.fromId !== user.id ? 1 : 0),
          };
          return updated.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        });

        // If this chat's messages aren't loaded yet, load them
        setMessages((prev) => {
          if (!prev[chatId] || prev[chatId].length === 0) {
            loadMessages(chatId);
          }
          return prev;
        });
      }),

      // Own message sent confirmation
      onSocket('message:sent', ({ message }) => {
        setMessages((prev) => {
          const existing = prev[message.chatId] || [];
          if (existing.some((m) => m.id === message.id)) return prev;
          return { ...prev, [message.chatId]: [...existing, message] };
        });
      }),

      // Message edited
      onSocket('message:edited', (msg) => {
        setMessages((prev) => ({
          ...prev,
          [msg.chatId]: (prev[msg.chatId] || []).map((m) => (m.id === msg.id ? { ...m, text: msg.text, edited: true } : m)),
        }));
      }),

      // Message deleted
      onSocket('message:deleted', ({ messageId, chatId }) => {
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).filter((m) => m.id !== messageId),
        }));
      }),

      // Read status
      onSocket('message:status', ({ messageId, chatId, status }) => {
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).map((m) => (m.id === messageId ? { ...m, status } : m)),
        }));
      }),

      // Typing indicator
      onSocket('user:typing', ({ chatId, userId, typing }) => {
        if (userId === user.id) return;
        setTypingUsers((prev) => {
          const chatTyping = new Set(prev[chatId] || []);
          if (typing) chatTyping.add(userId);
          else chatTyping.delete(userId);
          return { ...prev, [chatId]: chatTyping };
        });
        const key = `${chatId}:${userId}`;
        clearTimeout(typingTimers.current[key]);
        typingTimers.current[key] = setTimeout(() => {
          setTypingUsers((prev) => {
            const s = new Set(prev[chatId] || []);
            s.delete(userId);
            return { ...prev, [chatId]: s };
          });
        }, 4000);
      }),

      // Online status
      onSocket('user:status', ({ userId, online }) => {
        setChats((prev) =>
          prev.map((c) => ({
            ...c,
            members: c.members?.map((m) =>
              m.userId === userId ? { ...m, user: { ...m.user, online } } : m
            ),
          }))
        );
      }),

      // Notification push
      onSocket('notification', (notif) => {
        setNotifications((prev) => [{ ...notif, id: Date.now(), time: new Date() }, ...prev].slice(0, 50));
      }),

      // Chat info updated (name, avatar, description)
      onSocket('chat:updated', (data) => {
        setChats((prev) => prev.map((c) => c.id === data.chatId ? {
          ...c,
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
        } : c));
      }),

      // Member added to chat
      onSocket('chat:member_added', (data) => {
        loadChats(); // Reload to get fresh member list
      }),

      // Member removed from chat
      onSocket('chat:member_removed', ({ chatId, userId: removedId }) => {
        if (removedId === user.id) {
          // We were removed — remove chat from list
          setChats((prev) => prev.filter((c) => c.id !== chatId));
          if (activeChat === chatId) setActiveChat(null);
        } else {
          loadChats();
        }
      }),

      // Member role changed
      onSocket('chat:member_updated', ({ chatId, userId: updatedId, role }) => {
        setChats((prev) => prev.map((c) => c.id === chatId ? {
          ...c,
          members: c.members?.map((m) => m.userId === updatedId ? { ...m, role } : m),
        } : c));
      }),
    ];

    return () => cleanups.forEach((c) => c());
  }, [user, loadChats, loadMessages]);

  // ── Actions ──
  const sendMessage = useCallback((chatId, text, replyToId, forwardedFromId) => {
    ws.sendMessage({ chatId, text, replyToId, forwardedFromId });
  }, []);

  const editMessage = useCallback((chatId, messageId, text) => {
    ws.editMessage({ messageId, chatId, text });
    setMessages((prev) => ({
      ...prev,
      [chatId]: (prev[chatId] || []).map((m) => (m.id === messageId ? { ...m, text, edited: true } : m)),
    }));
  }, []);

  const deleteMessage = useCallback((chatId, messageId) => {
    ws.deleteMessage({ messageId, chatId });
    setMessages((prev) => ({
      ...prev,
      [chatId]: (prev[chatId] || []).filter((m) => m.id !== messageId),
    }));
  }, []);

  const markRead = useCallback((chatId, messageId) => {
    ws.markRead({ chatId, messageId });
    setChats((prev) => prev.map((c) => (c.id === chatId ? { ...c, unreadCount: 0 } : c)));
  }, []);

  const startTyping = useCallback((chatId) => {
    ws.startTyping(chatId);
  }, []);

  const selectChat = useCallback((chatId) => {
    setActiveChat(chatId);
    if (chatId && !messages[chatId]) loadMessages(chatId);
    if (chatId) {
      // Mark as read after short delay
      setTimeout(() => {
        setChats((prev) => {
          const chat = prev.find((c) => c.id === chatId);
          if (chat?.unreadCount > 0) {
            markRead(chatId, 'latest');
          }
          return prev;
        });
      }, 500);
    }
  }, [messages, loadMessages, markRead]);

  return (
    <ChatContext.Provider value={{
      chats, activeChat, messages, typingUsers, notifications,
      setChats, setNotifications,
      loadChats, loadMessages, selectChat,
      sendMessage, editMessage, deleteMessage, markRead, startTyping,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be inside ChatProvider');
  return ctx;
}
