export function ChannelInviteModal({ inviteChannel, joiningInvite, styles, onJoin, onClose }) {
  if (!inviteChannel) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 380 }} onClick={onClose}>
      <div style={{ background: '#1D2128', borderRadius: 16, padding: 24, width: 420, maxWidth: '92vw', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Канал по ссылке</h3>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>{inviteChannel.name || 'Канал'}</div>
        <div style={{ fontSize: 13, color: '#A2A8B6', marginBottom: 10 }}>{inviteChannel._count?.members || 0} подписчиков</div>
        {inviteChannel.description && <p style={{ fontSize: 14, color: '#CACED7', lineHeight: 1.5 }}>{inviteChannel.description}</p>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button style={{ ...styles.saveBtn, flex: 1, opacity: joiningInvite ? 0.7 : 1 }} onClick={onJoin} disabled={joiningInvite}>{joiningInvite ? 'Подписка...' : 'Подписаться'}</button>
          <button style={{ ...styles.ib, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: '10px 12px' }} onClick={onClose}>Позже</button>
        </div>
      </div>
    </div>
  );
}
