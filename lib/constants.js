import WELCOME_GUIDE from './welcome.md?raw';

export const STORAGE_KEYS = {
  CONTENT: 'md-preview-content',
  THEME: 'md-preview-theme',
  EDITOR_WIDTH: 'md-preview-editor-width',
  EDITOR_COLLAPSED: 'md-preview-editor-collapsed',
  MOBILE_VIEW: 'md-preview-mobile-view',
  SCROLL_SYNC: 'md-preview-scroll-sync',
  LINT_ENABLED: 'md-preview-lint-enabled',
  BLOCK_REMOTE_IMAGES: 'md-preview-block-remote-images',
  OUTLINE_OPEN: 'md-preview-outline-open',
};

export const DEBOUNCE_DELAY = 300;
export const SCROLL_SYNC_DELAY = 50;
export const LINT_DEBOUNCE_DELAY = 500;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORTABLE_EXTENSIONS = ['.md', '.markdown', '.txt'];
export const MOBILE_BREAKPOINT = 768;
export const PRINT_IMAGE_TIMEOUT_MS = 10_000;
export const TOAST_DURATION_MS = 2500;
// Long enough to notice and reach an action button such as Undo.
export const TOAST_ACTION_DURATION_MS = 8000;
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

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
blockquote,
.markdown-alert {
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

export const DEFAULT_CONTENT = WELCOME_GUIDE;
