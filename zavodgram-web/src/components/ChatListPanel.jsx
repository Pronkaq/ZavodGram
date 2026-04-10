import { Icons, typeColors } from './Icons';
import { Av } from './chatUiParts';
import { formatTime, getChatName, isOnline, getLastMessage } from '../utils/helpers.jsx';

const tc = typeColors;

export function ChatListPanel({
  styles,
  search,
  onSearchChange,
  onOpenSidebar,
  onToggleNotifications,
  onOpenNewChat,
  filteredChats,
  userId,
  activeChat,
  onSelectChat,
  getAvatarSourceForChat,
}) {
  return (
    <div style={styles.cl} className="zg-chatlist">
      <div style={{ display: 'flex', alignItems: 'center', padding: '12px 12px', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <button style={styles.ib} onClick={onOpenSidebar}><Icons.Menu /></button>
        <h1 style={styles.title}>ZavodGram</h1>
        <button style={styles.ib} onClick={onToggleNotifications}><Icons.Bell /></button>
        <button style={styles.ib} onClick={onOpenNewChat}><Icons.Plus /></button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 12px', padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 10, color: '#686F7F' }}>
        <Icons.Search />
        <input style={styles.si} placeholder="Поиск чатов..." value={search} onChange={(e) => onSearchChange(e.target.value)} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredChats.map((chat) => {
          const name = getChatName(chat, userId);
          const on = isOnline(chat, userId);
          return (
            <div
              key={chat.id}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.025)', ...(activeChat === chat.id ? { background: 'rgba(255,255,255,0.1)', borderLeft: '3px solid #E9EBEF' } : {}) }}
              onClick={() => onSelectChat(chat.id)}
            >
              <Av src={getAvatarSourceForChat(chat)} name={name} color={tc[chat.type]} online={on} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {chat.type === 'SECRET' && <Icons.Lock />}
                    {chat.type === 'GROUP' && <Icons.Group />}
                    {chat.type === 'CHANNEL' && <Icons.Channel />}
                    {chat.muted && <Icons.BellOff size={12} />} {name}
                  </span>
                  <span style={{ fontSize: 11, color: '#686F7F', flexShrink: 0, fontFamily: 'mono' }}>{formatTime(chat.messages?.[0]?.createdAt || chat.updatedAt)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 13, color: '#7C8392', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{getLastMessage(chat)}</span>
                  {chat.unreadCount > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', padding: '2px 7px', borderRadius: 10, background: chat.muted ? '#686F7F' : tc[chat.type], fontFamily: 'mono' }}>{chat.unreadCount}</span>}
                </div>
              </div>
            </div>
          );
        })}
        {filteredChats.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: '#686F7F', fontSize: 14 }}>Нет чатов</div>}
      </div>
    </div>
  );
}
