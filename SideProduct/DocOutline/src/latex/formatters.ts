export type SnippetKind = 'title' | 'section' | 'paragraph' | 'quote';

// MVP: escapes the common LaTeX special characters that show up in ordinary prose.
// Doesn't handle backslash/tilde/caret — rare in highlighted text, not worth the complexity yet.
function escapeLatex(text: string): string {
  return text.replace(/([&%$#_{}])/g, '\\$1');
}

export function formatSnippet(kind: SnippetKind, text: string): string {
  const escaped = escapeLatex(text.trim());
  switch (kind) {
    case 'title':
      // \title alone doesn't render anything until \maketitle is called — emit both so the
      // inserted snippet is immediately valid instead of silently-dangling metadata.
      return `\\title{${escaped}}\n\\maketitle\n`;
    case 'section':
      return `\\section{${escaped}}\n`;
    case 'paragraph':
      return `${escaped}\n\n`;
    case 'quote':
      return `\\begin{quote}\n${escaped}\n\\end{quote}\n`;
  }
}
