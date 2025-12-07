/**
 * MD Preview — Application Logic
 * Instant live markdown preview with auto-save and theme switching
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
  };

  const DEBOUNCE_DELAY = 300; // ms for auto-save debounce
  const SCROLL_SYNC_DELAY = 50; // ms for scroll sync debounce

  // Scroll sync state
  let isScrollingEditor = false;
  let isScrollingPreview = false;
  let scrollSyncTimeout = null;
  let scrollSyncEnabled = false;

  // Prevent browser from trying to restore scroll positions on refresh
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  const DEFAULT_CONTENT = `# Welcome to mdfor.work ✨

Start typing your **markdown** on the left, and watch it transform into beautiful formatted text on the right — *instantly*.

## Features

- 📝 **Live Preview** — See your changes in real-time
- 🌓 **Dark & Light Modes** — Easy on your eyes
- 💾 **Auto-Save** — Never lose your work
- 🔒 **100% Private** — Everything stays in your browser
- 🔗 **Scroll Sync** — Click the link icon in header to sync scrolling

## Try Some Markdown

### Code Blocks

\`\`\`javascript
const greeting = "Hello, Markdown!";
console.log(greeting);
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
   * Render markdown to HTML and update preview
   */
  function updatePreview() {
    const markdownText = editor.value;

    if (typeof marked !== 'undefined') {
      preview.innerHTML = marked.parse(markdownText);
    } else {
      // Fallback if marked.js hasn't loaded yet
      preview.innerHTML = `<p>${markdownText.replace(/\n/g, '<br>')}</p>`;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Auto-Save Functionality
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
   * Toggle editor pane collapse state
   */
  function toggleCollapse() {
    const isCollapsed = editorPane.classList.toggle('collapsed');
    setStorageItem(STORAGE_KEYS.EDITOR_COLLAPSED, isCollapsed ? 'true' : 'false');
    if (collapseBtn) {
      collapseBtn.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
    }

    // Hide resize handle and expand preview when collapsed
    if (resizeHandle) {
      resizeHandle.style.display = isCollapsed ? 'none' : 'flex';
    }

    // Ensure preview pane expands
    if (previewPane) {
      previewPane.style.flex = isCollapsed ? '1 1 100%' : '1';
    }
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
      debouncedSave();
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
    loadContent();
    resetPaneScrollPositions();
    normalizeEditorPosition();
    setupEventListeners();
    initMobileView();
  }

  // Start the app when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
