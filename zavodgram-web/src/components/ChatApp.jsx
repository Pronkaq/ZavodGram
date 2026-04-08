import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { chatsApi, usersApi, mediaApi, messagesApi, getAccessToken } from '../api/client';
import { Icons, typeColors } from './Icons';
import { formatTime, formatTimeShort, getChatName, getChatAvatar, getOtherUser, isOnline, getLastMessage, highlightText } from '../utils/helpers.jsx';

const tc = typeColors;

function mediaUrlById(id) {
  const token = getAccessToken();
  return token ? `/api/media/${id}/download?token=${encodeURIComponent(token)}` : '';
}

function resolveAvatarSrc(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  if (src.startsWith('media:')) return mediaUrlById(src.slice(6));
  if (src.startsWith('/uploads/')) {
    const token = getAccessToken();
    return token ? `/api/media/legacy?path=${encodeURIComponent(src)}&token=${encodeURIComponent(token)}` : '';
  }
  return src;
}

// Avatar component — shows image or initials, clickable
function Av({ src, name, size = 46, radius = 12, color, online, onClick, style: extraStyle }) {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const bg = src ? 'transparent' : (color || '#4A9EE5');
  return (
    <div onClick={onClick} style={{ width: size, height: size, borderRadius: radius, background: bg, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: onClick ? 'pointer' : 'default', overflow: 'hidden', ...extraStyle }}>
      {src ? <img src={resolveAvatarSrc(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> :
        <span style={{ fontSize: size * 0.34, fontWeight: 600, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{initials}</span>}
      {online && <div style={{ position: 'absolute', bottom: size > 40 ? 1 : 0, right: size > 40 ? 1 : 0, width: size > 40 ? 10 : 8, height: size > 40 ? 10 : 8, background: '#4AE58E', borderRadius: '50%', border: '2px solid #0F1219' }} />}
    </div>
  );
}

// Media attachment in message bubble
function MediaAttachment({ media }) {
  if (!media || media.length === 0) return null;
  return media.map((m) => {
    if (m.type === 'IMAGE') {
      return (
        <div key={m.id} style={{ marginBottom: 6, borderRadius: 10, overflow: 'hidden', maxWidth: 260 }}>
          <img src={mediaUrlById(m.id)} style={{ width: '100%', maxHeight: 300, objectFit: 'cover', display: 'block', borderRadius: 10 }} alt={m.originalName} />
          {m.originalName && <div style={{ fontSize: 11, color: '#5A6070', marginTop: 4 }}>{m.originalName}</div>}
        </div>
      );
    }
    if (m.type === 'VIDEO') {
      return (
        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(124,107,222,0.1)', borderRadius: 10, marginBottom: 6, border: '1px solid rgba(124,107,222,0.15)' }}>
          <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(124,107,222,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7C6BDE', flexShrink: 0 }}><Icons.Video /></div>
          <div><div style={{ fontSize: 13, fontWeight: 500 }}>{m.originalName}</div><div style={{ fontSize: 11, color: '#4A5060', fontFamily: 'mono' }}>{(m.size / 1024 / 1024).toFixed(1)} MB</div></div>
        </div>
      );
    }
    return (
      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(74,158,229,0.08)', borderRadius: 10, marginBottom: 6, border: '1px solid rgba(74,158,229,0.1)' }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(74,158,229,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#4A9EE5', flexShrink: 0 }}><Icons.File /></div>
        <div><div style={{ fontSize: 13, fontWeight: 500 }}>{m.originalName}</div><div style={{ fontSize: 11, color: '#4A5060', fontFamily: 'mono' }}>{(m.size / 1024 / 1024).toFixed(1)} MB</div></div>
      </div>
    );
  });
}

export default function ChatApp() {
  const { user, logout, updateUser } = useAuth();
  const { chats, activeChat, messages, typingUsers, notifications, setNotifications, loadChats, loadMessages, selectChat, sendMessage, editMessage, deleteMessage, startTyping } = useChat();

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
  const [newChatSearch, setNewChatSearch] = useState('');
  const [newChatResults, setNewChatResults] = useState([]);
  const [settingsMode, setSettingsMode] = useState(false);
  const [tagEdit, setTagEdit] = useState('');
  const [tagError, setTagError] = useState('');
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
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState([]);
  const endRef = useRef(null);
  const inpRef = useRef(null);
  const typingTimer = useRef(null);
  const fileRef = useRef(null);

  const acd = chats.find((c) => c.id === activeChat);
  const cms = messages[activeChat] || [];

  const filteredChats = useMemo(() => chats.filter((c) => {
    if (!search) return true;
    return getChatName(c, user.id).toLowerCase().includes(search.toLowerCase());
  }), [chats, search, user]);

  const searchResults = useMemo(() => {
    if (!msgSearch.trim()) return [];
    return cms.filter((m) => m.text?.toLowerCase().includes(msgSearch.toLowerCase())).map((m) => m.id);
  }, [msgSearch, cms]);

  useEffect(() => {
    if (searchResults.length > 0 && msgSearchIdx >= 0)
      document.getElementById(`msg-${searchResults[msgSearchIdx]}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [msgSearchIdx, searchResults]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [cms.length, activeChat]);
  useEffect(() => { if (editingMsg || replyTo) inpRef.current?.focus(); }, [editingMsg, replyTo]);

  // ── Handlers ──
  const handleSend = () => {
    const text = input.trim();
    if (!text || !activeChat) return;
    const roleInChat = acd?.myRole || acd?.members?.find(m => m.userId === user.id)?.role || 'MEMBER';
    if (acd?.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(roleInChat)) return;
    if (editingMsg) { editMessage(activeChat, editingMsg.id, text); setEditingMsg(null); }
    else { sendMessage(activeChat, text, replyTo?.id, null); setReplyTo(null); }
    setInput('');
  };

  const handleTyping = () => {
    if (!activeChat) return;
    const roleInChat = acd?.myRole || acd?.members?.find(m => m.userId === user.id)?.role || 'MEMBER';
    if (acd?.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(roleInChat)) return;
    clearTimeout(typingTimer.current);
    startTyping(activeChat);
    typingTimer.current = setTimeout(() => {}, 3000);
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;
    const roleInChat = acd?.myRole || acd?.members?.find(m => m.userId === user.id)?.role || 'MEMBER';
    if (acd?.type === 'CHANNEL' && !['OWNER', 'ADMIN'].includes(roleInChat)) return;
    try {
      const media = await mediaApi.upload(file);
      await messagesApi.send(activeChat, { mediaIds: [media.id] });
      await loadMessages(activeChat);
      await loadChats();
    } catch (err) { console.error('Upload failed', err); }
    e.target.value = '';
    setAttachMenu(false);
  };

  const openProfile = async (userId) => {
    if (userId === user.id) { setProfileData({ ...user, online: true }); }
    else { try { const data = await usersApi.getById(userId); setProfileData(data); } catch {} }
    setSettingsMode(false);
    setProfilePanel(userId);
  };

  const handleNewChat = async (otherUserId, type = 'PRIVATE') => {
    try {
      const chat = await chatsApi.create({ type, memberIds: [otherUserId] });
      await loadChats(); selectChat(chat.id); setShowMobileChat(true);
      setNewChatModal(false); setNewChatMode('search');
    } catch (err) { console.error(err); }
  };

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

  const saveTag = async () => {
    const t = tagEdit.startsWith('@') ? tagEdit : '@' + tagEdit;
    try { await usersApi.updateTag(t); updateUser({ tag: t }); setTagError(''); } catch (e) { setTagError(e.message); }
  };

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const media = await mediaApi.upload(file);
      const avatarRef = `media:${media.id}`;
      await usersApi.update({ avatar: avatarRef });
      updateUser({ avatar: avatarRef });
      setProfileData(p => ({ ...p, avatar: avatarRef }));
    } catch (err) { console.error(err); }
  };

  const doForward = (chatId) => { if (!forwardMsg) return; sendMessage(chatId, forwardMsg.text, null, forwardMsg.id); setForwardMsg(null); selectChat(chatId); setShowMobileChat(true); };

  // ── Group management ──
  const myRole = acd?.myRole || acd?.members?.find(m => m.userId === user.id)?.role || 'MEMBER';
  const isOwnerOrAdmin = myRole === 'OWNER' || myRole === 'ADMIN';
  const isOwner = myRole === 'OWNER';
  const isGroupOrChannel = acd?.type === 'GROUP' || acd?.type === 'CHANNEL';

  const openGroupSettings = () => {
    if (!acd || !isGroupOrChannel) return;
    setEditGroupName(acd.name || '');
    setEditGroupDesc(acd.description || '');
    setGroupSettingsModal(true);
  };

  const saveGroupSettings = async () => {
    if (!activeChat) return;
    try {
      await chatsApi.update(activeChat, { name: editGroupName, description: editGroupDesc });
      await loadChats();
      setGroupSettingsModal(false);
    } catch (err) { console.error(err); }
  };

  const handleGroupAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeChat) return;
    try {
      const media = await mediaApi.upload(file);
      const avatarRef = `media:${media.id}`;
      await chatsApi.update(activeChat, { avatar: avatarRef });
      await loadChats();
    } catch (err) { console.error(err); }
  };

  const handleSetRole = async (targetId, role) => {
    if (!activeChat) return;
    try { await chatsApi.setMemberRole(activeChat, targetId, role); await loadChats(); } catch (err) { console.error(err); }
  };

  const handleKickMember = async (targetId) => {
    if (!activeChat) return;
    try { await chatsApi.removeMember(activeChat, targetId); await loadChats(); } catch (err) { console.error(err); }
  };

  const handleTransferOwnership = async (targetId) => {
    if (!activeChat || !confirm('Передать права создателя? Это действие нельзя отменить.')) return;
    try { await chatsApi.transferOwnership(activeChat, targetId); await loadChats(); } catch (err) { console.error(err); }
  };

  const handleAddMember = async (targetId) => {
    if (!activeChat) return;
    try { await chatsApi.addMember(activeChat, targetId); await loadChats(); setAddMemberSearch(''); setAddMemberResults([]); } catch (err) { console.error(err); }
  };

  const searchAddMember = async (q) => {
    setAddMemberSearch(q);
    if (q.length < 2) { setAddMemberResults([]); return; }
    try { setAddMemberResults(await usersApi.search(q)); } catch {}
  };

  const scrollToMsg = (msgId) => {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.style.background = 'rgba(74,158,229,0.15)'; setTimeout(() => el.style.background = 'transparent', 1500); }
  };

  const ctx = (e, msg) => { e.preventDefault(); e.stopPropagation(); setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 220), msg }); };

  const typingText = useMemo(() => {
    if (!activeChat) return null;
    const t = typingUsers[activeChat];
    if (!t || t.size === 0) return null;
    const names = [...t].map(uid => acd?.members?.find(m => m.userId === uid)?.user?.name?.split(' ')[0] || 'Кто-то');
    return names.length === 1 ? `${names[0]} печатает...` : `${names.join(', ')} печатают...`;
  }, [typingUsers, activeChat, acd]);

  const [toasts, setToasts] = useState([]);
  useEffect(() => {
    if (notifications.length > 0) {
      const latest = notifications[0];
      if (!toasts.some(t => t.id === latest.id)) {
        setToasts(p => [latest, ...p].slice(0, 3));
        setTimeout(() => setToasts(p => p.filter(t => t.id !== latest.id)), 4000);
      }
    }
  }, [notifications]);

  useEffect(() => {
    if (profilePanel || newChatModal || groupSettingsModal || memberListModal || forwardMsg || avatarView) {
      setNotifPanel(false);
    }
  }, [profilePanel, newChatModal, groupSettingsModal, memberListModal, forwardMsg, avatarView]);

  const openNotificationsPanel = useCallback(() => {
    setSidebarOpen(false);
    setProfilePanel(null);
    setSettingsMode(false);
    setNotifPanel(true);
  }, []);

  const openSettingsPanel = useCallback(() => {
    setSidebarOpen(false);
    setNotifPanel(false);
    setSettingsMode(true);
    setProfileData({ ...user, online: true });
    setProfilePanel(user.id);
  }, [user]);

  return (
    <div style={s.root} onClick={() => { setContextMenu(null); setSidebarOpen(false); setAttachMenu(false); setNotifPanel(false); }}>

      {/* ── Toasts ── */}
      <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
        {toasts.map(n => (
          <div key={n.id} style={{ pointerEvents: 'auto', background: '#1E2130', border: '1px solid rgba(74,158,229,0.2)', borderRadius: 14, padding: '12px 16px', minWidth: 260, maxWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, animation: 'slideDown .3s ease' }}
            onClick={() => { selectChat(n.chatId); setShowMobileChat(true); setToasts(p => p.filter(t => t.id !== n.id)); }}>
            <Icons.Bell size={16} /><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{n.chatName}</div><div style={{ fontSize: 12, color: '#6A7090', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.text}</div></div>
          </div>
        ))}
      </div>

      {/* ── Sidebar ── */}
      <div style={{ ...s.sb, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => { setSidebarOpen(false); openProfile(user.id); }}>
            <Av src={user.avatar} name={user.name} size={42} />
            <div><div style={{ fontSize: 15, fontWeight: 600 }}>{user.name}</div><div style={{ fontSize: 12, color: '#4A9EE5', fontFamily: 'mono' }}>{user.tag}</div></div>
          </div>
        </div>
        <div style={{ flex: 1, padding: '6px 0' }}>
          {[
            { l: 'Мой профиль', a: () => { setSidebarOpen(false); openProfile(user.id); } },
            { l: 'Настройки', a: openSettingsPanel },
            { l: 'Уведомления', a: openNotificationsPanel },
          ].map((it, i) => <div key={i} style={s.mi} onClick={it.a}>{it.l}</div>)}
          <div style={{ ...s.mi, color: '#E55A5A' }} onClick={() => { setSidebarOpen(false); logout(); }}>Выйти</div>
        </div>
        <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', opacity: 0.3, fontSize: 11, fontFamily: 'mono' }}>ZavodGram v0.4.0</div>
      </div>

      {/* ── Chat List ── */}
      <div style={s.cl} className="zg-chatlist">
        <div style={{ display: 'flex', alignItems: 'center', padding: '12px 12px', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <button style={s.ib} onClick={e => { e.stopPropagation(); setNotifPanel(false); setSidebarOpen(true); }}><Icons.Menu /></button>
          <h1 style={s.title}>ZavodGram</h1>
          <button style={s.ib} onClick={e => { e.stopPropagation(); notifPanel ? setNotifPanel(false) : openNotificationsPanel(); }}><Icons.Bell /></button>
          <button style={s.ib} onClick={() => setNewChatModal(true)}><Icons.Plus /></button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 12px', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, color: '#3A4050' }}>
          <Icons.Search /><input style={s.si} placeholder="Поиск чатов..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredChats.map(c => {
            const name = getChatName(c, user.id);
            const other = getOtherUser(c, user.id);
            const on = isOnline(c, user.id);
            return (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.025)', ...(activeChat === c.id ? { background: 'rgba(74,158,229,0.1)', borderLeft: '3px solid #4A9EE5' } : {}) }}
                onClick={() => { selectChat(c.id); setShowMobileChat(true); }}>
                <Av src={other?.avatar || c.avatar} name={name} color={tc[c.type]} online={on} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.type === 'SECRET' && <Icons.Lock />}{c.type === 'GROUP' && <Icons.Group />}{c.type === 'CHANNEL' && <Icons.Channel />}
                      {c.muted && <Icons.BellOff size={12} />} {name}
                    </span>
                    <span style={{ fontSize: 11, color: '#3A4050', flexShrink: 0, fontFamily: 'mono' }}>{formatTime(c.messages?.[0]?.createdAt || c.updatedAt)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, color: '#4A5060', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getLastMessage(c)}</span>
                    {c.unreadCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', padding: '2px 7px', borderRadius: 10, background: c.muted ? '#3A4050' : tc[c.type], fontFamily: 'mono' }}>{c.unreadCount}</span>}
                  </div>
                </div>
              </div>
            );
          })}
          {filteredChats.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#3A4050', fontSize: 14 }}>Нет чатов</div>}
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0C0E13' }} className="zg-chatarea">
        {activeChat && acd ? (() => {
          const chatName = getChatName(acd, user.id);
          const other = getOtherUser(acd, user.id);
          const isDirectChat = acd.type === 'PRIVATE' || acd.type === 'SECRET';
          const isChannel = acd.type === 'CHANNEL';
          const canPublishInChannel = !isChannel || ['OWNER', 'ADMIN'].includes(myRole);
          const on = isOnline(acd, user.id);
          const memberCount = acd._count?.members || acd.members?.length || 0;
          return (<>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,18,25,0.92)', backdropFilter: 'blur(12px)' }}>
              <button style={{ ...s.ib, display: 'none' }} className="zg-back" onClick={() => setShowMobileChat(false)}><Icons.Back /></button>
              <Av src={other?.avatar || acd.avatar} name={chatName} size={38} color={tc[acd.type]} online={on}
                onClick={() => isDirectChat && other ? openProfile(other.id) : isGroupOrChannel ? openGroupSettings() : null} />
              <div style={{ flex: 1, cursor: 'pointer' }} onClick={() => isDirectChat && other ? openProfile(other.id) : isGroupOrChannel ? openGroupSettings() : null}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{chatName}</div>
                <div style={{ fontSize: 12, color: typingText ? '#4A9EE5' : '#3A4050', cursor: isGroupOrChannel ? 'pointer' : 'default' }}
                  onClick={(e) => { if (isGroupOrChannel) { e.stopPropagation(); setMemberListModal(true); } }}>
                  {typingText || (acd.type === 'SECRET' ? '🔐 End-to-end' : acd.type === 'GROUP' ? `${memberCount} участников` : acd.type === 'CHANNEL' ? `${memberCount} подписчиков` : on ? 'в сети' : 'был(а) недавно')}
                </div>
              </div>
              <button style={s.ib} onClick={() => { setMsgSearchOpen(!msgSearchOpen); setMsgSearch(''); setMsgSearchIdx(-1); }}><Icons.Search /></button>
              <button style={s.ib} onClick={() => handleMute(acd.id)}>{acd.muted ? <Icons.BellOff /> : <Icons.Bell />}</button>
              {isDirectChat && other && <button style={s.ib} onClick={() => openProfile(other.id)}><Icons.User /></button>}
            </div>

            {/* Message search bar */}
            {msgSearchOpen && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,18,25,0.95)' }}>
                <Icons.Search size={16} />
                <input style={{ ...s.si, fontSize: 13 }} placeholder="Поиск..." value={msgSearch} onChange={e => { setMsgSearch(e.target.value); setMsgSearchIdx(0); }} autoFocus />
                <span style={{ fontSize: 12, color: '#4A5060', fontFamily: 'mono', whiteSpace: 'nowrap' }}>{searchResults.length > 0 ? `${msgSearchIdx+1}/${searchResults.length}` : msgSearch ? '0' : ''}</span>
                {searchResults.length > 1 && <>
                  <button style={s.ib} onClick={() => setMsgSearchIdx(i => Math.max(0, i-1))}><span style={{ transform: 'rotate(180deg)', display: 'flex' }}><Icons.ArrowDown /></span></button>
                  <button style={s.ib} onClick={() => setMsgSearchIdx(i => Math.min(searchResults.length-1, i+1))}><Icons.ArrowDown /></button>
                </>}
                <button style={s.ib} onClick={() => { setMsgSearchOpen(false); setMsgSearch(''); }}><Icons.Close /></button>
              </div>
            )}

            {acd.type === 'SECRET' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 5, background: 'rgba(74,229,142,0.06)', color: '#4AE58E', fontSize: 12, fontFamily: 'mono' }}><Icons.Lock /> Сквозное шифрование</div>}

            {/* Messages */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: isChannel ? 10 : 3 }}>
              {cms.map(msg => {
                const isMine = msg.fromId === user.id || msg.from?.id === user.id;
                const sender = msg.from || {};
                const isHL = searchResults[msgSearchIdx] === msg.id;
                const postAuthor = acd.name || chatName;
                return (
                  <div key={msg.id} id={`msg-${msg.id}`} style={{ display: 'flex', justifyContent: isChannel ? 'stretch' : (isMine ? 'flex-end' : 'flex-start'), marginBottom: 2, alignItems: 'flex-end', gap: 6, transition: 'background .3s', borderRadius: 8, ...(isHL ? { background: 'rgba(74,158,229,0.12)' } : {}) }}
                    onContextMenu={e => ctx(e, { ...msg, mine: isMine })}>
                    {!isMine && acd.type === 'GROUP' && (
                      <Av src={sender.avatar} name={sender.name} size={28} radius={8} color={sender.color} onClick={() => openProfile(msg.fromId || sender.id)} />
                    )}
                    <div style={{
                      maxWidth: isChannel ? '100%' : '72%',
                      width: isChannel ? '100%' : 'auto',
                      padding: isChannel ? '14px 16px' : '8px 12px',
                      borderRadius: 14,
                      lineHeight: 1.45,
                      ...(isChannel
                        ? { background: 'linear-gradient(135deg, rgba(74,158,229,0.12), rgba(124,107,222,0.09))', border: '1px solid rgba(74,158,229,0.2)' }
                        : (isMine ? { background: 'linear-gradient(135deg, rgba(74,158,229,0.15), rgba(124,107,222,0.15))', borderBottomRightRadius: 4, border: '1px solid rgba(74,158,229,0.1)' } : { background: 'rgba(255,255,255,0.05)', borderBottomLeftRadius: 4, border: '1px solid rgba(255,255,255,0.04)' }))
                    }}>
                      {isChannel && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <Icons.Channel />
                          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, color: '#E8EDF8' }}>{postAuthor}</span>
                        </div>
                      )}
                      {msg.forwardedFromName && <div style={{ fontSize: 12, color: '#4A9EE5', marginBottom: 4, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}><Icons.Forward /> Переслано от {msg.forwardedFromName}</div>}
                      {msg.replyTo && (
                        <div style={{ padding: '4px 8px', marginBottom: 6, borderLeft: '3px solid #4A9EE5', background: 'rgba(74,158,229,0.08)', borderRadius: '0 6px 6px 0', cursor: 'pointer', fontSize: 12 }}
                          onClick={() => scrollToMsg(msg.replyTo.id)}>
                          <span style={{ fontWeight: 600, color: '#4A9EE5', display: 'block', marginBottom: 1 }}>{msg.replyTo.from?.name}</span>
                          <span style={{ color: '#6A7090' }}>{msg.replyTo.text?.slice(0, 60)}</span>
                        </div>
                      )}
                      {!isMine && acd.type === 'GROUP' && !msg.forwardedFromName && (
                        <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#7C6BDE', marginBottom: 2, cursor: 'pointer' }} onClick={() => openProfile(msg.fromId || sender.id)}>
                          {sender.name} <span style={{ fontSize: 11, fontWeight: 400, opacity: 0.4, fontFamily: 'mono' }}>{sender.tag}</span>
                        </span>
                      )}
                      <MediaAttachment media={msg.media} />
                      {msg.text && <span style={{ fontSize: 14, wordBreak: 'break-word' }}>{msgSearch ? highlightText(msg.text, msgSearch) : msg.text}</span>}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', fontSize: 11, color: '#3A4050', marginTop: 8, fontFamily: 'mono' }}>
                        {msg.edited && <span style={{ fontStyle: 'italic', opacity: 0.5 }}>ред.</span>}
                        {msg.encrypted && <Icons.Lock />}
                        {formatTimeShort(msg.createdAt)}
                        {isMine && <span style={{ display: 'flex', alignItems: 'center', color: '#4A9EE5' }}><Icons.Check double={msg.status === 'READ'} /></span>}
                      </span>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {/* Reply / Edit bar */}
            {(editingMsg || replyTo) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderTop: '1px solid rgba(74,158,229,0.15)', background: 'rgba(74,158,229,0.05)', color: '#4A9EE5' }}>
                {editingMsg ? <Icons.Edit /> : <Icons.Reply />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{editingMsg ? 'Редактирование' : `Ответ для ${replyTo?.from?.name}`}</div>
                  <div style={{ fontSize: 13, color: '#4A5060', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editingMsg?.text || replyTo?.text}</div>
                </div>
                <button style={s.ib} onClick={() => { setEditingMsg(null); setReplyTo(null); setInput(''); }}><Icons.Close /></button>
              </div>
            )}

            {/* Input */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,18,25,0.92)' }}>
              {canPublishInChannel ? (
                <>
                  <div style={{ position: 'relative' }}>
                    <button style={s.ib} onClick={e => { e.stopPropagation(); setAttachMenu(!attachMenu); }}><Icons.Attach /></button>
                    {attachMenu && (
                      <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 8, background: '#1A1D26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 4, zIndex: 50, minWidth: 150, boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                        <label style={s.mi}><Icons.Image /> Фото/Видео<input type="file" accept="image/*,video/*" onChange={handleFileUpload} style={{ display: 'none' }} /></label>
                        <label style={s.mi}><Icons.File /> Файл<input type="file" onChange={handleFileUpload} style={{ display: 'none' }} /></label>
                      </div>
                    )}
                  </div>
                  <input ref={inpRef} style={s.inp2} placeholder={isChannel ? 'Опубликовать новость...' : 'Сообщение...'} value={input}
                    onChange={e => { setInput(e.target.value); handleTyping(); }}
                    onKeyDown={e => e.key === 'Enter' && handleSend()} />
                  <button style={{ ...s.sendBtn, opacity: input.trim() ? 1 : 0.3 }} onClick={handleSend} disabled={!input.trim()}><Icons.Send /></button>
                </>
              ) : (
                <div style={{ width: '100%', padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.04)', color: '#6A7090', fontSize: 13 }}>
                  Только администраторы и модераторы могут публиковать посты в этом канале.
                </div>
              )}
            </div>
          </>);
        })() : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}>
            <div style={{ width: 80, height: 80, background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 700, fontFamily: 'mono', color: '#fff', marginBottom: 16 }}>Z</div>
            <h2 style={{ fontSize: 24, fontWeight: 700, fontFamily: 'mono', marginBottom: 8 }}>ZavodGram</h2>
            <p style={{ fontSize: 14, color: '#4A5060' }}>Выберите чат для начала</p>
          </div>
        )}
      </div>

      {/* ── Profile Panel ── */}
      {profilePanel && profileData && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, maxWidth: '100vw', background: '#11141B', borderLeft: '1px solid rgba(255,255,255,0.06)', zIndex: 90, display: 'flex', flexDirection: 'column', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button style={s.ib} onClick={() => setProfilePanel(null)}><Icons.Close /></button>
            <span style={{ fontSize: 15, fontWeight: 600 }}>{settingsMode ? 'Настройки' : 'Профиль'}</span>
          </div>
          <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', marginBottom: 14 }}>
              <Av src={profileData.avatar} name={profileData.name} size={90} radius={22}
                onClick={() => !settingsMode && setAvatarView({ url: profileData.avatar, name: profileData.name })} />
              {settingsMode && (
                <label style={{ position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #11141B' }}>
                  <Icons.Edit />
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarUpload} />
                </label>
              )}
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{profileData.name}</h2>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: 'rgba(74,158,229,0.1)', borderRadius: 20, color: '#4A9EE5', fontSize: 13, fontWeight: 600, fontFamily: 'mono', marginBottom: 18 }}><Icons.Tag />{profileData.tag}<Icons.Shield /></div>

            {settingsMode ? (
              <div style={{ width: '100%' }}>
                <label style={s.lbl}>Персональный тег</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input style={{ ...s.inp2, fontFamily: 'mono' }} value={tagEdit || user.tag} onChange={e => { setTagEdit(e.target.value); setTagError(''); }} />
                  <button onClick={saveTag} style={s.saveBtn}>Сохранить</button>
                </div>
                {tagError && <span style={{ color: '#E55A5A', fontSize: 12, fontFamily: 'mono', marginTop: 4, display: 'block' }}>{tagError}</span>}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 18, padding: '12px 14px', background: 'rgba(74,229,142,0.06)', borderRadius: 10, color: '#4AE58E', fontSize: 12, lineHeight: 1.5 }}>
                  <Icons.Shield /><span>Тег бронируется за вами навсегда.</span>
                </div>
              </div>
            ) : (<>
              <p style={{ fontSize: 14, color: '#7A8090', textAlign: 'center', lineHeight: 1.55, marginBottom: 22, maxWidth: 260 }}>{profileData.bio}</p>
              <div style={{ width: '100%' }}>
                {[['Телефон', profileData.phone], ['Тег', profileData.tag, '#4A9EE5']].map(([l, v, c], i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 13, color: '#4A5060' }}>{l}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'mono', color: c || '#E8E8ED' }}>{v}</span>
                  </div>
                ))}
              </div>
            </>)}
          </div>
        </div>
      )}

      {/* ── Notification Panel ── */}
      {notifPanel && (
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, maxWidth: '100vw', background: '#11141B', borderLeft: '1px solid rgba(255,255,255,0.06)', zIndex: 95, display: 'flex', flexDirection: 'column', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <button style={s.ib} onClick={() => setNotifPanel(false)}><Icons.Close /></button>
            <span style={{ fontSize: 15, fontWeight: 600 }}>Уведомления</span>
            {notifications.length > 0 && <button style={{ ...s.ib, marginLeft: 'auto', fontSize: 12, color: '#4A9EE5' }} onClick={() => setNotifications([])}>Очистить</button>}
          </div>
          <div style={{ flex: 1, padding: '8px 0' }}>
            {notifications.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#3A4050' }}>Нет уведомлений</div> : notifications.map(n => (
              <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.025)' }}
                onClick={() => { selectChat(n.chatId); setShowMobileChat(true); setNotifPanel(false); }}>
                <Icons.Bell size={14} /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{n.chatName}</div><div style={{ fontSize: 12, color: '#4A5060' }}>{n.text}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Context Menu ── */}
      {contextMenu && (
        <div style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#1A1D26', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 4, zIndex: 200, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
          <div style={s.mi} onClick={() => { setReplyTo(contextMenu.msg); setEditingMsg(null); setInput(''); setContextMenu(null); inpRef.current?.focus(); }}><Icons.Reply /> Ответить</div>
          <div style={s.mi} onClick={() => { setForwardMsg(contextMenu.msg); setContextMenu(null); }}><Icons.Forward /> Переслать</div>
          <div style={s.mi} onClick={() => { navigator.clipboard?.writeText(contextMenu.msg.text || ''); setContextMenu(null); }}><Icons.Copy /> Копировать</div>
          {contextMenu.msg.mine && <div style={s.mi} onClick={() => { setEditingMsg(contextMenu.msg); setReplyTo(null); setInput(contextMenu.msg.text || ''); setContextMenu(null); }}><Icons.Edit /> Редактировать</div>}
          {contextMenu.msg.mine && <div style={{ ...s.mi, color: '#E55A5A' }} onClick={() => { deleteMessage(activeChat, contextMenu.msg.id); setContextMenu(null); }}><Icons.Trash /> Удалить</div>}
        </div>
      )}

      {/* ── Forward Modal ── */}
      {forwardMsg && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }} onClick={() => setForwardMsg(null)}>
          <div style={{ background: '#1A1D26', borderRadius: 16, padding: 20, minWidth: 300, maxWidth: 380, border: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, fontFamily: 'mono' }}>Переслать</h3>
            <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#6A7090', borderLeft: '3px solid #4A9EE5' }}>{forwardMsg.text || '[медиа]'}</div>
            <div style={{ maxHeight: 240, overflowY: 'auto' }}>
              {chats.filter(c => c.type !== 'CHANNEL').map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer', borderRadius: 8 }} onClick={() => doForward(c.id)}>
                  <Av name={getChatName(c, user.id)} size={32} radius={8} color={tc[c.type]} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{getChatName(c, user.id)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── New Chat Modal ── */}
      {newChatModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }} onClick={() => { setNewChatModal(false); setNewChatMode('search'); }}>
          <div style={{ background: '#1A1D26', borderRadius: 16, padding: 24, width: 400, maxWidth: '92vw', border: '1px solid rgba(255,255,255,0.08)' }} onClick={e => e.stopPropagation()}>
            {newChatMode === 'search' ? (<>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, fontFamily: 'mono' }}>Новый чат</h3>
              {/* Type selector */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
                {[['Личный','PRIVATE','#4A9EE5'],['Группа','GROUP','#7C6BDE'],['Канал','CHANNEL','#E5884A'],['Секретный','SECRET','#4AE58E']].map(([l,t,c]) => (
                  <button key={t} onClick={() => (t === 'GROUP' || t === 'CHANNEL') ? setNewChatMode(t) : setNewChatType(t)}
                    style={{ flex: 1, padding: '8px 4px', background: newChatType === t ? c+'22' : 'rgba(255,255,255,0.04)', border: `1px solid ${newChatType === t ? c : 'rgba(255,255,255,0.06)'}`, borderRadius: 8, color: newChatType === t ? c : '#6A7090', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'mono' }}>{l}</button>
                ))}
              </div>
              <input style={s.inp2} placeholder="Поиск по имени или @тегу..." value={newChatSearch} onChange={e => searchNewChat(e.target.value)} autoFocus />
              <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 12 }}>
                {newChatResults.map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer', borderRadius: 8 }} onClick={() => handleNewChat(u.id, newChatType)}>
                    <Av src={u.avatar} name={u.name} size={36} radius={10} online={u.online} />
                    <div><div style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</div><div style={{ fontSize: 12, color: '#4A9EE5', fontFamily: 'mono' }}>{u.tag}</div></div>
                  </div>
                ))}
                {newChatSearch.length >= 2 && newChatResults.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#3A4050', fontSize: 13 }}>Никого не найдено</div>}
              </div>
            </>) : (<>
              {/* Group / Channel creation */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <button style={s.ib} onClick={() => setNewChatMode('search')}><Icons.Back /></button>
                <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'mono' }}>{newChatMode === 'GROUP' ? 'Новая группа' : 'Новый канал'}</h3>
              </div>
              <input style={{ ...s.inp2, marginBottom: 8 }} placeholder="Название" value={groupName} onChange={e => setGroupName(e.target.value)} autoFocus />
              <textarea style={{ ...s.inp2, minHeight: 50, resize: 'vertical', marginBottom: 12 }} placeholder="Описание (необязательно)" value={groupDesc} onChange={e => setGroupDesc(e.target.value)} />
              <input style={s.inp2} placeholder="Добавить участников..." value={newChatSearch} onChange={e => searchNewChat(e.target.value)} />
              {groupMembers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
                  {groupMembers.map(m => (
                    <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(74,158,229,0.1)', borderRadius: 20, fontSize: 12, color: '#4A9EE5' }}>
                      {m.name} <span style={{ cursor: 'pointer', opacity: 0.6, fontSize: 14 }} onClick={() => setGroupMembers(p => p.filter(x => x.id !== m.id))}>×</span>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 8 }}>
                {newChatResults.filter(u => !groupMembers.some(m => m.id === u.id)).map(u => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer', borderRadius: 8 }} onClick={() => setGroupMembers(p => [...p, u])}>
                    <Av src={u.avatar} name={u.name} size={30} radius={8} />
                    <span style={{ fontSize: 13 }}>{u.name}</span>
                    <span style={{ fontSize: 11, color: '#4A9EE5', fontFamily: 'mono' }}>{u.tag}</span>
                  </div>
                ))}
              </div>
              <button style={{ ...s.saveBtn, width: '100%', marginTop: 14, opacity: groupName.trim() ? 1 : 0.4 }} disabled={!groupName.trim()} onClick={createGroupOrChannel}>
                Создать {newChatMode === 'GROUP' ? 'группу' : 'канал'}
              </button>
            </>)}
          </div>
        </div>
      )}

      {/* ── Avatar Fullscreen ── */}
      {avatarView && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, cursor: 'pointer' }} onClick={() => setAvatarView(null)}>
          {avatarView.url ? (
            <img src={resolveAvatarSrc(avatarView.url)} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 16 }} alt="" />
          ) : (
            <div style={{ width: 240, height: 240, borderRadius: 32, background: '#4A9EE5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 96, fontWeight: 700, color: '#fff', fontFamily: 'mono' }}>
              {avatarView.name?.split(' ').map(w => w[0]).join('').slice(0, 2)}
            </div>
          )}
        </div>
      )}

      {/* ── Group Settings Modal ── */}
      {groupSettingsModal && acd && isGroupOrChannel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350, backdropFilter: 'blur(4px)' }} onClick={() => setGroupSettingsModal(false)}>
          <div style={{ background: '#1A1D26', borderRadius: 16, padding: 24, width: 400, maxWidth: '92vw', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <button style={s.ib} onClick={() => setGroupSettingsModal(false)}><Icons.Close /></button>
              <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'mono' }}>{acd.type === 'GROUP' ? 'Настройки группы' : 'Настройки канала'}</h3>
            </div>

            {/* Group avatar */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div style={{ position: 'relative' }}>
                <Av src={acd.avatar} name={acd.name} size={90} radius={22} color={tc[acd.type]} />
                {isOwnerOrAdmin && (
                  <label style={{ position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #1A1D26' }}>
                    <Icons.Edit />
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleGroupAvatarUpload} />
                  </label>
                )}
              </div>
            </div>

            {isOwnerOrAdmin ? (<>
              <label style={s.lbl}>Название</label>
              <input style={s.inp2} value={editGroupName} onChange={e => setEditGroupName(e.target.value)} />

              <label style={{ ...s.lbl, marginTop: 12 }}>Описание</label>
              <textarea style={{ ...s.inp2, minHeight: 60, resize: 'vertical' }} value={editGroupDesc} onChange={e => setEditGroupDesc(e.target.value)} />

              <button style={{ ...s.saveBtn, width: '100%', marginTop: 16 }} onClick={saveGroupSettings}>Сохранить</button>
            </>) : (<>
              <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>{acd.name}</h2>
              {acd.description && <p style={{ fontSize: 14, color: '#7A8090', textAlign: 'center', lineHeight: 1.5 }}>{acd.description}</p>}
            </>)}

            {/* Quick member count */}
            <div style={{ marginTop: 20, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
              onClick={() => { setGroupSettingsModal(false); setMemberListModal(true); }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icons.Group />
                <span style={{ fontSize: 14 }}>{acd._count?.members || acd.members?.length} участников</span>
              </div>
              <span style={{ color: '#4A9EE5', fontSize: 13 }}>Показать →</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Member List Modal ── */}
      {memberListModal && acd && isGroupOrChannel && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350, backdropFilter: 'blur(4px)' }} onClick={() => { setMemberListModal(false); setAddMemberSearch(''); setAddMemberResults([]); }}>
          <div style={{ background: '#1A1D26', borderRadius: 16, padding: 24, width: 420, maxWidth: '92vw', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button style={s.ib} onClick={() => { setMemberListModal(false); setAddMemberSearch(''); setAddMemberResults([]); }}><Icons.Close /></button>
              <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'mono', flex: 1 }}>Участники ({acd.members?.length || 0})</h3>
              {isOwnerOrAdmin && <button style={{ ...s.ib, color: '#4A9EE5', fontSize: 12, gap: 4, display: 'flex', alignItems: 'center' }}
                onClick={() => { setGroupSettingsModal(true); setMemberListModal(false); }}><Icons.Edit /> Управление</button>}
            </div>

            {/* Add member (owner/admin) */}
            {isOwnerOrAdmin && (
              <div style={{ marginBottom: 12 }}>
                <input style={s.inp2} placeholder="Добавить участника..." value={addMemberSearch} onChange={e => searchAddMember(e.target.value)} />
                {addMemberResults.length > 0 && (
                  <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4 }}>
                    {addMemberResults.filter(u => !acd.members?.some(m => m.userId === u.id)).map(u => (
                      <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', borderRadius: 6 }} onClick={() => handleAddMember(u.id)}>
                        <Av src={u.avatar} name={u.name} size={28} radius={7} />
                        <span style={{ fontSize: 13 }}>{u.name}</span>
                        <span style={{ fontSize: 11, color: '#4A9EE5', fontFamily: 'mono' }}>{u.tag}</span>
                        <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4AE58E' }}>+ Добавить</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Member list */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {(acd.members || [])
                .sort((a, b) => { const order = { OWNER: 0, ADMIN: 1, MEMBER: 2 }; return (order[a.role] || 2) - (order[b.role] || 2); })
                .map(member => {
                  const u = member.user;
                  const isMe = member.userId === user.id;
                  const roleLabel = member.role === 'OWNER' ? 'Создатель' : member.role === 'ADMIN' ? 'Модератор' : null;
                  const roleColor = member.role === 'OWNER' ? '#E5884A' : member.role === 'ADMIN' ? '#7C6BDE' : null;
                  const canManage = isOwner && !isMe && member.role !== 'OWNER';
                  const canAdminManage = isOwnerOrAdmin && !isMe && member.role === 'MEMBER';

                  return (
                    <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <Av src={u?.avatar} name={u?.name} size={38} radius={10} onClick={() => { setMemberListModal(false); openProfile(member.userId); }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {u?.name}
                          {roleLabel && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: roleColor + '22', color: roleColor, fontFamily: 'mono', fontWeight: 600 }}>{roleLabel}</span>}
                          {isMe && <span style={{ fontSize: 10, color: '#4A5060' }}>(вы)</span>}
                        </div>
                        <div style={{ fontSize: 12, color: '#4A9EE5', fontFamily: 'mono' }}>{u?.tag}</div>
                      </div>

                      {/* Actions dropdown */}
                      {(canManage || canAdminManage) && (
                        <div style={{ position: 'relative' }}>
                          <select
                            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#8A8FA0', fontSize: 11, padding: '4px 6px', cursor: 'pointer', fontFamily: 'mono' }}
                            value=""
                            onChange={e => {
                              const action = e.target.value;
                              if (action === 'make_admin') handleSetRole(member.userId, 'ADMIN');
                              if (action === 'remove_admin') handleSetRole(member.userId, 'MEMBER');
                              if (action === 'kick') handleKickMember(member.userId);
                              if (action === 'transfer') handleTransferOwnership(member.userId);
                              e.target.value = '';
                            }}
                          >
                            <option value="" disabled>···</option>
                            {isOwner && member.role === 'MEMBER' && <option value="make_admin">Назначить модератором</option>}
                            {isOwner && member.role === 'ADMIN' && <option value="remove_admin">Снять модератора</option>}
                            {(canManage || canAdminManage) && <option value="kick">Удалить из группы</option>}
                            {isOwner && <option value="transfer">Передать права создателя</option>}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown{from{opacity:0;transform:translateY(-12px)}to{opacity:1;transform:translateY(0)}}
        @media(max-width:700px){
          .zg-chatlist{${showMobileChat ? 'display:none !important' : 'width:100% !important;max-width:100% !important'}}
          .zg-chatarea{${showMobileChat ? 'display:flex !important;width:100% !important' : 'display:none !important'}}
          .zg-back{display:flex !important}
        }
      `}</style>
    </div>
  );
}

const s = {
  root: { display: 'flex', width: '100%', height: '100vh', background: '#0C0E13', fontFamily: "'Manrope', sans-serif", color: '#E8E8ED', position: 'relative', overflow: 'hidden' },
  sb: { position: 'absolute', top: 0, left: 0, bottom: 0, width: 280, background: '#11141B', borderRight: '1px solid rgba(255,255,255,0.06)', zIndex: 100, display: 'flex', flexDirection: 'column', transition: 'transform .25s cubic-bezier(.4,0,.2,1)' },
  cl: { width: 360, minWidth: 280, maxWidth: 400, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', background: '#0F1219' },
  title: { flex: 1, fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  ib: { background: 'none', border: 'none', color: '#5A6070', cursor: 'pointer', padding: 6, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  si: { flex: 1, background: 'none', border: 'none', outline: 'none', color: '#E8E8ED', fontSize: 13, fontFamily: "'Manrope', sans-serif" },
  mi: { display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer', borderRadius: 8 },
  lbl: { fontSize: 11, color: '#4A5060', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2, fontFamily: "'JetBrains Mono', monospace", display: 'block', marginTop: 14, marginBottom: 4 },
  inp2: { flex: 1, width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '10px 14px', color: '#E8E8ED', fontSize: 14, fontFamily: "'Manrope', sans-serif", outline: 'none' },
  saveBtn: { padding: '10px 16px', background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' },
  sendBtn: { width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
};
