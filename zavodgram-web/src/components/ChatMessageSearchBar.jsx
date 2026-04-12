import { Icons } from './Icons';

export function ChatMessageSearchBar({
  open,
  styles,
  msgSearch,
  onSearchChange,
  searchResults,
  msgSearchIdx,
  onPrev,
  onNext,
  onClose,
}) {
  if (!open) return null;

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,18,25,0.95)' }}>
      <div style={{ ...styles.chatInner, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
        <Icons.Search size={16} />
        <input
          style={{ ...styles.si, fontSize: 13 }}
          placeholder="Поиск..."
          value={msgSearch}
          onChange={(event) => onSearchChange(event.target.value)}
          autoFocus
        />
        <span style={{ fontSize: 12, color: '#7C8392', fontFamily: 'mono', whiteSpace: 'nowrap' }}>
          {searchResults.length > 0 ? `${msgSearchIdx + 1}/${searchResults.length}` : msgSearch ? '0' : ''}
        </span>
        {searchResults.length > 1 && (
          <>
            <button style={styles.ib} onClick={onPrev}>
              <span style={{ transform: 'rotate(180deg)', display: 'flex' }}><Icons.ArrowDown /></span>
            </button>
            <button style={styles.ib} onClick={onNext}><Icons.ArrowDown /></button>
          </>
        )}
        <button style={styles.ib} onClick={onClose}><Icons.Close /></button>
      </div>
    </div>
  );
}
