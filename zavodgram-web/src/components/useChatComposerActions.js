import { useCallback } from 'react';
import { sanitizeRichHtml, richTextToPlain } from './chatRichText';

export function useChatComposerActions({
  input,
  pendingMedia,
  activeChat,
  activeTopicId,
  acd,
  userId,
  editingMsg,
  replyTo,
  channelPostCommentsEnabled,
  typingTimer,
  composerRef,
  setEditingMsg,
  setReplyTo,
  setChannelPostCommentsEnabled,
  setInput,
  setComposerToolbar,
  setPendingMedia,
  setMediaComposerMenu,
  setAttachMenu,
  loadMessages,
  loadChats,
  sendMessage,
  editMessage,
  startTyping,
  mediaApi,
  messagesApi,
}) {
  const enqueuePendingMedia = useCallback((fileList) => {
    const files = Array.from(fileList || []).filter((f) => f instanceof File);
    if (!files.length) return;
    setPendingMedia((prev) => ([
      ...prev,
      ...files.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        file,
        spoiler: false,
        previewUrl: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : '',
      })),
    ]));
  }, [setPendingMedia]);

  const handleSend = useCallback(async () => {
    const text = sanitizeRichHtml(input);
    const plainText = richTextToPlain(text);
    if (!plainText && pendingMedia.length === 0) return;
    if (!activeChat) return;
    if (acd?.type === 'GROUP' && acd?.topicsEnabled && !activeTopicId) return;
    const roleInChat = acd?.myRole || acd?.members?.find(m => m.userId === userId)?.role || 'MEMBER';
    if (acd?.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(roleInChat)) return;
    if (editingMsg) {
      editMessage(activeChat, editingMsg.id, text);
      setEditingMsg(null);
    } else {
      const options = {
        ...((acd?.type === 'CHANNEL' && !replyTo) ? { commentsEnabled: channelPostCommentsEnabled } : {}),
        ...((acd?.type === 'GROUP' && acd?.topicsEnabled) ? { topicId: activeTopicId } : {}),
      };
      let mediaIds = [];
      if (pendingMedia.length > 0) {
        const uploaded = await Promise.all(pendingMedia.map(async (item) => mediaApi.upload(item.file)));
        mediaIds = uploaded.map((item) => item.id);
      }
      if (mediaIds.length > 0) {
        await messagesApi.send(activeChat, { text: plainText ? text : undefined, mediaIds, replyToId: replyTo?.id, ...options });
        await loadMessages(activeChat, acd?.type === 'GROUP' && acd?.topicsEnabled ? activeTopicId : undefined);
        await loadChats();
      } else {
        sendMessage(activeChat, text, replyTo?.id, null, options);
      }
      setReplyTo(null);
      if (acd?.type === 'CHANNEL') setChannelPostCommentsEnabled(true);
    }
    setInput('');
    if (composerRef.current) composerRef.current.innerHTML = '';
    setComposerToolbar(null);
    pendingMedia.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    setPendingMedia([]);
    setMediaComposerMenu(false);
  }, [input, pendingMedia, activeChat, acd, activeTopicId, userId, editingMsg, editMessage, setEditingMsg, replyTo, channelPostCommentsEnabled, mediaApi, messagesApi, loadMessages, loadChats, sendMessage, setReplyTo, setChannelPostCommentsEnabled, setInput, composerRef, setComposerToolbar, setPendingMedia, setMediaComposerMenu]);

  const handleTyping = useCallback(() => {
    if (!activeChat) return;
    if (acd?.type === 'GROUP' && acd?.topicsEnabled && !activeTopicId) return;
    const roleInChat = acd?.myRole || acd?.members?.find(m => m.userId === userId)?.role || 'MEMBER';
    if (acd?.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(roleInChat)) return;
    clearTimeout(typingTimer.current);
    startTyping(activeChat);
    typingTimer.current = setTimeout(() => {}, 3000);
  }, [activeChat, acd, activeTopicId, userId, typingTimer, startTyping]);

  const handleFileUpload = useCallback((e) => {
    const files = e.target.files;
    if (!files?.length || !activeChat) return;
    const roleInChat = acd?.myRole || acd?.members?.find(m => m.userId === userId)?.role || 'MEMBER';
    if (acd?.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(roleInChat)) return;
    enqueuePendingMedia(files);
    e.target.value = '';
    setAttachMenu(false);
  }, [activeChat, acd, userId, enqueuePendingMedia, setAttachMenu]);

  return {
    enqueuePendingMedia,
    handleSend,
    handleTyping,
    handleFileUpload,
  };
}
