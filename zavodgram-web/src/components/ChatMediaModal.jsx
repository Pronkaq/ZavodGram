import { Icons } from './Icons';

export function ChatMediaModal({ media, styles, onClose }) {
  if (!media) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,12,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 430, padding: 18 }}
      onClick={onClose}
    >
      <div style={{ width: 'min(96vw, 980px)', maxHeight: '92vh', display: 'flex', flexDirection: 'column', gap: 10 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          <button type="button" style={styles.ib} onClick={onClose} aria-label="Закрыть медиа"><Icons.Close /></button>
        </div>
        <div style={{ background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, overflow: 'hidden', maxHeight: 'calc(92vh - 54px)' }}>
          {media.type === 'VIDEO' ? (
            <video src={media.src} controls autoPlay playsInline style={{ width: '100%', maxHeight: 'calc(92vh - 56px)', display: 'block', background: '#000' }} />
          ) : (
            <img src={media.src} alt={media.title || 'media'} style={{ width: '100%', maxHeight: 'calc(92vh - 56px)', objectFit: 'contain', display: 'block', background: '#000' }} />
          )}
        </div>
      </div>
    </div>
  );
}
