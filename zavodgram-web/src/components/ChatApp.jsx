import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Virtuoso } from 'react-virtuoso';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { chatsApi, usersApi, mediaApi, messagesApi } from '../api/client';
import { ws } from '../api/socket';
import { Icons, typeColors } from './Icons';
import { ChatToasts } from './ChatToasts';
import { ChatSidebar } from './ChatSidebar';
import { ChatListPanel } from './ChatListPanel';
import { ChatNotificationsPanel } from './ChatNotificationsPanel';
import { ChatMessageContextMenu } from './ChatMessageContextMenu';
import { ChatReactionPicker } from './ChatReactionPicker';
import { ChatMessageSearchBar } from './ChatMessageSearchBar';
import { ChatTopicsBar } from './ChatTopicsBar';
import { ChannelInviteModal } from './ChannelInviteModal';
import { ChannelAttachmentsModal } from './ChannelAttachmentsModal';
import { PostCommentsModal } from './PostCommentsModal';
import { ChannelManageModal } from './ChannelManageModal';
import { ForwardMessageModal } from './ForwardMessageModal';
import { NewChatModal } from './NewChatModal';
import { ChannelInfoModal } from './ChannelInfoModal';
import { ChatMediaModal } from './ChatMediaModal';
import { AvatarFullscreenModal } from './AvatarFullscreenModal';
import { GroupSettingsModal } from './GroupSettingsModal';
import { MemberListModal } from './MemberListModal';
import { ChatAppGlobalStyles } from './ChatAppGlobalStyles';
import { ProfilePanel } from './ProfilePanel';
import { Av, MediaAttachment, mediaUrlById } from './chatUiParts';
import { formatTime, formatTimeShort, getChatName, getChatAvatar, getOtherUser, isOnline, getLastMessage } from '../utils/helpers.jsx';
import { useChatToasts } from './useChatToasts';
import { useChatAppDerivedState } from './useChatAppDerivedState';
import { useComposerFormatting } from './useComposerFormatting';
import { useChatTopicFlow } from './useChatTopicFlow';
import { useChatMessageViewport } from './useChatMessageViewport';
import { useChatComposerActions } from './useChatComposerActions';
import { useVoiceMessaging } from './useVoiceMessaging';

const tc = typeColors;

