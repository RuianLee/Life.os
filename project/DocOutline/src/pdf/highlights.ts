import { extractHighlightText } from './textIntersection';
import { nearestColorKey } from './colorPalette';
import type { Highlight, TextItemLike } from './types';

interface PdfDocumentLike {
  getPage(pageNumber: number): Promise<PdfPageLike>;
}

interface PdfPageLike {
  getAnnotations(): Promise<RawAnnotation[]>;
  getTextContent(): Promise<{ items: TextItemLike[] }>;
}

interface RawAnnotation {
  subtype: string;
  quadPoints?: ArrayLike<number>;
  color?: ArrayLike<number>;
}

export async function extractHighlightsForPageRange(
  pdfDocument: PdfDocumentLike,
  startPage: number,
  endPage: number
): Promise<Highlight[]> {
  const highlights: Highlight[] = [];

  for (let pageNum = startPage; pageNum <= endPage; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const annotations = await page.getAnnotations();
    const highlightAnnots = annotations.filter((a) => a.subtype === 'Highlight' && a.quadPoints);
    if (highlightAnnots.length === 0) {
      continue;
    }

    const textContent = await page.getTextContent();

    for (const annot of highlightAnnots) {
      const quadPoints = Array.from(annot.quadPoints as ArrayLike<number>);
      const colorRgb = (annot.color ? Array.from(annot.color) : [255, 255, 0]) as [number, number, number];
      highlights.push({
        id: `${pageNum}-${quadPoints.map((n) => Math.round(n)).join('_')}`,
        page: pageNum,
        colorRgb,
        paletteKey: nearestColorKey(colorRgb),
        text: extractHighlightText(quadPoints, textContent.items),
        quadPoints
      });
    }
  }

  return highlights;
}
