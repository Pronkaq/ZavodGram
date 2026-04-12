import { useCallback } from 'react';
import { highlightText } from '../utils/helpers.jsx';
import { sanitizeRichHtml, richTextToPlain } from './chatRichText';

export function useMessageTextRenderer({ msgSearch }) {
  return useCallback((text) => {
    if (!text) return null;
    const safeHtml = sanitizeRichHtml(text);
    const plain = richTextToPlain(safeHtml);
    if (msgSearch) return highlightText(plain, msgSearch);
    if (safeHtml !== plain) {
      return <span className="zg-rich-text" style={{ whiteSpace: 'pre-wrap' }} dangerouslySetInnerHTML={{ __html: safeHtml }} />;
    }
    const parts = plain.split(/(https?:\/\/[^\s]+)/g);
    return parts.map((part, idx) => (
      /^https?:\/\/[^\s]+$/.test(part)
        ? <a key={idx} href={part} target="_blank" rel="noreferrer" style={{ color: '#F5F6F8', textDecoration: 'underline' }}>{part}</a>
        : <span key={idx}>{part}</span>
    ));
  }, [msgSearch]);
}
