import { useEffect, useMemo, useState } from 'react';
import { Av } from './chatUiParts';
import { Icons } from './Icons';

const SETTINGS_GROUPS = [
  {
    id: 'account',
    rows: [
      { id: 'profile', title: 'Профиль', subtitle: 'Имя и фото', icon: <Icons.User size={16} /> },
    ],
  },
  {
    id: 'privacy',
    rows: [
      { id: 'notifications', title: 'Уведомления', subtitle: 'Звуки и предпросмотр', icon: <Icons.Bell size={15} /> },
      { id: 'privacy', title: 'Конфиденциальность', subtitle: 'Доступ и безопасность', icon: <Icons.Lock size={14} /> },
      { id: 'data', title: 'Данные и память', subtitle: 'Кэш и медиа', icon: <Icons.File size={14} /> },
      { id: 'devices', title: 'Устройства', subtitle: 'Активные сессии', icon: <Icons.Group size={14} /> },
    ],
  },
  {
    id: 'appearance',
    rows: [
      { id: 'language', title: 'Язык', subtitle: 'Русский', icon: <Icons.Copy size={14} /> },
      { id: 'stickers', title: 'Стикеры и эмодзи', subtitle: 'Наборы и реакции', icon: <Icons.Smile size={14} /> },
      { id: 'folders', title: 'Папки чатов', subtitle: 'Организация диалогов', icon: <Icons.Channel size={14} /> },
    ],
  },
];

const SETTINGS_SUBPAGE_TITLES = {
  profile: 'Профиль',
  notifications: 'Уведомления',
  privacy: 'Конфиденциальность',
  data: 'Данные и память',
  devices: 'Устройства',
  language: 'Язык',
  stickers: 'Стикеры и эмодзи',
  folders: 'Папки чатов',
};

const DEFAULT_PREFERENCES = {
  notifications: {
    sound: true,
    previews: true,
    desktopAlerts: true,
  },
  privacy: {
    readReceipts: true,
    lastSeen: 'contacts',
  },
  data: {
    mediaAutoload: true,
    saveToGallery: false,
    cachedMb: 486,
  },
  language: 'Русский',
  stickers: {
    bigEmoji: true,
    suggestByEmoji: true,
    loopAnimated: true,
  },
  folders: {
    unreadOnly: false,
    separateChannels: true,
    muteBots: false,
  },
};

