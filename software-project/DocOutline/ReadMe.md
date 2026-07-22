# Doc Outline

VSCode extension that turns color-coded PDF highlights (annotated externally in **Skim**, the macOS PDF reader) into LaTeX content — grouped by highlight color, scoped to a TOC entry or page range, inserted into a `.tex` file with one click.

This is an MVP: single tracked document at a time, in-memory state only (resets on VSCode reload), manual sync trigger instead of a file watcher. See "Known limitations" below — these are deliberate simplifications, not bugs, until the core flow is proven useful.

## Workflow

1. **Doc Outline: Add Document** — pick a PDF. It's copied to `annotations/<slug>/source.pdf` in the current workspace and opened in Skim.
2. Highlight it in Skim, in whatever colors you like.
3. **Doc Outline: Sync Highlights from Skim** (also a button in the panel) — exports Skim's notes into the PDF and re-parses it. Required because Skim's normal Cmd+S does *not* write annotations into the PDF file itself (see below).
4. **Doc Outline: Open Panel** — shows the document's TOC (if it has one) and a page-range picker. Click a TOC entry, or type a page range, then "Show Highlights" to list the highlights in that scope, grouped by color.
5. Each highlight has 4 buttons — `title` / `section` / `paragraph` / `quote`. Clicking one inserts that highlight's text, formatted as the corresponding LaTeX construct, at the cursor of whichever `.tex` file you last had focused.

## Why Skim, and the annotation-embedding gotcha

Skim supports multi-color highlights and is scriptable, unlike Preview (one color, awkward to change) or Acrobat (commercial, opaque save behavior).

**Critical:** Skim stores highlights in macOS extended attributes by default — a plain save does **not** write them into the PDF's byte stream. `commands/syncHighlights.ts` works around this by running Skim's AppleScript `save document 1 ... as "PDF With Embedded Notes"`, which writes real `/Highlight` PDF annotations in place. Always use the Sync command (or panel button) after highlighting — a manual Cmd+S in Skim is not enough.

## LaTeX target file convention (for live preview in VSCode)

The `.tex` file you insert snippets into needs a real preamble — the extension only ever inserts fragments (`\section{...}`, `\begin{quote}...`, etc.) at your cursor, it never scaffolds a whole document. Highlighted text here is typically Chinese, so the established convention is:

```latex
\documentclass{article}
\usepackage{ctex}

\begin{document}

% snippets inserted by Doc Outline go here

\end{document}
```

`ctex` + the **xelatex** engine is what handles CJK text correctly. To get "edit and see the rendered PDF update live" in VSCode:

1. Install a LaTeX distribution if you don't have one — `brew install --cask mactex` (full, ~5GB, includes every package) or `brew install --cask basictex` (minimal, then `sudo tlmgr install ctex xecjk` for the CJK packages).
2. Install the **LaTeX Workshop** VSCode extension (`James-Yu.latex-workshop`).
3. In the workspace containing your `.tex` file, add `.vscode/settings.json`:
   ```json
   {
     "latex-workshop.latex.tools": [
       { "name": "xelatex", "command": "xelatex", "args": ["-synctex=1", "-interaction=nonstopmode", "-file-line-error", "%DOC%"] }
     ],
     "latex-workshop.latex.recipes": [
       { "name": "xelatex", "tools": ["xelatex"] }
     ],
     "latex-workshop.latex.autoBuild.run": "onSave",
     "latex-workshop.view.pdf.viewer": "tab"
   }
   ```
4. Save the `.tex` file — LaTeX Workshop builds automatically and the PDF preview tab (opened via its "View LaTeX PDF" command, or the preview icon in the editor toolbar) refreshes in place.

This is also why `latex/formatters.ts`'s `title` case emits both `\title{...}` and `\maketitle` together — `\title` alone is silently-dangling metadata until something calls `\maketitle`, which would otherwise sit unrendered in the inserted fragment.

## Architecture

```
src/
  extension.ts                activate(): registers commands, starts the active-editor tracker
  commands/
    addDocument.ts            file picker -> copy to annotations/<slug>/source.pdf -> open in Skim
    syncHighlights.ts         runs the Skim AppleScript export, then re-parses and refreshes outline
    insertAsLatex.ts          formats + inserts a highlight's text into the last-focused .tex editor
  pdf/
    pdfDocumentCache.ts       loads pdfjs-dist (ESM, dynamic import) and caches one PDFDocumentProxy per path
    outline.ts                PDF outline/bookmarks -> TocNode tree with resolved start/end page ranges
    highlights.ts             per-page: reads Highlight annotations + text content, builds Highlight[]
    textIntersection.ts       geometry: which text items overlap a highlight's quadPoints
    colorPalette.ts           nearest-match of an annotation's RGB color to a fixed palette key
    types.ts                  shared Highlight / TocNode / TrackedDocument types
  state/
    currentDocument.ts        the single tracked document (MVP: no multi-doc list, no persistence)
    activeEditorTracker.ts    remembers the last-focused .tex editor (webview clicks steal focus)
  webview/
    panel.ts                  the panel UI (inline HTML/CSS/JS) + extension<->webview message handling
  latex/
    formatters.ts             title/section/paragraph/quote formatting + special-char escaping
```

### Data flow

`Add Document` → `annotations/<slug>/source.pdf` (tracked in `state/currentDocument.ts`) → user highlights in Skim → `Sync Highlights` runs the AppleScript export and calls `pdf/outline.ts` to refresh the TOC → user picks a TOC node or page range in the webview → `pdf/highlights.ts` parses just that page range (annotations + text content, intersected geometrically, colored via `colorPalette.ts`) → webview renders them grouped by color → clicking a format button calls `commands/insertAsLatex.ts`, which formats the text (`latex/formatters.ts`) and inserts it into the tracked `.tex` editor (`state/activeEditorTracker.ts`).

### How highlight text is extracted

`page.getAnnotations()` gives you a highlight's bounding box (`quadPoints`) and color, but never the underlying text — pdf.js doesn't support that directly. `pdf/textIntersection.ts` cross-references each highlight's quad against `page.getTextContent()` items by bounding-box overlap and concatenates the text of every overlapping item. This is whole-item inclusion, not character-precise clipping — if a highlight only covers part of a text run, the whole run's text comes along. Acceptable for a personal tool; flagged as a known limitation below.

## Known limitations (deliberate MVP cuts)

- **Single document at a time.** No list/picker for multiple tracked PDFs — adding a new one replaces the current one in memory.
- **No persistence.** Reloading VSCode forgets the tracked document and its outline; re-run Add Document (the PDF file itself is untouched on disk).
- **No file watcher.** Sync is manual (button/command) rather than automatic on save — simpler and also avoids a watcher/AppleScript-save race.
- **Text extraction is whole-item, not character-precise.** A highlight that covers only part of a text run pulls in the whole run.
- **Color palette is a fixed guess**, not calibrated against real Skim swatches yet.
- **macOS + Skim only.** `open -a Skim` / `osascript` are hardcoded.

## Running it

1. `npm install`
2. Press `F5` in VSCode (with this folder open) to launch the Extension Development Host — this runs the `watch` build task automatically.
3. In the new window, open a workspace folder, then run **Doc Outline: Add Document**.

There's also a **Doc Outline: Run pdf.js Spike (debug)** command (`src/pdf/spike.ts`) that loads a PDF you pick and dumps its outline/annotations/text content to an output channel — useful for poking at a real PDF's structure without going through the full UI.
