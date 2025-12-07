/**
 * MD Preview — Application Logic
 * Instant live markdown preview with auto-save and theme switching
 */

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // Constants & Configuration
    // ═══════════════════════════════════════════════════════════════
    const STORAGE_KEYS = {
        CONTENT: 'md-preview-content',
        THEME: 'md-preview-theme',
        EDITOR_WIDTH: 'md-preview-editor-width',
        EDITOR_COLLAPSED: 'md-preview-editor-collapsed'
    };

    const DEBOUNCE_DELAY = 300; // ms for auto-save debounce

    const DEFAULT_CONTENT = `# Welcome to mdfor.work ✨

Start typing your **markdown** on the left, and watch it transform into beautiful formatted text on the right — *instantly*.

## Features

- 📝 **Live Preview** — See your changes in real-time
- 🌓 **Dark & Light Modes** — Easy on your eyes
- 💾 **Auto-Save** — Never lose your work
- 🔒 **100% Private** — Everything stays in your browser

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
    const editorHeader = editorPane ? editorPane.querySelector('.pane-header') : null;
    const previewPane = document.getElementById('previewPane');
    const collapseBtn = document.getElementById('collapseEditor');
    const resizeHandle = document.getElementById('resizeHandle');
    const html = document.documentElement;

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
     * Configure marked.js options
     */
    function configureMarked() {
        if (typeof marked !== 'undefined') {
            marked.setOptions({
                breaks: true,         // Convert \n to <br>
                gfm: true,           // GitHub Flavored Markdown
                headerIds: true,     // Add IDs to headers
                mangle: false,       // Don't escape autolinked emails
                sanitize: false      // Allow HTML (we trust user input since it's local)
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
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // Resize Functionality
    // ═══════════════════════════════════════════════════════════════

    let isResizing = false;
    let startX = 0;
    let startWidth = 0;

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

        // Click on collapsed header to expand
        if (editorHeader) {
            editorHeader.addEventListener('click', (e) => {
                // Only expand if collapsed and click wasn't on the button itself
                if (editorPane.classList.contains('collapsed') && e.target !== collapseBtn && !collapseBtn.contains(e.target)) {
                    toggleCollapse();
                }
            });
        }

        // Resize events
        if (resizeHandle) {
            resizeHandle.addEventListener('mousedown', startResize);
            resizeHandle.addEventListener('touchstart', startResize, { passive: false });

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
        loadContent();
        setupEventListeners();
    }

    // Start the app when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