export default function ChatApp() {
  const { user, logout, updateUser } = useAuth();
  const { chats, activeChat, messages, typingUsers, notifications, setNotifications, loadChats, loadMessages, loadMoreMessages, messagePaging, selectChat, sendMessage, editMessage, deleteMessage, startTyping } = useChat();

  const [search, setSearch] = useState('');
  const [input, setInput] = useState('');
  const [contextMenu, setContextMenu] = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [forwardMsg, setForwardMsg] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [newChatModal, setNewChatModal] = useState(false);
  const [showMobileChat, setShowMobileChat] = useState(false);
  const [profilePanel, setProfilePanel] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [msgSearch, setMsgSearch] = useState('');
  const [msgSearchOpen, setMsgSearchOpen] = useState(false);
  const [msgSearchIdx, setMsgSearchIdx] = useState(-1);
  const [notifPanel, setNotifPanel] = useState(false);
  const [attachMenu, setAttachMenu] = useState(false);
  const [pendingMedia, setPendingMedia] = useState([]);
  const [mediaComposerMenu, setMediaComposerMenu] = useState(false);
  const [newChatSearch, setNewChatSearch] = useState('');
  const [newChatResults, setNewChatResults] = useState([]);
  const [settingsMode, setSettingsMode] = useState(false);
  const [settingsSubpage, setSettingsSubpage] = useState(null);
  const [tagEdit, setTagEdit] = useState('');
  const [nameEdit, setNameEdit] = useState('');
  const [bioEdit, setBioEdit] = useState('');
  const [settingsSaveState, setSettingsSaveState] = useState({ loading: false, error: '', ok: '' });
  const [newChatMode, setNewChatMode] = useState('search'); // search | GROUP | CHANNEL
  const [newChatType, setNewChatType] = useState('PRIVATE');
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [avatarView, setAvatarView] = useState(null);
  const [groupSettingsModal, setGroupSettingsModal] = useState(false);
  const [memberListModal, setMemberListModal] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');
  const [editTopicsEnabled, setEditTopicsEnabled] = useState(false);
  const [editContentProtection, setEditContentProtection] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState([]);
  const [channelInfoModal, setChannelInfoModal] = useState(false);
  const [channelSlugEdit, setChannelSlugEdit] = useState('');
  const [channelSlugError, setChannelSlugError] = useState('');
  const [channelManageModal, setChannelManageModal] = useState(false);
  const [channelManageTab, setChannelManageTab] = useState('main');
  const [bannedUsers, setBannedUsers] = useState([]);
  const [bansLoading, setBansLoading] = useState(false);
  const [attachmentsModal, setAttachmentsModal] = useState(false);
  const [reactionPicker, setReactionPicker] = useState(null);
  const [postCommentsModal, setPostCommentsModal] = useState(null);
  const [postCommentDraft, setPostCommentDraft] = useState('');
  const [postCommentReplyTo, setPostCommentReplyTo] = useState(null);
  const [channelPostCommentsEnabled, setChannelPostCommentsEnabled] = useState(true);
  const [voiceRecording, setVoiceRecording] = useState(false);
  const [voiceRecorderState, setVoiceRecorderState] = useState({ startedAt: 0, error: '' });
  const [recordingNowTs, setRecordingNowTs] = useState(Date.now());
  const [transcriptions, setTranscriptions] = useState({});
  const [transcriptionLoading, setTranscriptionLoading] = useState({});
  const [transcriptionAvailable, setTranscriptionAvailable] = useState(true);
  const [chatTopics, setChatTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(false);
  const [activeTopicId, setActiveTopicId] = useState(null);
  const [newTopicTitle, setNewTopicTitle] = useState('');
  const [topicError, setTopicError] = useState('');
  const [mediaModal, setMediaModal] = useState(null);
  const endRef = useRef(null);
  const messagesScrollRef = useRef(null);
  const messagesVirtuosoRef = useRef(null);
  const inpRef = useRef(null);
  const composerRef = useRef(null);
  const typingTimer = useRef(null);
  const fileRef = useRef(null);
  const mediaExtraRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const voiceChunksRef = useRef([]);

  const {
    acd,
    topicMessageKey,
    cms,
    paging,
    shouldVirtualize,
    filteredChats,
    getAvatarSourceForChat,
    searchResults,
  } = useChatAppDerivedState({
    chats,
    activeChat,
    activeTopicId,
    messages,
    messagePaging,
    search,
    msgSearch,
    userId: user.id,
  });

  const {
    composerToolbar,
    setComposerToolbar,
    refreshComposerSelection,
    applyComposerFormat,
    applyComposerLink,
    syncComposerInput,
  } = useComposerFormatting({
    composerRef,
    input,
    setInput,
    activeChat,
    activeTopicId,
    acd,
    userId: user.id,
    typingTimer,
    startTyping,
  });

  const { loadTopics } = useChatTopicFlow({
    chatsApi,
    activeChat,
    acd,
    activeTopicId,
    setTopicsLoading,
    setChatTopics,
    setActiveTopicId,
    loadMessages,
  });

  const openMediaModal = useCallback((payload) => {
    if (!payload?.src) return;
    setMediaModal(payload);
  }, []);

  useEffect(() => { if (editingMsg || replyTo) inpRef.current?.focus(); }, [editingMsg, replyTo]);
  useEffect(() => () => {
    mediaRecorderRef.current?.stop?.();
    mediaStreamRef.current?.getTracks?.().forEach((track) => track.stop());
  }, []);

  const { onMessagesScroll, onMessagesViewportScroll } = useChatMessageViewport({
    activeChat,
    activeTopicId,
    acd,
    paging,
    loadMoreMessages,
    shouldVirtualize,
    cmsLength: cms.length,
    searchResults,
    msgSearchIdx,
    endRef,
    messagesVirtuosoRef,
  });

  // ── Handlers ──
  const { enqueuePendingMedia, handleSend, handleTyping, handleFileUpload } = useChatComposerActions({
    input,
    pendingMedia,
    activeChat,
    activeTopicId,
    acd,
    userId: user.id,
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
  });

  const { handleVoiceRecordToggle, handleTranscribe } = useVoiceMessaging({
    activeChat,
    acd,
    userId: user.id,
    voiceRecording,
    transcriptionLoading,
    transcriptionAvailable,
    mediaRecorderRef,
    mediaStreamRef,
    voiceChunksRef,
    setVoiceRecorderState,
    setRecordingNowTs,
    setVoiceRecording,
    setTranscriptionLoading,
    setTranscriptions,
    setTranscriptionAvailable,
    mediaApi,
    messagesApi,
    loadMessages,
    loadChats,
  });

  const handleComposerPaste = useCallback((e) => {
    const files = Array.from(e.clipboardData?.items || [])
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    enqueuePendingMedia(files);
  }, [enqueuePendingMedia]);

  const removePendingMedia = useCallback((id) => {
    setPendingMedia((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  }, []);

  const togglePendingSpoiler = useCallback(() => {
    setPendingMedia((prev) => {
      if (!prev.length) return prev;
      const next = [...prev];
      next[0] = { ...next[0], spoiler: !next[0].spoiler };
      return next;
    });
  }, []);

  const openProfile = async (userId) => {
    if (userId === user.id) { setProfileData({ ...user, online: true }); }
    else { try { const data = await usersApi.getById(userId); setProfileData(data); } catch {} }
    setSettingsMode(false);
    setSettingsSubpage(null);
    setProfilePanel(userId);
  };

  const handleNewChat = async (otherUserId, type = 'PRIVATE') => {
    try {
      const chat = await chatsApi.create({ type, memberIds: [otherUserId] });
      await loadChats(); selectChat(chat.id); setShowMobileChat(true);
      setNewChatModal(false); setNewChatMode('search');
    } catch (err) { console.error(err); }
  };

  const openDirectChatWithUser = useCallback(async (targetUser) => {
    const targetId = targetUser?.id;
    if (!targetId || targetId === user.id) return;

    const existingDirect = chats.find((chat) => {
      if (chat.type !== 'PRIVATE' && chat.type !== 'SECRET') return false;
      if (chat.peer?.id) return chat.peer.id === targetId;
      const memberIds = new Set((chat.members || []).map((member) => member.userId));
      return memberIds.has(user.id) && memberIds.has(targetId);
    });

    if (existingDirect) {
      selectChat(existingDirect.id);
      setShowMobileChat(true);
      setPostCommentsModal(null);
      setPostCommentReplyTo(null);
      return;
    }

    try {
      const chat = await chatsApi.create({ type: 'PRIVATE', memberIds: [targetId] });
      await loadChats();
      selectChat(chat.id);
      setShowMobileChat(true);
      setPostCommentsModal(null);
      setPostCommentReplyTo(null);
    } catch (err) {
      console.error(err);
    }
  }, [chats, loadChats, selectChat, user.id]);

  const createGroupOrChannel = async () => {
    if (!groupName.trim()) return;
    try {
      const chat = await chatsApi.create({ type: newChatMode, name: groupName, description: groupDesc, memberIds: groupMembers.map(m => m.id) });
      await loadChats(); selectChat(chat.id); setShowMobileChat(true);
      setNewChatModal(false); setNewChatMode('search'); setGroupName(''); setGroupDesc(''); setGroupMembers([]);
    } catch (err) { console.error(err); }
  };

  const searchNewChat = async (q) => {
    setNewChatSearch(q);
    if (q.length < 2) { setNewChatResults([]); return; }
    try { setNewChatResults(await usersApi.search(q)); } catch {}
  };

  const handleMute = async (chatId) => {
    const chat = chats.find(c => c.id === chatId);
    try { await chatsApi.mute(chatId, !chat?.muted); loadChats(); } catch {}
  };

  const {
    protectedDirectChat,
    incomingProtectionRequest,
    incomingRequestType,
    shieldActivationNotice,
    toggleDirectContentProtection,
    acceptDirectContentProtectionRequest,
    declineDirectContentProtectionRequest,
  } = useDirectContentProtection({
    activeChat,
    acd,
    chatsApi,
    loadChats,
  });

  const doForward = (chatId) => {
    if (!forwardMsg) return;
    const targetChat = chats.find((c) => c.id === chatId);
    sendMessage(chatId, forwardMsg.text, null, forwardMsg.id, targetChat?.topicsEnabled && activeTopicId ? { topicId: activeTopicId } : {});
    setForwardMsg(null);
    selectChat(chatId);
    setShowMobileChat(true);
  };

  // ── Group management ──
  const {
    myRole,
    isOwnerOrAdmin,
    isOwner,
    isGroupOrChannel,
    openGroupSettings,
    saveGroupSettings,
    createTopic,
    handleGroupAvatarUpload,
    handleSetRole,
    handleKickMember,
    handleTransferOwnership,
    handleAddMember,
    searchAddMember,
  } = useGroupManagement({
    acd,
    userId: user.id,
    activeChat,
    editGroupName,
    editGroupDesc,
    editTopicsEnabled,
    editContentProtection,
    newTopicTitle,
    setEditGroupName,
    setEditGroupDesc,
    setEditTopicsEnabled,
    setEditContentProtection,
    setGroupSettingsModal,
    setNewTopicTitle,
    setTopicError,
    setActiveTopicId,
    setAddMemberSearch,
    setAddMemberResults,
    chatsApi,
    usersApi,
    mediaApi,
    loadChats,
    loadTopics,
  });

  const scrollToMsg = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = 'rgba(255,255,255,0.15)'; setTimeout(() => el.style.background = 'transparent', 1500); }
  };

  const ctx = (e, msg) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 220), msg }); };

  const typingText = useMemo(() => {
    if (!activeChat) return null;
    const t = typingUsers[activeChat];
    if (!t || t.size === 0) return null;
    const names = [...t].map(uid => acd?.members?.find(m => m.userId === uid)?.user?.name?.split(' ')[0] || 'Кто-то');
    return names.length === 1 ? `${names[0]} печатает...` : `${names.join(', ')} печатают...`;
  }, [typingUsers, activeChat, acd]);

  const { toasts, dismissToast } = useChatToasts(notifications);

  useEffect(() => {
    if (profilePanel || newChatModal || groupSettingsModal || memberListModal || forwardMsg || avatarView || channelInfoModal || channelManageModal || attachmentsModal) {
      setNotifPanel(false);
    }
  }, [profilePanel, newChatModal, groupSettingsModal, memberListModal, forwardMsg, avatarView, channelInfoModal, channelManageModal, attachmentsModal]);

  const openNotificationsPanel = useCallback(() => {
    setSidebarOpen(false);
    setProfilePanel(null);
    setSettingsMode(false);
    setNotifPanel(true);
  }, []);


  const {
    loadChannelBans,
    channelPublicLink,
    openChannelInfo,
    shareChannelLink,
    saveChannelSlug,
    openChannelManagement,
    saveChannelManagement,
    handleBanMember,
    handleUnbanMember,
  } = useChannelManagement({
    activeChat,
    acd,
    isOwnerOrAdmin,
    channelManageModal,
    channelSlugEdit,
    editGroupName,
    editGroupDesc,
    editContentProtection,
    setChannelSlugEdit,
    setChannelSlugError,
    setChannelInfoModal,
    setBansLoading,
    setBannedUsers,
    setEditGroupName,
    setEditGroupDesc,
    setEditContentProtection,
    setChannelManageTab,
    setChannelManageModal,
    chatsApi,
    loadChats,
  });

  const channelAttachments = useChannelAttachments({ acd, cms });

  const { REACTION_SET, addReaction, groupReactions, openReactionPicker } = useMessageReactions({
    activeChat,
    ws,
    setReactionPicker,
  });

  const { openSettingsPanel, openSettingsSubpage } = useSettingsPanelFlow({
    user,
    setSidebarOpen,
    setNotifPanel,
    setSettingsMode,
    setSettingsSubpage,
    setTagEdit,
    setNameEdit,
    setBioEdit,
    setSettingsSaveState,
    setProfileData,
    setProfilePanel,
  });

  const { inviteChannel, joiningInvite, setInviteChannel, joinInviteChannel } = useChannelInviteFlow({
    chats,
    selectChat,
    loadChats,
    chatsApi,
    setShowMobileChat,
  });

  const renderMessageText = useMessageTextRenderer({ msgSearch });

  const { getPostComments, openPostComments, sendPostComment, handleModerateComment } = usePostCommentsFlow({
    cms,
    activeChat,
    isOwnerOrAdmin,
    postCommentsModal,
    postCommentDraft,
    postCommentReplyTo,
    setPostCommentsModal,
    setPostCommentDraft,
    setPostCommentReplyTo,
    sendMessage,
    deleteMessage,
    chatsApi,
    loadChats,
  });

  return (
    <div className="zg-root" style={s.root} onClick={() => { setContextMenu(null); setSidebarOpen(false); setAttachMenu(false); setMediaComposerMenu(false); setNotifPanel(false); setReactionPicker(null); }}>

      {/* ── Toasts ── */}
      <ChatToasts
        toasts={toasts}
        onOpenToast={(toast) => {
          selectChat(toast.chatId);
          setShowMobileChat(true);
          dismissToast(toast.id);
        }}
      />
      {shieldActivationNotice && (
        <div
          style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            zIndex: 1200,
            pointerEvents: 'none',
            padding: '10px 16px',
            borderRadius: 14,
            border: '1px solid rgba(80, 255, 150, 0.55)',
            background: 'rgba(18, 38, 27, 0.48)',
            color: '#DFFFEA',
            fontSize: 13,
            fontWeight: 600,
            backdropFilter: 'blur(10px)',
            boxShadow: '0 0 0 1px rgba(123, 255, 180, 0.2), 0 0 32px rgba(70, 255, 145, 0.35)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Icons.Shield /> {shieldActivationNotice}
          </span>
        </div>
      )}

      {/* ── Sidebar ── */}
      <ChatSidebar
        user={user}
        sidebarOpen={sidebarOpen}
        styles={s}
        onOpenProfile={() => openProfile(user.id)}
        onOpenSettings={openSettingsPanel}
        onOpenNotifications={openNotificationsPanel}
        onLogout={() => { setSidebarOpen(false); logout(); }}
        onClose={() => setSidebarOpen(false)}
      />

      {/* ── Chat List ── */}
      <ChatListPanel
        styles={s}
        search={search}
        onSearchChange={setSearch}
        onOpenSidebar={(e) => {
          e.stopPropagation();
          setNotifPanel(false);
          setSidebarOpen(true);
        }}
        onToggleNotifications={(e) => {
          e.stopPropagation();
          notifPanel ? setNotifPanel(false) : openNotificationsPanel();
        }}
        onOpenNewChat={() => setNewChatModal(true)}
        filteredChats={filteredChats}
        userId={user.id}
        activeChat={activeChat}
        onSelectChat={(chatId) => {
          selectChat(chatId);
          setShowMobileChat(true);
        }}
        getAvatarSourceForChat={getAvatarSourceForChat}
      />

      {/* ── Chat Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(16,19,25,0.86)', backdropFilter: 'blur(24px)' }} className="zg-chatarea">
        {activeChat && acd ? (() => {
          const chatName = getChatName(acd, user.id);
          const other = getOtherUser(acd, user.id);
          const isDirectChat = acd.type === 'PRIVATE' || acd.type === 'SECRET';
          const isChannel = acd.type === 'CHANNEL';
          const isTopicGroup = acd.type === 'GROUP' && acd.topicsEnabled;
          const canPublishInChannel = !isChannel || ['OWNER', 'ADMIN'].includes(myRole);
          const canSendInTopicGroup = !isTopicGroup || !!activeTopicId;
          const on = isOnline(acd, user.id);
          const memberCount = acd._count?.members || acd.members?.length || 0;
          const renderVirtualizedMessage = (msg) => {
            const isMine = msg.fromId === user.id || msg.from?.id === user.id;
            const sender = msg.from || {};
            const isHL = searchResults[msgSearchIdx] === msg.id;
            const mediaLockedBySafeMode = (msg.media || []).some((item) => item?.protectedBySafeMode);
            const mediaBlocked = mediaLockedBySafeMode && !acd?.contentProtectionEnabled;
            const mediaBlockedReason = mediaLockedBySafeMode
              ? 'Медиа недоступно: отправлено во время сейф-режима.'
              : 'Медиа скрыто: в чате включена защита контента.';
            return (
              <div key={msg.id} id={`msg-${msg.id}`} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 2, alignItems: 'flex-end', gap: 6, transition: 'background .3s', borderRadius: 8, ...(isHL ? { background: 'rgba(255,255,255,0.12)' } : {}) }}
                onContextMenu={e => ctx(e, { ...msg, mine: isMine })}
                onTouchStart={(e) => {
                  const t = e.touches?.[0];
                  if (!t) return;
                  const timer = setTimeout(() => openReactionPicker(t.clientX, t.clientY - 50, msg.id), 450);
                  e.currentTarget.__touchTimer = timer;
                }}
                onTouchEnd={(e) => { clearTimeout(e.currentTarget.__touchTimer); }}
                onTouchMove={(e) => { clearTimeout(e.currentTarget.__touchTimer); }}>
                {!isMine && acd.type === 'GROUP' && (
                  <Av src={sender.avatar} name={sender.name} size={28} radius={8} color={sender.color} onClick={() => openProfile(msg.fromId || sender.id)} />
                )}
                <div style={{
                  maxWidth: (msg.media && msg.media.length > 1) ? "min(100%, 480px)" : (msg.media && msg.media.length > 0) ? "min(100%, 380px)" : "85%",
                  padding: (msg.media && msg.media.length > 0) ? "2px 2px 6px" : "8px 12px",
                  borderRadius: 14,
                  lineHeight: 1.45,
                  ...(isMine ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(231,234,240,0.15))', borderBottomRightRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } : { background: 'rgba(255,255,255,0.05)', borderBottomLeftRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }),
                }}>
                  {msg.forwardedFromName && <div style={{ fontSize: 12, color: '#E9EBEF', marginBottom: 4, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}><Icons.Forward /> Переслано от {msg.forwardedFromName}</div>}
                  {msg.replyTo && (
                    <div style={{ padding: '4px 8px', marginBottom: 6, borderLeft: '3px solid #E9EBEF', background: 'rgba(255,255,255,0.08)', borderRadius: '0 6px 6px 0', cursor: 'pointer', fontSize: 12 }}
                      onClick={() => scrollToMsg(msg.replyTo.id)}>
                      <span style={{ fontWeight: 600, color: '#E9EBEF', display: 'block', marginBottom: 1 }}>{msg.replyTo.from?.name}</span>
                      <span style={{ color: '#9CA3B1' }}>{msg.replyTo.text?.slice(0, 60)}</span>
                    </div>
                  )}
                  {!isMine && acd.type === 'GROUP' && !msg.forwardedFromName && (
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#C8CCD4', marginBottom: 2, cursor: 'pointer' }} onClick={() => openProfile(msg.fromId || sender.id)}>
                      {sender.name} <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.4, fontFamily: 'mono' }}>{sender.tag}</span>
                    </span>
                  )}
                  <MediaAttachment
                    media={msg.media}
                    mediaBlocked={mediaBlocked}
                    mediaBlockedReason={mediaBlockedReason}
                    onTranscribe={handleTranscribe}
                    transcriptions={transcriptions}
                    transcriptionLoading={transcriptionLoading}
                    transcriptionAvailable={transcriptionAvailable}
                    actionButtonStyle={s.ib}
                    onOpenMedia={openMediaModal}
                  />
                  {msg.text && <span style={{ fontSize: 14, wordBreak: 'break-word' }}>{renderMessageText(msg.text)}</span>}
                  {!!Object.keys(groupReactions(msg)).length && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                      {Object.entries(groupReactions(msg)).map(([emoji, userIds]) => (
                        <button key={emoji} onClick={() => addReaction(msg.id, emoji)} style={{ border: '1px solid rgba(255,255,255,0.12)', background: userIds.includes(user.id) ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', color: '#F2F4F7', borderRadius: 14, padding: '2px 8px', fontSize: 13, cursor: 'pointer' }}>
                          {emoji} {userIds.length}
                        </button>
                      ))}
                    </div>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', fontSize: 11, color: '#686F7F', marginTop: 8, fontFamily: 'mono' }}>
                    {msg.edited && <span style={{ fontStyle: 'italic', opacity: 0.5 }}>ред.</span>}
                    {msg.encrypted && <Icons.Lock />}
                    {formatTimeShort(msg.createdAt)}
                    {isMine && <span style={{ display: 'flex', alignItems: 'center', color: '#E9EBEF' }}><Icons.Check double={msg.status === 'READ'} /></span>}
                  </span>
                </div>
              </div>
            );
          };
          return (<>
            {/* Header */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,18,25,0.92)', backdropFilter: 'blur(12px)' }}>
              <div style={{ ...s.chatInner, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px' }}>
                <button style={{ ...s.ib, display: 'none' }} className="zg-back" onClick={() => setShowMobileChat(false)}><Icons.Back /></button>
                <Av src={getAvatarSourceForChat(acd)} name={chatName} size={38} color={tc[acd.type]} online={on}
                  onClick={() => isDirectChat && other ? openProfile(other.id) : (acd.type === 'CHANNEL' ? openChannelInfo() : isGroupOrChannel ? openGroupSettings() : null)} />
                <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => isDirectChat && other ? openProfile(other.id) : (acd.type === 'CHANNEL' ? openChannelInfo() : isGroupOrChannel ? openGroupSettings() : null)}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{chatName}</div>
                  <div style={{ fontSize: 12, color: typingText ? '#E9EBEF' : '#686F7F', cursor: isGroupOrChannel ? 'pointer' : 'default' }}
                    onClick={(e) => { if (isGroupOrChannel) { e.stopPropagation(); setMemberListModal(true); } }}>
                    {typingText || (acd.type === 'SECRET' ? '🔐 End-to-end' : acd.type === 'GROUP' ? `${memberCount} участников` : acd.type === 'CHANNEL' ? `${memberCount} подписчиков` : on ? 'в сети' : 'был(а) недавно')}
                  </div>
                </div>
                <button style={s.ib} onClick={() => { setMsgSearchOpen(!msgSearchOpen); setMsgSearch(''); setMsgSearchIdx(-1); }}><Icons.Search /></button>
                <button style={s.ib} onClick={() => handleMute(acd.id)}>{acd.muted ? <Icons.BellOff /> : <Icons.Bell />}</button>
                {isDirectChat && (
                  <button
                    style={{
                      ...s.ib,
                      ...(acd?.contentProtectionEnabled ? {
                        color: '#DFFFEA',
                        border: '1px solid rgba(88, 255, 154, 0.9)',
                        background: 'rgba(24, 66, 43, 0.42)',
                        boxShadow: '0 0 0 1px rgba(92, 255, 160, 0.35), 0 0 16px rgba(88, 255, 154, 0.75), 0 0 32px rgba(88, 255, 154, 0.35)',
                      } : incomingProtectionRequest ? {
                        color: '#EEF6FF',
                        border: '1px solid rgba(153, 197, 255, 0.7)',
                        background: 'rgba(44, 72, 112, 0.34)',
                        boxShadow: '0 0 0 1px rgba(153, 197, 255, 0.25), 0 0 14px rgba(153, 197, 255, 0.35)',
                      } : {}),
                    }}
                    onClick={toggleDirectContentProtection}
                    title={acd?.contentProtectionEnabled
                      ? (acd?.contentProtectionRequestedByMe
                        ? 'Отменить запрос на отключение защиты контента'
                        : 'Отправить запрос на отключение защиты контента')
                      : incomingProtectionRequest
                        ? 'Ожидается ваше решение по запросу'
                        : acd?.contentProtectionRequestedByMe
                          ? 'Отменить запрос защиты контента'
                          : 'Отправить запрос на защиту контента'}
                  >
                    <Icons.Shield />
                  </button>
                )}
                {isDirectChat && other && <button style={s.ib} onClick={() => openProfile(other.id)}><Icons.User /></button>}
                {acd.type === 'CHANNEL' && <button style={s.ib} onClick={() => setAttachmentsModal(true)}><Icons.Attach /></button>}
              </div>
            </div>

            <ChatMessageSearchBar
              open={msgSearchOpen}
              styles={s}
              msgSearch={msgSearch}
              onSearchChange={(value) => { setMsgSearch(value); setMsgSearchIdx(0); }}
              searchResults={searchResults}
              msgSearchIdx={msgSearchIdx}
              onPrev={() => setMsgSearchIdx((index) => Math.max(0, index - 1))}
              onNext={() => setMsgSearchIdx((index) => Math.min(searchResults.length - 1, index + 1))}
              onClose={() => { setMsgSearchOpen(false); setMsgSearch(''); }}
            />

            {acd.type === 'SECRET' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 5, background: 'rgba(245,247,250,0.06)', color: '#EDEFF3', fontSize: 12, fontFamily: 'mono' }}><Icons.Lock /> Сквозное шифрование</div>}

            <ChatTopicsBar
              visible={isTopicGroup}
              styles={s}
              topicsLoading={topicsLoading}
              chatTopics={chatTopics}
              activeTopicId={activeTopicId}
              onSelectTopic={setActiveTopicId}
              isOwnerOrAdmin={isOwnerOrAdmin}
              newTopicTitle={newTopicTitle}
              onNewTopicTitleChange={(value) => { setNewTopicTitle(value); setTopicError(''); }}
              onCreateTopic={createTopic}
            />
            {isDirectChat && incomingProtectionRequest && (
              <div style={{ padding: '8px 14px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: '1px solid rgba(153, 197, 255, 0.45)',
                  background: 'rgba(42, 64, 98, 0.35)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#EAF2FF' }}>
                    <Icons.Shield />
                    {incomingRequestType === 'ENABLE'
                      ? 'Собеседник включил сейф-режим. Принять?'
                      : 'Собеседник просит отключить сейф-режим. Подтвердить?'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button style={{ ...s.ib, height: 32, minWidth: 90 }} onClick={declineDirectContentProtectionRequest}>Отклонить</button>
                    <button
                      style={{
                        ...s.ib,
                        height: 32,
                        minWidth: 90,
                        color: '#DFFFEA',
                        border: '1px solid rgba(88, 255, 154, 0.9)',
                        background: 'rgba(24, 66, 43, 0.42)',
                      }}
                      onClick={acceptDirectContentProtectionRequest}
                    >
                      Принять
                    </button>
                  </div>
                </div>
              </div>
            )}
            {topicError && <div style={{ padding: '0 14px 8px', color: '#D5D8DE', fontSize: 12 }}>{topicError}</div>}

            {/* Messages */}
            <div ref={messagesScrollRef} onScroll={onMessagesViewportScroll} style={{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
              <div style={{ ...s.chatInner, display: 'flex', flexDirection: 'column', gap: isChannel ? 10 : 3 }}>
                {paging.loadingMore && (
                  <div style={{ alignSelf: 'center', fontSize: 12, color: '#8E95A3', padding: '4px 0 8px' }}>
                    Загружаем историю…
                  </div>
                )}
                {shouldVirtualize ? (
                  <div style={{ flex: 1, minHeight: 0 }}>
                    <Virtuoso
                      ref={messagesVirtuosoRef}
                      style={{ height: '100%' }}
                      data={cms}
                      increaseViewportBy={{ top: 400, bottom: 700 }}
                      alignToBottom
                      atTopThreshold={120}
                      startReached={() => {
                        if (!activeChat || paging.loadingMore || !paging.hasMore) return;
                        const topicId = (acd?.type === 'GROUP' && acd?.topicsEnabled) ? activeTopicId : undefined;
                        loadMoreMessages(activeChat, topicId);
                      }}
                      itemContent={(_, msg) => renderVirtualizedMessage(msg)}
                    />
                  </div>
                ) : (
                  (isChannel ? cms.filter((m) => !m.replyToId) : cms).map(msg => {
                const isMine = msg.fromId === user.id || msg.from?.id === user.id;
                const sender = msg.from || {};
                const isHL = searchResults[msgSearchIdx] === msg.id;
                const mediaLockedBySafeMode = (msg.media || []).some((item) => item?.protectedBySafeMode);
                const mediaBlocked = mediaLockedBySafeMode && !acd?.contentProtectionEnabled;
                const mediaBlockedReason = mediaLockedBySafeMode
                  ? 'Медиа недоступно: отправлено во время сейф-режима.'
                  : 'Медиа скрыто: в чате включена защита контента.';
                const postComments = getPostComments(msg);
                const commentsButtonActive = msg.commentsEnabled || isOwnerOrAdmin;
                const postVisual = (msg.media || []).find((m) => m.type === 'IMAGE' || m.type === 'VIDEO');
                const postViewsRaw = msg.viewsCount ?? msg.viewCount ?? msg.views ?? msg.channelViews ?? msg._count?.views ?? 0;
                const postViews = Number.isFinite(Number(postViewsRaw)) ? Number(postViewsRaw) : 0;
                return (
                  <div key={msg.id} id={`msg-${msg.id}`} style={{ display: 'flex', justifyContent: isChannel ? 'flex-start' : (isMine ? 'flex-end' : 'flex-start'), marginBottom: 2, alignItems: 'flex-end', gap: 6, transition: 'background .3s', borderRadius: 8, ...(isHL ? { background: 'rgba(255,255,255,0.12)' } : {}) }}
                    onContextMenu={e => ctx(e, { ...msg, mine: isMine })}
                    onTouchStart={(e) => {
                      const t = e.touches?.[0];
                      if (!t) return;
                      const timer = setTimeout(() => openReactionPicker(t.clientX, t.clientY - 50, msg.id), 450);
                      e.currentTarget.__touchTimer = timer;
                    }}
                    onTouchEnd={(e) => { clearTimeout(e.currentTarget.__touchTimer); }}
                    onTouchMove={(e) => { clearTimeout(e.currentTarget.__touchTimer); }}>
                    {!isMine && acd.type === 'GROUP' && (
                      <Av src={sender.avatar} name={sender.name} size={28} radius={8} color={sender.color} onClick={() => openProfile(msg.fromId || sender.id)} />
                    )}
                    <div style={{
                      maxWidth: isChannel ? 'min(100%, 620px)' : '85%',
                      width: isChannel ? 'min(100%, 620px)' : 'auto',
                      padding: isChannel ? '0' : '8px 12px',
                      borderRadius: 14,
                      lineHeight: isChannel ? 1.48 : 1.45,
                      ...(isChannel
                        ? { background: 'linear-gradient(180deg, rgba(36,42,55,0.95), rgba(27,31,41,0.98))', border: '1px solid rgba(220,224,235,0.13)', boxShadow: '0 10px 26px rgba(0,0,0,0.25)', overflow: 'hidden' }
                        : (isMine ? { background: 'linear-gradient(135deg, rgba(255,255,255,0.15), rgba(231,234,240,0.15))', borderBottomRightRadius: 4, border: '1px solid rgba(255,255,255,0.1)' } : { background: 'rgba(255,255,255,0.05)', borderBottomLeftRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }))
                    }}>
                      {isChannel && postVisual && !mediaBlocked && (
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => openMediaModal?.({ type: postVisual.type, src: mediaUrlById(postVisual.id), title: postVisual.originalName })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openMediaModal?.({ type: postVisual.type, src: mediaUrlById(postVisual.id), title: postVisual.originalName });
                            }
                          }}
                          style={{ width: '100%', maxHeight: 460, background: '#000', padding: 0, overflow: 'hidden', display: 'block', borderBottom: '1px solid rgba(255,255,255,0.09)', cursor: 'pointer', position: 'relative' }}
                        >
                          {postVisual.type === 'VIDEO' ? (
                            <>
                              <video
                                src={mediaUrlById(postVisual.id)}
                                preload="auto"
                                muted
                                autoPlay
                                loop
                                playsInline
                                style={{ width: '100%', maxHeight: 460, display: 'block', objectFit: 'cover', background: '#000' }}
                              />
                              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.02), rgba(0,0,0,0.2))', pointerEvents: 'none' }} />
                              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(0,0,0,0.42)', border: '1px solid rgba(255,255,255,0.34)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, paddingLeft: 3 }}>▶</div>
                              </div>
                            </>
                          ) : (
                            <img src={mediaUrlById(postVisual.id)} alt={postVisual.originalName || 'Пост'} style={{ width: '100%', display: 'block', objectFit: 'cover' }} />
                          )}
                        </div>
                      )}
                      <div style={{ padding: isChannel ? '12px 14px 8px' : 0 }}>
                      {msg.forwardedFromName && <div style={{ fontSize: 12, color: '#E9EBEF', marginBottom: 4, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}><Icons.Forward /> Переслано от {msg.forwardedFromName}</div>}
                      {msg.replyTo && (
                        <div style={{ padding: '4px 8px', marginBottom: 6, borderLeft: '3px solid #E9EBEF', background: 'rgba(255,255,255,0.08)', borderRadius: '0 6px 6px 0', cursor: 'pointer', fontSize: 12 }}
                          onClick={() => scrollToMsg(msg.replyTo.id)}>
                          <span style={{ fontWeight: 600, color: '#E9EBEF', display: 'block', marginBottom: 1 }}>{msg.replyTo.from?.name}</span>
                          <span style={{ color: '#9CA3B1' }}>{msg.replyTo.text?.slice(0, 60)}</span>
                        </div>
                      )}
                      {!isMine && acd.type === 'GROUP' && !msg.forwardedFromName && (
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#C8CCD4', marginBottom: 2, cursor: 'pointer' }} onClick={() => openProfile(msg.fromId || sender.id)}>
                          {sender.name} <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.4, fontFamily: 'mono' }}>{sender.tag}</span>
                        </span>
                      )}
                      <MediaAttachment
                        media={isChannel ? (msg.media || []).filter((m) => m.id !== postVisual?.id) : msg.media}
                        mediaBlocked={mediaBlocked}
                        mediaBlockedReason={mediaBlockedReason}
                        onTranscribe={handleTranscribe}
                        transcriptions={transcriptions}
                        transcriptionLoading={transcriptionLoading}
                        transcriptionAvailable={transcriptionAvailable}
                        actionButtonStyle={s.ib}
                        onOpenMedia={openMediaModal}
                        showMeta={!isChannel}
                        carouselImages={isChannel}
                        mediaMaxWidth={isChannel ? '100%' : 260}
                      />
                      {isChannel ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {msg.text && (
                            <div style={{ fontSize: 15, color: '#E3E7EF', lineHeight: 1.48, wordBreak: 'break-word', fontWeight: 400 }}>
                              {renderMessageText(msg.text)}
                            </div>
                          )}
                        </div>
                      ) : (
                        msg.text && <span style={{ fontSize: 14, wordBreak: 'break-word' }}>{renderMessageText(msg.text)}</span>
                      )}
                      {!!Object.keys(groupReactions(msg)).length && (
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
                          {Object.entries(groupReactions(msg)).map(([emoji, userIds]) => (
                            <button key={emoji} onClick={() => addReaction(msg.id, emoji)} style={{ border: '1px solid rgba(255,255,255,0.12)', background: userIds.includes(user.id) ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', color: '#F2F4F7', borderRadius: 14, padding: '2px 8px', fontSize: 13, cursor: 'pointer' }}>
                              {emoji} {userIds.length}
                            </button>
                          ))}
                        </div>
                      )}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', fontSize: 11, color: isChannel ? '#95A0B3' : '#686F7F', marginTop: 8, fontFamily: 'mono' }}>
                        {msg.edited && <span style={{ fontStyle: 'italic', opacity: 0.5 }}>ред.</span>}
                        {msg.encrypted && <Icons.Lock />}
                        {isChannel && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ fontSize: 11 }}>👁</span>{postViews}</span>}
                        {formatTimeShort(msg.createdAt)}
                        {isMine && <span style={{ display: 'flex', alignItems: 'center', color: '#E9EBEF' }}><Icons.Check double={msg.status === 'READ'} /></span>}
                      </span>
                      </div>
                      {isChannel && (
                        <button
                          style={{ margin: '4px 5px 7px', width: 'calc(100% - 10px)', border: 'none', borderRadius: 11, background: commentsButtonActive ? 'rgba(20,24,33,0.88)' : 'rgba(20,24,33,0.62)', color: commentsButtonActive ? '#98A4FF' : '#6E7482', cursor: commentsButtonActive ? 'pointer' : 'not-allowed', padding: '8px 12px', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)' }}
                          onClick={() => commentsButtonActive && openPostComments(msg)}
                          disabled={!commentsButtonActive}
                          title={!commentsButtonActive ? 'Комментарии отключены' : undefined}
                        >
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <Icons.Reply size={16} />
                            Прокомментировать {postComments.length > 0 ? `(${postComments.length})` : ''}
                          </span>
                          <span style={{ display: 'inline-flex', transform: 'rotate(-90deg)' }}><Icons.ArrowDown size={16} /></span>
                        </button>
                      )}
                    </div>
                  </div>
                );
                })
                )}
                <div ref={endRef} />
              </div>
            </div>

            {/* Reply / Edit bar */}
            {(editingMsg || replyTo) && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#E9EBEF' }}>
                <div style={{ ...s.chatInner, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px' }}>
                  {editingMsg ? <Icons.Edit /> : <Icons.Reply />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{editingMsg ? 'Редактирование' : `Ответ для ${replyTo?.from?.name}`}</div>
                    <div style={{ fontSize: 13, color: '#7C8392', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingMsg?.text || replyTo?.text}</div>
                  </div>
                  <button style={s.ib} onClick={() => { setEditingMsg(null); setReplyTo(null); setInput(''); }}><Icons.Close /></button>
                </div>
              </div>
            )}

            {/* Input */}
            <div style={{ background: 'transparent' }}>
              <div style={{ ...s.chatInner, display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px 14px' }}>
                {isChannel && canPublishInChannel && !editingMsg && !replyTo && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#D6DAE2' }}>
                    <input type="checkbox" checked={channelPostCommentsEnabled} onChange={(e) => setChannelPostCommentsEnabled(e.target.checked)} />
                    Разрешить комментарии к этому посту
                  </label>
                )}
                {(voiceRecording || voiceRecorderState.error) && (
                  <div style={{ fontSize: 12, color: voiceRecorderState.error ? '#D5D8DE' : '#EDEFF3', fontFamily: 'mono' }}>
                    {voiceRecorderState.error || `Идёт запись голосового${voiceRecorderState.startedAt ? ` · ${Math.floor((recordingNowTs - voiceRecorderState.startedAt) / 1000)}с` : ''}`}
                  </div>
                )}
                {pendingMedia.length > 0 && (
                  <div style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(17,20,27,0.92)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <button type="button" style={{ ...s.ib, width: 28, height: 28 }} onClick={() => { pendingMedia.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl)); setPendingMedia([]); setMediaComposerMenu(false); }}><Icons.Close /></button>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#EEF1F7' }}>Отправить {pendingMedia.length} фото</div>
                      <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" style={{ ...s.ib, width: 30, height: 30 }} onClick={() => setMediaComposerMenu((prev) => !prev)}>⋮</button>
                        {mediaComposerMenu && (
                          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6, width: 220, background: '#2B303A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: 6, zIndex: 70 }}>
                            <label style={s.mi}><Icons.Plus /> Добавить<input ref={mediaExtraRef} type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} /></label>
                            <button type="button" style={{ ...s.mi, width: '100%', background: 'transparent' }} onClick={() => setMediaComposerMenu(false)}><Icons.File /> Отправить без сжатия</button>
                            <button type="button" style={{ ...s.mi, width: '100%', background: 'transparent' }} onClick={togglePendingSpoiler}><Icons.Image /> {pendingMedia[0]?.spoiler ? 'Убрать спойлер' : 'Скрыть под спойлер'}</button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ padding: 12, display: 'flex', gap: 8, overflowX: 'auto' }}>
                      {pendingMedia.map((item) => (
                        <div key={item.id} style={{ position: 'relative', width: 148, height: 110, borderRadius: 10, overflow: 'hidden', background: 'rgba(255,255,255,0.06)', flex: '0 0 auto' }}>
                          {item.previewUrl ? (
                            item.file.type.startsWith('video/') ? (
                              <video src={item.previewUrl} muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', filter: item.spoiler ? 'blur(12px)' : 'none' }} />
                            ) : (
                              <img src={item.previewUrl} alt={item.file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: item.spoiler ? 'blur(12px)' : 'none' }} />
                            )
                          ) : (
                            <div style={{ padding: 10, fontSize: 12, color: '#D5D9E1' }}>{item.file.name}</div>
                          )}
                          <button type="button" style={{ ...s.ib, position: 'absolute', top: 6, right: 6, width: 24, height: 24, background: 'rgba(9,10,14,0.72)' }} onClick={() => removePendingMedia(item.id)}><Icons.Close size={13} /></button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 16, background: 'rgba(15,18,25,0.84)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(16px)' }}>
                  {canPublishInChannel && canSendInTopicGroup ? (
                    <>
                      <div style={{ position: 'relative' }}>
                        <button style={s.ib} onClick={e => { e.stopPropagation(); setAttachMenu(!attachMenu); }}><Icons.Attach /></button>
                        {attachMenu && (
                          <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: '#1D2128', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 4, zIndex: 50, minWidth: 150, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                            <label style={s.mi}><Icons.Image /> Фото/Видео<input type="file" accept="image/*,video/*" multiple onChange={handleFileUpload} style={{ display: 'none' }} /></label>
                            <label style={s.mi}><Icons.File /> Файл<input type="file" multiple onChange={handleFileUpload} style={{ display: 'none' }} /></label>
                          </div>
                        )}
                      </div>
                      <div style={{ flex: 1, position: 'relative' }}>
                        {composerToolbar && (
                          <div style={{ position: 'fixed', top: composerToolbar.top, left: composerToolbar.left, transform: 'translate(-50%, -100%)', display: 'flex', gap: 4, padding: 4, borderRadius: 9, border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(18,21,30,0.96)', zIndex: 250 }}>
                            <button type="button" style={{ ...s.ib, width: 30, height: 26, fontWeight: 700, fontSize: 13 }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyComposerFormat('bold')}>B</button>
                            <button type="button" style={{ ...s.ib, width: 30, height: 26, fontStyle: 'italic', fontSize: 13 }} onMouseDown={(e) => e.preventDefault()} onClick={() => applyComposerFormat('italic')}>I</button>
                            <button type="button" style={{ ...s.ib, width: 30, height: 26, fontSize: 13 }} onMouseDown={(e) => e.preventDefault()} onClick={applyComposerLink}>🔗</button>
                          </div>
                        )}
                        <div
                          className="zg-composer"
                          ref={(node) => {
                            composerRef.current = node;
                            inpRef.current = node;
                          }}
                          contentEditable
                          suppressContentEditableWarning
                          data-placeholder={isChannel ? 'Опубликовать сообщение...' : isTopicGroup ? 'Сообщение в тему...' : 'Сообщение...'}
                          style={{ ...s.inp2, minHeight: 40, maxHeight: 140, overflowY: 'auto', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)', boxShadow: 'none', padding: '10px 12px', lineHeight: 1.42, fontSize: 15, color: '#E9EDF5', fontWeight: 400 }}
                          onInput={syncComposerInput}
                          onPaste={handleComposerPaste}
                          onFocus={refreshComposerSelection}
                          onBlur={() => setTimeout(() => setComposerToolbar(null), 120)}
                          onMouseUp={refreshComposerSelection}
                          onKeyUp={refreshComposerSelection}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                              e.preventDefault();
                              applyComposerFormat('bold');
                              return;
                            }
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
                              e.preventDefault();
                              applyComposerFormat('italic');
                              return;
                            }
                            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
                              const sel = window.getSelection?.();
                              if (sel && !sel.isCollapsed && document.activeElement === composerRef.current) {
                                e.preventDefault();
                                applyComposerLink();
                                return;
                              }
                            }
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSend();
                            }
                          }}
                        />
                        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                          <button type="button" style={{ ...s.ib, width: 30, height: 24, fontWeight: 700, fontSize: 12 }} onClick={() => applyComposerFormat('bold')} title="Ctrl+B">B</button>
                          <button type="button" style={{ ...s.ib, width: 30, height: 24, fontStyle: 'italic', fontSize: 12 }} onClick={() => applyComposerFormat('italic')} title="Ctrl+I">I</button>
                          <button type="button" style={{ ...s.ib, width: 30, height: 24, fontSize: 12 }} onClick={applyComposerLink} title="Выделите текст и добавьте ссылку">🔗</button>
                        </div>
                      </div>
                      <button
                        style={{ ...s.ib, color: voiceRecording ? '#D5D8DE' : '#EDEFF3' }}
                        onClick={handleVoiceRecordToggle}
                        title={voiceRecording ? 'Остановить запись' : 'Записать голосовое'}
                      >
                        <Icons.Mic />
                      </button>
                      <button style={{ ...s.sendBtn, opacity: sendButtonOpacity }} onClick={handleSend} disabled={!canSendComposerMessage}><Icons.Send /></button>
                    </>
                  ) : (
                    <div style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', color: '#9CA3B1', fontSize: 13 }}>
                      {isChannel ? 'Посты публикуют только администраторы и модераторы. Для комментариев откройте пост.' : 'Выберите тему, чтобы отправлять сообщения.'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>);
        })() : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
            <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #E9EBEF, #C8CCD4)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700, fontFamily: 'mono', color: '#fff', marginBottom: 16 }}>Z</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'mono', marginBottom: 8 }}>ZavodGram</h2>
            <p style={{ fontSize: 14, color: '#7C8392' }}>Выберите чат для начала</p>
          </div>
        )}
      </div>

      <ProfilePanel
        open={profilePanel}
        profileData={profileData}
        settingsMode={settingsMode}
        settingsSubpage={settingsSubpage}
        nameEdit={nameEdit}
        tagEdit={tagEdit}
        bioEdit={bioEdit}
        settingsSaveState={settingsSaveState}
        styles={s}
        onClose={() => setProfilePanel(null)}
        onSetSettingsSubpage={setSettingsSubpage}
        onSetNameEdit={setNameEdit}
        onSetTagEdit={setTagEdit}
        onSetBioEdit={setBioEdit}
        onSaveProfileCard={saveProfileCard}
        onAvatarUpload={handleAvatarUpload}
        onOpenSettingsSubpage={openSettingsSubpage}
        onLogout={logout}
        onOpenAvatar={() => setAvatarView({ url: profileData?.avatar, name: profileData?.name })}
      />

      {/* ── Notification Panel ── */}
      <ChatNotificationsPanel
        open={notifPanel}
        styles={s}
        notifications={notifications}
        onClose={() => setNotifPanel(false)}
        onClear={() => setNotifications([])}
        onOpenNotification={(notification) => {
          selectChat(notification.chatId);
          setShowMobileChat(true);
          setNotifPanel(false);
        }}
      />

      {/* ── Context Menu ── */}
      <ChatMessageContextMenu
        contextMenu={contextMenu}
        styles={s}
        canForward={!protectedDirectChat && !contextMenu?.msg?.protectedBySafeMode && !(contextMenu?.msg?.media || []).some((item) => item?.protectedBySafeMode)}
        canDelete={!protectedDirectChat}
        onReply={() => { setReplyTo(contextMenu.msg); setEditingMsg(null); setInput(''); setContextMenu(null); inpRef.current?.focus(); }}
        onForward={() => { setForwardMsg(contextMenu.msg); setContextMenu(null); }}
        onReaction={() => { openReactionPicker(contextMenu.x + 10, contextMenu.y - 50, contextMenu.msg.id); setContextMenu(null); }}
        onCopy={() => { navigator.clipboard?.writeText(contextMenu.msg.text || ''); setContextMenu(null); }}
        onEdit={() => { setEditingMsg(contextMenu.msg); setReplyTo(null); setInput(contextMenu.msg.text || ''); setContextMenu(null); }}
        onDelete={() => { deleteMessage(activeChat, contextMenu.msg.id); setContextMenu(null); }}
      />


      <ChatReactionPicker
        reactionPicker={reactionPicker}
        reactionSet={REACTION_SET}
        onReact={addReaction}
        onClose={() => setReactionPicker(null)}
      />

      {/* ── Forward Modal ── */}
      <ForwardMessageModal
        openMessage={forwardMsg}
        chats={chats}
        userId={user.id}
        onForward={doForward}
        onClose={() => setForwardMsg(null)}
      />

      <NewChatModal
        open={newChatModal}
        mode={newChatMode}
        chatType={newChatType}
        search={newChatSearch}
        results={newChatResults}
        groupName={groupName}
        groupDesc={groupDesc}
        groupMembers={groupMembers}
        styles={s}
        onClose={() => { setNewChatModal(false); setNewChatMode('search'); }}
        onModeChange={setNewChatMode}
        onChatTypeChange={setNewChatType}
        onSearch={searchNewChat}
        onPickUser={handleNewChat}
        onGroupNameChange={setGroupName}
        onGroupDescChange={setGroupDesc}
        onGroupMemberAdd={(member) => setGroupMembers((prev) => [...prev, member])}
        onGroupMemberRemove={(memberId) => setGroupMembers((prev) => prev.filter((item) => item.id !== memberId))}
        onCreate={createGroupOrChannel}
        onMirrorCreated={(channel) => { loadChats(); selectChat(channel.id); setShowMobileChat(true); setNewChatModal(false); }}
      />

      <ChannelInfoModal
        open={channelInfoModal}
        channel={acd}
        isOwnerOrAdmin={isOwnerOrAdmin}
        channelPublicLink={channelPublicLink}
        styles={s}
        onClose={() => setChannelInfoModal(false)}
        onAvatarUpload={handleGroupAvatarUpload}
        onShare={shareChannelLink}
        onOpenManagement={() => { setChannelInfoModal(false); openChannelManagement(); }}
        onOpenAttachments={() => { setChannelInfoModal(false); setAttachmentsModal(true); }}
      />

      <ChannelManageModal
        open={channelManageModal}
        chat={acd}
        isOwnerOrAdmin={isOwnerOrAdmin}
        tab={channelManageTab}
        setTab={setChannelManageTab}
        onLoadBans={loadChannelBans}
        onClose={() => setChannelManageModal(false)}
        onAvatarUpload={handleGroupAvatarUpload}
        editGroupName={editGroupName}
        setEditGroupName={setEditGroupName}
        editGroupDesc={editGroupDesc}
        setEditGroupDesc={setEditGroupDesc}
        editContentProtection={editContentProtection}
        setEditContentProtection={setEditContentProtection}
        channelSlugEdit={channelSlugEdit}
        setChannelSlugEdit={setChannelSlugEdit}
        setChannelSlugError={setChannelSlugError}
        channelSlugError={channelSlugError}
        onSave={saveChannelManagement}
        bansLoading={bansLoading}
        bannedUsers={bannedUsers}
        onUnbanMember={handleUnbanMember}
        styles={s}
      />

      <ChannelAttachmentsModal
        open={attachmentsModal && acd?.type === 'CHANNEL'}
        channelAttachments={channelAttachments}
        onClose={() => setAttachmentsModal(false)}
      />

      <PostCommentsModal
        post={postCommentsModal}
        isOwnerOrAdmin={isOwnerOrAdmin}
        userId={user.id}
        members={acd?.members}
        getPostComments={getPostComments}
        onOpenDirectChat={openDirectChatWithUser}
        onModerateComment={handleModerateComment}
        replyTo={postCommentReplyTo}
        setReplyTo={setPostCommentReplyTo}
        draft={postCommentDraft}
        setDraft={setPostCommentDraft}
        onSend={sendPostComment}
        styles={s}
        onClose={() => { setPostCommentsModal(null); setPostCommentReplyTo(null); }}
      />

      <ChannelInviteModal
        inviteChannel={inviteChannel}
        joiningInvite={joiningInvite}
        styles={s}
        onJoin={joinInviteChannel}
        onClose={() => setInviteChannel(null)}
      />

      <ChatMediaModal
        media={mediaModal}
        styles={s}
        onClose={() => setMediaModal(null)}
      />

      <AvatarFullscreenModal
        avatarView={avatarView}
        onClose={() => setAvatarView(null)}
      />

      <GroupSettingsModal
        open={groupSettingsModal}
        chat={acd}
        isGroupOrChannel={isGroupOrChannel}
        isOwnerOrAdmin={isOwnerOrAdmin}
        editGroupName={editGroupName}
        setEditGroupName={setEditGroupName}
        editGroupDesc={editGroupDesc}
        setEditGroupDesc={setEditGroupDesc}
        editTopicsEnabled={editTopicsEnabled}
        setEditTopicsEnabled={setEditTopicsEnabled}
        editContentProtection={editContentProtection}
        setEditContentProtection={setEditContentProtection}
        styles={s}
        onClose={() => setGroupSettingsModal(false)}
        onAvatarUpload={handleGroupAvatarUpload}
        onSave={saveGroupSettings}
        onOpenMembers={() => { setGroupSettingsModal(false); setMemberListModal(true); }}
      />

      <MemberListModal
        open={memberListModal}
        chat={acd}
        isGroupOrChannel={isGroupOrChannel}
        isOwner={isOwner}
        isOwnerOrAdmin={isOwnerOrAdmin}
        userId={user.id}
        styles={s}
        addMemberSearch={addMemberSearch}
        addMemberResults={addMemberResults}
        onClose={() => { setMemberListModal(false); setAddMemberSearch(''); setAddMemberResults([]); }}
        onOpenManagement={() => { setGroupSettingsModal(true); setMemberListModal(false); }}
        onSearchAddMember={searchAddMember}
        onAddMember={handleAddMember}
        onOpenProfile={(memberUserId) => { setMemberListModal(false); openProfile(memberUserId); }}
        onSetRole={handleSetRole}
        onKickMember={handleKickMember}
        onBanMember={handleBanMember}
        onTransferOwnership={handleTransferOwnership}
      />

      <ChatAppGlobalStyles showMobileChat={showMobileChat} />
    </div>
  );
}

