import type { TocNode } from './types';

interface PdfDocumentLike {
  numPages: number;
  getOutline(): Promise<RawOutlineItem[] | null>;
  getDestination(name: string): Promise<unknown[] | null>;
  getPageIndex(ref: unknown): Promise<number>;
}

interface RawOutlineItem {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineItem[];
}

interface FlatNode {
  node: TocNode;
  depth: number;
}

export async function getOutlineTree(pdfDocument: PdfDocumentLike): Promise<TocNode[]> {
  const raw = await pdfDocument.getOutline();
  if (!raw || raw.length === 0) {
    return [];
  }
  const nodes = await resolveNodes(pdfDocument, raw);
  assignEndPages(nodes, pdfDocument.numPages);
  return nodes;
}

async function resolveNodes(pdfDocument: PdfDocumentLike, items: RawOutlineItem[]): Promise<TocNode[]> {
  const nodes: TocNode[] = [];
  for (const item of items) {
    const startPage = (await resolvePageNumber(pdfDocument, item.dest)) ?? 1;
    const children = item.items.length > 0 ? await resolveNodes(pdfDocument, item.items) : [];
    nodes.push({ title: item.title, startPage, endPage: null, children });
  }
  return nodes;
}

async function resolvePageNumber(pdfDocument: PdfDocumentLike, dest: string | unknown[] | null): Promise<number | null> {
  if (!dest) {
    return null;
  }
  const explicitDest = typeof dest === 'string' ? await pdfDocument.getDestination(dest) : dest;
  if (!explicitDest || explicitDest.length === 0) {
    return null;
  }
  try {
    const pageIndex = await pdfDocument.getPageIndex(explicitDest[0]);
    return pageIndex + 1;
  } catch {
    return null;
  }
}

// A node's endPage is the start page of the next entry at the same-or-shallower depth
// (i.e. skip over its own children), minus 1. Last node in the document gets numPages.
function assignEndPages(nodes: TocNode[], numPages: number): void {
  const flat: FlatNode[] = [];
  flatten(nodes, 0, flat);
  for (let i = 0; i < flat.length; i++) {
    const { node, depth } = flat[i];
    let endPage = numPages;
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[j].depth <= depth) {
        endPage = Math.max(node.startPage, flat[j].node.startPage - 1);
        break;
      }
    }
    node.endPage = endPage;
  }
}

function flatten(nodes: TocNode[], depth: number, out: FlatNode[]): void {
  for (const node of nodes) {
    out.push({ node, depth });
    flatten(node.children, depth + 1, out);
  }
}
