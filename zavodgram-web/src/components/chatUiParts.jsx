import { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';
import { getAccessToken } from '../api/client';
import MediaGroupMessage from './media/MediaGroupMessage.jsx';

export function mediaUrlById(id) {
  const token = getAccessToken();
  return token ? `/api/media/${id}/download?token=${encodeURIComponent(token)}` : '';
}

export function resolveAvatarSrc(src) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  if (src.startsWith('media:')) return mediaUrlById(src.slice(6));
  if (src.startsWith('/uploads/')) {
    const token = getAccessToken();
    return token ? `/api/media/legacy?path=${encodeURIComponent(src)}&token=${encodeURIComponent(token)}` : '';
  }
  return src;
}

function formatAudioTime(totalSeconds) {
  const safe = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function Av({ src, name, size = 46, radius = 12, color, online, onClick, style: extraStyle }) {
  const initials = name?.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const bg = src ? 'transparent' : (color || '#E9EBEF');
  return (
    <div onClick={onClick} style={{ width: size, height: size, borderRadius: radius, background: bg, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: onClick ? 'pointer' : 'default', overflow: 'hidden', ...extraStyle }}>
      {src ? <img src={resolveAvatarSrc(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" /> :
        <span style={{ fontSize: size * 0.34, fontWeight: 600, color: '#fff', fontFamily: "'JetBrains Mono', monospace" }}>{initials}</span>}
      {online && <div style={{ position: 'absolute', bottom: size > 40 ? 1 : 0, right: size > 40 ? 1 : 0, width: size > 40 ? 10 : 8, height: size > 40 ? 10 : 8, background: '#EDEFF3', borderRadius: '50%', border: '2px solid #131720' }} />}
    </div>
  );
}

export function MediaAttachment({ media, onTranscribe, transcriptions = {}, transcriptionLoading = {}, transcriptionAvailable = true, actionButtonStyle = {}, onOpenMedia, showMeta = true, carouselImages = false, mediaMaxWidth = 260 }) {
  if (!media || media.length === 0) return null;
  const imageItems = media.filter((m) => m.type === 'IMAGE');
  const visualItems = media.filter((m) => m.type === 'IMAGE' || m.type === 'VIDEO');
  const nonImageItems = media.filter((m) => m.type !== 'IMAGE');

  const parts = [];

  if (carouselImages && imageItems.length > 1) {
    parts.push(
      <div key="image-carousel" style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', overflowX: 'auto', gap: 8, scrollSnapType: 'x mandatory', borderRadius: 12 }}>
          {imageItems.map((m, idx) => (
            <button
              key={m.id}
              type="button"
              onClick={() => onOpenMedia?.({ type: 'IMAGE', src: mediaUrlById(m.id), title: m.originalName })}
              style={{ flex: '0 0 100%', borderRadius: 12, overflow: 'hidden', border: 'none', background: 'transparent', padding: 0, textAlign: 'left', scrollSnapAlign: 'start' }}
              aria-label={`Открыть изображение ${idx + 1}`}
            >
              <img src={mediaUrlById(m.id)} style={{ width: '100%', maxHeight: 340, objectFit: 'cover', display: 'block', borderRadius: 12 }} alt={m.originalName} />
            </button>
          ))}
        </div>
        <div style={{ marginTop: 6, display: 'flex', gap: 5, justifyContent: 'center' }}>
          {imageItems.map((m, idx) => (
            <span key={`${m.id}-dot`} style={{ width: 6, height: 6, borderRadius: '50%', background: idx === 0 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.28)' }} />
          ))}
        </div>
      </div>
    );
  } else if (visualItems.length > 1) {
    parts.push(
      <MediaGroupMessage
        key="media-group"
        items={visualItems.map((item) => ({
          id: item.id,
          url: mediaUrlById(item.id),
          alt: item.originalName,
          type: item.type === 'VIDEO' ? 'video' : 'image',
        }))}
        onOpenImage={(index) => {
          const mediaItem = visualItems[index];
          if (!mediaItem) return;
          onOpenMedia?.({ type: mediaItem.type || 'IMAGE', src: mediaUrlById(mediaItem.id), title: mediaItem.originalName });
        }}
      />
    );
  } else {
    imageItems.forEach((m) => {
      parts.push(
        <button
          key={m.id}
          type="button"
          onClick={() => onOpenMedia?.({ type: 'IMAGE', src: mediaUrlById(m.id), title: m.originalName })}
          style={{ marginBottom: 6, borderRadius: 10, overflow: 'hidden', maxWidth: mediaMaxWidth, border: 'none', background: 'transparent', padding: 0, textAlign: 'left' }}
        >
          <img src={mediaUrlById(m.id)} style={{ width: '100%', maxHeight: 300, objectFit: 'cover', display: 'block', borderRadius: 10 }} alt={m.originalName} />
          {false && <div style={{ fontSize: 11, color: '#8E95A3', marginTop: 4 }}>{m.originalName}</div>}
        </button>
      );
    });
  }

  return [...parts, ...nonImageItems.map((m) => {
    if (visualItems.length > 1 && m.type === 'VIDEO') {
      return null;
    }
    if (m.type === 'AUDIO') {
      return (
        <VoiceAttachment
          key={m.id}
          mediaItem={m}
          onTranscribe={onTranscribe}
          transcriptions={transcriptions}
          transcriptionLoading={transcriptionLoading}
          transcriptionAvailable={transcriptionAvailable}
          actionButtonStyle={actionButtonStyle}
        />
      );
    }
    if (m.type === 'IMAGE') {
      return null;
    }
    if (m.type === 'VIDEO') {
      return (
        <button
          key={m.id}
          type="button"
          onClick={() => onOpenMedia?.({ type: 'VIDEO', src: mediaUrlById(m.id), title: m.originalName })}
          style={{ marginBottom: 8, border: '1px solid rgba(231,234,240,0.2)', borderRadius: 12, background: 'rgba(20,23,31,0.55)', width: 'min(100%, 360px)', padding: 0, overflow: 'hidden', textAlign: 'left' }}
        >
          <div style={{ position: 'relative', background: 'rgba(10,12,18,0.85)' }}>
            <video
              src={mediaUrlById(m.id)}
              preload="metadata"
              muted
              playsInline
              style={{ width: '100%', maxHeight: 260, display: 'block', objectFit: 'cover', background: '#0D1017' }}
            />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, border: '1px solid rgba(255,255,255,0.3)' }}>▶</div>
            </div>
          </div>
          {showMeta && (
            <div style={{ padding: '8px 10px' }}>
              <div style={{ fontSize: 13, fontWeight: 500, color: '#E8ECF4' }}>{m.originalName || 'Видео'}</div>
              <div style={{ fontSize: 11, color: '#93A0B7', fontFamily: 'mono' }}>{(m.size / 1024 / 1024).toFixed(1)} MB</div>
            </div>
          )}
        </button>
      );
    }
    return (
      <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'rgba(255,255,255,0.08)', borderRadius: 10, marginBottom: 6, border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ width: 38, height: 38, borderRadius: 9, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E9EBEF', flexShrink: 0 }}><Icons.File /></div>
        <div><div style={{ fontSize: 13, fontWeight: 500 }}>{m.originalName}</div><div style={{ fontSize: 11, color: '#7C8392', fontFamily: 'mono' }}>{(m.size / 1024 / 1024).toFixed(1)} MB</div></div>
      </div>
    );
  }).filter(Boolean)];
}

function VoiceAttachment({ mediaItem, onTranscribe, transcriptions = {}, transcriptionLoading = {}, transcriptionAvailable = true, actionButtonStyle = {} }) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const onLoaded = () => setDuration(audio.duration || 0);
    const onTime = () => setCurrentTime(audio.currentTime || 0);
    const onEnded = () => setIsPlaying(false);

    audio.addEventListener('loadedmetadata', onLoaded);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', onLoaded);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    try {
      await audio.play();
      setIsPlaying(true);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'linear-gradient(145deg, rgba(59,64,79,0.7), rgba(42,46,60,0.72))', borderRadius: 14, marginBottom: 6, border: '1px solid rgba(255,255,255,0.16)', minWidth: 250 }}>
      <audio ref={audioRef} preload="metadata" src={mediaUrlById(mediaItem.id)} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button
          type="button"
          onClick={togglePlayback}
          style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'linear-gradient(135deg, #9480FF, #7464EC)', color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
        >
          <span style={{ fontSize: isPlaying ? 14 : 16, lineHeight: 1, marginLeft: isPlaying ? 0 : 2 }}>{isPlaying ? '❚❚' : '▶'}</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ height: 22, borderRadius: 999, position: 'relative', overflow: 'hidden', background: 'rgba(20,23,31,0.6)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}
            onClick={(e) => {
              const audio = audioRef.current;
              if (!audio || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              audio.currentTime = ratio * duration;
              setCurrentTime(audio.currentTime);
            }}>
            <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(90deg, rgba(140,126,255,0.8) 0 3px, transparent 3px 7px)', opacity: 0.45 }} />
            <div style={{ position: 'absolute', inset: 0, width: `${progress}%`, background: 'linear-gradient(90deg, rgba(164,150,255,0.8), rgba(132,116,244,0.9))', boxShadow: '0 0 10px rgba(132,116,244,0.5)' }} />
          </div>
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#B9BFCC', fontFamily: 'mono' }}>
            <span>{formatAudioTime(currentTime)}</span>
            <span>{formatAudioTime(duration)}</span>
          </div>
        </div>
      </div>
      {transcriptionAvailable ? (
        <button
          style={{ ...actionButtonStyle, alignSelf: 'flex-start', fontSize: 12, padding: '6px 10px', height: 'auto' }}
          onClick={() => onTranscribe?.(mediaItem.id)}
          disabled={!!transcriptionLoading[mediaItem.id]}
        >
          <Icons.Wave /> {transcriptionLoading[mediaItem.id] ? 'Расшифровка…' : 'Расшифровать'}
        </button>
      ) : (
        <div style={{ fontSize: 12, color: '#A3A8B4' }}>
          Расшифровка временно недоступна
        </div>
      )}
      {transcriptions[mediaItem.id] && (
        <div style={{ fontSize: 12, lineHeight: 1.45, color: '#F0F2F6', background: 'rgba(0,0,0,0.18)', borderRadius: 8, padding: '8px 10px', whiteSpace: 'pre-wrap' }}>
          {transcriptions[mediaItem.id]}
        </div>
      )}
    </div>
  );
}
