import * as vscode from 'vscode';
import { runPdfSpike } from './pdf/spike';
import { addDocument } from './commands/addDocument';
import { syncHighlights } from './commands/syncHighlights';
import { initActiveEditorTracker } from './state/activeEditorTracker';
import { openPanel } from './webview/panel';

export function activate(context: vscode.ExtensionContext): void {
  initActiveEditorTracker(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('docOutline.addDocument', () => addDocument()),
    vscode.commands.registerCommand('docOutline.syncHighlights', () => syncHighlights()),
    vscode.commands.registerCommand('docOutline.openPanel', () => openPanel()),
    vscode.commands.registerCommand('docOutline.pdfSpike', () => runPdfSpike(context))
  );
}

export function deactivate(): void {}
