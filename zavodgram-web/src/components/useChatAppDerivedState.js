import { useMemo, useCallback } from 'react';
import { getChatName, getOtherUser } from '../utils/helpers.jsx';

const VIRTUAL_THRESHOLD = 80;

export function useChatAppDerivedState({
  chats,
  activeChat,
  activeTopicId,
  messages,
  messagePaging,
  search,
  msgSearch,
  userId,
}) {
  const acd = useMemo(() => chats.find((c) => c.id === activeChat), [chats, activeChat]);

  const topicMessageKey = useMemo(
    () => (activeTopicId ? `${activeChat}::${activeTopicId}` : activeChat),
    [activeChat, activeTopicId],
  );

  const cms = useMemo(() => messages[topicMessageKey] || [], [messages, topicMessageKey]);

  const paging = useMemo(
    () => messagePaging[topicMessageKey] || { hasMore: false, loadingMore: false },
    [messagePaging, topicMessageKey],
  );

  const isActiveChannel = acd?.type === 'CHANNEL';
  const shouldVirtualize = !isActiveChannel && cms.length > VIRTUAL_THRESHOLD;

  const filteredChats = useMemo(() => chats.filter((c) => {
    if (!search) return true;
    return getChatName(c, userId).toLowerCase().includes(search.toLowerCase());
  }), [chats, search, userId]);

  const getAvatarSourceForChat = useCallback((chat) => {
    const isDirect = chat?.type === 'PRIVATE' || chat?.type === 'SECRET';
    if (!isDirect) return chat?.avatar;
    const other = getOtherUser(chat, userId);
    return other?.avatar || chat?.avatar;
  }, [userId]);

  const searchResults = useMemo(() => {
    if (!msgSearch.trim()) return [];
    return cms
      .filter((m) => m.text?.toLowerCase().includes(msgSearch.toLowerCase()))
      .map((m) => m.id);
  }, [msgSearch, cms]);

  return {
    acd,
    topicMessageKey,
    cms,
    paging,
    shouldVirtualize,
    filteredChats,
    getAvatarSourceForChat,
    searchResults,
  };
}
