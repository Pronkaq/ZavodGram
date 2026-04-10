import { Icons } from './Icons';

export function ChatNotificationsPanel({
  open,
  styles,
  notifications,
  onClose,
  onClear,
  onOpenNotification,
}) {
  if (!open) return null;

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, maxWidth: '100vw', background: '#171A20', borderLeft: '1px solid rgba(255,255,255,0.06)', zIndex: 95, display: 'flex', flexDirection: 'column', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button style={styles.ib} onClick={onClose}><Icons.Close /></button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>Уведомления</span>
        {notifications.length > 0 && <button style={{ ...styles.ib, marginLeft: 'auto', fontSize: 12, color: '#E9EBEF' }} onClick={onClear}>Очистить</button>}
      </div>
      <div style={{ flex: 1, padding: '8px 0' }}>
        {notifications.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: '#686F7F' }}>Нет уведомлений</div> : notifications.map((notification) => (
          <div key={notification.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.025)' }} onClick={() => onOpenNotification(notification)}>
            <Icons.Bell size={14} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{notification.chatName}</div>
              <div style={{ fontSize: 12, color: '#7C8392' }}>{notification.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
