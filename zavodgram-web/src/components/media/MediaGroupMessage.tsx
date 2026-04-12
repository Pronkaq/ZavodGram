import { useMemo, useState } from 'react';
import styles from './MediaGroupMessage.module.css';
import { getMediaGroupLayout, type MediaItem, type MessageStatus } from './getMediaGroupLayout';

export type MediaGroupMessageProps = {
  items: MediaItem[];
  caption?: string;
  time?: string;
  status?: MessageStatus;
  isOutgoing?: boolean;
  onOpenImage?: (index: number) => void;
};

type MediaTileProps = {
  item: MediaItem;
  index: number;
  overflowCount?: number;
  onOpenImage?: (index: number) => void;
};

function MessageMeta({ time, status = 'sent', isOutgoing = false }: { time: string; status?: MessageStatus; isOutgoing?: boolean }) {
  const ticks = status === 'sending'
    ? '🕓'
    : status === 'sent'
      ? '✓'
      : '✓✓';

  return (
    <div className={`${styles.meta} ${isOutgoing ? styles.metaOutgoing : ''}`}>
      <span>{time}</span>
      <span className={status === 'read' ? styles.metaRead : ''}>{ticks}</span>
    </div>
  );
}

function MediaTile({ item, index, overflowCount = 0, onOpenImage }: MediaTileProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);
  const isVideo = item.type === 'video';

  return (
    <button type="button" className={`${styles.tile} ${isLoading ? styles.loading : ''}`} onClick={() => onOpenImage?.(index)}>
      {!isError ? (
        <>
          {isVideo ? (
            <video
              className={styles.media}
              src={item.previewUrl || item.url}
              preload="metadata"
              muted
              playsInline
              onLoadedData={() => setIsLoading(false)}
              onError={() => { setIsError(true); setIsLoading(false); }}
            />
          ) : (
            <img
              className={styles.media}
              src={item.previewUrl || item.url}
              alt={item.alt || `media-${index + 1}`}
              loading="lazy"
              decoding="async"
              onLoad={() => setIsLoading(false)}
              onError={() => { setIsError(true); setIsLoading(false); }}
            />
          )}
          {isLoading && <span className={styles.skeleton} />}
        </>
      ) : (
        <div className={styles.errorState}>Не удалось загрузить</div>
      )}

      {isVideo && !isError && <span className={styles.videoBadge}>VIDEO</span>}
      {overflowCount > 0 && <span className={styles.overflowOverlay}>+{overflowCount}</span>}
    </button>
  );
}

function MediaGrid({ items, onOpenImage }: { items: MediaItem[]; onOpenImage?: (index: number) => void }) {
  const visibleItems = items.slice(0, 10);
  const overflow = Math.max(0, items.length - visibleItems.length);
  const layout = useMemo(() => getMediaGroupLayout(visibleItems.length), [visibleItems.length]);

  return (
    <div
      className={styles.grid}
      style={{
        gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${layout.rows}, minmax(0, 1fr))`,
        aspectRatio: layout.containerAspectRatio,
      }}
    >
      {layout.tiles.map((tile) => {
        const item = visibleItems[tile.index];
        if (!item) return null;
        return (
          <div
            key={item.id}
            style={{
              gridColumn: `${tile.colStart} / span ${tile.colSpan}`,
              gridRow: `${tile.rowStart} / span ${tile.rowSpan}`,
            }}
          >
            <MediaTile
              item={item}
              index={tile.index}
              onOpenImage={onOpenImage}
              overflowCount={overflow > 0 && tile.index === visibleItems.length - 1 ? overflow : 0}
            />
          </div>
        );
      })}
    </div>
  );
}

export function MediaGroupMessage({ items, caption, time, status = 'sent', isOutgoing = false, onOpenImage }: MediaGroupMessageProps) {
  if (!items?.length) return null;

  return (
    <div className={styles.bubble}>
      <MediaGrid items={items} onOpenImage={onOpenImage} />
      {caption && <div className={styles.caption}>{caption}</div>}
      {time ? <MessageMeta time={time} status={status} isOutgoing={isOutgoing} /> : null}
    </div>
  );
}

export default MediaGroupMessage;
