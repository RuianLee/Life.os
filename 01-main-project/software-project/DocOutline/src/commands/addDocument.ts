import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { setCurrentDocument } from '../state/currentDocument';

function slugify(fileName: string): string {
  const base = fileName.toLowerCase().replace(/\.[^.]+$/, '');
  const slug = base.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return slug || 'document';
}

export async function addDocument(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showErrorMessage('Doc Outline: open a workspace folder first.');
    return;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: { 'PDF files': ['pdf'] },
    openLabel: 'Add PDF'
  });
  if (!picked || picked.length === 0) {
    return;
  }

  const sourcePath = picked[0].fsPath;
  const fileName = path.basename(sourcePath);
  const slug = slugify(fileName);
  const targetDir = path.join(folders[0].uri.fsPath, 'annotations', slug);
  const targetPath = path.join(targetDir, 'source.pdf');

  await fs.promises.mkdir(targetDir, { recursive: true });
  await fs.promises.copyFile(sourcePath, targetPath);

  setCurrentDocument({ id: slug, name: fileName, sourcePdfPath: targetPath, outline: null });

  exec(`open -a Skim "${targetPath}"`, (err) => {
    if (err) {
      vscode.window.showErrorMessage(`Doc Outline: failed to open Skim — ${err.message}`);
    }
  });

  vscode.window.showInformationMessage(
    `Doc Outline: added "${fileName}". Highlight it in Skim, then run "Doc Outline: Sync Highlights from Skim".`
  );
}
