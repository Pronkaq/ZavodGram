import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { chatsApi, messagesApi } from '../api/client';
import { onSocket, ws, joinChatRoom, leaveChatRoom, isSocketConnected, getSocket } from '../api/socket';
import { useAuth } from './AuthContext';

const ChatContext = createContext(null);
const SAFE_MODE_PLACEHOLDER = 'Сообщение недоступно: отправлено во время safe mode.';
const MESSAGES_CACHE_TTL_MS = 20_000;

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

const deriveMessagePreview = (msg) => {
  if (!msg) return '';
  if (msg.protectedBySafeMode) return SAFE_MODE_PLACEHOLDER;
  if (msg.text) return msg.text;
  return (msg.media?.length || 0) > 0 ? '[медиа]' : '';
};

export function ChatProvider({ children }) {
  const { user } = useAuth();

  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState({});
  const [messagePaging, setMessagePaging] = useState({});
  const [typingUsers, setTypingUsers] = useState({});
  const [notifications, setNotifications] = useState([]);
  const [connected, setConnected] = useState(isSocketConnected());

  // ── Refs — всегда актуальные значения без попадания в deps ──
  const chatsRef = useRef(chats);
  const activeChatRef = useRef(activeChat);
  const messagesRef = useRef(messages);
  const messagePagingRef = useRef(messagePaging);
  const messageLoadMetaRef = useRef({});
  const typingTimers = useRef({});
  const loadChatsTimerRef = useRef(null);
  const userRef = useRef(user);

  useEffect(() => { chatsRef.current = chats; }, [chats]);
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { messagePagingRef.current = messagePaging; }, [messagePaging]);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Helpers ──
  const upsertChat = useCallback((chatId, patchFn) => {
    setChats((prev) => {
      const idx = prev.findIndex((c) => c.id === chatId);
      if (idx === -1) return prev;
      const updated = [...prev];
      updated[idx] = patchFn(updated[idx]);
      // Сортируем по дате последнего сообщения — как в Telegram
      return updated.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    });
  }, []);

  // ── Load chats ──
  const loadChats = useCallback(async () => {
    if (!userRef.current) return;
    try {
      const data = await chatsApi.list();
      setChats(data);
      // После загрузки — зайти во все комнаты (нужно при реконнекте)
      data.forEach((c) => joinChatRoom(c.id));
    } catch (e) {
      console.error('Failed to load chats', e);
    }
  }, []); // нет зависимостей — userRef вместо user

  const scheduleLoadChats = useCallback((delayMs = 300) => {
    clearTimeout(loadChatsTimerRef.current);
    loadChatsTimerRef.current = setTimeout(loadChats, delayMs);
  }, [loadChats]);

  const loadChatDetails = useCallback(async (chatId) => {
    if (!chatId) return null;
    try {
      const details = await chatsApi.get(chatId);
      setChats((prev) => {
        const idx = prev.findIndex((c) => c.id === chatId);
        if (idx === -1) return [...prev, details];
        const updated = [...prev];
        updated[idx] = { ...updated[idx], ...details };
        return updated;
      });
      return details;
    } catch (e) {
      console.error('Failed to load chat details', e);
      return null;
    }
  }, []);

  // ── Load messages ──
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
              [key]: { hasMore: !!data.hasMore, nextCursor: data.nextCursor || null, loadingMore: false },
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
            const cur = messageLoadMetaRef.current[key] || {};
            delete cur.refreshing;
            messageLoadMetaRef.current[key] = cur;
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
          [key]: { hasMore: !!data.hasMore, nextCursor: data.nextCursor || null, loadingMore: false },
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
  }, []); // нет зависимостей

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
          [key]: { hasMore: !!data.hasMore, nextCursor: data.nextCursor || null, loadingMore: false },
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

  // ── Initial load ──
  useEffect(() => {
    if (user) loadChats();
    return () => clearTimeout(loadChatsTimerRef.current);
  }, [user, loadChats]);

  // ── Следим за статусом соединения + синхронизация после реконнекта ──
  useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    if (!socket) return;

    const onConnect = () => {
      setConnected(true);
      // Реконнект — принудительно обновляем чаты и сообщения активного чата,
      // т.к. пока соединение было разорвано могли прийти новые сообщения
      loadChats();
      const activeChatId = activeChatRef.current;
      if (activeChatId) {
        loadMessages(activeChatId, undefined, { force: true });
      }
    };

    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [user, loadChats, loadMessages]);

  // ── WebSocket event listeners ──
  // ВАЖНО: deps = [user] только. Всё остальное читается через refs.
  // Это гарантирует что эффект не пересоздаётся при каждом изменении
  // chats/messages — иначе слушатели отписываются и кратко пропускают события.
  useEffect(() => {
    if (!user) return;

    const cleanups = [

      // ── Новое сообщение ──
      onSocket('message:new', (msg) => {
        const { chatId } = msg;
        const currentUser = userRef.current;

        // Добавляем в список сообщений
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

        // Обновляем превью в списке чатов
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === chatId);
          if (idx === -1) {
            // Чат нам незнаком — скорее всего нас только что добавили
            scheduleLoadChats(100);
            return prev;
          }
          const updated = [...prev];
          const isOwn = msg.fromId === currentUser?.id;
          updated[idx] = {
            ...updated[idx],
            lastMessagePreview: deriveMessagePreview(msg),
            lastMessageAt: msg.createdAt || new Date().toISOString(),
            lastMessageFromId: msg.fromId || null,
            updatedAt: msg.createdAt || new Date().toISOString(),
            unreadCount: isOwn ? (updated[idx].unreadCount || 0) : (updated[idx].unreadCount || 0) + 1,
          };
          // Поднимаем чат в топ — как в Telegram
          return updated.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        });
      }),

      // ── Подтверждение своего сообщения ──
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

        // Обновляем превью списка чатов для своего сообщения
        setChats((prev) => {
          const idx = prev.findIndex((c) => c.id === message.chatId);
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            lastMessagePreview: deriveMessagePreview(message),
            lastMessageAt: message.createdAt || new Date().toISOString(),
            lastMessageFromId: message.fromId || null,
            updatedAt: message.createdAt || new Date().toISOString(),
          };
          return updated.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
        });
      }),

      // ── Редактирование ──
      onSocket('message:edited', (msg) => {
        setMessages((prev) => {
          const key = topicKey(msg.chatId);
          return {
            ...prev,
            [key]: (prev[key] || []).map((m) =>
              m.id === msg.id ? { ...m, text: msg.text, edited: true } : m
            ),
          };
        });
      }),

      // ── Удаление ──
      onSocket('message:deleted', ({ messageId, chatId }) => {
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).filter((m) => m.id !== messageId),
        }));
      }),

      // ── Статус прочтения ──
      onSocket('message:status', ({ messageId, chatId, status }) => {
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).map((m) =>
            m.id === messageId ? { ...m, status } : m
          ),
        }));
      }),

      // ── Реакции ──
      onSocket('message:reaction', ({ messageId, chatId, reactions }) => {
        setMessages((prev) => ({
          ...prev,
          [chatId]: (prev[chatId] || []).map((m) =>
            m.id === messageId ? { ...m, reactions } : m
          ),
        }));
      }),

      // ── Печатает... ──
      onSocket('user:typing', ({ chatId, userId, typing }) => {
        if (userId === userRef.current?.id) return;
        setTypingUsers((prev) => {
          const s = new Set(prev[chatId] || []);
          typing ? s.add(userId) : s.delete(userId);
          return { ...prev, [chatId]: s };
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

      // ── Онлайн-статус ──
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

      // ── Push-уведомление ──
      onSocket('notification', (notif) => {
        setNotifications((prev) =>
          [{ ...notif, id: Date.now(), time: new Date() }, ...prev].slice(0, 50)
        );
      }),

      // ── Чат обновлён (название, аватар, настройки) ──
      onSocket('chat:updated', (data) => {
        // Уведомление о запросе контент-протекции — читаем chats через ref
        if (
          data.contentProtectionRequestPending
          && data.contentProtectionRequestedByUserId
          && data.contentProtectionRequestedByUserId !== userRef.current?.id
        ) {
          const targetChat = chatsRef.current.find((c) => c.id === data.chatId);
          if (targetChat) {
            setNotifications((prev) => [{
              id: Date.now(),
              chatId: data.chatId,
              chatName: targetChat.name || targetChat.peer?.name || 'Личный чат',
              text: data.contentProtectionEnabled
                ? 'Собеседник запросил отключение щита контента. Подтвердите в чате.'
                : 'Собеседник запросил включение щита контента. Подтвердите в чате.',
              time: new Date(),
            }, ...prev].slice(0, 50));
          }
        }

        setChats((prev) => prev.map((c) => c.id !== data.chatId ? c : {
          ...c,
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
          ...(data.channelSlug !== undefined ? { channelSlug: data.channelSlug } : {}),
          ...(data.contentProtectionEnabled !== undefined ? { contentProtectionEnabled: data.contentProtectionEnabled } : {}),
          ...(data.contentProtectionRequestPending !== undefined ? {
            contentProtectionRequestedByMe: data.contentProtectionRequestedByUserId === userRef.current?.id
              ? !!data.contentProtectionRequestPending
              : (data.contentProtectionEnabled ? false : !!c.contentProtectionRequestedByMe),
            contentProtectionRequestedByPeer: data.contentProtectionRequestedByUserId !== userRef.current?.id
              ? !!data.contentProtectionRequestPending
              : (data.contentProtectionEnabled ? false : !!c.contentProtectionRequestedByPeer),
          } : {}),
        }));
      }),

      // ── Участник добавлен ──
      onSocket('chat:member_added', ({ chatId }) => {
        // Перезаходим в комнату на случай если это наш новый чат
        if (chatId) joinChatRoom(chatId);
        scheduleLoadChats();
      }),

      // ── Участник удалён ──
      onSocket('chat:member_removed', ({ chatId, userId: removedId }) => {
        if (removedId === userRef.current?.id) {
          leaveChatRoom(chatId);
          setChats((prev) => prev.filter((c) => c.id !== chatId));
          if (activeChatRef.current === chatId) setActiveChat(null);
        } else {
          scheduleLoadChats();
        }
      }),

      // ── Роль участника изменена ──
      onSocket('chat:member_updated', ({ chatId, userId: updatedId, role }) => {
        setChats((prev) => prev.map((c) => c.id !== chatId ? c : {
          ...c,
          members: c.members?.map((m) => m.userId === updatedId ? { ...m, role } : m),
        }));
      }),
    ];

    return () => cleanups.forEach((cleanup) => cleanup());
  }, [user, scheduleLoadChats]); // НЕ chats, НЕ messages, НЕ loadMessages

  // ── Actions ──
  const sendMessage = useCallback((chatId, text, replyToId, forwardedFromId, options = {}) => {
    ws.sendMessage({ chatId, text, replyToId, forwardedFromId, ...options });
  }, []);

  const editMessage = useCallback((chatId, messageId, text) => {
    ws.editMessage({ messageId, chatId, text });
    setMessages((prev) => ({
      ...prev,
      [chatId]: (prev[chatId] || []).map((m) =>
        m.id === messageId ? { ...m, text, edited: true } : m
      ),
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
    setChats((prev) => prev.map((c) => c.id === chatId ? { ...c, unreadCount: 0 } : c));
  }, []);

  const startTyping = useCallback((chatId) => {
    ws.startTyping(chatId);
  }, []);

  const selectChat = useCallback((chatId) => {
    setActiveChat(chatId);
    if (!chatId) return;

    // Зайти в комнату (на случай если ещё не зашли)
    joinChatRoom(chatId);

    const chat = chatsRef.current.find((c) => c.id === chatId);
    if (!chat?.members || chat.members.length === 0) {
      loadChatDetails(chatId);
    }

    setTimeout(() => {
      const currentChat = chatsRef.current.find((c) => c.id === chatId);
      if (currentChat?.unreadCount > 0) {
        markRead(chatId, 'latest');
      }
    }, 500);
  }, [loadChatDetails, markRead]); // chats убран — читаем через chatsRef

  return (
    <ChatContext.Provider value={{
      chats, activeChat, messages, typingUsers, notifications,
      messagePaging, connected,
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