export function ProfilePanel({
  open,
  profileData,
  settingsMode,
  settingsSubpage,
  nameEdit,
  tagEdit,
  bioEdit,
  settingsSaveState,
  styles,
  onClose,
  onSetSettingsSubpage,
  onSetNameEdit,
  onSetTagEdit,
  onSetBioEdit,
  onSaveProfileCard,
  onAvatarUpload,
  onOpenSettingsSubpage,
  onLogout,
  onOpenAvatar,
}) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('zg.settings.preferences');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        setPreferences((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
  }, []);

  useEffect(() => {
    localStorage.setItem('zg.settings.preferences', JSON.stringify(preferences));
  }, [preferences]);

  const activeSessions = useMemo(() => ([
    { id: 'current', name: 'Текущее устройство', hint: navigator.userAgent || 'Web browser', current: true },
    { id: 'mobile', name: 'iPhone 14 · Safari', hint: 'Москва · 10 минут назад', current: false },
    { id: 'tablet', name: 'iPad Pro · Chrome', hint: 'Санкт-Петербург · 2 дня назад', current: false },
  ]), []);

  const toggleNestedPreference = (scope, key) => {
    setPreferences((prev) => ({
      ...prev,
      [scope]: {
        ...prev[scope],
        [key]: !prev[scope][key],
      },
    }));
  };

  const renderSettingSwitch = (label, hint, checked, onToggle) => (
    <button
      type="button"
      onClick={onToggle}
      style={{ width: '100%', border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '10px 12px', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}
    >
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#EBEEF5' }}>{label}</div>
        {hint && <div style={{ marginTop: 2, fontSize: 12, color: '#97A0B2' }}>{hint}</div>}
      </div>
      <div style={{ width: 36, height: 22, borderRadius: 999, background: checked ? 'linear-gradient(135deg, #DEE3EC, #B8BFCE)' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.16)', position: 'relative', transition: 'all .2s ease' }}>
        <div style={{ width: 16, height: 16, borderRadius: '50%', background: checked ? '#1F2632' : '#DCE1EA', position: 'absolute', top: 2, left: checked ? 17 : 2, transition: 'left .2s ease' }} />
      </div>
    </button>
  );

  const renderSettingsSubpage = () => {
    switch (settingsSubpage) {
      case 'notifications':
        return (
          <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {renderSettingSwitch('Звуковые уведомления', 'Воспроизводить звук при новых сообщениях', preferences.notifications.sound, () => toggleNestedPreference('notifications', 'sound'))}
            {renderSettingSwitch('Предпросмотр сообщений', 'Показывать текст уведомления на экране', preferences.notifications.previews, () => toggleNestedPreference('notifications', 'previews'))}
            {renderSettingSwitch('Desktop уведомления', 'Разрешить push-уведомления в браузере', preferences.notifications.desktopAlerts, () => toggleNestedPreference('notifications', 'desktopAlerts'))}
          </div>
        );
      case 'privacy':
        return (
          <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {renderSettingSwitch('Отправлять отметку о прочтении', 'Собеседники увидят, что вы прочитали сообщение', preferences.privacy.readReceipts, () => toggleNestedPreference('privacy', 'readReceipts'))}
            <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Кто видит статус «в сети»</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                {['all', 'contacts', 'nobody'].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPreferences((prev) => ({ ...prev, privacy: { ...prev.privacy, lastSeen: value } }))}
                    style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '7px 10px', background: preferences.privacy.lastSeen === value ? 'rgba(224,228,237,0.18)' : 'transparent', color: '#E8ECF5', fontSize: 12 }}
                  >
                    {value === 'all' ? 'Все' : value === 'contacts' ? 'Контакты' : 'Никто'}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      case 'data':
        return (
          <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {renderSettingSwitch('Автозагрузка медиа', 'Фото и видео загружаются автоматически', preferences.data.mediaAutoload, () => toggleNestedPreference('data', 'mediaAutoload'))}
            {renderSettingSwitch('Сохранять в галерею', 'Сохранять входящие фото и видео на устройство', preferences.data.saveToGallery, () => toggleNestedPreference('data', 'saveToGallery'))}
            <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
              <div style={{ fontSize: 12, color: '#9AA3B5' }}>Кэш приложения</div>
              <div style={{ marginTop: 4, fontSize: 18, fontWeight: 700 }}>{preferences.data.cachedMb} MB</div>
              <button
                type="button"
                onClick={() => setPreferences((prev) => ({ ...prev, data: { ...prev.data, cachedMb: 0 } }))}
                style={{ marginTop: 8, border: '1px solid rgba(255,255,255,0.16)', borderRadius: 10, background: 'transparent', color: '#E7EBF4', padding: '6px 10px', fontSize: 12 }}
              >
                Очистить кэш
              </button>
            </div>
          </div>
        );
      case 'devices':
        return (
          <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeSessions.map((session) => (
              <div key={session.id} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12, padding: 12, background: 'rgba(255,255,255,0.03)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{session.name}</div>
                  {session.current && <span style={{ fontSize: 11, color: '#BFD5C4' }}>текущая</span>}
                </div>
                <div style={{ marginTop: 4, fontSize: 12, color: '#9AA3B5' }}>{session.hint}</div>
              </div>
            ))}
          </div>
        );
      case 'language':
        return (
          <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Русский', 'English'].map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setPreferences((prev) => ({ ...prev, language: lang }))}
                style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '10px 12px', textAlign: 'left', background: preferences.language === lang ? 'rgba(224,228,237,0.18)' : 'rgba(255,255,255,0.03)', color: '#ECF0F8', fontWeight: preferences.language === lang ? 700 : 500 }}
              >
                {lang}
              </button>
            ))}
          </div>
        );
      case 'stickers':
        return (
          <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {renderSettingSwitch('Увеличенные эмодзи', 'Показывать крупный размер для одиночных эмодзи', preferences.stickers.bigEmoji, () => toggleNestedPreference('stickers', 'bigEmoji'))}
            {renderSettingSwitch('Подсказки по эмодзи', 'Предлагать стикеры на основе эмодзи', preferences.stickers.suggestByEmoji, () => toggleNestedPreference('stickers', 'suggestByEmoji'))}
            {renderSettingSwitch('Анимированные эмодзи', 'Проигрывать анимацию в интерфейсе', preferences.stickers.loopAnimated, () => toggleNestedPreference('stickers', 'loopAnimated'))}
          </div>
        );
      case 'folders':
        return (
          <div style={{ padding: '20px 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {renderSettingSwitch('Только непрочитанные', 'Показывать в папках чаты с новыми сообщениями', preferences.folders.unreadOnly, () => toggleNestedPreference('folders', 'unreadOnly'))}
            {renderSettingSwitch('Отдельно каналы', 'Группировать каналы в отдельную папку', preferences.folders.separateChannels, () => toggleNestedPreference('folders', 'separateChannels'))}
            {renderSettingSwitch('Скрывать ботов', 'Исключать служебные чаты из папок', preferences.folders.muteBots, () => toggleNestedPreference('folders', 'muteBots'))}
          </div>
        );
      default:
        return null;
    }
  };

  if (!open || !profileData) return null;

  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 340, maxWidth: '100vw', background: '#171A20', borderLeft: '1px solid rgba(255,255,255,0.06)', zIndex: 90, display: 'flex', flexDirection: 'column', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button
          style={styles.ib}
          onClick={() => {
            if (settingsMode && settingsSubpage) {
              onSetSettingsSubpage(null);
              return;
            }
            onClose();
            onSetSettingsSubpage(null);
          }}
        >
          {settingsMode && settingsSubpage ? <Icons.Back /> : <Icons.Close />}
        </button>
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          {settingsMode ? (SETTINGS_SUBPAGE_TITLES[settingsSubpage] || 'Настройки') : 'Профиль'}
        </span>
      </div>
      {settingsMode ? (
        settingsSubpage === 'profile' ? (
          <div style={{ padding: '20px 16px 24px' }}>
            <div style={{ padding: 16, background: 'linear-gradient(155deg, rgba(34,39,49,0.95), rgba(27,31,40,0.96))', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 18 }}>
              <label style={styles.lbl}>Display name</label>
              <input style={styles.inp2} value={nameEdit} onChange={(e) => onSetNameEdit(e.target.value)} placeholder="Введите имя" />
              <label style={{ ...styles.lbl, marginTop: 12 }}>Имя пользователя</label>
              <input style={{ ...styles.inp2, fontFamily: 'mono' }} value={tagEdit} onChange={(e) => onSetTagEdit(e.target.value)} placeholder="@username" />
              <label style={{ ...styles.lbl, marginTop: 12 }}>О себе</label>
              <textarea style={{ ...styles.inp2, minHeight: 90, resize: 'vertical' }} value={bioEdit} onChange={(e) => onSetBioEdit(e.target.value)} placeholder="Коротко расскажите о себе" />
              <button onClick={onSaveProfileCard} style={{ ...styles.saveBtn, width: '100%', marginTop: 12 }} disabled={settingsSaveState.loading}>
                {settingsSaveState.loading ? 'Сохранение…' : 'Сохранить'}
              </button>
              {settingsSaveState.error && <div style={{ marginTop: 10, fontSize: 12, color: '#D5D8DE' }}>{settingsSaveState.error}</div>}
              {settingsSaveState.ok && <div style={{ marginTop: 10, fontSize: 12, color: '#B8D9C6' }}>{settingsSaveState.ok}</div>}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 14, padding: '10px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 12, color: '#BFC4D0', fontSize: 12, lineHeight: 1.5 }}>
                <Icons.Shield /><span>Публичные поля профиля редактируются в одном месте для удобства.</span>
              </div>
            </div>
          </div>
        ) : settingsSubpage ? renderSettingsSubpage() : (
          <div style={{ padding: '14px 14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'linear-gradient(150deg, rgba(35,40,51,0.96), rgba(27,31,40,0.96))', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 20, padding: 14, boxShadow: '0 12px 30px rgba(0,0,0,0.28)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ position: 'relative' }}>
                  <Av src={profileData.avatar} name={profileData.name} size={72} radius={18} />
                  <label style={{ position: 'absolute', bottom: -4, right: -4, width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #E9EBEF, #C8CCD4)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: '2px solid #171A20' }}>
                    <Icons.Edit />
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={onAvatarUpload} />
                  </label>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#F3F5F9', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profileData.name}</div>
                  <div style={{ fontSize: 13, color: '#BBC2D1', fontFamily: 'mono', marginTop: 3 }}>{profileData.tag || '@username'}</div>
                  <div style={{ fontSize: 12, color: '#8E96A7', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{profileData.bio || 'Расскажите немного о себе'}</div>
                </div>
                <button style={{ ...styles.ib, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }} onClick={() => onOpenSettingsSubpage('profile')}>
                  <Icons.Edit />
                </button>
              </div>
            </div>

            {SETTINGS_GROUPS.map((group) => (
              <div key={group.id} style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>
                {group.rows.map((row, idx) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => onOpenSettingsSubpage(row.id)}
                    style={{ width: '100%', border: 'none', background: 'transparent', color: 'inherit', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px', cursor: 'pointer', borderBottom: idx === group.rows.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.06)', textAlign: 'left' }}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 10, background: 'rgba(255,255,255,0.07)', color: '#ECEFF5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{row.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#F2F4F8' }}>{row.title}</div>
                      {row.subtitle && <div style={{ fontSize: 12, color: '#8F98A9', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.subtitle}</div>}
                    </div>
                    <div style={{ transform: 'rotate(180deg)', color: '#7D8799', display: 'flex' }}>
                      <Icons.Back size={14} />
                    </div>
                  </button>
                ))}
              </div>
            ))}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '2px 2px 6px' }}>
              <div style={{ fontSize: 12, color: '#717A8B', textAlign: 'center' }}>ZavodGram Web · v1.0</div>
              <button onClick={onLogout} style={{ ...styles.saveBtn, width: '100%', background: 'rgba(255,255,255,0.07)', color: '#F3F4F7', border: '1px solid rgba(255,255,255,0.11)' }}>
                <Icons.Logout /> Выйти
              </button>
            </div>
          </div>
        )
      ) : (
        <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ position: 'relative', marginBottom: 14 }}>
            <Av src={profileData.avatar} name={profileData.name} size={90} radius={22} onClick={onOpenAvatar} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{profileData.name}</h2>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: 'rgba(255,255,255,0.1)', borderRadius: 20, color: '#E9EBEF', fontSize: 13, fontWeight: 600, fontFamily: 'mono', marginBottom: 18 }}><Icons.Tag />{profileData.tag}<Icons.Shield /></div>
          <p style={{ fontSize: 14, color: '#A2A8B6', textAlign: 'center', lineHeight: 1.55, marginBottom: 22, maxWidth: 260 }}>{profileData.bio}</p>
          <div style={{ width: '100%' }}>
            {[['Телефон', profileData.phone], ['Тег', profileData.tag, '#E9EBEF']].map(([label, value, color], idx) => (
              <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style={{ fontSize: 13, color: '#7C8392' }}>{label}</span>
                <span style={{ fontSize: 13, fontWeight: 500, fontFamily: 'mono', color: color || '#F2F4F7' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
