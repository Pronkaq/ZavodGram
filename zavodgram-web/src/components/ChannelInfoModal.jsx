import { Icons, typeColors } from './Icons';
import { Av } from './chatUiParts';

const tc = typeColors;

export function ChannelInfoModal({
  open,
  channel,
  isOwnerOrAdmin,
  channelPublicLink,
  styles,
  onClose,
  onAvatarUpload,
  onShare,
  onOpenManagement,
  onOpenAttachments,
}) {
  if (!open || channel?.type !== 'CHANNEL') return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 360, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#1D2128', borderRadius: 16, padding: 24, width: 420, maxWidth: '92vw', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, fontFamily: 'mono' }}>О канале</h3>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative' }}>
            <Av src={channel.avatar} name={channel.name} size={78} radius={20} color={tc[channel.type]} />
            {isOwnerOrAdmin && (
              <label style={{ position: 'absolute', bottom: -2, right: -2, width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #E9EBEF, #C8CCD4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #1D2128' }}>
                <Icons.Edit />
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarUpload} />
              </label>
            )}
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#A2A8B6', marginBottom: 6 }}>Публичная ссылка</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input style={styles.inp2} value={channelPublicLink || 'Ссылка не настроена'} readOnly />
          <button style={styles.ib} onClick={() => navigator.clipboard?.writeText(channelPublicLink)} disabled={!channelPublicLink}><Icons.Copy /></button>
          <button style={styles.ib} onClick={onShare} disabled={!channelPublicLink}><Icons.Share /></button>
        </div>
        {isOwnerOrAdmin && <button style={{ ...styles.saveBtn, width: '100%' }} onClick={onOpenManagement}><Icons.Edit /> Управление</button>}
        <button style={{ ...styles.ib, marginTop: 14, width: '100%', justifyContent: 'center', padding: 10, border: '1px solid rgba(255,255,255,0.1)' }} onClick={onOpenAttachments}>
          <Icons.Image /> Вложения канала
        </button>
      </div>
    </div>
  );
}
