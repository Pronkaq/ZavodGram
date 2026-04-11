import MediaGroupMessage from './MediaGroupMessage';
import type { MediaItem } from './getMediaGroupLayout';

const demoItems: MediaItem[] = [
  { id: '1', url: '/demo/1.jpg', alt: 'photo 1', type: 'image' },
  { id: '2', url: '/demo/2.jpg', alt: 'photo 2', type: 'image' },
  { id: '3', url: '/demo/3.jpg', alt: 'photo 3', type: 'image' },
  { id: '4', url: '/demo/4.jpg', alt: 'photo 4', type: 'image' },
  { id: '5', url: '/demo/5.jpg', alt: 'photo 5', type: 'image' },
];

export function MediaGroupMessageExample() {
  return (
    <MediaGroupMessage
      items={demoItems}
      caption="Подпись к альбому: это единый bubble сообщения."
      time="13:24"
      status="read"
      isOutgoing
      onOpenImage={(index) => {
        // connect to your lightbox/viewer
        console.log('open media index', index);
      }}
    />
  );
}
