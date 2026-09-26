export const STORAGE_KEYS = {
  CONTENT: 'md-preview-content',
  THEME: 'md-preview-theme',
  EDITOR_WIDTH: 'md-preview-editor-width',
  EDITOR_COLLAPSED: 'md-preview-editor-collapsed',
  MOBILE_VIEW: 'md-preview-mobile-view',
  SCROLL_SYNC: 'md-preview-scroll-sync',
  LINT_ENABLED: 'md-preview-lint-enabled',
};

export const DEBOUNCE_DELAY = 300;
export const SCROLL_SYNC_DELAY = 50;
export const LINT_DEBOUNCE_DELAY = 500;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORTABLE_EXTENSIONS = ['.md', '.markdown', '.txt'];
export const MOBILE_BREAKPOINT = 768;

export const MATH_PATTERN = /\$\$?[^\s$]/;
export const FENCED_CODE_LANG = /```[\w-]+/;

export const EXPORT_RESET_CSS = `
html, body {
  height: auto !important;
  min-height: 0 !important;
  max-height: none !important;
  overflow: visible !important;
}
body {
  margin: 0;
  padding: 0;
  background: var(--bg-primary);
}
.preview {
  flex: none !important;
  min-height: auto !important;
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
  padding: 2rem clamp(1.25rem, 4vw, 2.5rem);
}
.prose {
  max-width: min(78ch, 100%);
}
.mermaid-toolbar,
.preview-figure-toolbar,
.code-copy-btn {
  display: none !important;
}
`.trim();

export const EXPORT_PRINT_CSS = `
@page {
  margin: 16mm;
}
html,
body {
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
[data-theme='light'] html,
[data-theme='light'] body,
[data-theme='light'] .preview {
  background: #ffffff !important;
}
[data-theme='dark'] html,
[data-theme='dark'] body,
[data-theme='dark'] .preview {
  background: var(--bg-primary) !important;
}
.preview {
  padding: 0 !important;
}
.prose {
  max-width: none !important;
}
pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.table-wrap {
  overflow: visible !important;
}
pre,
.mermaid,
img,
tr,
blockquote {
  break-inside: avoid;
  page-break-inside: avoid;
}
h1,
h2,
h3,
h4,
h5,
h6 {
  break-after: avoid;
  page-break-after: avoid;
}
`.trim();

export const DEFAULT_CONTENT = `# Welcome to mdfor.dev ✨

Start typing your **markdown** in the editor, and watch it transform into beautiful formatted text in the preview — *instantly*.

## Features

- 📝 **Live Preview** — See your changes in real-time
- 🌓 **Dark & Light Modes** — Easy on your eyes
- 💾 **Auto-Save** — Your work is saved locally on this device
- 🔒 **100% Private** — Nothing leaves your browser
- 🔗 **Scroll Sync** — Click the link icon in the header to sync scrolling
- ⚠️ **Markdown Lint** — Toggle the warning icon to catch style issues
- ∑ **Math (KaTeX)** — Inline and block LaTeX equations
- 📊 **Mermaid Diagrams** — Flowcharts with copy/download as PNG
- 🖼️ **Images & Tables** — Rich content with syntax highlighting and copy buttons

## Try Some Markdown

### Code Blocks

\`\`\`javascript
const greeting = "Hello, Markdown!";
console.log(greeting);
\`\`\`

### Math

Inline math: $a^2 + b^2 = c^2$

Block equation:

$$
f(x) = \\int_{-\\infty}^{\\infty} \\hat{f}(\\xi)\\, e^{2 \\pi i \\xi x}\\, d\\xi
$$

### Mermaid Diagrams

\`\`\`mermaid
graph LR
    A[Write Markdown] --> B{Preview}
    B --> C[Dark Mode]
    B --> D[Light Mode]
    C --> E[Beautiful Output]
    D --> E
\`\`\`

### Images

![Sample landscape](https://placehold.co/800x320/e7dfd0/6b6256?text=mdfor.dev)

### Tables

| Feature        | Supported |
| -------------- | --------- |
| Bold / *italic* | ✅        |
| ~~Strikethrough~~ | ✅      |
| Task lists     | ✅        |

### Text Formatting

**Bold**, *italic*, ~~strikethrough~~, <mark>highlighted</mark>, \`inline code\`, and keyboard shortcuts like <kbd>Cmd</kbd> + <kbd>S</kbd>.

### Blockquotes

> "The best writing is rewriting."
> — E.B. White

### Lists

1. Ordered lists
2. Work great
3. Out of the box

- Unordered lists too
- [x] Task lists are supported
- [ ] Try checking this in preview

### Links

Check out the [Markdown Guide](https://www.markdownguide.org) to learn more.

---

**Happy writing!** 🚀
`;
