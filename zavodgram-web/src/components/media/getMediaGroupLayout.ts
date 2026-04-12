export type MediaItemType = 'image' | 'video';

export type MediaItem = {
  id: string;
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  type?: MediaItemType;
  previewUrl?: string;
};

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export type LayoutTile = {
  index: number;
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
};

export type LayoutPreset = {
  columns: number;
  rows: number;
  tiles: LayoutTile[];
  containerAspectRatio: string;
};

// Telegram-style layouts:
// 1 photo  → full width
// 2 photos → side by side
// 3 photos → one big top, two small bottom
// 4 photos → one big left, three stacked right (TG style)
// 5+ → top row big, bottom row fills
const PRESETS: Record<number, LayoutPreset> = {
  1: {
    columns: 1,
    rows: 1,
    containerAspectRatio: '4 / 3',
    tiles: [{ index: 0, colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 }],
  },
  2: {
    columns: 2,
    rows: 1,
    containerAspectRatio: '2 / 1',
    tiles: [
      { index: 0, colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 1, colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
    ],
  },
  3: {
    columns: 3,
    rows: 2,
    containerAspectRatio: '3 / 2',
    tiles: [
      { index: 0, colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 1 },
      { index: 1, colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 2, colStart: 2, colSpan: 2, rowStart: 2, rowSpan: 1 },
    ],
  },
  // TG-style: big left, 3 stacked right
  4: {
    columns: 3,
    rows: 3,
    containerAspectRatio: '4 / 3',
    tiles: [
      { index: 0, colStart: 1, colSpan: 2, rowStart: 1, rowSpan: 3 },
      { index: 1, colStart: 3, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 2, colStart: 3, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 3, colStart: 3, colSpan: 1, rowStart: 3, rowSpan: 1 },
    ],
  },
  5: {
    columns: 3,
    rows: 2,
    containerAspectRatio: '3 / 2',
    tiles: [
      { index: 0, colStart: 1, colSpan: 2, rowStart: 1, rowSpan: 1 },
      { index: 1, colStart: 3, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 2, colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 3, colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 4, colStart: 3, colSpan: 1, rowStart: 2, rowSpan: 1 },
    ],
  },
  6: {
    columns: 3,
    rows: 2,
    containerAspectRatio: '3 / 2',
    tiles: [
      { index: 0, colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 1, colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 2, colStart: 3, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 3, colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 4, colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 5, colStart: 3, colSpan: 1, rowStart: 2, rowSpan: 1 },
    ],
  },
  7: {
    columns: 4,
    rows: 2,
    containerAspectRatio: '2 / 1',
    tiles: [
      { index: 0, colStart: 1, colSpan: 2, rowStart: 1, rowSpan: 1 },
      { index: 1, colStart: 3, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 2, colStart: 4, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 3, colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 4, colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 5, colStart: 3, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 6, colStart: 4, colSpan: 1, rowStart: 2, rowSpan: 1 },
    ],
  },
  8: {
    columns: 4,
    rows: 2,
    containerAspectRatio: '2 / 1',
    tiles: [
      { index: 0, colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 1, colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 2, colStart: 3, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 3, colStart: 4, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 4, colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 5, colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 6, colStart: 3, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 7, colStart: 4, colSpan: 1, rowStart: 2, rowSpan: 1 },
    ],
  },
  9: {
    columns: 3,
    rows: 3,
    containerAspectRatio: '1 / 1',
    tiles: Array.from({ length: 9 }, (_, i) => ({
      index: i,
      colStart: (i % 3) + 1,
      colSpan: 1,
      rowStart: Math.floor(i / 3) + 1,
      rowSpan: 1,
    })),
  },
  10: {
    columns: 5,
    rows: 2,
    containerAspectRatio: '5 / 2',
    tiles: Array.from({ length: 10 }, (_, i) => ({
      index: i,
      colStart: (i % 5) + 1,
      colSpan: 1,
      rowStart: Math.floor(i / 5) + 1,
      rowSpan: 1,
    })),
  },
};

export function getMediaGroupLayout(count: number): LayoutPreset {
  const safeCount = Math.min(Math.max(Math.floor(count || 1), 1), 10);
  return PRESETS[safeCount] || PRESETS[1];
}
