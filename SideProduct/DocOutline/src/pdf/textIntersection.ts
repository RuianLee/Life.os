import type { TextItemLike } from './types';

interface BBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

function quadToBBox(quad: number[]): BBox {
  const xs = [quad[0], quad[2], quad[4], quad[6]];
  const ys = [quad[1], quad[3], quad[5], quad[7]];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

function textItemToBBox(item: TextItemLike): BBox {
  // item.transform = [scaleX, skewY, skewX, scaleY, x, y]. We don't handle rotated text in v1.
  const x = item.transform[4];
  const y = item.transform[5];
  return { x0: x, y0: y, x1: x + item.width, y1: y + item.height };
}

function bboxesOverlap(a: BBox, b: BBox): boolean {
  return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

/**
 * MVP heuristic: for each quad in a highlight, include the full text of any text item
 * whose bounding box overlaps the quad at all (no sub-item clipping). This can pull in
 * a stray neighboring word when a highlight only partially covers a text run — acceptable
 * for a personal tool; can be refined later if it proves annoying in practice.
 */
export function extractHighlightText(quadPoints: number[], items: TextItemLike[]): string {
  const quadCount = Math.floor(quadPoints.length / 8);
  const parts: string[] = [];
  for (let q = 0; q < quadCount; q++) {
    const quadBBox = quadToBBox(quadPoints.slice(q * 8, q * 8 + 8));
    const lineParts: string[] = [];
    for (const item of items) {
      if (!item.str) continue;
      if (bboxesOverlap(textItemToBBox(item), quadBBox)) {
        lineParts.push(item.str);
      }
    }
    if (lineParts.length > 0) {
      parts.push(lineParts.join(' '));
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
