import { dom } from './dom.js';
import { labelIconButton } from './icons.js';
import { STORAGE_KEYS, SCROLL_SYNC_DELAY, MOBILE_BREAKPOINT } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { throttle } from './utils.js';

const {
  editor,
  preview,
  editorPane,
  previewPane,
  collapseBtn,
  resizeHandle,
  scrollSyncToggle,
  viewTabs,
} = dom;

let isScrollingEditor = false;
let isScrollingPreview = false;
let scrollSyncTimeout = null;
let scrollSyncEnabled = false;

let isResizing = false;
let startX = 0;
let startWidth = 0;
const KEY_RESIZE_STEP = 24;

function setScrollSyncTooltip(enabled) {
  if (!scrollSyncToggle) return;
  const label = enabled ? 'Sync scrolling (on)' : 'Sync scrolling (off)';
  scrollSyncToggle.title = label;
  scrollSyncToggle.setAttribute('data-tooltip', label);
}

function setCollapseTooltip(collapsed) {
  if (!collapseBtn) return;
  const label = collapsed ? 'Expand editor' : 'Collapse editor';
  labelIconButton(collapseBtn, label);
}

function getScrollPercentage(element) {
  const scrollTop = element.scrollTop;
  const scrollHeight = element.scrollHeight - element.clientHeight;
  if (scrollHeight <= 0) return 0;
  return Math.min(1, Math.max(0, scrollTop / scrollHeight));
}

function setScrollByPercentage(element, percentage) {
  const scrollHeight = element.scrollHeight - element.clientHeight;
  if (scrollHeight <= 0) return;
  element.scrollTop = percentage * scrollHeight;
}

function syncEditorToPreview() {
  if (!scrollSyncEnabled || isScrollingPreview) return;

  const editorScrollHeight = editor.scrollHeight - editor.clientHeight;
  const previewScrollHeight = preview.scrollHeight - preview.clientHeight;

  if (editorScrollHeight <= 0 || previewScrollHeight <= 0) return;

  const scrollPercent = getScrollPercentage(editor);

  isScrollingEditor = true;
  setScrollByPercentage(preview, scrollPercent);

  clearTimeout(scrollSyncTimeout);
  scrollSyncTimeout = setTimeout(() => {
    isScrollingEditor = false;
  }, SCROLL_SYNC_DELAY);
}

function syncPreviewToEditor() {
  if (!scrollSyncEnabled || isScrollingEditor) return;

  const editorScrollHeight = editor.scrollHeight - editor.clientHeight;
  const previewScrollHeight = preview.scrollHeight - preview.clientHeight;

  if (editorScrollHeight <= 0 || previewScrollHeight <= 0) return;

  const scrollPercent = getScrollPercentage(preview);

  isScrollingPreview = true;
  setScrollByPercentage(editor, scrollPercent);

  clearTimeout(scrollSyncTimeout);
  scrollSyncTimeout = setTimeout(() => {
    isScrollingPreview = false;
  }, SCROLL_SYNC_DELAY);
}

export const throttledSyncEditorToPreview = throttle(syncEditorToPreview, SCROLL_SYNC_DELAY);
export const throttledSyncPreviewToEditor = throttle(syncPreviewToEditor, SCROLL_SYNC_DELAY);

export function setCollapsed(collapsed) {
  const isCurrentlyCollapsed = editorPane.classList.contains('collapsed');
  if (isCurrentlyCollapsed === collapsed) return;

  editorPane.classList.toggle('collapsed', collapsed);
  setStorageItem(STORAGE_KEYS.EDITOR_COLLAPSED, collapsed ? 'true' : 'false');

  if (collapseBtn) {
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    setCollapseTooltip(collapsed);
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

export function toggleCollapse() {
  setCollapsed(!editorPane.classList.contains('collapsed'));
}

export function loadCollapseState() {
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
      setCollapseTooltip(true);
    }
    const app = document.querySelector('.app');
    if (app) {
      app.classList.add('zen-mode');
    }
  } else if (collapseBtn) {
    collapseBtn.setAttribute('aria-expanded', 'true');
    setCollapseTooltip(false);
  }
}

