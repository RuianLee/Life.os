import * as fs from 'fs';
import * as path from 'path';
import { pathToFileURL } from 'url';

// Using `any` here deliberately: pdfjs-dist's legacy/build/pdf.mjs is ESM-only and typing
// it precisely from this CommonJS file fights TS's resolution-mode rules for no real benefit —
// callers (outline.ts, highlights.ts) declare their own minimal structural types for what they use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PdfjsModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PDFDocumentProxy = any;

let pdfjsLibPromise: Promise<PdfjsModule> | undefined;

async function getPdfjsLib(): Promise<PdfjsModule> {
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = importPdfjsWithElectronWorkaround();
  }
  return pdfjsLibPromise;
}

// pdf.js decides it's "not really Node" whenever process.versions.electron is set and
// process.type isn't "browser" — true for VSCode's extension host, which runs as an Electron
// utility process. That misdetection makes it take a browser code path that references the
// DOM `document` global, crashing with "document is not defined". The check is a top-level
// const computed once when pdf.mjs first evaluates, so we hide process.versions.electron only
// for that one import and restore it right after.
async function importPdfjsWithElectronWorkaround(): Promise<PdfjsModule> {
  const versions = process.versions as Record<string, string | undefined>;
  const electronVersion = versions.electron;
  delete versions.electron;
  try {
    const lib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    lib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    return lib;
  } finally {
    if (electronVersion !== undefined) {
      versions.electron = electronVersion;
    }
  }
}

function pdfjsDistAssetUrl(subdir: string): string {
  const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
  return pathToFileURL(path.join(pkgDir, subdir) + path.sep).toString();
}

// MVP: one cached PDFDocumentProxy per tracked PDF path, no per-range result caching.
// Re-parsing a selected page range on every scope change is cheap enough at personal-PDF scale.
const documentCache = new Map<string, PDFDocumentProxy>();

export async function getPdfDocument(filePath: string): Promise<PDFDocumentProxy> {
  const existing = documentCache.get(filePath);
  if (existing) {
    return existing;
  }
  const pdfjsLib = await getPdfjsLib();
  const data = new Uint8Array(fs.readFileSync(filePath));
  const pdfDocument = await pdfjsLib.getDocument({
    data,
    standardFontDataUrl: pdfjsDistAssetUrl('standard_fonts'),
    cMapUrl: pdfjsDistAssetUrl('cmaps'),
    cMapPacked: true
  }).promise;
  documentCache.set(filePath, pdfDocument);
  return pdfDocument;
}

export function invalidatePdfDocument(filePath: string): void {
  const existing = documentCache.get(filePath);
  if (existing) {
    void existing.destroy();
    documentCache.delete(filePath);
  }
}
