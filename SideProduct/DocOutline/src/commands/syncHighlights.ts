import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { getCurrentDocument, setOutline } from '../state/currentDocument';
import { getPdfDocument, invalidatePdfDocument } from '../pdf/pdfDocumentCache';
import { getOutlineTree } from '../pdf/outline';

function execAsync(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(stderr || err.message));
      } else {
        resolve();
      }
    });
  });
}

// Skim's plain Cmd+S does NOT embed annotations into the PDF (they go to macOS xattrs).
// "PDF With Embedded Notes" is the export that actually writes /Highlight annotations
// pdf.js can read. Runs as a temp AppleScript file to avoid shell-escaping headaches.
async function exportEmbeddedNotes(pdfPath: string): Promise<void> {
  const script = [
    'tell application "Skim"',
    `  save document 1 in POSIX file "${pdfPath}" as "PDF With Embedded Notes"`,
    'end tell'
  ].join('\n');

  const tmpFile = path.join(os.tmpdir(), `doc-outline-sync-${Date.now()}.scpt`);
  await fs.promises.writeFile(tmpFile, script, 'utf8');
  try {
    await execAsync(`osascript "${tmpFile}"`);
  } finally {
    await fs.promises.unlink(tmpFile).catch(() => {});
  }
}

export async function syncHighlights(onDone?: () => void): Promise<void> {
  const doc = getCurrentDocument();
  if (!doc) {
    vscode.window.showWarningMessage('Doc Outline: add a document first.');
    return;
  }

  try {
    await exportEmbeddedNotes(doc.sourcePdfPath);
  } catch (err) {
    vscode.window.showErrorMessage(
      `Doc Outline: Skim sync failed — make sure the PDF is open in Skim. (${err instanceof Error ? err.message : String(err)})`
    );
    return;
  }

  invalidatePdfDocument(doc.sourcePdfPath);
  const pdfDocument = await getPdfDocument(doc.sourcePdfPath);
  const outline = await getOutlineTree(pdfDocument);
  setOutline(outline);

  vscode.window.showInformationMessage('Doc Outline: highlights synced.');
  onDone?.();
}
