import { useCallback, useEffect } from 'react';

export function useChatTopicFlow({
  chatsApi,
  activeChat,
  acd,
  activeTopicId,
  setTopicsLoading,
  setChatTopics,
  setActiveTopicId,
  loadMessages,
}) {
  const loadTopics = useCallback(async (chatId) => {
    if (!chatId) return;
    setTopicsLoading(true);
    try {
      const data = await chatsApi.listTopics(chatId);
      setChatTopics(data);
      if (data.length > 0) {
        setActiveTopicId((prev) => (prev && data.some((t) => t.id === prev) ? prev : data[0].id));
      } else {
        setActiveTopicId(null);
      }
    } catch (err) {
      console.error(err);
      setChatTopics([]);
      setActiveTopicId(null);
    } finally {
      setTopicsLoading(false);
    }
  }, [chatsApi, setTopicsLoading, setChatTopics, setActiveTopicId]);

  useEffect(() => {
    if (!activeChat || acd?.type !== 'GROUP' || !acd?.topicsEnabled) {
      setChatTopics([]);
      setActiveTopicId(null);
      return;
    }
    loadTopics(activeChat);
  }, [activeChat, acd?.type, acd?.topicsEnabled, loadTopics, setChatTopics, setActiveTopicId]);

  useEffect(() => {
    if (!activeChat) return;
    if (acd?.type === 'GROUP' && acd?.topicsEnabled) {
      if (activeTopicId) loadMessages(activeChat, activeTopicId);
      return;
    }
    loadMessages(activeChat);
  }, [activeChat, activeTopicId, acd?.type, acd?.topicsEnabled, loadMessages]);

  return { loadTopics };
}
