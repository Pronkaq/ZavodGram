import { Icons } from './Icons';

export function ChatTopicsBar({
  visible,
  styles,
  topicsLoading,
  chatTopics,
  activeTopicId,
  onSelectTopic,
  isOwnerOrAdmin,
  newTopicTitle,
  onNewTopicTitleChange,
  onCreateTopic,
}) {
  if (!visible) return null;

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,18,25,0.7)', overflowX: 'auto' }}>
      <div style={{ ...styles.chatInner, display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        {topicsLoading && <span style={{ fontSize: 12, color: '#A3A8B4' }}>Загрузка тем...</span>}
        {!topicsLoading && chatTopics.map((topic) => (
          <button
            key={topic.id}
            style={{ ...styles.ib, height: 'auto', padding: '6px 10px', borderRadius: 999, whiteSpace: 'nowrap', ...(activeTopicId === topic.id ? { background: 'rgba(255,255,255,0.2)', color: '#F5F6F8' } : {}) }}
            onClick={() => onSelectTopic(topic.id)}
          >
            #{topic.title}
          </button>
        ))}
        {isOwnerOrAdmin && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <input
              value={newTopicTitle}
              onChange={(event) => onNewTopicTitleChange(event.target.value)}
              placeholder="Новая тема"
              style={{ ...styles.inp2, height: 30, minWidth: 130 }}
            />
            <button style={{ ...styles.ib, color: '#EDEFF3' }} onClick={onCreateTopic}><Icons.Plus /></button>
          </div>
        )}
      </div>
    </div>
  );
}
