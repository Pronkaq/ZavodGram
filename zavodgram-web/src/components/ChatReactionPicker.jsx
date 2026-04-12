export function ChatReactionPicker({ reactionPicker, reactionSet, onReact, onClose }) {
  if (!reactionPicker) return null;

  return (
    <div
      style={{ position: 'fixed', top: reactionPicker.y, left: reactionPicker.x, background: '#1D2128', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 999, padding: '8px 10px', zIndex: 240, display: 'flex', gap: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
      onClick={(e) => e.stopPropagation()}
    >
      {reactionSet.map((emoji) => (
        <button
          key={emoji}
          style={{ background: 'transparent', border: 'none', fontSize: 20, cursor: 'pointer' }}
          onClick={() => {
            onReact(reactionPicker.msgId, emoji);
            onClose();
          }}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
