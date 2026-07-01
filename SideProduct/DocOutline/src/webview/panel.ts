import * as vscode from 'vscode';
import { getCurrentDocument } from '../state/currentDocument';
import { getPdfDocument } from '../pdf/pdfDocumentCache';
import { extractHighlightsForPageRange } from '../pdf/highlights';
import { syncHighlights } from '../commands/syncHighlights';
import { insertSnippet } from '../commands/insertAsLatex';
import type { SnippetKind } from '../latex/formatters';

type WebviewMessage =
  | { type: 'sync' }
  | { type: 'setRange'; startPage: number; endPage: number }
  | { type: 'insertSnippet'; kind: SnippetKind; text: string };

let panel: vscode.WebviewPanel | undefined;

export function openPanel(): void {
  if (panel) {
    panel.reveal();
    sendState();
    return;
  }

  panel = vscode.window.createWebviewPanel('docOutline', 'Doc Outline', vscode.ViewColumn.Beside, {
    enableScripts: true,
    retainContextWhenHidden: true
  });

  panel.webview.html = getHtml();

  panel.onDidDispose(() => {
    panel = undefined;
  });

  panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
    if (message.type === 'sync') {
      await syncHighlights(() => sendState());
    } else if (message.type === 'setRange') {
      await sendHighlights(message.startPage, message.endPage);
    } else if (message.type === 'insertSnippet') {
      await insertSnippet(message.kind, message.text);
    }
  });

  sendState();
}

function sendState(): void {
  if (!panel) {
    return;
  }
  const doc = getCurrentDocument();
  panel.webview.postMessage({
    type: 'state',
    docName: doc?.name ?? null,
    outline: doc?.outline ?? []
  });
}

async function sendHighlights(startPage: number, endPage: number): Promise<void> {
  if (!panel) {
    return;
  }
  const doc = getCurrentDocument();
  if (!doc) {
    return;
  }
  const pdfDocument = await getPdfDocument(doc.sourcePdfPath);
  const highlights = await extractHighlightsForPageRange(pdfDocument, startPage, endPage);
  panel.webview.postMessage({ type: 'highlights', highlights });
}

function getHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<style>
  body { font-family: var(--vscode-font-family); padding: 8px; color: var(--vscode-foreground); }
  .row { margin-bottom: 10px; }
  input[type=number] { width: 60px; }
  button { margin-right: 4px; cursor: pointer; }
  .toc-btn { display: block; margin: 2px 0; text-align: left; }
  .highlight { border-left: 4px solid #888; padding: 4px 8px; margin-bottom: 6px; }
  .highlight .text { margin-bottom: 4px; }
  .swatch-yellow { border-color: #d4c000; }
  .swatch-green { border-color: #2ea043; }
  .swatch-blue { border-color: #1f8fd1; }
  .swatch-pink { border-color: #d63384; }
  .swatch-orange { border-color: #d9822b; }
  .swatch-red { border-color: #cc2936; }
  .swatch-purple { border-color: #8e44ad; }
</style>
</head>
<body>
  <div class="row">
    <strong id="docName">No document added yet</strong>
    <button id="syncBtn">Sync Highlights from Skim</button>
  </div>
  <div class="row" id="tocList"></div>
  <div class="row">
    Page range:
    <input type="number" id="startPage" min="1" value="1" />
    -
    <input type="number" id="endPage" min="1" value="1" />
    <button id="showBtn">Show Highlights</button>
  </div>
  <div id="highlightsList"></div>

  <script>
    const vscodeApi = acquireVsCodeApi();

    document.getElementById('syncBtn').addEventListener('click', () => {
      vscodeApi.postMessage({ type: 'sync' });
    });

    document.getElementById('showBtn').addEventListener('click', () => {
      const startPage = parseInt(document.getElementById('startPage').value, 10) || 1;
      const endPage = parseInt(document.getElementById('endPage').value, 10) || startPage;
      vscodeApi.postMessage({ type: 'setRange', startPage, endPage });
    });

    function flattenOutline(outline) {
      const flat = [];
      (function walk(nodes, depth) {
        for (const node of nodes) {
          flat.push({ node, depth });
          walk(node.children, depth + 1);
        }
      })(outline, 0);
      return flat;
    }

    function renderToc(outline) {
      const container = document.getElementById('tocList');
      container.innerHTML = '';
      for (const { node, depth } of flattenOutline(outline)) {
        const btn = document.createElement('button');
        btn.className = 'toc-btn';
        btn.style.marginLeft = (depth * 12) + 'px';
        btn.textContent = node.title + ' (p.' + node.startPage + '-' + (node.endPage ?? '?') + ')';
        btn.addEventListener('click', () => {
          const endPage = node.endPage ?? node.startPage;
          document.getElementById('startPage').value = node.startPage;
          document.getElementById('endPage').value = endPage;
          vscodeApi.postMessage({ type: 'setRange', startPage: node.startPage, endPage });
        });
        container.appendChild(btn);
      }
    }

    function renderHighlights(highlights) {
      const container = document.getElementById('highlightsList');
      container.innerHTML = '';
      if (highlights.length === 0) {
        container.textContent = 'No highlights in this range.';
        return;
      }
      for (const h of highlights) {
        const row = document.createElement('div');
        row.className = 'highlight swatch-' + h.paletteKey;

        const textDiv = document.createElement('div');
        textDiv.className = 'text';
        textDiv.textContent = h.text || ('(no text found, p.' + h.page + ')');
        row.appendChild(textDiv);

        const actions = document.createElement('div');
        for (const kind of ['title', 'section', 'paragraph', 'quote']) {
          const btn = document.createElement('button');
          btn.textContent = kind;
          btn.addEventListener('click', () => {
            vscodeApi.postMessage({ type: 'insertSnippet', kind: kind, text: h.text });
          });
          actions.appendChild(btn);
        }
        row.appendChild(actions);
        container.appendChild(row);
      }
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        document.getElementById('docName').textContent = message.docName || 'No document added yet';
        renderToc(message.outline || []);
      } else if (message.type === 'highlights') {
        renderHighlights(message.highlights);
      }
    });
  </script>
</body>
</html>`;
}
