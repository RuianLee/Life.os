export interface Highlight {
  id: string;
  page: number; // 1-based
  colorRgb: [number, number, number]; // 0-255
  paletteKey: string;
  text: string;
  quadPoints: number[];
}

export interface TocNode {
  title: string;
  startPage: number; // 1-based
  endPage: number | null;
  children: TocNode[];
}

export interface PageRange {
  startPage: number;
  endPage: number;
}

export type HighlightScope = { kind: 'toc'; node: TocNode } | { kind: 'range'; range: PageRange };

export interface TrackedDocument {
  id: string;
  name: string;
  sourcePdfPath: string;
  outline: TocNode[] | null;
  lastScope?: HighlightScope;
}

export interface TextItemLike {
  str: string;
  transform: number[];
  width: number;
  height: number;
}
