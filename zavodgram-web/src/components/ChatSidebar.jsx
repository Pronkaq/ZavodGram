import { Av } from './chatUiParts';

export function ChatSidebar({
  user,
  sidebarOpen,
  styles,
  onOpenProfile,
  onOpenSettings,
  onOpenNotifications,
  onLogout,
  onClose,
}) {
  return (
    <div style={{ ...styles.sb, transform: sidebarOpen ? 'translateX(0)' : 'translateX(-100%)' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ padding: 16, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => { onClose?.(); onOpenProfile?.(); }}>
          <Av src={user.avatar} name={user.name} size={42} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{user.name}</div>
            <div style={{ fontSize: 12, color: '#E9EBEF', fontFamily: 'mono' }}>{user.tag}</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, padding: '6px 0' }}>
        {[
          { l: 'Мой профиль', a: () => { onClose?.(); onOpenProfile?.(); } },
          { l: 'Настройки', a: onOpenSettings },
          { l: 'Уведомления', a: onOpenNotifications },
        ].map((it, i) => <div key={i} style={styles.mi} onClick={it.a}>{it.l}</div>)}
        <div style={{ ...styles.mi, color: '#D5D8DE' }} onClick={onLogout}>Выйти</div>
      </div>
      <div style={{ padding: '14px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', opacity: 0.3, fontSize: 11, fontFamily: 'mono' }}>ZavodGram v0.4.0</div>
    </div>
  );
}
