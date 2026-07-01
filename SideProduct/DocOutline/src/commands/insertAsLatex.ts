import * as vscode from 'vscode';
import { formatSnippet, SnippetKind } from '../latex/formatters';
import { getLastActiveTexEditor, isLatexDocument } from '../state/activeEditorTracker';

// Falls back to any currently-open (even backgrounded/non-visible) .tex document if the
// activation-time tracker missed it — e.g. the extension only activates on first command use,
// so if focus wasn't on the .tex editor at that exact moment, the tracker never saw it.
async function resolveTexEditor(): Promise<vscode.TextEditor | undefined> {
  const tracked = getLastActiveTexEditor();
  if (tracked) {
    return tracked;
  }
  const openDoc = vscode.workspace.textDocuments.find((doc) => isLatexDocument(doc));
  if (openDoc) {
    return vscode.window.showTextDocument(openDoc, { preserveFocus: true, preview: false });
  }
  return undefined;
}

export async function insertSnippet(kind: SnippetKind, text: string): Promise<void> {
  const editor = await resolveTexEditor();
  if (!editor) {
    vscode.window.showWarningMessage('Doc Outline: open a .tex file first.');
    return;
  }

  const formatted = formatSnippet(kind, text);
  await editor.edit((editBuilder) => {
    editBuilder.insert(editor.selection.active, formatted);
  });

  await vscode.window.showTextDocument(editor.document, {
    viewColumn: editor.viewColumn,
    preserveFocus: true
  });
}
