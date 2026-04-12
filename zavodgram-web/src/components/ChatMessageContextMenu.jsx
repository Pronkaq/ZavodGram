import { Icons } from './Icons';

export function ChatMessageContextMenu({
  contextMenu,
  styles,
  canForward = true,
  canDelete = true,
  onReply,
  onForward,
  onReaction,
  onCopy,
  onEdit,
  onDelete,
}) {
  if (!contextMenu) return null;

  return (
    <div
      style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, background: '#1D2128', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 4, zIndex: 200, minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={styles.mi} onClick={onReply}><Icons.Reply /> Ответить</div>
      {canForward && <div style={styles.mi} onClick={onForward}><Icons.Forward /> Переслать</div>}
      <div style={styles.mi} onClick={onReaction}><Icons.Smile /> Реакция</div>
      <div style={styles.mi} onClick={onCopy}><Icons.Copy /> Копировать</div>
      {contextMenu.msg.mine && <div style={styles.mi} onClick={onEdit}><Icons.Edit /> Редактировать</div>}
      {contextMenu.msg.mine && canDelete && <div style={{ ...styles.mi, color: '#D5D8DE' }} onClick={onDelete}><Icons.Trash /> Удалить</div>}
    </div>
  );
}
