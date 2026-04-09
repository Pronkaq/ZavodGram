import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { login, registerStart, registerStatus, registerComplete } = useAuth();
  const [mode, setMode] = useState('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registerStep, setRegisterStep] = useState('form');
  const [pendingRegistration, setPendingRegistration] = useState(null);
  const [form, setForm] = useState({ phone: '+7', password: '', name: '', tag: '@', bio: '' });

  const set = (k, v) => {
    if (k === 'phone') {
      v = v.replace(/[^\d+]/g, '');
      v = v.replace(/\+/g, '');
      v = `+${v}`;
    }
    if (k === 'tag') {
      if (!v.startsWith('@')) v = '@' + v;
      v = '@' + v.slice(1).replace(/[^a-zA-Z0-9_]/g, '');
    }
    setForm((p) => ({ ...p, [k]: v }));
  };

  useEffect(() => {
    if (mode !== 'register' || !pendingRegistration?.registrationId) return;

    const interval = setInterval(async () => {
      try {
        const data = await registerStatus(pendingRegistration.registrationId);
        setPendingRegistration((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            status: data.status,
            confirmedAt: data.confirmedAt,
          };
        });
        if (data.status === 'CONFIRMED') {
          setRegisterStep('confirmed');
        }
      } catch {
        // silently ignore transient polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [mode, pendingRegistration?.registrationId, registerStatus]);

  const validateRegisterForm = () => {
    if (!form.name.trim()) return 'Введите имя';
    if (form.tag.length < 4) return 'Тег минимум 3 символа после @';
    if (!/^\+7\d{10}$/.test(form.phone)) return 'Введите номер в формате +7XXXXXXXXXX';
    if (form.password.length < 6) return 'Пароль минимум 6 символов';
    return '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(form.phone, form.password);
      } else if (registerStep === 'form') {
        const validationError = validateRegisterForm();
        if (validationError) {
          setError(validationError);
          setLoading(false);
          return;
        }

        const data = await registerStart({
          phone: form.phone,
          password: form.password,
          name: form.name,
          tag: form.tag,
          bio: form.bio,
        });

        setPendingRegistration({
          registrationId: data.registrationId,
          expiresAt: data.expiresAt,
          telegramDeepLink: data.telegramDeepLink,
          status: 'PENDING',
        });
        setRegisterStep('telegram');
      } else {
        const registrationId = pendingRegistration?.registrationId;
        if (!registrationId) throw new Error('Регистрация не инициализирована');
        await registerComplete(registrationId);
      }
    } catch (err) {
      setError(err.message || 'Ошибка');
    }
    setLoading(false);
  };

  const resetRegisterFlow = () => {
    setRegisterStep('form');
    setPendingRegistration(null);
    setError('');
  };

  const telegramConfirmed = pendingRegistration?.status === 'CONFIRMED' || registerStep === 'confirmed';
  const telegramStartPayload = (() => {
    if (!pendingRegistration?.telegramDeepLink) return '';
    try {
      return new URL(pendingRegistration.telegramDeepLink).searchParams.get('start') || '';
    } catch {
      return '';
    }
  })();
  const telegramStartCommand = telegramStartPayload ? `/start ${telegramStartPayload}` : '';

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logo}>Z</div>
        <h1 style={s.title}>ZavodGram</h1>
        <p style={s.subtitle}>{mode === 'login' ? 'Вход в аккаунт' : 'Создание аккаунта'}</p>

        <form onSubmit={handleSubmit} style={s.form}>
          {mode === 'register' && registerStep === 'form' && (
            <>
              <input style={s.input} placeholder="Имя" value={form.name} onChange={(e) => set('name', e.target.value)} />
              <input style={s.input} placeholder="@ваш_тег" value={form.tag} onChange={(e) => set('tag', e.target.value)} />
            </>
          )}

          {(mode === 'login' || (mode === 'register' && registerStep === 'form')) && (
            <>
              <input style={s.input} placeholder="+79001234567" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
              <input style={s.input} type="password" placeholder="Пароль" value={form.password} onChange={(e) => set('password', e.target.value)} />
              {mode === 'register' && (
                <textarea style={{ ...s.input, minHeight: 50, resize: 'vertical' }} placeholder="О себе (необязательно)" value={form.bio} onChange={(e) => set('bio', e.target.value)} />
              )}
            </>
          )}

          {mode === 'register' && registerStep !== 'form' && pendingRegistration && (
            <div style={s.telegramBox}>
              <div style={s.telegramTitle}>Подтвердите регистрацию в Telegram</div>
              <div style={s.telegramText}>1) Откройте бота по ссылке ниже и нажмите «Подтвердить».</div>
              <div style={s.telegramText}>2) Вернитесь сюда и завершите регистрацию.</div>
              {pendingRegistration.telegramDeepLink ? (
                <>
                  <a href={pendingRegistration.telegramDeepLink} target="_blank" rel="noreferrer" style={s.telegramLink}>
                    Открыть Telegram-бота
                  </a>
                  <div style={s.telegramHint}>
                    Если бот пишет, что payload отсутствует — отправьте ему эту команду вручную:
                  </div>
                  <div style={s.telegramCommandRow}>
                    <code style={s.telegramCommand}>{telegramStartCommand}</code>
                    <button
                      type="button"
                      style={s.telegramCopyBtn}
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(telegramStartCommand);
                        } catch {
                          // ignore clipboard permission errors
                        }
                      }}
                    >
                      Копировать
                    </button>
                  </div>
                </>
              ) : (
                <div style={s.error}>Бот не настроен: отсутствует TELEGRAM_BOT_USERNAME на backend.</div>
              )}
              <div style={s.telegramStatus}>
                Статус: {telegramConfirmed ? 'подтверждено ✅' : 'ожидаем подтверждение...'}
              </div>
            </div>
          )}

          {error && <div style={s.error}>{error}</div>}

          <button style={s.btn} type="submit" disabled={loading || (mode === 'register' && registerStep !== 'form' && !telegramConfirmed)}>
            {loading
              ? '...'
              : mode === 'login'
                ? 'Войти'
                : registerStep === 'form'
                  ? 'Отправить в Telegram'
                  : 'Завершить регистрацию'}
          </button>

          {mode === 'register' && registerStep !== 'form' && (
            <button type="button" style={s.switch} onClick={resetRegisterFlow}>
              Начать заново
            </button>
          )}
        </form>

        <button style={s.switch} onClick={() => {
          setMode(mode === 'login' ? 'register' : 'login');
          setError('');
          resetRegisterFlow();
        }}>
          {mode === 'login' ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войти'}
        </button>
      </div>
    </div>
  );
}

