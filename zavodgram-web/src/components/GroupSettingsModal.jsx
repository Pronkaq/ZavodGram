import { Av } from './chatUiParts';
import { Icons, typeColors } from './Icons';

const tc = typeColors;

export function GroupSettingsModal({
  open,
  chat,
  isGroupOrChannel,
  isOwnerOrAdmin,
  editGroupName,
  setEditGroupName,
  editGroupDesc,
  setEditGroupDesc,
  editTopicsEnabled,
  setEditTopicsEnabled,
  styles,
  onClose,
  onAvatarUpload,
  onSave,
  onOpenMembers,
}) {
  if (!open || !chat || !isGroupOrChannel) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#1D2128', borderRadius: 16, padding: 24, width: 400, maxWidth: '92vw', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '80vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <button style={styles.ib} onClick={onClose}><Icons.Close /></button>
          <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'mono' }}>{chat.type === 'GROUP' ? 'Настройки группы' : 'Настройки канала'}</h3>
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <div style={{ position: 'relative' }}>
            <Av src={chat.avatar} name={chat.name} size={90} radius={22} color={tc[chat.type]} />
            {isOwnerOrAdmin && (
              <label style={{ position: 'absolute', bottom: -4, right: -4, width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #E9EBEF, #C8CCD4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #1D2128' }}>
                <Icons.Edit />
                <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarUpload} />
              </label>
            )}
          </div>
        </div>

        {isOwnerOrAdmin ? (
          <>
            <label style={styles.lbl}>Название</label>
            <input style={styles.inp2} value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} />

            <label style={{ ...styles.lbl, marginTop: 12 }}>Описание</label>
            <textarea style={{ ...styles.inp2, minHeight: 60, resize: 'vertical' }} value={editGroupDesc} onChange={(e) => setEditGroupDesc(e.target.value)} />
            {chat.type === 'GROUP' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 13, color: '#D6DAE2' }}>
                <input
                  type="checkbox"
                  checked={editTopicsEnabled}
                  onChange={(e) => setEditTopicsEnabled(e.target.checked)}
                  disabled={!isOwnerOrAdmin}
                />
                Группа с темами (отдельные ветки)
              </label>
            )}

            <button style={{ ...styles.saveBtn, width: '100%', marginTop: 16 }} onClick={onSave}>Сохранить</button>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 20, fontWeight: 700, textAlign: 'center', marginBottom: 6 }}>{chat.name}</h2>
            {chat.description && <p style={{ fontSize: 14, color: '#A2A8B6', textAlign: 'center', lineHeight: 1.5 }}>{chat.description}</p>}
          </>
        )}

        <div style={{ marginTop: 20, padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }} onClick={onOpenMembers}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icons.Group />
            <span style={{ fontSize: 14 }}>{chat._count?.members || chat.members?.length} участников</span>
          </div>
          <span style={{ color: '#E9EBEF', fontSize: 13 }}>Показать →</span>
        </div>
      </div>
    </div>
  );
}
