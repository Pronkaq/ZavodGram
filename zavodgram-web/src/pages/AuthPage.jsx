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
  page: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'radial-gradient(1000px 520px at 20% 10%, rgba(255,255,255,0.14), transparent 60%), linear-gradient(150deg, #0f1319 0%, #171c24 55%, #1f242c 100%)', padding: 20 },
  card: { background: 'rgba(0,0,0,0.6)', borderRadius: 24, padding: '40px 32px', width: '100%', maxWidth: 430, border: '1px solid rgba(255,255,255,0.3)', textAlign: 'center', backdropFilter: 'blur(24px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2), inset 0 -18px 34px rgba(255,255,255,0.03), 0 24px 55px rgba(0,0,0,0.42)' },
  logo: { width: 64, height: 64, background: 'rgba(255,255,255,0.82)', borderRadius: 16, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: '#161b24', marginBottom: 16, border: '1px solid rgba(255,255,255,0.35)' },
  title: { fontSize: 24, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, color: '#F5F6F8' },
  subtitle: { fontSize: 14, color: '#B8BEC9', marginBottom: 24 },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  input: { width: '100%', background: 'rgba(255,255,255,0.72)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 12, padding: '11px 14px', color: '#11151d', fontSize: 14, outline: 'none', fontFamily: "'Manrope', sans-serif", backdropFilter: 'blur(22px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.65), inset 0 -8px 20px rgba(0,0,0,0.09)' },
  btn: { width: '100%', padding: '12px', background: 'rgba(255,255,255,0.82)', border: '1px solid rgba(255,255,255,0.34)', borderRadius: 12, color: '#161b24', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginTop: 6, backdropFilter: 'blur(22px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.75), 0 14px 24px rgba(0,0,0,0.2)' },
  error: { color: '#DDE1E8', fontSize: 13, textAlign: 'left', padding: '6px 0' },
  switch: { background: 'none', border: 'none', color: '#F0F2F6', fontSize: 13, cursor: 'pointer', marginTop: 16, padding: 4 },
  telegramBox: { textAlign: 'left', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 12, background: 'rgba(255,255,255,0.12)', padding: 12, backdropFilter: 'blur(20px)' },
  telegramTitle: { color: '#F2F4F7', fontSize: 14, fontWeight: 700, marginBottom: 8 },
  telegramText: { color: '#D2D6DE', fontSize: 13, marginBottom: 6 },
  telegramLink: { display: 'inline-block', color: '#F5F6F8', textDecoration: 'none', fontWeight: 600, margin: '8px 0' },
  telegramHint: { color: '#D2D6DE', fontSize: 12, marginTop: 4, marginBottom: 6 },
  telegramCommandRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  telegramCommand: { background: 'rgba(0,0,0,0.45)', borderRadius: 8, padding: '5px 8px', color: '#F2F4F7', fontSize: 12 },
  telegramCopyBtn: { border: '1px solid rgba(255,255,255,0.28)', borderRadius: 8, padding: '5px 10px', background: 'rgba(255,255,255,0.1)', color: '#E5E9F0', cursor: 'pointer', fontSize: 12 },
  telegramStatus: { color: '#F2F4F7', fontSize: 13, marginTop: 8 },
};
