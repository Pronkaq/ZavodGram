import React from 'react';

export function formatTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - d) / 86400000);

  if (diffDays === 0) return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  if (diffDays === 1) return 'вчера';
  if (diffDays < 7) return d.toLocaleDateString('ru', { weekday: 'short' });
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

export function formatTimeShort(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

export function getChatName(chat, myId) {
  if (chat.name) return chat.name;
  // Private chat — show other person's name
  const other = chat.members?.find((m) => m.userId !== myId);
  return other?.user?.name || 'Чат';
}

export function getChatAvatar(chat, myId) {
  if (chat.name) {
    return chat.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  }
  const other = chat.members?.find((m) => m.userId !== myId);
  return other?.user?.name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export function getOtherUser(chat, myId) {
  return chat.members?.find((m) => m.userId !== myId)?.user || null;
}

export function isOnline(chat, myId) {
  if (chat.type === 'GROUP' || chat.type === 'CHANNEL') return null;
  const other = getOtherUser(chat, myId);
  return other?.online || false;
}

export function getLastMessage(chat) {
  const msg = chat.messages?.[0];
  if (!msg) return '';
  const prefix = chat.type === 'GROUP' && msg.from ? `${msg.from.name}: ` : '';
  return prefix + (msg.text || '[медиа]');
}

export function highlightText(text, query) {
  if (!query?.trim() || !text) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(74,158,229,0.35)', color: '#fff', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}
