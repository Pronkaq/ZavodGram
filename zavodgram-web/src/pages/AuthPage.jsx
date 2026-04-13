import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { login, registerStart, fetchCaptcha, recoveryResetPassword } = useAuth();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [captcha, setCaptcha] = useState({ captchaId: '', question: '' });
  const [form, setForm] = useState({
    nickname: '',
    password: '',
    name: '',
    captchaAnswer: '',
    recoveryCode: '',
    newPassword: '',
  });

  const set = (k, v) => {
    if (k === 'nickname') {
      v = v.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
    }
    setForm((p) => ({ ...p, [k]: v }));
  };

  const loadCaptcha = async () => {
    try {
      const data = await fetchCaptcha();
      setCaptcha({ captchaId: data.captchaId, question: data.question });
      setForm((prev) => ({ ...prev, captchaAnswer: '' }));
    } catch {
      setError('Не удалось загрузить капчу');
    }
  };

  useEffect(() => {
    loadCaptcha();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setRecoveryCode('');
    setLoading(true);
    try {
      if (!captcha.captchaId) throw new Error('Обновите капчу');

      if (mode === 'login') {
        await login(form.nickname, form.password, captcha.captchaId, form.captchaAnswer);
      } else if (mode === 'register') {
        if (!form.name.trim()) throw new Error('Введите имя');
        const data = await registerStart({
          nickname: form.nickname,
          password: form.password,
          name: form.name,
          captchaId: captcha.captchaId,
          captchaAnswer: form.captchaAnswer,
        });
        setRecoveryCode(data.recoveryCode || '');
        setSuccess('Аккаунт создан. Сохраните recovery code — он будет показан только один раз.');
      } else {
        await recoveryResetPassword({
          nickname: form.nickname,
          recoveryCode: form.recoveryCode,
          newPassword: form.newPassword,
          captchaId: captcha.captchaId,
          captchaAnswer: form.captchaAnswer,
        });
        setSuccess('Пароль обновлен. Войдите с новым паролем.');
      }
    } catch (err) {
      setError(err.message || 'Ошибка');
      await loadCaptcha();
    }
    setLoading(false);
  };

  return (
    <div style={s.page} className="zg-auth">
      <div style={s.card}>
        <div style={s.logo}>Z</div>
        <h1 style={s.title}>ZavodGram</h1>
        <p style={s.subtitle}>{mode === 'login' ? 'Вход в аккаунт' : mode === 'register' ? 'Анонимная регистрация' : 'Восстановление по recovery code'}</p>

        <form onSubmit={handleSubmit} style={s.form}>
          {mode !== 'login' && (
            <input style={s.input} placeholder="Имя" value={form.name} onChange={(e) => set('name', e.target.value)} disabled={mode === 'recovery'} />
          )}

          <input style={s.input} placeholder="Ник (без @)" value={form.nickname} onChange={(e) => set('nickname', e.target.value)} />

          {mode !== 'recovery' && (
            <input style={s.input} type="password" placeholder="Пароль" value={form.password} onChange={(e) => set('password', e.target.value)} />
          )}

          {mode === 'recovery' && (
            <>
              <input style={s.input} placeholder="Recovery code" value={form.recoveryCode} onChange={(e) => set('recoveryCode', e.target.value.toUpperCase())} />
              <input style={s.input} type="password" placeholder="Новый пароль" value={form.newPassword} onChange={(e) => set('newPassword', e.target.value)} />
            </>
          )}

          <div style={s.captchaBox}>
            <div style={s.captchaQuestion}>Капча: {captcha.question || '...'}</div>
            <div style={s.captchaRow}>
              <input style={{ ...s.input, marginBottom: 0 }} placeholder="Ответ" value={form.captchaAnswer} onChange={(e) => set('captchaAnswer', e.target.value)} />
              <button type="button" style={s.captchaBtn} onClick={loadCaptcha}>↻</button>
            </div>
          </div>

          {error && <div style={s.error}>{error}</div>}
          {success && <div style={s.success}>{success}</div>}
          {recoveryCode && <div style={s.recovery}>Ваш recovery code: <b>{recoveryCode}</b></div>}

          <button style={s.btn} type="submit" disabled={loading}>{loading ? '...' : mode === 'login' ? 'Войти' : mode === 'register' ? 'Создать аккаунт' : 'Сбросить пароль'}</button>
        </form>

        <div style={{ display: 'grid', gap: 8 }}>
          <button style={s.switch} onClick={() => { setMode('login'); setError(''); setSuccess(''); }}>Вход</button>
          <button style={s.switch} onClick={() => { setMode('register'); setError(''); setSuccess(''); }}>Регистрация</button>
          <button style={s.switch} onClick={() => { setMode('recovery'); setError(''); setSuccess(''); }}>Восстановление</button>
        </div>
      </div>
      <style>{`
        .zg-auth input::placeholder,
        .zg-auth textarea::placeholder{
          color: rgba(228,232,238,.58);
        }
      `}</style>
    </div>
  );
}

const s = {
  page: { minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 20% 20%, #1b2a41, #0f1726 60%)', padding: 20 },
  card: { width: '100%', maxWidth: 420, background: '#121c2d', border: '1px solid #25344f', borderRadius: 16, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,.45)' },
  logo: { width: 44, height: 44, borderRadius: 12, background: '#4f8cff', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 800, marginBottom: 12 },
  title: { margin: 0, color: '#e4e8ee', fontSize: 26 },
  subtitle: { margin: '6px 0 18px', color: '#9fb0cb' },
  form: { display: 'grid', gap: 10 },
  input: { width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #2a3a57', outline: 'none', background: '#0f1726', color: '#e4e8ee', marginBottom: 2 },
  btn: { marginTop: 4, padding: '12px 14px', borderRadius: 10, border: 'none', background: '#4f8cff', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  switch: { background: 'transparent', border: '1px solid #2a3a57', color: '#9fb0cb', borderRadius: 10, padding: '10px 12px', cursor: 'pointer' },
  error: { background: 'rgba(255,86,86,.12)', border: '1px solid rgba(255,86,86,.35)', color: '#ffb3b3', borderRadius: 10, padding: '10px 12px', fontSize: 14 },
  success: { background: 'rgba(78,216,130,.12)', border: '1px solid rgba(78,216,130,.35)', color: '#b7f5cf', borderRadius: 10, padding: '10px 12px', fontSize: 14 },
  recovery: { background: 'rgba(79,140,255,.12)', border: '1px solid rgba(79,140,255,.35)', color: '#cbdcff', borderRadius: 10, padding: '10px 12px', fontSize: 14 },
  captchaBox: { border: '1px solid #2a3a57', borderRadius: 10, padding: 10, marginTop: 4 },
  captchaQuestion: { color: '#c5d2e6', marginBottom: 8 },
  captchaRow: { display: 'grid', gridTemplateColumns: '1fr 44px', gap: 8, alignItems: 'center' },
  captchaBtn: { height: 44, borderRadius: 10, border: '1px solid #2a3a57', background: '#17243a', color: '#d5e1f4', cursor: 'pointer' },
};
