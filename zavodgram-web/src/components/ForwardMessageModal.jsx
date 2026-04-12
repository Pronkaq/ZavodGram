import { Av } from './chatUiParts';
import { getChatName } from '../utils/helpers.jsx';
import { typeColors } from './Icons';

const tc = typeColors;

export function ForwardMessageModal({ openMessage, chats, userId, onForward, onClose }) {
  if (!openMessage) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#1D2128', borderRadius: 16, padding: 20, minWidth: 300, maxWidth: 380, border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, fontFamily: 'mono' }}>Переслать</h3>
        <div style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#9CA3B1', borderLeft: '3px solid #E9EBEF' }}>{openMessage.text || '[медиа]'}</div>
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {chats.filter((c) => c.type !== 'CHANNEL').map((c) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer', borderRadius: 8 }} onClick={() => onForward(c.id)}>
              <Av name={getChatName(c, userId)} size={32} radius={8} color={tc[c.type]} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{getChatName(c, userId)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