const s = {
  page: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'radial-gradient(circle at top left, #200e14, #0a0b10 50%)', padding: 24 },
  card: { background: '#141017', borderRadius: 24, padding: '44px 36px', width: '100%', maxWidth: 460, border: '1px solid rgba(255,122,142,0.18)', textAlign: 'center', boxShadow: '0 30px 60px rgba(0,0,0,0.45)' },
  logo: { width: 72, height: 72, background: 'linear-gradient(135deg, #E03A4E, #7A0C18)', borderRadius: 20, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 34, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#fff', marginBottom: 18 },
  title: { fontSize: 28, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginBottom: 6, background: 'linear-gradient(135deg, #FF7285, #8D1123)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
  subtitle: { fontSize: 16, color: '#A07F8A', marginBottom: 26 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,122,142,0.2)', borderRadius: 12, padding: '13px 15px', color: '#F4ECEF', fontSize: 15, outline: 'none', fontFamily: "'Manrope', sans-serif" },
  btn: { width: '100%', padding: '13px', background: 'linear-gradient(135deg, #E03A4E, #7A0C18)', border: 'none', borderRadius: 12, color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 8 },
  error: { color: '#E55A5A', fontSize: 13, textAlign: 'left', padding: '6px 0' },
  switch: { background: 'none', border: 'none', color: '#E03A4E', fontSize: 13, cursor: 'pointer', marginTop: 16, padding: 4 },
  telegramBox: { textAlign: 'left', border: '1px solid rgba(224,58,78,0.45)', borderRadius: 10, background: 'rgba(224,58,78,0.12)', padding: 12 },
  telegramTitle: { color: '#E8E8ED', fontSize: 14, fontWeight: 700, marginBottom: 8 },
  telegramText: { color: '#B8BDCA', fontSize: 13, marginBottom: 6 },
  telegramLink: { display: 'inline-block', color: '#FF7D8E', textDecoration: 'none', fontWeight: 600, margin: '8px 0' },
  telegramHint: { color: '#B8BDCA', fontSize: 12, marginTop: 4, marginBottom: 6 },
  telegramCommandRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  telegramCommand: { background: 'rgba(0,0,0,0.22)', borderRadius: 6, padding: '5px 8px', color: '#E8E8ED', fontSize: 12 },
  telegramCopyBtn: { border: '1px solid rgba(255,255,255,0.16)', borderRadius: 8, padding: '5px 10px', background: 'transparent', color: '#D6DBE8', cursor: 'pointer', fontSize: 12 },
  telegramStatus: { color: '#E8E8ED', fontSize: 13, marginTop: 8 },
};
