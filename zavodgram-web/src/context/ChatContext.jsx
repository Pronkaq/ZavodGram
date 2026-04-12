import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { chatsApi, messagesApi } from '../api/client';
import { onSocket, ws } from '../api/socket';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);

const topicKey = (chatId, topicId) => (topicId ? `${chatId}::${topicId}` : chatId);

const mergeMessagesUnique = (existing = [], incoming = []) => {
  const byId = new Map();
  [...existing, ...incoming].forEach((msg) => {
    if (!msg?.id) return;
    byId.set(msg.id, msg);
  });
  return Array.from(byId.values()).sort((a, b) => {
    const at = new Date(a.createdAt || 0).getTime();
    const bt = new Date(b.createdAt || 0).getTime();
    if (at === bt) return String(a.id).localeCompare(String(b.id));
    return at - bt;
  });
};

export function ChatProvider({ children }) {
  const { user } = useAuth();
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState({});
  const [messagePaging, setMessagePaging] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [notifications, setNotifications] = useState([]);
  const typingTimers = useRef({});
  const loadChatsTimerRef = useRef(null);
  const messagesRef = useRef(messages);
  const messagePagingRef = useRef(messagePaging);
  const messageLoadMetaRef = useRef({});
  const MESSAGES_CACHE_TTL_MS = 20_000;

  // Keep refs in sync
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { messagePagingRef.current = messagePaging; }, [messagePaging]);

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

  const loadChatDetails = useCallback(async (chatId) => {
    if (!chatId) return null;
    try {
      const details = await chatsApi.get(chatId);
      setChats((prev) => {
        const existingIndex = prev.findIndex((c) => c.id === chatId);
        if (existingIndex === -1) return [...prev, details];
        return prev.map((c) => (c.id === chatId ? { ...c, ...details } : c));
      });
      return details;
    } catch (e) {
      console.error('Failed to load chat details', e);
      return null;
    }
  }, []);

  const scheduleLoadChats = useCallback((delayMs = 300) => {
    clearTimeout(loadChatsTimerRef.current);
    loadChatsTimerRef.current = setTimeout(() => {
      loadChats();
    }, delayMs);
  }, [loadChats]);

  useEffect(() => { loadChats(); }, [loadChats]);
  useEffect(() => () => clearTimeout(loadChatsTimerRef.current), []);

  // ── Load messages for a chat ──
  const loadMessages = useCallback(async (chatId, topicId, options = {}) => {
    const key = topicKey(chatId, topicId);
    const now = Date.now();
    const force = options?.force === true;
    const meta = messageLoadMetaRef.current[key];
    const cachedMessages = messagesRef.current[key];

    if (!force && meta?.loadedAt && (now - meta.loadedAt) < MESSAGES_CACHE_TTL_MS && Array.isArray(cachedMessages)) {
      if (!meta?.refreshing) {
        messageLoadMetaRef.current[key] = { ...(meta || {}), refreshing: true };
        messagesApi.list(chatId, undefined, topicId)
          .then((data) => {
            setMessages((prev) => ({
              ...prev,
              [key]: mergeMessagesUnique(prev[key], data.messages || []),
            }));
            setMessagePaging((prev) => ({
              ...prev,
              [key]: {
                hasMore: !!data.hasMore,
                nextCursor: data.nextCursor || null,
                loadingMore: false,
              },
            }));
            messageLoadMetaRef.current[key] = {
              ...(messageLoadMetaRef.current[key] || {}),
              loadedAt: Date.now(),
              hasMore: data.hasMore,
              nextCursor: data.nextCursor,
            };
          })
          .catch((e) => console.error('Failed to refresh cached messages', e))
          .finally(() => {
            const current = messageLoadMetaRef.current[key] || {};
            delete current.refreshing;
            messageLoadMetaRef.current[key] = current;
          });
      }
      return {
        messages: cachedMessages,
        hasMore: meta.hasMore ?? false,
        nextCursor: meta.nextCursor ?? null,
        cached: true,
      };
    }

    if (!force && meta?.pending) return meta.pending;

    const pending = messagesApi.list(chatId, undefined, topicId)
      .then((data) => {
        setMessages((prev) => ({
          ...prev,
          [key]: mergeMessagesUnique(prev[key], data.messages || []),
        }));
        setMessagePaging((prev) => ({
          ...prev,
          [key]: {
            hasMore: !!data.hasMore,
            nextCursor: data.nextCursor || null,
            loadingMore: false,
          },
        }));
        messageLoadMetaRef.current[key] = {
          loadedAt: Date.now(),
          hasMore: data.hasMore,
          nextCursor: data.nextCursor,
        };
        return data;
      })
      .catch((e) => {
        console.error('Failed to load messages', e);
        throw e;
      })
      .finally(() => {
        if (messageLoadMetaRef.current[key]?.pending === pending) {
          delete messageLoadMetaRef.current[key].pending;
        }
      });

    messageLoadMetaRef.current[key] = { ...(meta || {}), pending };
    return pending;
  }, []);

  const loadMoreMessages = useCallback(async (chatId, topicId) => {
    const key = topicKey(chatId, topicId);
    const paging = messagePagingRef.current[key];
    if (!paging?.hasMore || !paging?.nextCursor || paging?.loadingMore) return null;

    const meta = messageLoadMetaRef.current[key];
    if (meta?.pendingMore) return meta.pendingMore;

    setMessagePaging((prev) => ({
      ...prev,
      [key]: { ...(prev[key] || {}), loadingMore: true },
    }));

    const pendingMore = messagesApi.list(chatId, paging.nextCursor, topicId)
      .then((data) => {
        setMessages((prev) => {
          const existing = prev[key] || [];
          const knownIds = new Set(existing.map((m) => m.id));
          const older = (data.messages || []).filter((m) => !knownIds.has(m.id));
          return { ...prev, [key]: [...older, ...existing] };
        });
        setMessagePaging((prev) => ({
          ...prev,
          [key]: {
            hasMore: !!data.hasMore,
            nextCursor: data.nextCursor || null,
            loadingMore: false,
          },
        }));
        messageLoadMetaRef.current[key] = {
          ...(messageLoadMetaRef.current[key] || {}),
          loadedAt: Date.now(),
          hasMore: data.hasMore,
          nextCursor: data.nextCursor,
        };
        return data;
      })
      .catch((e) => {
        setMessagePaging((prev) => ({
          ...prev,
          [key]: { ...(prev[key] || {}), loadingMore: false },
        }));
        console.error('Failed to load older messages', e);
        throw e;
      })
      .finally(() => {
        if (messageLoadMetaRef.current[key]?.pendingMore === pendingMore) {
          delete messageLoadMetaRef.current[key].pendingMore;
        }
      });

    messageLoadMetaRef.current[key] = { ...(meta || {}), pendingMore };
    return pendingMore;
  }, []);

  // ── WebSocket listeners ──
  useEffect(() => {
    if (!user) return;

    const cleanups = [
      // New message from others
      onSocket('message:new', (msg) => {
        const chatId = msg.chatId;

        setMessages((prev) => {
          const baseKey = topicKey(chatId);
          const specificKey = topicKey(chatId, msg.topicId);
          const next = { ...prev };
          const pushUnique = (k) => {
            const existing = next[k] || [];
            if (!existing.some((m) => m.id === msg.id)) next[k] = [...existing, msg];
          };
          pushUnique(baseKey);
          if (msg.topicId) pushUnique(specificKey);
          return next;
        });

        // Update chat list
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === chatId);
          if (idx === -1) {
            // New chat we don't have yet — reload chat list
            scheduleLoadChats(100);
            return prev;
          }
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lastMessagePreview: msg.text || ((msg.media?.length || 0) > 0 ? '[медиа]' : ''),
            lastMessageAt: msg.createdAt || new Date().toISOString(),
            lastMessageFromId: msg.fromId || null,
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
          const baseKey = topicKey(message.chatId);
          const specificKey = topicKey(message.chatId, message.topicId);
          const next = { ...prev };
          const pushUnique = (k) => {
            const existing = next[k] || [];
            if (!existing.some((m) => m.id === message.id)) next[k] = [...existing, message];
          };
          pushUnique(baseKey);
          if (message.topicId) pushUnique(specificKey);
          return next;
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

      // Message reactions updated
      onSocket('message:reaction', ({ messageId, chatId, reactions }) => {
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).map((m) => (m.id === messageId ? { ...m, reactions } : m)),
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
            ...(c.peer?.id === userId ? { peer: { ...c.peer, online } } : {}),
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
          ...(data.channelSlug !== undefined ? { channelSlug: data.channelSlug } : {}),
          ...(data.contentProtectionEnabled !== undefined ? { contentProtectionEnabled: data.contentProtectionEnabled } : {}),
        } : c));
      }),

      // Member added to chat
      onSocket('chat:member_added', () => {
        scheduleLoadChats(); // Reload to get fresh member list
      }),

      // Member removed from chat
      onSocket('chat:member_removed', ({ chatId, userId: removedId }) => {
        if (removedId === user.id) {
          // We were removed — remove chat from list
          setChats((prev) => prev.filter((c) => c.id !== chatId));
          if (activeChat === chatId) setActiveChat(null);
        } else {
          scheduleLoadChats();
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
  }, [user, loadMessages, scheduleLoadChats]);

  // ── Actions ──
  const sendMessage = useCallback((chatId, text, replyToId, forwardedFromId, options = {}) => {
    ws.sendMessage({ chatId, text, replyToId, forwardedFromId, ...options });
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
    if (chatId) {
      const chat = chats.find((c) => c.id === chatId);
      if (!chat?.members || chat.members.length === 0) {
        loadChatDetails(chatId);
      }
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
  }, [chats, loadChatDetails, markRead]);

  return (
    <ChatContext.Provider value={{
      chats, activeChat, messages, typingUsers, notifications,
      messagePaging,
      setChats, setNotifications,
      loadChats, loadChatDetails, loadMessages, loadMoreMessages, selectChat,
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
