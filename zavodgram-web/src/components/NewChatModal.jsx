import { Icons } from './Icons';
import { Av } from './chatUiParts';

const CHAT_TYPE_OPTIONS = [
  ['Личный', 'PRIVATE', '#E9EBEF'],
  ['Группа', 'GROUP', '#C8CCD4'],
  ['Канал', 'CHANNEL', '#D3D6DC'],
  ['Секретный', 'SECRET', '#EDEFF3'],
];

export function NewChatModal({
  open,
  mode,
  chatType,
  search,
  results,
  groupName,
  groupDesc,
  groupMembers,
  styles,
  onClose,
  onModeChange,
  onChatTypeChange,
  onSearch,
  onPickUser,
  onGroupNameChange,
  onGroupDescChange,
  onGroupMemberAdd,
  onGroupMemberRemove,
  onCreate,
}) {
  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: '#1D2128', borderRadius: 16, padding: 24, width: 400, maxWidth: '92vw', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        {mode === 'search' ? (
          <>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 12, fontFamily: 'mono' }}>Новый чат</h3>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {CHAT_TYPE_OPTIONS.map(([label, type, color]) => (
                <button
                  key={type}
                  onClick={() => (type === 'GROUP' || type === 'CHANNEL' ? onModeChange(type) : onChatTypeChange(type))}
                  style={{
                    flex: 1,
                    padding: '8px 4px',
                    background: chatType === type ? `${color}22` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${chatType === type ? color : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 8,
                    color: chatType === type ? color : '#9CA3B1',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'mono',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <input style={styles.inp2} placeholder="Поиск по имени или @тегу..." value={search} onChange={(e) => onSearch(e.target.value)} autoFocus />
            <div style={{ maxHeight: 280, overflowY: 'auto', marginTop: 12 }}>
              {results.map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer', borderRadius: 8 }} onClick={() => onPickUser(u.id, chatType)}>
                  <Av src={u.avatar} name={u.name} size={36} radius={10} online={u.online} />
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{u.name}</div>
                    <div style={{ fontSize: 12, color: '#E9EBEF', fontFamily: 'mono' }}>{u.tag}</div>
                  </div>
                </div>
              ))}
              {search.length >= 2 && results.length === 0 && <div style={{ textAlign: 'center', padding: 20, color: '#686F7F', fontSize: 13 }}>Никого не найдено</div>}
            </div>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <button style={styles.ib} onClick={() => onModeChange('search')}><Icons.Back /></button>
              <h3 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'mono' }}>{mode === 'GROUP' ? 'Новая группа' : 'Новый канал'}</h3>
            </div>
            <input style={{ ...styles.inp2, marginBottom: 8 }} placeholder="Название" value={groupName} onChange={(e) => onGroupNameChange(e.target.value)} autoFocus />
            <textarea style={{ ...styles.inp2, minHeight: 50, resize: 'vertical', marginBottom: 12 }} placeholder="Описание (необязательно)" value={groupDesc} onChange={(e) => onGroupDescChange(e.target.value)} />
            <input style={styles.inp2} placeholder="Добавить участников..." value={search} onChange={(e) => onSearch(e.target.value)} />
            {groupMembers.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
                {groupMembers.map((m) => (
                  <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(255,255,255,0.1)', borderRadius: 20, fontSize: 12, color: '#E9EBEF' }}>
                    {m.name}
                    <span style={{ cursor: 'pointer', opacity: 0.6, fontSize: 14 }} onClick={() => onGroupMemberRemove(m.id)}>×</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ maxHeight: 160, overflowY: 'auto', marginTop: 8 }}>
              {results.filter((u) => !groupMembers.some((m) => m.id === u.id)).map((u) => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer', borderRadius: 8 }} onClick={() => onGroupMemberAdd(u)}>
                  <Av src={u.avatar} name={u.name} size={30} radius={8} />
                  <span style={{ fontSize: 13 }}>{u.name}</span>
                  <span style={{ fontSize: 11, color: '#E9EBEF', fontFamily: 'mono' }}>{u.tag}</span>
                </div>
              ))}
            </div>
            <button style={{ ...styles.saveBtn, width: '100%', marginTop: 14, opacity: groupName.trim() ? 1 : 0.4 }} disabled={!groupName.trim()} onClick={onCreate}>
              Создать {mode === 'GROUP' ? 'группу' : 'канал'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
