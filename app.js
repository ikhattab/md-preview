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
- 🔗 **Scroll Sync** — Click the link icon in header to sync scrolling
- 📊 **Mermaid Diagrams** — Create flowcharts and diagrams

## Try Some Markdown

### Code Blocks

\`\`\`javascript
const greeting = "Hello, Markdown!";
console.log(greeting);
\`\`\`

### Mermaid Diagrams

\`\`\`mermaid
graph LR
    A[Write Markdown] --> B{Preview}
    B --> C[Dark Mode]
    B --> D[Light Mode]
    C --> E[Beautiful Output]
    D --> E
\`\`\`

### Blockquotes

> "The best writing is rewriting."
> — E.B. White

### Lists

1. First item
2. Second item
3. Third item

### Links

Check out [Markdown Guide](https://www.markdownguide.org) to learn more.

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
  const html = document.documentElement;

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
  const PNG_SCALE = 3;
  let toastTimeout = null;

  /**
   * Configure marked.js options with syntax highlighting
   */
  function configureMarked() {
    if (typeof marked !== 'undefined') {
      // Create a custom renderer for code blocks with Highlight.js
      const renderer = new marked.Renderer();

      renderer.code = function (code, language) {
        // Handle the case where code is an object (newer marked versions)
        const codeText = typeof code === 'object' ? code.text : code;
        const lang = typeof code === 'object' ? code.lang : language;

        // Handle mermaid diagrams
        if (lang === 'mermaid') {
          const id = `mermaid-${mermaidCounter++}`;
          return `<div class="mermaid" id="${id}">${escapeHtml(codeText)}</div>`;
        }

        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
          try {
            const highlighted = hljs.highlight(codeText, { language: lang }).value;
            return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
          } catch (e) {
            console.warn('Highlight.js error:', e);
          }
        }

        // Fallback: escape HTML and return without highlighting
        const escaped = codeText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `<pre><code>${escaped}</code></pre>`;
      };

      marked.setOptions({
        breaks: true, // Convert \n to <br>
        gfm: true, // GitHub Flavored Markdown
        renderer: renderer,
      });
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
          '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
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
    ctx.fillStyle = '#ffffff';
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
    if (typeof mermaid === 'undefined') return;

    const diagrams = preview.querySelectorAll('.mermaid:not(.mermaid-rendered)');
    if (diagrams.length === 0) return;

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

    if (typeof marked !== 'undefined') {
      preview.innerHTML = marked.parse(markdownText);
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

    // Update Highlight.js theme
    const hljsLight = document.getElementById('hljs-theme-light');
    const hljsDark = document.getElementById('hljs-theme-dark');
    if (hljsLight && hljsDark) {
      if (theme === 'dark') {
        hljsLight.disabled = true;
        hljsDark.disabled = false;
      } else {
        hljsLight.disabled = false;
        hljsDark.disabled = true;
      }
    }

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

  function setupEventListeners() {
    // Live preview on input
    editor.addEventListener('input', () => {
      updatePreview();
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
    initMermaid(); // Initialize mermaid before first render
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
