import { Icons } from './Icons';

export function ChatToasts({ toasts, onOpenToast }) {
  if (!toasts.length) return null;

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 8, pointerEvents: 'none' }}>
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{ pointerEvents: 'auto', background: '#20232A', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 14, padding: '12px 16px', minWidth: 260, maxWidth: 340, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, animation: 'slideDown .3s ease' }}
          onClick={() => onOpenToast?.(toast)}
        >
          <Icons.Bell size={16} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{toast.chatName}</div>
            <div style={{ fontSize: 12, color: '#9CA3B1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{toast.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
