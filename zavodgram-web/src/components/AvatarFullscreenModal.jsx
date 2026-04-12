import { resolveAvatarSrc } from './chatUiParts';

export function AvatarFullscreenModal({ avatarView, onClose }) {
  if (!avatarView) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, cursor: 'pointer' }} onClick={onClose}>
      {avatarView.url ? (
        <img src={resolveAvatarSrc(avatarView.url)} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 16 }} alt="" />
      ) : (
        <div style={{ width: 240, height: 240, borderRadius: 32, background: '#E9EBEF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 96, fontWeight: 700, color: '#fff', fontFamily: 'mono' }}>
          {avatarView.name?.split(' ').map((w) => w[0]).join('').slice(0, 2)}
        </div>
      )}
    </div>
  );
}
