import * as vscode from 'vscode';

let lastActiveTexEditor: vscode.TextEditor | undefined;

export function isLatexDocument(document: vscode.TextDocument): boolean {
  return document.languageId === 'latex' || document.fileName.endsWith('.tex');
}

export function initActiveEditorTracker(context: vscode.ExtensionContext): void {
  const active = vscode.window.activeTextEditor;
  if (active && isLatexDocument(active.document)) {
    lastActiveTexEditor = active;
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor && isLatexDocument(editor.document)) {
        lastActiveTexEditor = editor;
      }
    })
  );
}

export function getLastActiveTexEditor(): vscode.TextEditor | undefined {
  if (lastActiveTexEditor && !lastActiveTexEditor.document.isClosed) {
    return lastActiveTexEditor;
  }
  const active = vscode.window.activeTextEditor;
  if (active && isLatexDocument(active.document)) {
    return active;
  }
  return undefined;
}
