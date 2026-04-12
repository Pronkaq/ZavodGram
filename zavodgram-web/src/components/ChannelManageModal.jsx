import { Av } from './chatUiParts';
import { Icons, typeColors } from './Icons';

const tc = typeColors;

export function ChannelManageModal({
  open,
  chat,
  isOwner,
  tab,
  setTab,
  onLoadBans,
  onClose,
  onAvatarUpload,
  editGroupName,
  setEditGroupName,
  editGroupDesc,
  setEditGroupDesc,
  channelSlugEdit,
  setChannelSlugEdit,
  setChannelSlugError,
  channelSlugError,
  onSave,
  bansLoading,
  bannedUsers,
  onUnbanMember,
  styles,
}) {
  if (!open || chat?.type !== 'CHANNEL' || !isOwner) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.66)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 362, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#1D2128', borderRadius: 16, padding: 20, width: 520, maxWidth: '96vw', maxHeight: '84vh', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'mono', flex: 1 }}>Управление каналом</h3>
          <button style={{ ...styles.ib, ...(tab === 'main' ? { color: '#E9EBEF' } : {}) }} onClick={() => setTab('main')}>Основное</button>
          <button style={{ ...styles.ib, ...(tab === 'bans' ? { color: '#D3D6DC' } : {}) }} onClick={() => { setTab('bans'); onLoadBans(); }}>Забаненные</button>
          <button style={styles.ib} onClick={onClose}><Icons.Close /></button>
        </div>

        {tab === 'main' ? (
          <div style={{ overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
              <div style={{ position: 'relative' }}>
                <Av src={chat.avatar} name={chat.name} size={88} radius={22} color={tc[chat.type]} />
                <label style={{ position: 'absolute', bottom: -2, right: -2, width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #E9EBEF, #C8CCD4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #1D2128' }}>
                  <Icons.Edit />
                  <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarUpload} />
                </label>
              </div>
            </div>
            <label style={styles.lbl}>Название</label>
            <input style={{ ...styles.inp2, marginBottom: 10 }} value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} placeholder="Название канала" />
            <label style={styles.lbl}>Описание</label>
            <textarea style={{ ...styles.inp2, minHeight: 72, resize: 'vertical', marginBottom: 10 }} value={editGroupDesc} onChange={(e) => setEditGroupDesc(e.target.value)} placeholder="Описание канала" />
            <label style={styles.lbl}>Уникальная ссылка (slug)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: '#9CA3B1', fontSize: 13 }}>{window.location.origin}/</span>
              <input style={styles.inp2} value={channelSlugEdit} onChange={(e) => { setChannelSlugEdit(e.target.value); setChannelSlugError(''); }} placeholder="my-channel" />
            </div>
            {channelSlugError && <div style={{ color: '#D5D8DE', fontSize: 12, marginTop: 6 }}>{channelSlugError}</div>}
            <button style={{ ...styles.saveBtn, marginTop: 12, width: '100%' }} onClick={onSave}>Сохранить изменения</button>
          </div>
        ) : (
          <div style={{ flex: 1, overflowY: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 10 }}>
            {bansLoading && <div style={{ color: '#A2A8B6', fontSize: 13 }}>Загрузка...</div>}
            {!bansLoading && bannedUsers.length === 0 && <div style={{ color: '#A2A8B6', fontSize: 13 }}>Список пуст.</div>}
            {!bansLoading && bannedUsers.map((ban) => (
              <div key={ban.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <Av src={ban.user?.avatar} name={ban.user?.name} size={36} radius={10} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{ban.user?.name}</div>
                  <div style={{ fontSize: 11, color: '#A2A8B6' }}>{ban.user?.tag} • бан от {ban.admin?.name || 'админа'}</div>
                </div>
                <button style={{ ...styles.ib, color: '#EDEFF3' }} onClick={() => onUnbanMember(ban.userId)}><Icons.Check /> Разбан</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
