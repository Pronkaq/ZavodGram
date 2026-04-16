import { useState, useEffect, useRef } from 'react';
import { Icons } from './Icons';
import { Av } from './chatUiParts';

const TypeIcon = ({ type }) => {
  const icons = {
    PRIVATE:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
    GROUP:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
    CHANNEL:  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.42 2 2 0 0 1 3.6 1.24h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.81A16 16 0 0 0 16 16.92"/></svg>,
    SECRET:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    TG_MIRROR:<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  };
  return icons[type] || null;
};

const CHAT_TYPES = [
  { type: 'PRIVATE',    label: 'Личный',      color: '#7EB8F7' },
  { type: 'GROUP',      label: 'Группа',      color: '#81C784' },
  { type: 'CHANNEL',    label: 'Канал',       color: '#CE93D8' },
  { type: 'SECRET',     label: 'Секретный',   color: '#FFB74D' },
  { type: 'TG_MIRROR',  label: 'TG-зеркало', color: '#29B6F6' },
];

function Spinner() {
  return <div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.15)', borderTopColor: '#29B6F6', borderRadius: '50%', animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />;
}

function TgMirrorPane({ styles, onCreated }) {
  const [slug, setSlug] = useState('');
  const [channelName, setChannelName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [myMirrors, setMyMirrors] = useState([]);
  const [mirrorsLoading, setMirrorsLoading] = useState(true);

  const authHdr = () => ({ Authorization: `Bearer ${localStorage.getItem('zg_token') || ''}` });

  useEffect(() => {
    fetch('/api/channels/mirror', { headers: authHdr() })
      .then((r) => r.json())
      .then((d) => { if (d.ok) setMyMirrors(d.data); })
      .catch(() => {})
      .finally(() => setMirrorsLoading(false));
  }, []);

  const cleanSlug = slug.replace(/^@/, '').trim();
  const canCreate = cleanSlug.length >= 3 && channelName.trim().length >= 1 && !creating;

  const handleCreate = async () => {
    if (!canCreate) return;
    setCreating(true);
    setError('');
    try {
      const r = await fetch('/api/channels/mirror', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHdr() },
        body: JSON.stringify({ sourceSlug: cleanSlug, channelName: channelName.trim() }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error?.message || 'Ошибка создания');
      onCreated(d.data.channel);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDisable = async (mirrorId) => {
    await fetch(`/api/channels/mirror/${mirrorId}`, { method: 'DELETE', headers: authHdr() });
    setMyMirrors((prev) => prev.filter((m) => m.id !== mirrorId));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'rgba(41,182,246,0.08)', border: '1px solid rgba(41,182,246,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#90CAF9', lineHeight: 1.6 }}>
        Введите username публичного Telegram-канала — мы будем автоматически импортировать посты к вам в мессенджер.
      </div>

      <div>
        <div style={{ fontSize: 11, color: '#686F7F', marginBottom: 6 }}>Username канала в Telegram</div>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#4B93C9', fontFamily: 'monospace', fontSize: 15, pointerEvents: 'none' }}>@</span>
          <input
            style={{ ...styles.inp2, paddingLeft: 26, fontFamily: 'monospace', letterSpacing: 0.3 }}
            placeholder="username"
            value={slug.replace(/^@/, '')}
            onChange={(e) => setSlug(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: '#686F7F', marginBottom: 6 }}>Название в мессенджере</div>
        <input
          style={styles.inp2}
          placeholder="Например: DTF Best"
          value={channelName}
          onChange={(e) => setChannelName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
        />
      </div>

      {error && (
        <div style={{ background: 'rgba(239,83,80,0.1)', border: '1px solid rgba(239,83,80,0.25)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#EF9A9A' }}>
          {error}
        </div>
      )}

      <button
        onClick={handleCreate}
        disabled={!canCreate}
        style={{
          width: '100%', padding: '11px 0',
          background: canCreate ? 'linear-gradient(135deg, #0288D1, #29B6F6)' : 'rgba(255,255,255,0.05)',
          border: 'none', borderRadius: 10,
          color: canCreate ? '#fff' : '#555',
          fontSize: 14, fontWeight: 600,
          cursor: canCreate ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          transition: 'all 0.2s',
        }}
      >
        {creating ? <><Spinner /> Подключаем…</> : '📡 Подключить зеркало'}
      </button>

      {!mirrorsLoading && myMirrors.length > 0 && (
        <div>
          <div style={{ fontSize: 11, color: '#686F7F', marginBottom: 8 }}>Мои зеркала ({myMirrors.length}/5)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {myMirrors.map((m) => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 16 }}>📡</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#DDE1EA', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.channel?.name || m.sourceSlug}</div>
                  <div style={{ fontSize: 11, color: '#29B6F6', fontFamily: 'monospace' }}>@{m.sourceSlug}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: m.enabled ? '#66BB6A' : '#686F7F' }} />
                  <button onClick={() => handleDisable(m.id)} style={{ background: 'rgba(239,83,80,0.12)', border: 'none', borderRadius: 6, padding: '4px 8px', color: '#EF9A9A', fontSize: 11, cursor: 'pointer' }}>
                    Отключить
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function NewChatModal({
  open, mode, chatType, search, results, groupName, groupDesc, groupMembers,
  styles, onClose, onModeChange, onChatTypeChange, onSearch, onPickUser,
  onGroupNameChange, onGroupDescChange, onGroupMemberAdd, onGroupMemberRemove,
  onCreate, onMirrorCreated,
}) {
  const [activeType, setActiveType] = useState(chatType || 'PRIVATE');
  const isTgMirror = activeType === 'TG_MIRROR';

  useEffect(() => { setActiveType(chatType || 'PRIVATE'); }, [chatType]);

  const handleTypeClick = (type) => {
    setActiveType(type);
    if (type === 'GROUP' || type === 'CHANNEL') onModeChange(type);
    else if (type !== 'TG_MIRROR') { onModeChange('search'); onChatTypeChange(type); }
    else onModeChange('search');
  };

  if (!open) return null;

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeInUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300, backdropFilter: 'blur(6px)' }} onClick={onClose}>
        <div style={{ background: '#1A1F27', borderRadius: 18, padding: 24, width: 420, maxWidth: '94vw', border: '1px solid rgba(255,255,255,0.07)', boxShadow: '0 24px 60px rgba(0,0,0,0.6)', animation: 'fadeInUp 0.2s ease', maxHeight: '85vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            {(mode === 'GROUP' || mode === 'CHANNEL') && !isTgMirror && (
              <button style={styles.ib} onClick={() => { onModeChange('search'); setActiveType('PRIVATE'); }}><Icons.Back /></button>
            )}
            <h3 style={{ fontSize: 17, fontWeight: 700, margin: 0, color: '#E8EAF0' }}>
              {mode === 'GROUP' && !isTgMirror ? 'Новая группа'
                : mode === 'CHANNEL' && !isTgMirror ? 'Новый канал'
                : isTgMirror ? 'TG-зеркало'
                : 'Новый чат'}
            </h3>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5, marginBottom: 18 }}>
            {CHAT_TYPES.map(({ type, label, color }) => {
              const active = activeType === type;
              return (
                <button key={type} onClick={() => handleTypeClick(type)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '9px 4px', background: active ? `${color}18` : 'rgba(255,255,255,0.03)', border: `1px solid ${active ? color : 'rgba(255,255,255,0.06)'}`, borderRadius: 10, color: active ? color : '#686F7F', fontSize: 10, fontWeight: active ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s', letterSpacing: 0.2 }}>
                  <span style={{ opacity: active ? 1 : 0.5 }}><TypeIcon type={type} /></span>
                  {label}
                </button>
              );
            })}
          </div>

          {isTgMirror ? (
            <TgMirrorPane styles={styles} onCreated={(channel) => { onClose(); onMirrorCreated?.(channel); }} />
          ) : mode === 'search' ? (
            <>
              <input style={styles.inp2} placeholder="Поиск по имени или @тегу…" value={search} onChange={(e) => onSearch(e.target.value)} autoFocus />
              <div style={{ maxHeight: 260, overflowY: 'auto', marginTop: 10 }}>
                {results.map((u) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', cursor: 'pointer', borderRadius: 9 }} onClick={() => onPickUser(u.id, activeType)} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
                    <Av src={u.avatar} name={u.name} size={38} radius={11} online={u.online} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: '#DDE1EA' }}>{u.name}</div>
                      <div style={{ fontSize: 12, color: '#4B93C9', fontFamily: 'monospace' }}>{u.tag}</div>
                    </div>
                  </div>
                ))}
                {search.length >= 2 && results.length === 0 && <div style={{ textAlign: 'center', padding: 28, color: '#686F7F', fontSize: 13 }}>Никого не найдено</div>}
              </div>
            </>
          ) : (
            <>
              <input style={{ ...styles.inp2, marginBottom: 8 }} placeholder="Название" value={groupName} onChange={(e) => onGroupNameChange(e.target.value)} autoFocus />
              <textarea style={{ ...styles.inp2, minHeight: 52, resize: 'vertical', marginBottom: 12 }} placeholder="Описание (необязательно)" value={groupDesc} onChange={(e) => onGroupDescChange(e.target.value)} />
              <input style={styles.inp2} placeholder="Добавить участников…" value={search} onChange={(e) => onSearch(e.target.value)} />
              {groupMembers.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '10px 0' }}>
                  {groupMembers.map((m) => (
                    <span key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: 20, fontSize: 12, color: '#DDE1EA' }}>
                      {m.name}
                      <span style={{ cursor: 'pointer', opacity: 0.5, fontSize: 15 }} onClick={() => onGroupMemberRemove(m.id)}>×</span>
                    </span>
                  ))}
                </div>
              )}
              <div style={{ maxHeight: 150, overflowY: 'auto', marginTop: 8 }}>
                {results.filter((u) => !groupMembers.some((m) => m.id === u.id)).map((u) => (
                  <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer', borderRadius: 8 }} onClick={() => onGroupMemberAdd(u)}>
                    <Av src={u.avatar} name={u.name} size={30} radius={8} />
                    <span style={{ fontSize: 13, color: '#DDE1EA' }}>{u.name}</span>
                    <span style={{ fontSize: 11, color: '#4B93C9', fontFamily: 'monospace' }}>{u.tag}</span>
                  </div>
                ))}
              </div>
              <button style={{ ...styles.saveBtn, width: '100%', marginTop: 14, opacity: groupName.trim() ? 1 : 0.35 }} disabled={!groupName.trim()} onClick={onCreate}>
                Создать {mode === 'GROUP' ? 'группу' : 'канал'}
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
