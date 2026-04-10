const ALLOWED_RICH_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'A', 'BR']);

export function sanitizeRichHtml(html = '') {
  if (!html) return '';
  if (typeof window === 'undefined' || !window.DOMParser) return html;
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  if (!root) return '';

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return doc.createTextNode(node.textContent || '');
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return doc.createTextNode('');
    const tag = node.tagName?.toUpperCase();
    if (!ALLOWED_RICH_TAGS.has(tag)) {
      const fragment = doc.createDocumentFragment();
      Array.from(node.childNodes).forEach((child) => fragment.appendChild(sanitizeNode(child)));
      return fragment;
    }
    if (tag === 'BR') return doc.createElement('br');
    const safeEl = doc.createElement(tag.toLowerCase());
    if (tag === 'A') {
      const href = node.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) {
        safeEl.setAttribute('href', href);
        safeEl.setAttribute('target', '_blank');
        safeEl.setAttribute('rel', 'noreferrer');
      }
    }
    Array.from(node.childNodes).forEach((child) => safeEl.appendChild(sanitizeNode(child)));
    return safeEl;
  };

  const fragment = doc.createDocumentFragment();
  Array.from(root.childNodes).forEach((child) => fragment.appendChild(sanitizeNode(child)));
  const holder = doc.createElement('div');
  holder.appendChild(fragment);
  return holder.innerHTML
    .replace(/<div><br><\/div>/gi, '<br>')
    .replace(/<\/div><div>/gi, '<br>')
    .replace(/<\/?div>/gi, '');
}

export function richTextToPlain(text = '') {
  if (!text) return '';
  if (typeof window === 'undefined' || !window.DOMParser) return text.replace(/<[^>]*>/g, '').trim();
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(`<div>${text}</div>`, 'text/html');
  return (doc.body.textContent || '').replace(/\u00A0/g, ' ').trim();
}
