import { Av } from './chatUiParts';
import { Icons } from './Icons';

const MEMBER_ROLE_ORDER = { OWNER: 0, ADMIN: 1, MEMBER: 2 };

export function MemberListModal({
  open,
  chat,
  isGroupOrChannel,
  isOwner,
  isOwnerOrAdmin,
  userId,
  styles,
  addMemberSearch,
  addMemberResults,
  onClose,
  onOpenManagement,
  onSearchAddMember,
  onAddMember,
  onOpenProfile,
  onSetRole,
  onKickMember,
  onBanMember,
  onTransferOwnership,
}) {
  if (!open || !chat || !isGroupOrChannel) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 350, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#1D2128', borderRadius: 16, padding: 24, width: 420, maxWidth: '92vw', border: '1px solid rgba(255,255,255,0.08)', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <button style={styles.ib} onClick={onClose}><Icons.Close /></button>
          <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'mono', flex: 1 }}>Участники ({chat.members?.length || 0})</h3>
          {isOwnerOrAdmin && (
            <button
              style={{ ...styles.ib, color: '#E9EBEF', fontSize: 12, gap: 4, display: 'flex', alignItems: 'center' }}
              onClick={onOpenManagement}
            >
              <Icons.Edit /> Управление
            </button>
          )}
        </div>

        {isOwnerOrAdmin && (
          <div style={{ marginBottom: 12 }}>
            <input style={styles.inp2} placeholder="Добавить участника..." value={addMemberSearch} onChange={(e) => onSearchAddMember(e.target.value)} />
            {addMemberResults.length > 0 && (
              <div style={{ maxHeight: 120, overflowY: 'auto', marginTop: 6, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 4 }}>
                {addMemberResults.filter((u) => !chat.members?.some((m) => m.userId === u.id)).map((u) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', cursor: 'pointer', borderRadius: 6 }} onClick={() => onAddMember(u.id)}>
                    <Av src={u.avatar} name={u.name} size={28} radius={7} />
                    <span style={{ fontSize: 13 }}>{u.name}</span>
                    <span style={{ fontSize: 11, color: '#E9EBEF', fontFamily: 'mono' }}>{u.tag}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#EDEFF3' }}>+ Добавить</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(chat.members || [])
            .sort((a, b) => (MEMBER_ROLE_ORDER[a.role] || 2) - (MEMBER_ROLE_ORDER[b.role] || 2))
            .map((member) => {
              const currentUser = member.user;
              const isMe = member.userId === userId;
              const roleLabel = member.role === 'OWNER' ? 'Создатель' : member.role === 'ADMIN' ? 'Модератор' : null;
              const roleColor = member.role === 'OWNER' ? '#D3D6DC' : member.role === 'ADMIN' ? '#C8CCD4' : null;
              const canManage = isOwner && !isMe && member.role !== 'OWNER';
              const canAdminManage = isOwnerOrAdmin && !isMe && member.role === 'MEMBER';

              return (
                <div key={member.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                  <Av src={currentUser?.avatar} name={currentUser?.name} size={38} radius={10} onClick={() => onOpenProfile(member.userId)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {currentUser?.name}
                      {roleLabel && <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: `${roleColor}22`, color: roleColor, fontFamily: 'mono', fontWeight: 600 }}>{roleLabel}</span>}
                      {isMe && <span style={{ fontSize: 10, color: '#7C8392' }}>(вы)</span>}
                    </div>
                    <div style={{ fontSize: 12, color: '#E9EBEF', fontFamily: 'mono' }}>{currentUser?.tag}</div>
                  </div>

                  {(canManage || canAdminManage) && (
                    <div style={{ position: 'relative' }}>
                      <select
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#AAB0BD', fontSize: 11, padding: '4px 6px', cursor: 'pointer', fontFamily: 'mono' }}
                        value=""
                        onChange={(e) => {
                          const action = e.target.value;
                          if (action === 'make_admin') onSetRole(member.userId, 'ADMIN');
                          if (action === 'remove_admin') onSetRole(member.userId, 'MEMBER');
                          if (action === 'kick') onKickMember(member.userId);
                          if (action === 'ban') onBanMember(member.userId);
                          if (action === 'transfer') onTransferOwnership(member.userId);
                          e.target.value = '';
                        }}
                      >
                        <option value="" disabled>···</option>
                        {isOwner && member.role === 'MEMBER' && <option value="make_admin">Назначить модератором</option>}
                        {isOwner && member.role === 'ADMIN' && <option value="remove_admin">Снять модератора</option>}
                        {(canManage || canAdminManage) && <option value="kick">{chat.type === 'CHANNEL' ? 'Удалить из канала' : 'Удалить из группы'}</option>}
                        {(canManage || canAdminManage) && chat.type === 'CHANNEL' && <option value="ban">Забанить в канале</option>}
                        {isOwner && <option value="transfer">Передать права создателя</option>}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
