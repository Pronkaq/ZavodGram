import { Icons } from './Icons';
import { Av } from './chatUiParts';
import { formatTimeShort } from '../utils/helpers.jsx';

const commentsWord = (n) => {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'комментариев';
  if (last > 1 && last < 5) return 'комментария';
  if (last === 1) return 'комментарий';
  return 'комментариев';
};

export function PostCommentsModal({
  post,
  isOwnerOrAdmin,
  userId,
  members,
  getPostComments,
  onOpenDirectChat,
  onModerateComment,
  replyTo,
  setReplyTo,
  draft,
  setDraft,
  onSend,
  styles,
  onClose,
}) {
  if (!post) return null;

  const commentsAllowed = Boolean(post.commentsEnabled) || isOwnerOrAdmin;
  const modalComments = getPostComments(post);
  const hasLongPost = (post.text || '').length > 330;
  const commentsCount = modalComments.length;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.66)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 365, backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div style={{ background: 'linear-gradient(180deg, rgba(31,35,46,0.98), rgba(24,27,36,0.98))', borderRadius: 20, padding: 20, width: 580, maxWidth: '96vw', maxHeight: '86vh', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', boxShadow: '0 30px 60px rgba(0,0,0,0.45)', gap: 12 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ fontSize: 22, fontWeight: 800, margin: 0, letterSpacing: 0.2, color: '#F7F8FB', fontFamily: 'mono' }}>Комментарии к посту</h3>
        {!commentsAllowed && (
          <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(238,240,244,0.12)', border: '1px solid rgba(238,240,244,0.4)', color: '#F0F1F4', fontSize: 12 }}>
            Комментарии отключены для этого поста.
          </div>
        )}

        <div style={{ position: 'relative', borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', padding: '12px 14px' }}>
          <div style={{ fontSize: 14, color: '#C5CBD6', lineHeight: 1.58, maxHeight: 132, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 6, WebkitBoxOrient: 'vertical', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {post.text || '[медиа-пост]'}
          </div>
          {hasLongPost && <div style={{ position: 'absolute', left: 1, right: 1, bottom: 1, height: 28, borderRadius: '0 0 13px 13px', background: 'linear-gradient(180deg, rgba(26,30,39,0), rgba(26,30,39,0.94))', pointerEvents: 'none' }} />}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
          <button
            style={{ background: 'transparent', border: 'none', color: '#8F97A6', fontSize: 12, fontWeight: 500, lineHeight: 1, padding: '2px 0', height: 'auto', opacity: commentsAllowed ? 1 : 0.75, borderRadius: 0, fontFamily: 'Inter, system-ui, sans-serif' }}
            onClick={() => commentsAllowed && document.getElementById('channel-comment-input')?.focus()}
            disabled={!commentsAllowed}
          >
            {`${commentsCount} ${commentsWord(commentsCount)}`}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', paddingRight: 2, marginTop: 2 }}>
          {modalComments.length === 0 ? (
            <div style={{ color: '#A2A8B6', fontSize: 13, paddingTop: 6 }}>Пока комментариев нет. Будьте первым.</div>
          ) : modalComments.map((comment) => {
            const authorId = comment.fromId || comment.from?.id;
            const canModerate = isOwnerOrAdmin && authorId !== userId;
            const mutedByAdmin = members?.find((m) => m.userId === authorId)?.commentsMuted;
            const commentAuthor = comment.from || null;
            const canOpenAuthorChat = Boolean(commentAuthor?.id) && commentAuthor.id !== userId;
            const isMyComment = authorId === userId;
            const commentBody = `${comment.text || ''}`.trim();
            return (
              <div
                key={comment.id}
                style={{ marginLeft: Math.min((comment.depth || 0) * 16, 64), marginBottom: 6, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '4px 6px', borderRadius: 10, transition: 'background 160ms ease' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.03)';
                  const replyBtn = e.currentTarget.querySelector('[data-reply-btn="true"]');
                  if (replyBtn) {
                    replyBtn.style.opacity = '0.95';
                    replyBtn.style.color = '#BCC3CF';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  const replyBtn = e.currentTarget.querySelector('[data-reply-btn="true"]');
                  if (replyBtn) {
                    replyBtn.style.opacity = '0.5';
                    replyBtn.style.color = '#8D95A4';
                  }
                }}
              >
                <Av
                  src={commentAuthor?.avatar}
                  name={commentAuthor?.name || 'Пользователь'}
                  size={34}
                  radius={999}
                  onClick={canOpenAuthorChat ? () => onOpenDirectChat(commentAuthor) : undefined}
                  style={{ marginTop: 2, border: '1px solid rgba(255,255,255,0.16)' }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
                      <button
                        type="button"
                        style={{ background: 'transparent', border: 'none', fontSize: 14, padding: 0, height: 'auto', color: canOpenAuthorChat ? (isMyComment ? '#9FD3FF' : '#58C8E8') : '#C1C7D2', cursor: canOpenAuthorChat ? 'pointer' : 'default', fontWeight: 700, fontFamily: 'Inter, system-ui, sans-serif', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        onClick={() => canOpenAuthorChat && onOpenDirectChat(commentAuthor)}
                        disabled={!canOpenAuthorChat}
                        title={canOpenAuthorChat ? 'Открыть чат' : undefined}
                      >
                        {commentAuthor?.name || 'Пользователь'}
                      </button>
                      <span style={{ color: '#8790A0', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }}>{formatTimeShort(comment.createdAt)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button data-reply-btn="true" style={{ background: 'transparent', border: 'none', fontSize: 12, padding: 0, height: 'auto', fontFamily: 'Inter, system-ui, sans-serif', color: '#8D95A4', cursor: 'pointer', fontWeight: 500, opacity: 0.5, transition: 'opacity 160ms ease, color 160ms ease' }} onClick={() => setReplyTo(comment)}>Ответить</button>
                      {canModerate && (
                        <>
                          <button style={{ ...styles.ib, fontSize: 11 }} onClick={() => onModerateComment(comment, mutedByAdmin ? 'unmute' : 'mute')}>{mutedByAdmin ? 'Снять мут' : 'Мут'}</button>
                          <button style={{ ...styles.ib, fontSize: 11, color: '#D5D8DE' }} onClick={() => onModerateComment(comment, 'delete')}>Удалить</button>
                        </>
                      )}
                    </div>
                  </div>
                  <div style={{ borderRadius: 10, background: isMyComment ? 'rgba(68,86,115,0.36)' : 'rgba(255,255,255,0.03)', padding: '7px 9px', transition: 'background 160ms ease' }} onMouseEnter={(e) => { e.currentTarget.style.background = isMyComment ? 'rgba(68,86,115,0.44)' : 'rgba(255,255,255,0.045)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = isMyComment ? 'rgba(68,86,115,0.36)' : 'rgba(255,255,255,0.03)'; }}>
                    <div style={{ fontSize: 14, color: '#F2F4F7', lineHeight: 1.42, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {commentBody || '…'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {replyTo && (
          <div style={{ padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', fontSize: 12, color: '#D6DAE2', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Ответ для {replyTo.from?.name || 'пользователя'}: {(replyTo.text || '').slice(0, 90)}</span>
            <button style={styles.ib} onClick={() => setReplyTo(null)}><Icons.Close /></button>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            id="channel-comment-input"
            style={{ ...styles.inp2, flex: '1 1 260px', minWidth: 0, borderRadius: 12, padding: '10px 12px' }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={commentsAllowed ? (replyTo ? 'Написать ответ...' : 'Написать комментарий...') : 'Комментарии отключены'}
            onKeyDown={(e) => e.key === 'Enter' && commentsAllowed && onSend()}
            disabled={!commentsAllowed}
          />
          <button style={{ ...styles.ib, flex: '0 0 auto', minWidth: 102, borderRadius: 11, padding: '9px 12px', fontSize: 14, fontWeight: 500, color: '#C9D0DB', background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.16)', boxShadow: 'none' }} onClick={onSend} disabled={!commentsAllowed || !draft.trim()}>Отправить</button>
        </div>
      </div>
    </div>
  );
}