const s = {
  root: { display: 'flex', width: '100%', height: '100vh', background: '#101319', fontFamily: "'Manrope', sans-serif", color: '#F2F4F7', position: 'relative', overflow: 'hidden' },
  sb: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 280, background: 'rgba(0,0,0,0.62)', borderRight: '1px solid rgba(255,255,255,0.3)', zIndex: 100, display: 'flex', flexDirection: 'column', transition: 'transform .25s cubic-bezier(.4,0,.2,1)', backdropFilter: 'blur(24px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -10px 35px rgba(255,255,255,0.04), 16px 0 45px rgba(0,0,0,0.45)' },
  cl: { width: 360, minWidth: 280, maxWidth: 400, borderRight: '1px solid rgba(255,255,255,0.3)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(24px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -14px 30px rgba(255,255,255,0.04)' },
  chatInner: { width: '100%', maxWidth: 1060, margin: '0 auto' },
  title: { flex: 1, fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#F6F7FA', letterSpacing: 0.4 },
  ib: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.22)', color: '#DCE0E8', cursor: 'pointer', padding: 6, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', backdropFilter: 'blur(20px)' },
  si: { flex: 1, background: 'none', border: 'none', outline: 'none', color: '#F2F4F7', fontSize: 13, fontFamily: "'Manrope', sans-serif" },
  mi: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 8 },
  lbl: { fontSize: 11, color: '#7C8392', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: "'JetBrains Mono', monospace", display: 'block', marginTop: 14, marginBottom: 4 },
  inp2: { flex: 1, width: '100%', background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.26)', borderRadius: 12, padding: '10px 14px', color: '#EFF2F7', fontSize: 14, fontFamily: "'Manrope', sans-serif", outline: 'none', backdropFilter: 'blur(22px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -10px 24px rgba(0,0,0,0.24)' },
  saveBtn: { padding: '10px 16px', background: 'rgba(255,255,255,0.24)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 10, color: '#F5F7FB', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', backdropFilter: 'blur(22px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.24), 0 10px 24px rgba(0,0,0,0.26)' },
  sendBtn: { width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.24)', border: '1px solid rgba(255,255,255,0.31)', color: '#F4F7FB', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, backdropFilter: 'blur(22px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.24), 0 10px 22px rgba(0,0,0,0.26)' },
};
