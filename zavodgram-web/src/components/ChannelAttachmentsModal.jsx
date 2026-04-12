import { mediaUrlById } from './chatUiParts';

export function ChannelAttachmentsModal({ open, channelAttachments, onClose }) {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#1D2128', borderRadius: 16, padding: 20, width: 520, maxWidth: '96vw', maxHeight: '82vh', border: '1px solid rgba(255,255,255,0.08)', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12, fontFamily: 'mono' }}>Вложения канала</h3>
        {channelAttachments.length === 0 && <div style={{ color: '#A2A8B6', fontSize: 13 }}>Пока нет вложений или ссылок.</div>}
        {channelAttachments.map((item) => (
          <div key={`${item.msgId}-${item.kind}-${item.id || item.media?.id}`} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            {item.kind === 'link' ? (
              <a href={item.url} target="_blank" rel="noreferrer" style={{ color: '#E9EBEF', wordBreak: 'break-all' }}>{item.url}</a>
            ) : item.media?.type === 'IMAGE' ? (
              <img src={mediaUrlById(item.media.id)} alt={item.media.originalName} style={{ maxWidth: '100%', borderRadius: 10 }} />
            ) : (
              <a href={mediaUrlById(item.media.id)} target="_blank" rel="noreferrer" style={{ color: '#E9EBEF' }}>{item.media?.originalName || 'Файл'}</a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
