import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ phone: '+7', password: '', name: '', tag: '@', bio: '' });

  const set = (k, v) => {
    if (k === 'phone') {
      if (!v.startsWith('+')) v = '+' + v;
      v = v.replace(/[^\d+]/g, '');
    }
    if (k === 'tag') {
      if (!v.startsWith('@')) v = '@' + v;
      v = '@' + v.slice(1).replace(/[^a-zA-Z0-9_]/g, '');
    }
    setForm((p) => ({ ...p, [k]: v }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.phone, form.password);
      } else {
        if (!form.name.trim()) { setError('Введите имя'); setLoading(false); return; }
        if (form.tag.length < 4) { setError('Тег минимум 3 символа после @'); setLoading(false); return; }
        if (form.phone.length < 12) { setError('Введите номер телефона'); setLoading(false); return; }
        if (form.password.length < 6) { setError('Пароль минимум 6 символов'); setLoading(false); return; }
        await register({ phone: form.phone, password: form.password, name: form.name, tag: form.tag, bio: form.bio });
      }
    } catch (err) {
      setError(err.message || 'Ошибка');
    }
    setLoading(false);
  };

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>Z</div>
        <h1 style={s.title}>ZavodGram</h1>
        <p style={s.subtitle}>{mode === 'login' ? 'Вход в аккаунт' : 'Создание аккаунта'}</p>

        <form onSubmit={handleSubmit} style={s.form}>
          {mode === 'register' && (
            <>
              <input style={s.input} placeholder="Имя" value={form.name} onChange={(e) => set('name', e.target.value)} />
              <input style={s.input} placeholder="@ваш_тег" value={form.tag} onChange={(e) => set('tag', e.target.value)} />
            </>
          )}
          <input style={s.input} placeholder="+79001234567" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <input style={s.input} type="password" placeholder="Пароль" value={form.password} onChange={(e) => set('password', e.target.value)} />
          {mode === 'register' && (
            <textarea style={{ ...s.input, minHeight: 50, resize: 'vertical' }} placeholder="О себе (необязательно)" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
          )}

          {error && <div style={s.error}>{error}</div>}

          <button style={s.btn} type="submit" disabled={loading}>
            {loading ? '...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>

        <button style={s.switch} onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>
          {mode === 'login' ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  );
}

const s = {
  page: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0C0E13', padding: 20 },
  card: { background: '#11141B', borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 380, border: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' },
  logo: { width: 64, height: 64, background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#fff', marginBottom: 16 },
  title: { fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { fontSize: 14, color: '#5A6070', marginBottom: 24 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '11px 14px', color: '#E8E8ED', fontSize: 14, outline: 'none', fontFamily: "'Manrope', sans-serif" },
  btn: { width: '100%', padding: '12px', background: 'linear-gradient(135deg, #4A9EE5, #7C6BDE)', border: 'none', borderRadius: 10, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginTop: 6 },
  error: { color: '#E55A5A', fontSize: 13, textAlign: 'left', padding: '6px 0' },
  switch: { background: 'none', border: 'none', color: '#4A9EE5', fontSize: 13, cursor: 'pointer', marginTop: 16, padding: 4 },
};
