/**
 * MD Preview — Application Logic
 * Instant live markdown preview with local auto-save and theme switching
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  // Constants & Configuration
  // ═══════════════════════════════════════════════════════════════
  const STORAGE_KEYS = {
    CONTENT: 'md-preview-content',
    THEME: 'md-preview-theme',
    EDITOR_WIDTH: 'md-preview-editor-width',
    EDITOR_COLLAPSED: 'md-preview-editor-collapsed',
    MOBILE_VIEW: 'md-preview-mobile-view',
    SCROLL_SYNC: 'md-preview-scroll-sync',
    LINT_ENABLED: 'md-preview-lint-enabled',
  };

  const DEBOUNCE_DELAY = 300; // ms for auto-save debounce
  const SCROLL_SYNC_DELAY = 50; // ms for scroll sync debounce
  const LINT_DEBOUNCE_DELAY = 500; // ms for lint debounce (performance)

  // Scroll sync state
  let isScrollingEditor = false;
  let isScrollingPreview = false;
  let scrollSyncTimeout = null;
  let scrollSyncEnabled = false;

  // Lint state
  let lintEnabled = false;
  let currentLintWarnings = [];

  // Prevent browser from trying to restore scroll positions on refresh
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  const DEFAULT_CONTENT = `# Welcome to mdfor.work ✨

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

![Sample landscape](https://placehold.co/800x320/e7dfd0/6b6256?text=mdfor.work)

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

  // ═══════════════════════════════════════════════════════════════
  // DOM Elements
  // ═══════════════════════════════════════════════════════════════
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const themeToggle = document.getElementById('themeToggle');
  const editorPane = document.getElementById('editorPane');
  const previewPane = document.getElementById('previewPane');
  const collapseBtn = document.getElementById('collapseEditor');
  const resizeHandle = document.getElementById('resizeHandle');
  const mobileViewSwitcher = document.getElementById('mobileViewSwitcher');
  const viewTabs = mobileViewSwitcher ? mobileViewSwitcher.querySelectorAll('.view-tab') : [];
  const scrollSyncToggle = document.getElementById('scrollSyncToggle');
  const lintToggle = document.getElementById('lintToggle');
  const lintCount = document.getElementById('lintCount');
  const lintPanel = document.getElementById('lintPanel');
  const lintList = document.getElementById('lintList');
  const lineGutter = document.getElementById('lineGutter');
  const exportBtn = document.getElementById('exportBtn');
  const exportDialog = document.getElementById('exportDialog');
  const exportFilenameInput = document.getElementById('exportFilename');
  const exportThemeSelect = document.getElementById('exportTheme');
  const exportEmbedImages = document.getElementById('exportEmbedImages');
  const exportCancelBtn = document.getElementById('exportCancelBtn');
  const exportDownloadBtn = document.getElementById('exportDownloadBtn');
  const html = document.documentElement;

  // Export URLs
  const HLJS_LIGHT_URL =
    'https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github.min.css';
  const HLJS_DARK_URL =
    'https://cdn.jsdelivr.net/npm/highlight.js@11/styles/github-dark.min.css';
  const KATEX_CSS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.css';
  const GOOGLE_FONTS_URL =
    'https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap';
  const HLJS_JS_URL =
    'https://cdn.jsdelivr.net/gh/highlightjs/cdn-release@11/build/highlight.min.js';
  const KATEX_JS_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.22/dist/katex.min.js';
  const MARKED_KATEX_JS_URL =
    'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.10/lib/index.umd.js';
  const MERMAID_JS_URL = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js';
  const MATH_PATTERN = /\$\$?[^\s$]/;
  const FENCED_CODE_LANG = /```[\w-]+/;

  const EXPORT_RESET_CSS = `
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
.code-copy-btn {
  display: none !important;
}
`.trim();

  // Mobile breakpoint
  const MOBILE_BREAKPOINT = 768;

  // ═══════════════════════════════════════════════════════════════
  // Utility Functions
  // ═══════════════════════════════════════════════════════════════

  /**
   * Debounce function to limit how often a function is called
   */
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Escape HTML for safe insertion into the DOM
   */
  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Throttle function to limit how often a function is called
   */
  function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
      if (!inThrottle) {
        func(...args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  }

  // ═══════════════════════════════════════════════════════════════
  // Lazy asset loading
  // ═══════════════════════════════════════════════════════════════

  const assetCache = new Map();
  let katexConfigured = false;
  let katexLoading = null;
  let hljsLoading = null;
  let mermaidLoading = null;

  function loadScript(src) {
    if (assetCache.has(src)) return assetCache.get(src);
    const p = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(s);
    });
    assetCache.set(src, p);
    return p;
  }

  function loadStyle(href, id, { disabled = false } = {}) {
    const key = id || href;
    if (assetCache.has(key)) return assetCache.get(key);
    if (id && document.getElementById(id)) return Promise.resolve();

    const p = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      if (id) link.id = id;
      if (disabled) link.disabled = true;
      link.onload = () => resolve();
      link.onerror = () => reject(new Error(`Failed to load stylesheet: ${href}`));
      document.head.appendChild(link);
    });
    assetCache.set(key, p);
    return p;
  }

  function scheduleAssetRerender() {
    schedulePreviewUpdate();
  }

  function syncHljsThemeStyles() {
    const hljsLight = document.getElementById('hljs-theme-light');
    const hljsDark = document.getElementById('hljs-theme-dark');
    if (!hljsLight || !hljsDark) return;

    const isDark = html.getAttribute('data-theme') === 'dark';
    hljsLight.disabled = isDark;
    hljsDark.disabled = !isDark;
  }

  function ensureKatex() {
    if (katexConfigured) return Promise.resolve();
    if (katexLoading) return katexLoading;

    katexLoading = (async () => {
      await loadStyle(KATEX_CSS_URL, 'katex-css');
      await loadScript(KATEX_JS_URL);
      await loadScript(MARKED_KATEX_JS_URL);
      if (typeof katex !== 'undefined' && typeof markedKatex !== 'undefined') {
        marked.use(
          markedKatex({
            throwOnError: false,
            nonStandard: true,
          })
        );
        katexConfigured = true;
        scheduleAssetRerender();
      }
    })().catch((err) => {
      console.warn('KaTeX load failed:', err);
      katexLoading = null;
    });

    return katexLoading;
  }

  function ensureHljs() {
    if (typeof hljs !== 'undefined') return Promise.resolve();
    if (hljsLoading) return hljsLoading;

    hljsLoading = (async () => {
      await Promise.all([
        loadStyle(HLJS_LIGHT_URL, 'hljs-theme-light'),
        loadStyle(HLJS_DARK_URL, 'hljs-theme-dark', { disabled: true }),
        loadScript(HLJS_JS_URL),
      ]);
      syncHljsThemeStyles();
      scheduleAssetRerender();
    })().catch((err) => {
      console.warn('Highlight.js load failed:', err);
      hljsLoading = null;
    });

    return hljsLoading;
  }

  function ensureMermaid() {
    if (typeof mermaid !== 'undefined') return Promise.resolve();
    if (mermaidLoading) return mermaidLoading;

    mermaidLoading = loadScript(MERMAID_JS_URL)
      .then(() => {
        initMermaid();
      })
      .catch((err) => {
        console.warn('Mermaid load failed:', err);
        mermaidLoading = null;
      });

    return mermaidLoading;
  }

  // ═══════════════════════════════════════════════════════════════
  // Scroll Sync Functions
  // ═══════════════════════════════════════════════════════════════

  /**
   * Smart proportional scroll sync.
   *
   * The key insight: We can't match line-to-line because editor lines != preview pixels.
   * Instead, we use a hybrid approach:
   * 1. Calculate scroll percentage (0 to 1) in the source
   * 2. Apply the same percentage to the target, ensuring top->top and bottom->bottom
   *
   * This naturally handles:
   * - Images (1 line in editor = many pixels in preview)
   * - Code blocks with wrapping
   * - Any content with different height ratios
   */

  /**
   * Calculate scroll percentage (0 to 1) for an element
   * 0 = at top, 1 = at bottom
   */
  function getScrollPercentage(element) {
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight - element.clientHeight;
    if (scrollHeight <= 0) return 0;
    return Math.min(1, Math.max(0, scrollTop / scrollHeight));
  }

  /**
   * Set scroll position by percentage (0 to 1)
   */
  function setScrollByPercentage(element, percentage) {
    const scrollHeight = element.scrollHeight - element.clientHeight;
    if (scrollHeight <= 0) return;
    element.scrollTop = percentage * scrollHeight;
  }

  /**
   * Sync scroll from editor to preview using proportional scrolling
   */
  function syncEditorToPreview() {
    if (!scrollSyncEnabled || isScrollingPreview) return;

    const editorScrollHeight = editor.scrollHeight - editor.clientHeight;
    const previewScrollHeight = preview.scrollHeight - preview.clientHeight;

    // No scrollable content
    if (editorScrollHeight <= 0 || previewScrollHeight <= 0) return;

    // Get scroll percentage from editor
    const scrollPercent = getScrollPercentage(editor);

    // Apply to preview
    isScrollingEditor = true;
    setScrollByPercentage(preview, scrollPercent);

    clearTimeout(scrollSyncTimeout);
    scrollSyncTimeout = setTimeout(() => {
      isScrollingEditor = false;
    }, SCROLL_SYNC_DELAY);
  }

  /**
   * Sync scroll from preview to editor using proportional scrolling
   */
  function syncPreviewToEditor() {
    if (!scrollSyncEnabled || isScrollingEditor) return;

    const editorScrollHeight = editor.scrollHeight - editor.clientHeight;
    const previewScrollHeight = preview.scrollHeight - preview.clientHeight;

    // No scrollable content
    if (editorScrollHeight <= 0 || previewScrollHeight <= 0) return;

    // Get scroll percentage from preview
    const scrollPercent = getScrollPercentage(preview);

    // Apply to editor
    isScrollingPreview = true;
    setScrollByPercentage(editor, scrollPercent);

    clearTimeout(scrollSyncTimeout);
    scrollSyncTimeout = setTimeout(() => {
      isScrollingPreview = false;
    }, SCROLL_SYNC_DELAY);
  }

  // Throttled scroll sync functions
  const throttledSyncEditorToPreview = throttle(syncEditorToPreview, SCROLL_SYNC_DELAY);
  const throttledSyncPreviewToEditor = throttle(syncPreviewToEditor, SCROLL_SYNC_DELAY);

  /**
   * Safely get item from localStorage
   */
  function getStorageItem(key) {
    try {
      return localStorage.getItem(key);
    } catch (e) {
      console.warn('localStorage not available:', e);
      return null;
    }
  }

  /**
   * Safely set item in localStorage
   */
  function setStorageItem(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage not available:', e);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Markdown Parsing & Preview
  // ═══════════════════════════════════════════════════════════════

  // Counter for unique mermaid diagram IDs
  let mermaidCounter = 0;
  let previewRafId = null;
  const PNG_SCALE = 3;
  let toastTimeout = null;

  const PURIFY_CONFIG = {
    ADD_TAGS: ['mark', 'kbd', 'input'],
  };

  /**
   * Sanitize parsed HTML before inserting into the preview DOM
   */
  function sanitizePreviewHtml(rawHtml) {
    if (typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
    }
    return rawHtml;
  }

  /**
   * Batch preview updates to one parse per animation frame
   */
  function schedulePreviewUpdate() {
    if (previewRafId !== null) {
      return;
    }
    previewRafId = requestAnimationFrame(() => {
      previewRafId = null;
      updatePreview();
    });
  }

  /**
   * Configure marked.js with extensions for GFM, Mermaid, and syntax highlighting
   */
  function configureMarked() {
    if (typeof marked === 'undefined') {
      return;
    }

    marked.use({
      breaks: true,
      gfm: true,
      extensions: [
        {
          name: 'mermaidBlock',
          level: 'block',
          start(src) {
            const match = src.match(/```mermaid/);
            return match ? match.index : undefined;
          },
          tokenizer(src) {
            const match = /^```mermaid[^\n]*\n([\s\S]*?)\n```/.exec(src);
            if (match) {
              return {
                type: 'mermaidBlock',
                raw: match[0],
                text: match[1].trim(),
              };
            }
          },
          renderer(token) {
            const id = `mermaid-${mermaidCounter++}`;
            return `<div class="mermaid" id="${id}">${escapeHtml(token.text)}</div>`;
          },
        },
      ],
      renderer: {
        image({ href, title, text }) {
          if (!href) {
            return text ? escapeHtml(text) : '';
          }
          const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
          return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text || '')}"${titleAttr} loading="lazy" decoding="async">`;
        },
      },
    });

    const highlightModule = globalThis.markedHighlight;
    if (highlightModule) {
      marked.use(
        highlightModule.markedHighlight({
          emptyLangClass: 'hljs',
          langPrefix: 'hljs language-',
          highlight(code, lang) {
            if (lang === 'mermaid') {
              return escapeHtml(code);
            }
            if (typeof hljs === 'undefined') {
              ensureHljs();
              return escapeHtml(code);
            }
            if (lang && hljs.getLanguage(lang)) {
              try {
                return hljs.highlight(code, { language: lang }).value;
              } catch (e) {
                console.warn('Highlight.js error:', e);
              }
            }
            return escapeHtml(code);
          },
        })
      );
    }
  }

  /**
   * Initialize mermaid with theme based on current theme
   */
  function initMermaid() {
    if (typeof mermaid !== 'undefined') {
      const isDark = html.getAttribute('data-theme') === 'dark';
      mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily:
          '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        htmlLabels: false,
        flowchart: {
          htmlLabels: false,
          useMaxWidth: true,
        },
      });
    }
  }

  /**
   * Stash mermaid source on each diagram node before first render
   */
  function stashMermaidSource(diagramEl) {
    if (!diagramEl.dataset.mermaidSource) {
      diagramEl.dataset.mermaidSource = diagramEl.textContent.trim();
    }
  }

  /**
   * Reset mermaid diagrams so they can be re-rendered (e.g. theme change)
   */
  function prepareMermaidForRerender() {
    preview.querySelectorAll('.mermaid').forEach((el) => {
      if (!el.dataset.mermaidSource) return;
      el.textContent = el.dataset.mermaidSource;
      el.classList.remove('mermaid-rendered', 'mermaid-error-container', 'mermaid-has-toolbar');
      const toolbar = el.querySelector('.mermaid-toolbar');
      if (toolbar) toolbar.remove();
    });
  }

  /**
   * Show a brief toast notification
   */
  function showToast(message) {
    let toast = document.getElementById('mdToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mdToast';
      toast.className = 'md-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('visible'), 2500);
  }

  /**
   * Convert a rendered mermaid SVG to a high-res PNG blob
   */
  async function mermaidSvgToPngBlob(diagramEl) {
    const svg = diagramEl.querySelector('svg');
    if (!svg) throw new Error('No diagram rendered');

    const cloned = svg.cloneNode(true);
    cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

    const viewBox = svg.viewBox?.baseVal;
    let width =
      viewBox?.width || parseFloat(svg.getAttribute('width')) || svg.clientWidth || 0;
    let height =
      viewBox?.height || parseFloat(svg.getAttribute('height')) || svg.clientHeight || 0;

    if (!width || !height) {
      const bbox = svg.getBBox();
      width = bbox.width || 800;
      height = bbox.height || 600;
    }

    cloned.setAttribute('width', String(width));
    cloned.setAttribute('height', String(height));
    if (!cloned.getAttribute('viewBox')) {
      cloned.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }

    const svgString = new XMLSerializer().serializeToString(cloned);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Failed to load SVG'));
      img.src = svgUrl;
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * PNG_SCALE);
    canvas.height = Math.ceil(height * PNG_SCALE);
    const ctx = canvas.getContext('2d');
    const isDark = html.getAttribute('data-theme') === 'dark';
    ctx.fillStyle = isDark ? '#221e18' : '#fffdf8';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(PNG_SCALE, PNG_SCALE);
    ctx.drawImage(img, 0, 0, width, height);

    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to create PNG'));
      }, 'image/png');
    });
  }

  /**
   * Copy or download a mermaid diagram as PNG
   */
  async function exportMermaidPng(diagramEl, mode) {
    try {
      const blob = await mermaidSvgToPngBlob(diagramEl);
      const id = diagramEl.id || 'diagram';

      if (mode === 'download') {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${id}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Downloaded PNG');
        return;
      }

      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('Copied PNG');
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${id}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        showToast('Clipboard unavailable — downloaded instead');
      }
    } catch (err) {
      console.warn('Mermaid PNG export failed:', err);
      showToast('Export failed');
    }
  }

  /**
   * Attach copy/download toolbar to a rendered mermaid diagram
   */
  function attachMermaidToolbar(diagramEl) {
    if (diagramEl.querySelector('.mermaid-toolbar')) return;
    if (!diagramEl.querySelector('svg')) return;

    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Diagram export');

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = 'mermaid-btn';
    copyBtn.textContent = 'Copy PNG';
    copyBtn.setAttribute('aria-label', 'Copy diagram as PNG');
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMermaidPng(diagramEl, 'copy');
    });

    const downloadBtn = document.createElement('button');
    downloadBtn.type = 'button';
    downloadBtn.className = 'mermaid-btn';
    downloadBtn.textContent = 'Download PNG';
    downloadBtn.setAttribute('aria-label', 'Download diagram as PNG');
    downloadBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMermaidPng(diagramEl, 'download');
    });

    toolbar.append(copyBtn, downloadBtn);
    diagramEl.classList.add('mermaid-has-toolbar');
    diagramEl.appendChild(toolbar);
  }

  /**
   * Mark a diagram as failed and show an error message
   */
  function showMermaidError(diagram, renderError) {
    const msg = renderError?.message || 'Invalid diagram';
    diagram.innerHTML = `<div class="mermaid-error">Mermaid syntax error: ${escapeHtml(msg)}</div>`;
    diagram.classList.add('mermaid-rendered', 'mermaid-error-container');
  }

  /**
   * Render a single mermaid diagram with fallback error handling
   */
  async function renderSingleMermaidDiagram(diagram) {
    stashMermaidSource(diagram);
    const id = diagram.id || `mermaid-fallback-${mermaidCounter++}`;
    const code = diagram.dataset.mermaidSource;

    try {
      const { svg } = await mermaid.render(`${id}-svg`, code);
      diagram.innerHTML = svg;
      diagram.classList.add('mermaid-rendered');
      attachMermaidToolbar(diagram);
    } catch (renderError) {
      showMermaidError(diagram, renderError);
    }
  }

  /**
   * Render mermaid diagrams in the preview
   */
  async function renderMermaidDiagrams() {
    const diagrams = preview.querySelectorAll('.mermaid:not(.mermaid-rendered)');
    if (diagrams.length === 0) return;

    await ensureMermaid();
    if (typeof mermaid === 'undefined') return;

    diagrams.forEach(stashMermaidSource);

    initMermaid();

    try {
      await mermaid.run({
        nodes: diagrams,
        suppressErrors: true,
      });
      for (const d of diagrams) {
        if (d.querySelector('svg')) {
          d.classList.add('mermaid-rendered');
          attachMermaidToolbar(d);
        } else if (!d.classList.contains('mermaid-rendered')) {
          await renderSingleMermaidDiagram(d);
        }
      }
    } catch (_e) {
      for (const diagram of diagrams) {
        if (!diagram.classList.contains('mermaid-rendered')) {
          await renderSingleMermaidDiagram(diagram);
        }
      }
    }
  }

  /**
   * Post-process preview HTML: table wrappers, code copy buttons
   */
  function postProcessPreview() {
    preview.querySelectorAll('img').forEach((img) => {
      if (img.dataset.errorBound) return;
      img.dataset.errorBound = 'true';
      img.addEventListener('error', () => {
        img.classList.add('img-load-error');
        const fallback = document.createElement('span');
        fallback.className = 'img-load-error-msg';
        fallback.textContent = `Image failed to load: ${img.getAttribute('src') || 'unknown URL'}`;
        img.insertAdjacentElement('afterend', fallback);
      });
    });

    preview.querySelectorAll('table').forEach((table) => {
      if (table.parentElement?.classList.contains('table-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });

    preview.querySelectorAll('pre').forEach((pre) => {
      if (pre.querySelector('.code-copy-btn')) return;
      const code = pre.querySelector('code');
      if (!code) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'code-copy-btn';
      btn.textContent = 'Copy';
      btn.setAttribute('aria-label', 'Copy code');
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(code.textContent);
          showToast('Copied code');
          btn.textContent = 'Copied';
          setTimeout(() => {
            btn.textContent = 'Copy';
          }, 2000);
        } catch {
          showToast('Copy failed');
        }
      });

      pre.classList.add('code-block-with-copy');
      pre.appendChild(btn);
    });
  }

  /**
   * Render markdown to HTML and update preview
   */
  function updatePreview() {
    const markdownText = editor.value;

    mermaidCounter = 0;

    if (!katexConfigured && MATH_PATTERN.test(markdownText)) {
      ensureKatex();
    }

    if (typeof hljs === 'undefined' && FENCED_CODE_LANG.test(markdownText)) {
      ensureHljs();
    }

    if (typeof marked !== 'undefined') {
      preview.innerHTML = sanitizePreviewHtml(marked.parse(markdownText));
      postProcessPreview();
      renderMermaidDiagrams();
    } else {
      preview.innerHTML = `<p>${escapeHtml(markdownText).replace(/\n/g, '<br>')}</p>`;
    }
  }

  /**
   * Switch to reading view after paste (zen on desktop, preview tab on mobile)
   */
  function switchToPreviewAfterPaste() {
    if (isMobile()) {
      setMobileView('preview');
    } else {
      setCollapsed(true);
      if (preview) preview.scrollTop = 0;
    }
  }

  /**
   * Update line number gutter with line numbers and error indicators
   */
  function updateLineGutter() {
    if (!lineGutter) return;

    const content = editor.value;
    const lines = content.split('\n');
    const lineCount = lines.length;

    // Get lines with errors and their messages
    const errorMap = new Map();
    if (lintEnabled && currentLintWarnings.length > 0) {
      currentLintWarnings.forEach((w) => {
        const existing = errorMap.get(w.line);
        if (existing) {
          errorMap.set(w.line, existing + '\n' + w.message);
        } else {
          errorMap.set(w.line, w.message);
        }
      });
    }

    // Build gutter HTML - SVG warning icon for consistent sizing
    const warningSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;

    let gutterHTML = '';
    for (let i = 1; i <= lineCount; i++) {
      const errorMsg = errorMap.get(i);
      const hasError = !!errorMsg;
      gutterHTML += `<div class="line-number${hasError ? ' has-error' : ''}">`;
      if (hasError) {
        // Escape for data attribute and add tabindex for mobile focus
        const escapedMsg = errorMsg
          .replace(/"/g, '&quot;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
        gutterHTML += `<span class="line-error-icon" data-tooltip="${escapedMsg}" tabindex="0">${warningSvg}</span>`;
      }
      gutterHTML += `<span class="line-number-text">${i}</span></div>`;
    }

    lineGutter.innerHTML = gutterHTML;

    // Setup tooltip handlers for error icons
    setupGutterTooltips();
  }

  // Tooltip element (created once and reused)
  let gutterTooltip = null;

  function getGutterTooltip() {
    if (!gutterTooltip) {
      gutterTooltip = document.createElement('div');
      gutterTooltip.className = 'gutter-tooltip';
      document.body.appendChild(gutterTooltip);
    }
    return gutterTooltip;
  }

  function showGutterTooltip(icon) {
    const tooltip = getGutterTooltip();
    const message = icon.getAttribute('data-tooltip');
    if (!message) return;

    tooltip.textContent = message;
    tooltip.classList.add('visible');

    // Position tooltip to the right of the icon
    const rect = icon.getBoundingClientRect();
    tooltip.style.left = `${rect.right + 8}px`;
    tooltip.style.top = `${rect.top + rect.height / 2}px`;
    tooltip.style.transform = 'translateY(-50%)';
  }

  function hideGutterTooltip() {
    if (gutterTooltip) {
      gutterTooltip.classList.remove('visible');
    }
  }

  function setupGutterTooltips() {
    if (!lineGutter) return;

    const icons = lineGutter.querySelectorAll('.line-error-icon');
    icons.forEach((icon) => {
      icon.addEventListener('mouseenter', () => showGutterTooltip(icon));
      icon.addEventListener('mouseleave', hideGutterTooltip);
      icon.addEventListener('focus', () => showGutterTooltip(icon));
      icon.addEventListener('blur', hideGutterTooltip);
    });
  }

  /**
   * Sync line gutter scroll with editor scroll
   */
  function syncGutterScroll() {
    if (lineGutter && editor) {
      lineGutter.scrollTop = editor.scrollTop;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Auto-Save Functionality (localStorage only — never sent off-device)
  // ═══════════════════════════════════════════════════════════════

  /**
   * Save current content to localStorage
   */
  function saveContent() {
    setStorageItem(STORAGE_KEYS.CONTENT, editor.value);
  }

  /**
   * Load saved content from localStorage
   */
  function loadContent() {
    const savedContent = getStorageItem(STORAGE_KEYS.CONTENT);
    editor.value = savedContent !== null ? savedContent : DEFAULT_CONTENT;
    updatePreview();
  }

  /**
   * Keep editor caret and scroll at top to avoid jump on refresh
   */
  function normalizeEditorPosition() {
    if (!editor) return;
    // Place caret at start so the browser doesn't scroll to the end on focus
    editor.setSelectionRange(0, 0);
    editor.scrollTop = 0;
  }

  /**
   * Reset scroll positions to top to avoid random restoration on refresh
   */
  function resetPaneScrollPositions() {
    if (editor) editor.scrollTop = 0;
    if (preview) preview.scrollTop = 0;
  }

  // Debounced save function
  const debouncedSave = debounce(saveContent, DEBOUNCE_DELAY);

  // ═══════════════════════════════════════════════════════════════
  // Theme Management
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set the theme and persist preference
   */
  function setTheme(theme) {
    html.setAttribute('data-theme', theme);
    setStorageItem(STORAGE_KEYS.THEME, theme);

    syncHljsThemeStyles();

    // Re-render mermaid diagrams with new theme
    prepareMermaidForRerender();
    renderMermaidDiagrams();
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  }

  /**
   * Load saved theme preference or detect system preference
   */
  function loadTheme() {
    const savedTheme = getStorageItem(STORAGE_KEYS.THEME);

    if (savedTheme) {
      setTheme(savedTheme);
    } else {
      // Detect system preference
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(prefersDark ? 'dark' : 'light');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Collapse Functionality
  // ═══════════════════════════════════════════════════════════════

  /**
   * Set editor pane collapse state (idempotent)
   */
  function setCollapsed(collapsed) {
    const isCurrentlyCollapsed = editorPane.classList.contains('collapsed');
    if (isCurrentlyCollapsed === collapsed) return;

    if (collapsed) {
      editorPane.classList.add('collapsed');
    } else {
      editorPane.classList.remove('collapsed');
    }

    setStorageItem(STORAGE_KEYS.EDITOR_COLLAPSED, collapsed ? 'true' : 'false');

    if (collapseBtn) {
      collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    if (resizeHandle) {
      resizeHandle.style.display = collapsed ? 'none' : 'flex';
    }

    if (previewPane) {
      previewPane.style.flex = collapsed ? '1 1 100%' : '1';
    }

    const app = document.querySelector('.app');
    if (app) {
      app.classList.toggle('zen-mode', collapsed);
    }
  }

  /**
   * Toggle editor pane collapse state
   */
  function toggleCollapse() {
    setCollapsed(!editorPane.classList.contains('collapsed'));
  }

  /**
   * Load saved collapse state
   */
  function loadCollapseState() {
    const savedState = getStorageItem(STORAGE_KEYS.EDITOR_COLLAPSED);
    if (savedState === 'true') {
      editorPane.classList.add('collapsed');
      if (resizeHandle) {
        resizeHandle.style.display = 'none';
      }
      if (previewPane) {
        previewPane.style.flex = '1 1 100%';
      }
      if (collapseBtn) {
        collapseBtn.setAttribute('aria-expanded', 'false');
      }
      const app = document.querySelector('.app');
      if (app) {
        app.classList.add('zen-mode');
      }
    } else if (collapseBtn) {
      collapseBtn.setAttribute('aria-expanded', 'true');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Scroll Sync Toggle
  // ═══════════════════════════════════════════════════════════════

  /**
   * Toggle scroll sync on/off
   */
  function toggleScrollSync() {
    scrollSyncEnabled = !scrollSyncEnabled;
    setStorageItem(STORAGE_KEYS.SCROLL_SYNC, scrollSyncEnabled ? 'true' : 'false');

    if (scrollSyncToggle) {
      if (scrollSyncEnabled) {
        scrollSyncToggle.classList.add('active');
        scrollSyncToggle.title = 'Sync scrolling (on)';
      } else {
        scrollSyncToggle.classList.remove('active');
        scrollSyncToggle.title = 'Sync scrolling (off)';
      }
      scrollSyncToggle.setAttribute('aria-pressed', scrollSyncEnabled ? 'true' : 'false');
    }
  }

  /**
   * Load saved scroll sync preference
   */
  function loadScrollSyncPreference() {
    const savedState = getStorageItem(STORAGE_KEYS.SCROLL_SYNC);
    // Default to disabled if no preference saved
    scrollSyncEnabled = savedState === 'true';

    if (scrollSyncToggle) {
      if (scrollSyncEnabled) {
        scrollSyncToggle.classList.add('active');
        scrollSyncToggle.title = 'Sync scrolling (on)';
      } else {
        scrollSyncToggle.classList.remove('active');
        scrollSyncToggle.title = 'Sync scrolling (off)';
      }
      scrollSyncToggle.setAttribute('aria-pressed', scrollSyncEnabled ? 'true' : 'false');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Markdown Linting
  // ═══════════════════════════════════════════════════════════════

  /**
   * Lint rules - each returns an array of {line, message} warnings
   */
  const LINT_RULES = [
    // MD009: Trailing spaces
    {
      id: 'MD009',
      name: 'Trailing spaces',
      check: (lines) => {
        const warnings = [];
        lines.forEach((line, i) => {
          if (/[ \t]+$/.test(line) && !/  $/.test(line)) {
            // Allow exactly 2 trailing spaces (line break)
            warnings.push({ line: i + 1, message: 'Trailing spaces' });
          }
        });
        return warnings;
      },
    },
    // MD010: Hard tabs
    {
      id: 'MD010',
      name: 'Hard tabs',
      check: (lines) => {
        const warnings = [];
        lines.forEach((line, i) => {
          if (/\t/.test(line)) {
            warnings.push({ line: i + 1, message: 'Hard tabs used instead of spaces' });
          }
        });
        return warnings;
      },
    },
    // MD012: Multiple consecutive blank lines
    {
      id: 'MD012',
      name: 'Multiple blank lines',
      check: (lines) => {
        const warnings = [];
        let blankCount = 0;
        lines.forEach((line, i) => {
          if (line.trim() === '') {
            blankCount++;
            if (blankCount > 1) {
              warnings.push({ line: i + 1, message: 'Multiple consecutive blank lines' });
            }
          } else {
            blankCount = 0;
          }
        });
        return warnings;
      },
    },
    // MD018: No space after hash on heading
    {
      id: 'MD018',
      name: 'No space after hash',
      check: (lines) => {
        const warnings = [];
        lines.forEach((line, i) => {
          if (/^#{1,6}[^#\s]/.test(line.trim())) {
            warnings.push({ line: i + 1, message: 'No space after hash on heading' });
          }
        });
        return warnings;
      },
    },
    // MD022: Headings should be surrounded by blank lines
    {
      id: 'MD022',
      name: 'Heading blank lines',
      check: (lines) => {
        const warnings = [];
        lines.forEach((line, i) => {
          if (/^#{1,6}\s/.test(line.trim())) {
            // Check line before (if exists and not first line)
            if (i > 0 && lines[i - 1].trim() !== '') {
              warnings.push({ line: i + 1, message: 'Heading should have blank line before' });
            }
            // Check line after (if exists and not last line)
            if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
              warnings.push({ line: i + 1, message: 'Heading should have blank line after' });
            }
          }
        });
        return warnings;
      },
    },
    // MD047: File should end with newline
    {
      id: 'MD047',
      name: 'End with newline',
      check: (lines, content) => {
        if (content.length > 0 && !content.endsWith('\n')) {
          return [{ line: lines.length, message: 'File should end with newline' }];
        }
        return [];
      },
    },
    // MD037: Spaces inside emphasis markers (single * or _)
    // Matches: * text * or _ text _ (with spaces inside)
    // But NOT: **bold** or list items like "- * text"
    {
      id: 'MD037',
      name: 'Spaces in emphasis',
      check: (lines) => {
        const warnings = [];
        lines.forEach((line, i) => {
          // Match single * or _ with spaces inside. Exclude ** and __
          // Pattern: single * not preceded by *, followed by space, content, space, single * not followed by *
          if (/(?<!\*)\*\s+[^*]+\s+\*(?!\*)/.test(line) || /(?<!_)_\s+[^_]+\s+_(?!_)/.test(line)) {
            warnings.push({ line: i + 1, message: 'Spaces inside emphasis markers' });
          }
          // Match double ** or __ with spaces inside
          else if (
            /\*\*\s+(?:(?!\*\*).)+\s+\*\*/.test(line) ||
            /__\s+(?:(?!__).)+\s+__/.test(line)
          ) {
            warnings.push({ line: i + 1, message: 'Spaces inside bold markers' });
          }
        });
        return warnings;
      },
    },
    // MD041: First line should be a top-level heading
    {
      id: 'MD041',
      name: 'First line heading',
      check: (lines) => {
        // Find first non-empty line
        const firstNonEmpty = lines.find((line) => line.trim() !== '');
        if (firstNonEmpty && !/^#\s/.test(firstNonEmpty)) {
          const lineNum = lines.indexOf(firstNonEmpty) + 1;
          return [{ line: lineNum, message: 'First line should be a top-level heading' }];
        }
        return [];
      },
    },
  ];

  /**
   * Run all lint rules against the content
   */
  function runLinter(content) {
    const lines = content.split('\n');
    const allWarnings = [];

    LINT_RULES.forEach((rule) => {
      const warnings = rule.check(lines, content);
      warnings.forEach((w) => {
        allWarnings.push({
          line: w.line,
          message: `${rule.id}: ${w.message}`,
          ruleId: rule.id,
        });
      });
    });

    // Sort by line number
    allWarnings.sort((a, b) => a.line - b.line);
    return allWarnings;
  }

  /**
   * Update lint UI with warnings
   */
  function updateLintUI(warnings) {
    currentLintWarnings = warnings;

    // Update toggle button
    if (lintToggle) {
      if (warnings.length > 0) {
        lintToggle.classList.add('has-warnings');
      } else {
        lintToggle.classList.remove('has-warnings');
      }
    }

    // Update count
    if (lintCount) {
      lintCount.textContent = warnings.length > 0 ? warnings.length : '';
    }

    // Update panel
    if (lintList) {
      lintList.innerHTML = '';
      if (warnings.length === 0 && lintEnabled) {
        const li = document.createElement('li');
        li.className = 'lint-item';
        li.innerHTML = `
          <span class="lint-item-icon" style="color: var(--link-color)">✓</span>
          <span class="lint-item-message" style="color: var(--text-muted)">No issues found</span>
        `;
        lintList.appendChild(li);
      } else {
        warnings.forEach((warning) => {
          const li = document.createElement('li');
          li.className = 'lint-item';
          li.innerHTML = `
            <span class="lint-item-icon">⚠</span>
            <span class="lint-item-line">L${warning.line}</span>
            <span class="lint-item-message">${warning.message}</span>
          `;
          li.addEventListener('click', () => scrollToLine(warning.line));
          lintList.appendChild(li);
        });
      }
    }

    // Show/hide panel
    if (lintPanel && lintEnabled) {
      lintPanel.classList.add('visible');
    }

    // Update line gutter to show error indicators
    updateLineGutter();
  }

  /**
   * Scroll editor to a specific line
   */
  function scrollToLine(lineNumber) {
    if (!editor) return;

    const lines = editor.value.split('\n');
    let charIndex = 0;

    for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
      charIndex += lines[i].length + 1; // +1 for newline
    }

    editor.focus();
    editor.setSelectionRange(charIndex, charIndex);

    // Calculate approximate scroll position
    const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 24;
    const targetScroll = (lineNumber - 1) * lineHeight - editor.clientHeight / 3;
    editor.scrollTop = Math.max(0, targetScroll);
  }

  /**
   * Toggle lint on/off
   */
  function toggleLint() {
    lintEnabled = !lintEnabled;
    setStorageItem(STORAGE_KEYS.LINT_ENABLED, lintEnabled ? 'true' : 'false');

    if (lintToggle) {
      if (lintEnabled) {
        lintToggle.classList.add('active');
        lintToggle.title = 'Lint markdown (on)';
        // Run linter immediately
        const warnings = runLinter(editor.value);
        updateLintUI(warnings);
      } else {
        lintToggle.classList.remove('active');
        lintToggle.classList.remove('has-warnings');
        lintToggle.title = 'Lint markdown (off)';
        if (lintCount) lintCount.textContent = '';
        if (lintPanel) lintPanel.classList.remove('visible');
        currentLintWarnings = []; // Clear warnings
        updateLineGutter(); // Remove error icons from gutter
      }
      lintToggle.setAttribute('aria-pressed', lintEnabled ? 'true' : 'false');
    }
  }

  /**
   * Load saved lint preference
   */
  function loadLintPreference() {
    const savedState = getStorageItem(STORAGE_KEYS.LINT_ENABLED);
    lintEnabled = savedState === 'true';

    if (lintToggle) {
      if (lintEnabled) {
        lintToggle.classList.add('active');
        lintToggle.title = 'Lint markdown (on)';
      } else {
        lintToggle.classList.remove('active');
        lintToggle.title = 'Lint markdown (off)';
      }
      lintToggle.setAttribute('aria-pressed', lintEnabled ? 'true' : 'false');
    }
  }

  // Debounced lint function for input handler
  const debouncedLint = debounce((content) => {
    if (!lintEnabled) return;
    const warnings = runLinter(content);
    updateLintUI(warnings);
  }, LINT_DEBOUNCE_DELAY);

  // ═══════════════════════════════════════════════════════════════
  // Resize Functionality
  // ═══════════════════════════════════════════════════════════════

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;
  const KEY_RESIZE_STEP = 24;

  /**
   * Adjust editor width by a delta (keyboard support)
   * Accessibility: allows resize via keyboard arrows on the separator
   */
  function adjustWidthBy(delta) {
    const currentWidth = editorPane.offsetWidth;
    const newWidth = Math.max(200, Math.min(currentWidth + delta, window.innerWidth - 300));
    editorPane.style.flex = `0 0 ${newWidth}px`;
    setStorageItem(STORAGE_KEYS.EDITOR_WIDTH, newWidth.toString());
  }

  /**
   * Start resizing
   */
  function startResize(e) {
    if (editorPane.classList.contains('collapsed')) return;

    isResizing = true;
    startX = e.clientX || e.touches[0].clientX;
    startWidth = editorPane.offsetWidth;

    resizeHandle.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    e.preventDefault();
  }

  /**
   * Handle resize movement
   */
  function handleResize(e) {
    if (!isResizing) return;

    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    if (!clientX) return;

    const deltaX = clientX - startX;
    const newWidth = Math.max(200, Math.min(startWidth + deltaX, window.innerWidth - 300));

    editorPane.style.flex = `0 0 ${newWidth}px`;

    e.preventDefault();
  }

  /**
   * Handle keyboard-based resize for accessibility
   */
  function handleResizeKeydown(e) {
    if (!resizeHandle || editorPane.classList.contains('collapsed')) return;

    if (e.key === 'ArrowLeft') {
      adjustWidthBy(-KEY_RESIZE_STEP);
      e.preventDefault();
    } else if (e.key === 'ArrowRight') {
      adjustWidthBy(KEY_RESIZE_STEP);
      e.preventDefault();
    }
  }

  /**
   * Stop resizing
   */
  function stopResize() {
    if (!isResizing) return;

    isResizing = false;
    resizeHandle.classList.remove('resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    // Save the width
    const currentWidth = editorPane.offsetWidth;
    setStorageItem(STORAGE_KEYS.EDITOR_WIDTH, currentWidth.toString());
  }

  /**
   * Load saved editor width
   */
  function loadEditorWidth() {
    const savedWidth = getStorageItem(STORAGE_KEYS.EDITOR_WIDTH);
    if (savedWidth && !editorPane.classList.contains('collapsed')) {
      editorPane.style.flex = `0 0 ${savedWidth}px`;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Mobile View Switching
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check if currently in mobile viewport
   */
  function isMobile() {
    return window.innerWidth <= MOBILE_BREAKPOINT;
  }

  /**
   * Set the active mobile view (editor or preview)
   */
  function setMobileView(view) {
    if (!isMobile()) return;

    // Update pane visibility
    if (view === 'editor') {
      editorPane.classList.add('mobile-active');
      previewPane.classList.remove('mobile-active');
    } else {
      editorPane.classList.remove('mobile-active');
      previewPane.classList.add('mobile-active');
    }

    // Update tab styles
    viewTabs.forEach((tab) => {
      const isActive = tab.dataset.view === view;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    // Save preference
    setStorageItem(STORAGE_KEYS.MOBILE_VIEW, view);
  }

  /**
   * Initialize mobile view state
   */
  function initMobileView() {
    if (!isMobile()) {
      // On desktop, remove mobile-active classes
      editorPane.classList.remove('mobile-active');
      previewPane.classList.remove('mobile-active');
      return;
    }

    // Get saved preference or default to editor
    const savedView = getStorageItem(STORAGE_KEYS.MOBILE_VIEW) || 'editor';
    setMobileView(savedView);
  }

  /**
   * Handle viewport resize - transition between mobile/desktop
   */
  function handleViewportResize() {
    if (isMobile()) {
      // Entering mobile mode - initialize mobile view
      const savedView = getStorageItem(STORAGE_KEYS.MOBILE_VIEW) || 'editor';
      setMobileView(savedView);
    } else {
      // Entering desktop mode - remove mobile classes
      editorPane.classList.remove('mobile-active');
      previewPane.classList.remove('mobile-active');
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Event Listeners
  // ═══════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════
  // HTML Export
  // ═══════════════════════════════════════════════════════════════

  /**
   * Apply theme visuals without persisting to storage (for export preview)
   */
  function applyThemeVisual(theme) {
    html.setAttribute('data-theme', theme);
    syncHljsThemeStyles();
    initMermaid();
  }

  /**
   * Fetch CSS text from a URL
   */
  async function fetchCssText(url) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Failed to fetch CSS: ${url}`);
    return resp.text();
  }

  /**
   * Rewrite KaTeX relative font URLs to absolute CDN URLs
   */
  function rewriteKaTeXFontUrls(css, baseUrl) {
    const base = baseUrl.replace(/\/[^/]+$/, '/');
    return css.replace(/url\((['"]?)(?!data:|https?:|\/\/)([^)'"]+)\1\)/g, (_match, _quote, path) => {
      return `url("${new URL(path, base).href}")`;
    });
  }

  /**
   * Read the local app stylesheet via CSSOM (works with hashed build filenames)
   */
  async function readSameOriginStylesheet() {
    for (const sheet of document.styleSheets) {
      const linkEl = sheet.ownerNode;
      if (linkEl?.disabled) continue;
      if (linkEl?.tagName === 'LINK' && linkEl.getAttribute('rel') === 'stylesheet') {
        const href = linkEl.getAttribute('href') || '';
        if (href.includes('styles') && !href.includes('highlight') && !href.includes('katex')) {
          try {
            return [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
          } catch {
            if (sheet.href) {
              return fetchCssText(sheet.href);
            }
          }
        }
      }
    }

    const stylesLink = document.querySelector('link[href*="styles"][rel="stylesheet"]');
    if (stylesLink?.href) {
      return fetchCssText(stylesLink.href);
    }

    return '';
  }

  /**
   * Collect all CSS needed for a standalone export
   */
  async function collectInlineCss(exportTheme) {
    const isDark = exportTheme === 'dark';
    const parts = [];

    const appCss = await readSameOriginStylesheet();
    if (appCss) parts.push(appCss);

    parts.push(await fetchCssText(isDark ? HLJS_DARK_URL : HLJS_LIGHT_URL));

    let katexCss = await fetchCssText(KATEX_CSS_URL);
    katexCss = rewriteKaTeXFontUrls(katexCss, KATEX_CSS_URL);
    parts.push(katexCss);

    // Appended last so it overrides inlined app layout rules (overflow: hidden, height: 100%)
    parts.push(EXPORT_RESET_CSS);

    return parts.join('\n');
  }

  /**
   * Convert a Blob to a base64 data URL
   */
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Embed images in the export clone as base64 data URLs
   */
  async function inlineImages(rootEl) {
    const images = rootEl.querySelectorAll('img');
    await Promise.all(
      [...images].map(async (img) => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:')) return;

        try {
          const resp = await fetch(src);
          if (!resp.ok) return;
          const blob = await resp.blob();
          img.src = await blobToDataUrl(blob);
        } catch {
          // Keep original src on failure (CORS, network, etc.)
        }
      })
    );
  }

  /**
   * Clone preview content and strip app-only UI for export
   */
  function prepareExportClone(sourceEl) {
    const clone = sourceEl.cloneNode(true);

    clone.querySelectorAll('.mermaid-toolbar, .code-copy-btn').forEach((el) => el.remove());
    clone.querySelectorAll('.code-block-with-copy').forEach((pre) => {
      pre.classList.remove('code-block-with-copy');
    });

    clone.removeAttribute('id');
    clone.removeAttribute('aria-live');
    clone.removeAttribute('aria-label');

    clone.querySelectorAll('[data-error-bound]').forEach((el) => {
      el.removeAttribute('data-error-bound');
    });

    clone.querySelectorAll('.mermaid').forEach((el) => {
      el.classList.remove('mermaid-has-toolbar');
      el.removeAttribute('data-mermaid-source');
    });

    return clone;
  }

  /**
   * Derive a default export filename from the first heading
   */
  function getDefaultExportFilename() {
    const h1 = preview.querySelector('h1');
    if (h1?.textContent?.trim()) {
      const slug = h1.textContent
        .trim()
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 50);
      if (slug) return slug;
    }
    return 'export';
  }

  /**
   * Derive document title for exported HTML
   */
  function getExportDocumentTitle() {
    const h1 = preview.querySelector('h1');
    if (h1?.textContent?.trim()) return h1.textContent.trim();
    return 'Markdown Export';
  }

  /**
   * Assemble the full standalone HTML document
   */
  function assembleExportDocument({ title, theme, css, bodyHtml }) {
    return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${GOOGLE_FONTS_URL}" rel="stylesheet">
  <style>
${css}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
  }

  /**
   * Build a self-contained HTML export from the current preview
   */
  async function buildExportHtml(options) {
    const { theme, embedImages } = options;
    const originalTheme = html.getAttribute('data-theme') || 'light';
    const exportTheme = theme === 'current' ? originalTheme : theme;
    const themeChanged = exportTheme !== originalTheme;

    if (themeChanged) {
      applyThemeVisual(exportTheme);
      prepareMermaidForRerender();
      await renderMermaidDiagrams();
    }

    try {
      const clone = prepareExportClone(preview);
      if (embedImages) {
        await inlineImages(clone);
      }

      const css = await collectInlineCss(exportTheme);
      const title = getExportDocumentTitle();

      return assembleExportDocument({
        title,
        theme: exportTheme,
        css,
        bodyHtml: clone.outerHTML,
      });
    } finally {
      if (themeChanged) {
        applyThemeVisual(originalTheme);
        prepareMermaidForRerender();
        await renderMermaidDiagrams();
      }
    }
  }

  /**
   * Trigger download of the exported HTML file
   */
  function downloadHtml(filename, htmlContent) {
    const safeName = String(filename).replace(/[^\w\s.-]/g, '').trim() || 'export';
    const name = safeName.endsWith('.html') ? safeName : `${safeName}.html`;
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Open the export dialog with defaults
   */
  function openExportDialog() {
    if (!exportDialog) return;
    if (exportFilenameInput) {
      exportFilenameInput.value = getDefaultExportFilename();
    }
    if (exportThemeSelect) {
      exportThemeSelect.value = 'current';
    }
    if (exportEmbedImages) {
      exportEmbedImages.checked = true;
    }
    exportDialog.showModal();
    exportFilenameInput?.focus();
    exportFilenameInput?.select();
  }

  /**
   * Handle export download from the dialog
   */
  async function handleExportDownload() {
    const filename = exportFilenameInput?.value || 'export';
    const theme = exportThemeSelect?.value || 'current';
    const embedImages = exportEmbedImages?.checked ?? true;

    if (exportDownloadBtn) {
      exportDownloadBtn.disabled = true;
      exportDownloadBtn.textContent = 'Exporting…';
    }

    try {
      const htmlContent = await buildExportHtml({ theme, embedImages });
      downloadHtml(filename, htmlContent);
      showToast('Exported HTML');
      exportDialog?.close();
    } catch (err) {
      console.warn('HTML export failed:', err);
      showToast('Export failed');
    } finally {
      if (exportDownloadBtn) {
        exportDownloadBtn.disabled = false;
        exportDownloadBtn.textContent = 'Download';
      }
    }
  }

  function setupEventListeners() {
    // Live preview on input
    editor.addEventListener('input', () => {
      schedulePreviewUpdate();
      updateLineGutter();
      debouncedSave();
      debouncedLint(editor.value);
    });

    // Auto-switch to preview after paste
    editor.addEventListener('paste', () => {
      setTimeout(() => {
        updateLineGutter();
        debouncedSave();
        debouncedLint(editor.value);
        switchToPreviewAfterPaste();
      }, 0);
    });

    // Export
    if (exportBtn) {
      exportBtn.addEventListener('click', openExportDialog);
    }

    if (exportCancelBtn) {
      exportCancelBtn.addEventListener('click', () => exportDialog?.close());
    }

    if (exportDownloadBtn) {
      exportDownloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleExportDownload();
      });
    }

    if (exportDialog) {
      exportDialog.addEventListener('cancel', (e) => {
        e.preventDefault();
        exportDialog.close();
      });
    }

    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);

    // Collapse toggle
    if (collapseBtn) {
      collapseBtn.addEventListener('click', toggleCollapse);
    }

    // Click on collapsed pane to expand
    if (editorPane) {
      editorPane.addEventListener('click', (e) => {
        // Only expand if collapsed and click wasn't on the button itself
        if (
          editorPane.classList.contains('collapsed') &&
          e.target !== collapseBtn &&
          !collapseBtn.contains(e.target)
        ) {
          toggleCollapse();
        }
      });
    }

    // Resize events
    if (resizeHandle) {
      resizeHandle.addEventListener('mousedown', startResize);
      resizeHandle.addEventListener('touchstart', startResize, { passive: false });
      resizeHandle.addEventListener('keydown', handleResizeKeydown);

      document.addEventListener('mousemove', handleResize);
      document.addEventListener('touchmove', handleResize, { passive: false });

      document.addEventListener('mouseup', stopResize);
      document.addEventListener('touchend', stopResize);
    }

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Only auto-switch if user hasn't manually set a preference
      if (!getStorageItem(STORAGE_KEYS.THEME)) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });

    // Scroll sync toggle
    if (scrollSyncToggle) {
      scrollSyncToggle.addEventListener('click', toggleScrollSync);
    }

    // Lint toggle
    if (lintToggle) {
      lintToggle.addEventListener('click', toggleLint);
    }

    // Mobile view switcher
    viewTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        setMobileView(tab.dataset.view);
      });
    });

    // Handle viewport resize for mobile/desktop transitions
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(handleViewportResize, 100);
    });

    // Scroll sync event listeners (only on desktop)
    editor.addEventListener('scroll', () => {
      syncGutterScroll();
      if (!isMobile()) {
        throttledSyncEditorToPreview();
      }
    });

    preview.addEventListener('scroll', () => {
      if (!isMobile()) {
        throttledSyncPreviewToEditor();
      }
    });

    // Save before page unload (belt and suspenders)
    window.addEventListener('beforeunload', saveContent);
  }

  // ═══════════════════════════════════════════════════════════════
  // Initialization
  // ═══════════════════════════════════════════════════════════════

  function init() {
    configureMarked();
    loadTheme();
    loadCollapseState();
    loadEditorWidth();
    loadScrollSyncPreference();
    loadLintPreference();
    loadContent();
    updateLineGutter(); // Initial line numbers
    resetPaneScrollPositions();
    normalizeEditorPosition();
    setupEventListeners();
    initMobileView();

    // Run initial lint if enabled
    if (lintEnabled) {
      const warnings = runLinter(editor.value);
      updateLintUI(warnings);
    }
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
