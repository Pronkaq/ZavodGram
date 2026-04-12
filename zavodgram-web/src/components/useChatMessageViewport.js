import { useEffect, useCallback } from 'react';

export function useChatMessageViewport({
  activeChat,
  activeTopicId,
  acd,
  paging,
  loadMoreMessages,
  shouldVirtualize,
  cmsLength,
  searchResults,
  msgSearchIdx,
  endRef,
  messagesVirtuosoRef,
}) {
  useEffect(() => {
    if (searchResults.length > 0 && msgSearchIdx >= 0) {
      document
        .getElementById(`msg-${searchResults[msgSearchIdx]}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [msgSearchIdx, searchResults]);

  useEffect(() => {
    if (shouldVirtualize) {
      messagesVirtuosoRef.current?.scrollToIndex({
        index: Math.max(0, cmsLength - 1),
        align: 'end',
        behavior: 'smooth',
      });
      return;
    }
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [cmsLength, activeChat, shouldVirtualize, endRef, messagesVirtuosoRef]);

  const onMessagesScroll = useCallback((e) => {
    if (!activeChat || paging.loadingMore || !paging.hasMore) return;
    const el = e.currentTarget;
    if (el.scrollTop > 120) return;
    const topicId = (acd?.type === 'GROUP' && acd?.topicsEnabled) ? activeTopicId : undefined;
    loadMoreMessages(activeChat, topicId);
  }, [activeChat, paging.loadingMore, paging.hasMore, acd?.type, acd?.topicsEnabled, activeTopicId, loadMoreMessages]);

  const onMessagesViewportScroll = useCallback((e) => {
    onMessagesScroll(e);
  }, [onMessagesScroll]);

  return { onMessagesScroll, onMessagesViewportScroll };
}
