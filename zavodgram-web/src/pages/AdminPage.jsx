import { useEffect, useState } from 'react';
import { adminApi } from '../api/client';
import { useAuth } from '../context/AuthContext';

const card = {
  background: '#141923',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 14,
  padding: 16,
};

export default function AdminPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState('');

  const load = async (q = '') => {
    setLoading(true);
    setError('');
    try {
      const [s, u] = await Promise.all([
        adminApi.stats(),
        adminApi.users(q),
      ]);
      setStats(s);
      setUsers(u);
    } catch (e) {
      setError(e.message || 'Ошибка загрузки админки');
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleBlockToggle = async (target) => {
    const nextBlocked = !target.blocked;
    const confirmed = window.confirm(nextBlocked ? `Заблокировать ${target.tag}?` : `Разблокировать ${target.tag}?`);
    if (!confirmed) return;

    setBusyUserId(target.id);
    setError('');
    try {
      await adminApi.setBlocked(target.id, nextBlocked);
      await load(query);
    } catch (e) {
      setError(e.message || 'Не удалось изменить блокировку');
    }
    setBusyUserId('');
  };

  const handleDelete = async (target) => {
    const confirmed = window.confirm(`Удалить аккаунт ${target.tag}? Это действие необратимо.`);
    if (!confirmed) return;

    setBusyUserId(target.id);
    setError('');
    try {
      await adminApi.removeUser(target.id);
      await load(query);
    } catch (e) {
      setError(e.message || 'Не удалось удалить пользователя');
    }
    setBusyUserId('');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#0C0E13', color: '#E8E8ED', padding: 24, fontFamily: 'Manrope, sans-serif' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontFamily: 'JetBrains Mono, monospace' }}>Админка ZavodGram</h1>
            <div style={{ color: '#7F869B', marginTop: 6 }}>Вы вошли как {user?.tag}</div>
          </div>
          <button onClick={() => { window.location.href = '/'; }} style={{ background: 'rgba(74,158,229,0.15)', border: '1px solid rgba(74,158,229,0.35)', color: '#9DCAF5', borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}>
            Открыть мессенджер
          </button>
        </div>

        {error && <div style={{ ...card, color: '#FF8A8A', marginBottom: 14 }}>{error}</div>}

        {loading ? <div style={card}>Загрузка...</div> : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 18 }}>
              <StatItem title='Пользователи' value={stats?.totals?.users} />
              <StatItem title='Чаты' value={stats?.totals?.chats} />
              <StatItem title='Сообщения' value={stats?.totals?.messages} />
              <StatItem title='Медиа' value={stats?.totals?.media} />
              <StatItem title='Новых за 24ч' value={stats?.last24h?.users} />
              <StatItem title='Сообщений за 24ч' value={stats?.last24h?.messages} />
            </div>

            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
                <h2 style={{ margin: 0, fontSize: 18 }}>Пользователи</h2>
                <form onSubmit={(e) => { e.preventDefault(); load(query); }} style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder='Поиск по имени, тегу, телефону'
                    style={{ width: 280, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, color: '#E8E8ED', padding: '8px 10px' }}
                  />
                  <button type='submit' style={{ background: '#4A9EE5', color: '#fff', border: 0, borderRadius: 8, padding: '8px 12px', cursor: 'pointer' }}>Найти</button>
                </form>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <thead>
                    <tr style={{ color: '#8B93A8', textAlign: 'left' }}>
                      <th style={{ paddingBottom: 8 }}>Пользователь</th>
                      <th style={{ paddingBottom: 8 }}>Телефон</th>
                      <th style={{ paddingBottom: 8 }}>Создан</th>
                      <th style={{ paddingBottom: 8 }}>Чатов</th>
                      <th style={{ paddingBottom: 8 }}>Сообщений</th>
                      <th style={{ paddingBottom: 8 }}>Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                        <td style={{ padding: '10px 0' }}>
                          <div style={{ fontWeight: 600 }}>{u.name}</div>
                          <div style={{ color: '#7F869B' }}>{u.tag}</div>
                        </td>
                        <td>{u.phone}</td>
                        <td>{new Date(u.createdAt).toLocaleString()}</td>
                        <td>{u._count?.chatMembers || 0}</td>
                        <td>{u._count?.messages || 0}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <span style={{ fontSize: 12, color: u.blocked ? '#FF8A8A' : '#88D498' }}>
                              {u.blocked ? 'Заблокирован' : 'Активен'}
                            </span>
                            <button
                              onClick={() => handleBlockToggle(u)}
                              disabled={busyUserId === u.id}
                              style={{ background: u.blocked ? 'rgba(136,212,152,0.15)' : 'rgba(255,138,138,0.15)', color: u.blocked ? '#88D498' : '#FF8A8A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}
                            >
                              {u.blocked ? 'Разблокировать' : 'Блок'}
                            </button>
                            <button
                              onClick={() => handleDelete(u)}
                              disabled={busyUserId === u.id}
                              style={{ background: 'rgba(255,138,138,0.2)', color: '#FF8A8A', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '6px 8px', cursor: 'pointer' }}
                            >
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatItem({ title, value }) {
  return (
    <div style={card}>
      <div style={{ color: '#8B93A8', fontSize: 13 }}>{title}</div>
      <div style={{ marginTop: 6, fontSize: 26, fontWeight: 700 }}>{value ?? 0}</div>
    </div>
  );
}
