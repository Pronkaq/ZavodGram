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

const buildDenseLayout = (count: number, columns: number, ratio: string): LayoutPreset => {
  const rows = Math.ceil(count / columns);
  return {
    columns,
    rows,
    containerAspectRatio: ratio,
    tiles: Array.from({ length: count }, (_, idx) => ({
      index: idx,
      colStart: (idx % columns) + 1,
      colSpan: 1,
      rowStart: Math.floor(idx / columns) + 1,
      rowSpan: 1,
    })),
  };
};

// Layout presets (change here to rebalance collage composition).
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
    containerAspectRatio: '16 / 9',
    tiles: [
      { index: 0, colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 },
      { index: 1, colStart: 2, colSpan: 1, rowStart: 1, rowSpan: 1 },
    ],
  },
  3: {
    columns: 2,
    rows: 2,
    containerAspectRatio: '4 / 3',
    tiles: [
      { index: 0, colStart: 1, colSpan: 2, rowStart: 1, rowSpan: 1 },
      { index: 1, colStart: 1, colSpan: 1, rowStart: 2, rowSpan: 1 },
      { index: 2, colStart: 2, colSpan: 1, rowStart: 2, rowSpan: 1 },
    ],
  },
  4: {
    columns: 4,
    rows: 3,
    containerAspectRatio: '1 / 1',
    tiles: [
      { index: 0, colStart: 1, colSpan: 2, rowStart: 1, rowSpan: 2 },
      { index: 1, colStart: 3, colSpan: 2, rowStart: 1, rowSpan: 2 },
      { index: 2, colStart: 1, colSpan: 2, rowStart: 3, rowSpan: 1 },
      { index: 3, colStart: 3, colSpan: 2, rowStart: 3, rowSpan: 1 },
    ],
  },
  5: {
    columns: 6,
    rows: 4,
    containerAspectRatio: '6 / 5',
    tiles: [
      { index: 0, colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 2 },
      { index: 1, colStart: 4, colSpan: 3, rowStart: 1, rowSpan: 2 },
      { index: 2, colStart: 1, colSpan: 2, rowStart: 3, rowSpan: 2 },
      { index: 3, colStart: 3, colSpan: 2, rowStart: 3, rowSpan: 2 },
      { index: 4, colStart: 5, colSpan: 2, rowStart: 3, rowSpan: 2 },
    ],
  },
  6: {
    columns: 6,
    rows: 4,
    containerAspectRatio: '6 / 5',
    tiles: [
      { index: 0, colStart: 1, colSpan: 3, rowStart: 1, rowSpan: 2 },
      { index: 1, colStart: 4, colSpan: 3, rowStart: 1, rowSpan: 2 },
      { index: 2, colStart: 1, colSpan: 2, rowStart: 3, rowSpan: 2 },
      { index: 3, colStart: 3, colSpan: 2, rowStart: 3, rowSpan: 2 },
      { index: 4, colStart: 5, colSpan: 2, rowStart: 3, rowSpan: 1 },
      { index: 5, colStart: 5, colSpan: 2, rowStart: 4, rowSpan: 1 },
    ],
  },
};

export function getMediaGroupLayout(count: number): LayoutPreset {
  const safeCount = Math.min(Math.max(Math.floor(count || 1), 1), 10);
  if (PRESETS[safeCount]) return PRESETS[safeCount];
  if (safeCount <= 8) return buildDenseLayout(safeCount, 4, '1 / 1');
  return buildDenseLayout(safeCount, 5, '5 / 4');
}