export function toggleScrollSync() {
  scrollSyncEnabled = !scrollSyncEnabled;
  setStorageItem(STORAGE_KEYS.SCROLL_SYNC, scrollSyncEnabled ? 'true' : 'false');

  if (scrollSyncToggle) {
    scrollSyncToggle.classList.toggle('active', scrollSyncEnabled);
    scrollSyncToggle.setAttribute('aria-pressed', scrollSyncEnabled ? 'true' : 'false');
    setScrollSyncTooltip(scrollSyncEnabled);
  }
}

export function loadScrollSyncPreference() {
  scrollSyncEnabled = getStorageItem(STORAGE_KEYS.SCROLL_SYNC) === 'true';

  if (scrollSyncToggle) {
    scrollSyncToggle.classList.toggle('active', scrollSyncEnabled);
    scrollSyncToggle.setAttribute('aria-pressed', scrollSyncEnabled ? 'true' : 'false');
    setScrollSyncTooltip(scrollSyncEnabled);
  }
}

function adjustWidthBy(delta) {
  const currentWidth = editorPane.offsetWidth;
  const newWidth = Math.max(200, Math.min(currentWidth + delta, window.innerWidth - 300));
  editorPane.style.flex = `0 0 ${newWidth}px`;
  setStorageItem(STORAGE_KEYS.EDITOR_WIDTH, newWidth.toString());
}

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

function handleResize(e) {
  if (!isResizing) return;

  const clientX = e.clientX || (e.touches && e.touches[0].clientX);
  if (!clientX) return;

  const deltaX = clientX - startX;
  const newWidth = Math.max(200, Math.min(startWidth + deltaX, window.innerWidth - 300));

  editorPane.style.flex = `0 0 ${newWidth}px`;

  e.preventDefault();
}

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

function stopResize() {
  if (!isResizing) return;

  isResizing = false;
  resizeHandle.classList.remove('resizing');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';

  const currentWidth = editorPane.offsetWidth;
  setStorageItem(STORAGE_KEYS.EDITOR_WIDTH, currentWidth.toString());
}

export function loadEditorWidth() {
  const savedWidth = getStorageItem(STORAGE_KEYS.EDITOR_WIDTH);
  if (savedWidth && !editorPane.classList.contains('collapsed')) {
    editorPane.style.flex = `0 0 ${savedWidth}px`;
  }
}

export function isMobile() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

export function setMobileView(view) {
  if (!isMobile()) return;

  if (view === 'editor') {
    editorPane.classList.add('mobile-active');
    previewPane.classList.remove('mobile-active');
  } else {
    editorPane.classList.remove('mobile-active');
    previewPane.classList.add('mobile-active');
  }

  viewTabs.forEach((tab) => {
    const isActive = tab.dataset.view === view;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  setStorageItem(STORAGE_KEYS.MOBILE_VIEW, view);
}

export function initMobileView() {
  if (!isMobile()) {
    editorPane.classList.remove('mobile-active');
    previewPane.classList.remove('mobile-active');
    return;
  }

  const savedView = getStorageItem(STORAGE_KEYS.MOBILE_VIEW) || 'editor';
  setMobileView(savedView);
}

export function handleViewportResize() {
  if (isMobile()) {
    const savedView = getStorageItem(STORAGE_KEYS.MOBILE_VIEW) || 'editor';
    setMobileView(savedView);
  } else {
    editorPane.classList.remove('mobile-active');
    previewPane.classList.remove('mobile-active');
  }
}

export function switchToPreviewAfterPaste() {
  if (isMobile()) {
    setMobileView('preview');
  } else {
    setCollapsed(true);
    if (preview) preview.scrollTop = 0;
  }
}

export function bindResizeListeners() {
  if (!resizeHandle) return;

  resizeHandle.addEventListener('mousedown', startResize);
  resizeHandle.addEventListener('touchstart', startResize, { passive: false });
  resizeHandle.addEventListener('keydown', handleResizeKeydown);

  document.addEventListener('mousemove', handleResize);
  document.addEventListener('touchmove', handleResize, { passive: false });
  document.addEventListener('mouseup', stopResize);
  document.addEventListener('touchend', stopResize);
}
