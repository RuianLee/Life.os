import * as vscode from 'vscode';
import * as fs from 'fs';

/**
 * Throwaway de-risking spike (plan step 2): confirms pdfjs-dist's legacy/Node build
 * loads inside the extension host and that getOutline/getAnnotations/getTextContent
 * return usable data, before anything else depends on it.
 */
export async function runPdfSpike(_context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel('Doc Outline: pdf.js Spike');
  output.show(true);

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'PDF files': ['pdf'] },
    openLabel: 'Select a sample PDF for the spike'
  });
  if (!picked || picked.length === 0) {
    output.appendLine('No PDF selected, aborting spike.');
    return;
  }
  const pdfPath = picked[0].fsPath;
  output.appendLine(`Loading: ${pdfPath}`);

  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');

    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdfDocument = await pdfjsLib.getDocument({ data }).promise;
    output.appendLine(`Loaded OK. numPages=${pdfDocument.numPages}`);

    const outline = await pdfDocument.getOutline();
    output.appendLine(`Outline entries: ${outline ? outline.length : 0}`);
    if (outline && outline.length > 0) {
      output.appendLine(JSON.stringify(outline.slice(0, 3), null, 2));
    }

    const page = await pdfDocument.getPage(1);

    const annotations = await page.getAnnotations();
    const highlights = annotations.filter((a: any) => a.subtype === 'Highlight');
    output.appendLine(`Page 1 annotations: ${annotations.length} (highlights: ${highlights.length})`);
    if (highlights.length > 0) {
      output.appendLine(JSON.stringify(highlights[0], null, 2));
    }

    const textContent = await page.getTextContent();
    output.appendLine(`Page 1 text items: ${textContent.items.length}`);
    if (textContent.items.length > 0) {
      output.appendLine(JSON.stringify(textContent.items.slice(0, 3), null, 2));
    }

    output.appendLine('Spike complete: pdf.js works in the extension host.');
  } catch (err) {
    output.appendLine(`Spike FAILED: ${err instanceof Error ? err.stack : String(err)}`);
    throw err;
  }
}
