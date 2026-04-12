import { useMemo } from 'react';

const extractLinks = (text) => {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s]+/g);
  return matches || [];
};

export function useChannelAttachments({ acd, cms }) {
  return useMemo(() => {
    if (!acd || acd.type !== 'CHANNEL') return [];
    const list = [];
    cms.forEach((msg) => {
      (msg.media || []).forEach((m) => list.push({ kind: 'media', msgId: msg.id, createdAt: msg.createdAt, media: m }));
      extractLinks(msg.text).forEach((url, idx) => list.push({ kind: 'link', msgId: msg.id, createdAt: msg.createdAt, id: `${msg.id}-${idx}`, url }));
    });
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [acd, cms]);
}
