import type { TocNode, TrackedDocument } from '../pdf/types';

// MVP: track a single document at a time, in-memory only (resets on VSCode reload).
let current: TrackedDocument | undefined;

export function getCurrentDocument(): TrackedDocument | undefined {
  return current;
}

export function setCurrentDocument(doc: TrackedDocument): void {
  current = doc;
}

export function setOutline(outline: TocNode[]): void {
  if (current) {
    current.outline = outline;
  }
}
