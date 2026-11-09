import { dom } from './dom.js';
import { labelIconButton } from './icons.js';
import { STORAGE_KEYS, SCROLL_SYNC_DELAY, MOBILE_BREAKPOINT } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { ariaShortcut, formatShortcut, throttle } from './utils.js';
import { createMachine, reflectState } from './machine.js';
import {
  editorPaneMachine,
  mobileViewMachine,
  resizeMachine,
  scrollSyncMachine,
} from './machines/layout.js';

const {
  editor,
  preview,
  editorPane,
  previewPane,
  collapseBtn,
  resizeHandle,
  scrollSyncToggle,
  mobileViewSwitcher,
  viewTabs,
} = dom;

const KEY_RESIZE_STEP = 24;
const MIN_EDITOR_WIDTH = 200;
const MIN_PREVIEW_WIDTH = 300;

// The layout's states and events are in lib/machines/layout.js. Each is created by `initLayout()`.
let pane = null;
let mobileView = null;
let resize = null;
let scrollSync = null;

export function isMobile() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

function widthLimits() {
  return { minWidth: MIN_EDITOR_WIDTH, maxWidth: window.innerWidth - MIN_PREVIEW_WIDTH };
}

/* Editor pane */

function setCollapseTooltip(collapsed) {
  if (!collapseBtn) return;
  const label = collapsed ? 'Expand editor' : 'Collapse editor';
  labelIconButton(collapseBtn, label);
  const hint = `${label} (${formatShortcut('\\')})`;
  collapseBtn.title = hint;
  collapseBtn.setAttribute('data-tooltip', hint);
  collapseBtn.setAttribute('aria-keyshortcuts', ariaShortcut('\\'));
}

function setEditorWidth(width) {
  editorPane.style.flex = width ? `0 0 ${width}px` : '';
}

function renderPane({ value, context }) {
  const collapsed = value === 'collapsed';
  editorPane.classList.toggle('collapsed', collapsed);
  document.querySelector('.app')?.classList.toggle('zen-mode', collapsed);
  setEditorWidth(collapsed ? null : context.width);
  if (collapseBtn) {
    collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    setCollapseTooltip(collapsed);
  }
}

export function toggleCollapse() {
  pane.send('TOGGLE');
}

/* Mobile view */

function renderMobileView({ value }) {
  const mobile = isMobile();
  editorPane.classList.toggle('mobile-active', mobile && value === 'editor');
  previewPane.classList.toggle('mobile-active', mobile && value === 'preview');
  viewTabs.forEach((tab) => {
    const isActive = tab.dataset.view === value;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

/** Shows `view` ('editor' or 'preview') on narrow screens; wide screens show both. */
export function setMobileView(view) {
  if (!isMobile()) return;
  mobileView.send(view === 'editor' ? 'SHOW_EDITOR' : 'SHOW_PREVIEW');
}

export function handleViewportResize() {
  renderMobileView(mobileView.state);
}

/* Reading view after an import or paste */

function showPreviewForReading({ collapse }) {
  if (isMobile()) {
    setMobileView('preview');
  } else if (collapse) {
    pane.send('SHOW_FOR_READING');
  }
  if (preview) preview.scrollTop = 0;
}

/**
 * Pasting a whole document, into an empty editor or over all of it, is most likely there to be
 * read, so show it rendered. Pasting part of a document is editing, so nothing changes.
 * @returns {() => void} call once the paste has landed
 */
export function prepareForPaste() {
  const replacesEverything =
    !/\S/.test(editor.value) ||
    (editor.selectionStart === 0 && editor.selectionEnd === editor.value.length);
  return () => {
    if (replacesEverything && /\S/.test(editor.value)) showPreviewForReading({ collapse: true });
  };
}

/**
 * Imported files are most likely there to be read, so show the rendered document.
 * @returns {() => void} puts the layout back, for undoing the import
 */
export function showImportedDocument() {
  const previousView = mobileView.value;
  showPreviewForReading({ collapse: true });
  return () => {
    pane.send('RESTORE');
    setMobileView(previousView);
  };
}

/**
 * The welcome guide invites editing, so unlike an import it leaves the editor open on desktop.
 * @returns {() => void} puts the mobile view back, for undoing
 */
export function showWelcomeGuide() {
  const previousView = mobileView.value;
  showPreviewForReading({ collapse: false });
  return () => setMobileView(previousView);
}

/* Resizing */

function startResize(e) {
  if (pane.matches('collapsed') || !e.isPrimary) return;
  resizeHandle.setPointerCapture(e.pointerId);
  resize.send({ type: 'START', x: e.clientX, width: editorPane.offsetWidth });
  e.preventDefault();
}

function renderResize(state, previous) {
  const dragging = state.value === 'dragging';
  resizeHandle.classList.toggle('resizing', dragging);
  document.body.style.cursor = dragging ? 'col-resize' : '';
  document.body.style.userSelect = dragging ? 'none' : '';
  if (dragging || previous.value === 'dragging') setEditorWidth(state.context.width);
  if (state.value === 'idle' && previous.value === 'dragging') {
    pane.send({ type: 'RESIZED', width: state.context.width });
  }
}

function handleResizeKeydown(e) {
  if (pane.matches('collapsed')) return;
  const delta = { ArrowLeft: -KEY_RESIZE_STEP, ArrowRight: KEY_RESIZE_STEP }[e.key];
  if (!delta) return;
  const { minWidth, maxWidth } = widthLimits();
  const width = Math.max(minWidth, Math.min(editorPane.offsetWidth + delta, maxWidth));
  pane.send({ type: 'RESIZED', width });
  e.preventDefault();
}

export function bindResizeListeners() {
  if (!resizeHandle) return;
  resizeHandle.addEventListener('pointerdown', startResize);
  resizeHandle.addEventListener('pointermove', (e) => {
    resize.send({ type: 'MOVE', x: e.clientX, ...widthLimits() });
  });
  resizeHandle.addEventListener('pointerup', () => resize.send('END'));
  resizeHandle.addEventListener('pointercancel', () => resize.send('CANCEL'));
  // Ends a drag the browser stopped reporting, such as when the window loses focus.
  resizeHandle.addEventListener('lostpointercapture', () => resize.send('END'));
  resizeHandle.addEventListener('keydown', handleResizeKeydown);
}

/* Scroll sync */

function setScrollSyncTooltip(enabled) {
  if (!scrollSyncToggle) return;
  const label = enabled ? 'Sync scrolling (on)' : 'Sync scrolling (off)';
  scrollSyncToggle.title = label;
  scrollSyncToggle.setAttribute('data-tooltip', label);
}

function renderScrollSync({ value }) {
  if (!scrollSyncToggle) return;
  const enabled = value !== 'off';
  scrollSyncToggle.classList.toggle('active', enabled);
  scrollSyncToggle.setAttribute('aria-pressed', enabled ? 'true' : 'false');
  setScrollSyncTooltip(enabled);
}

function getScrollPercentage(element) {
  const scrollHeight = element.scrollHeight - element.clientHeight;
  if (scrollHeight <= 0) return 0;
  return Math.min(1, Math.max(0, element.scrollTop / scrollHeight));
}

let settleTimer = null;

/** Moves the other pane to match `pane`'s scroll position, if that pane is leading. */
function followScroll(leader) {
  const [source, target] = leader === 'editor' ? [editor, preview] : [preview, editor];
  if (source.scrollHeight <= source.clientHeight || target.scrollHeight <= target.clientHeight) {
    return;
  }
  if (!scrollSync.send({ type: 'SCROLLED', pane: leader })) return;

  const targetRange = target.scrollHeight - target.clientHeight;
  target.scrollTop = getScrollPercentage(source) * targetRange;
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => scrollSync.send('SETTLED'), SCROLL_SYNC_DELAY);
}

export const throttledSyncEditorToPreview = throttle(
  () => followScroll('editor'),
  SCROLL_SYNC_DELAY
);
export const throttledSyncPreviewToEditor = throttle(
  () => followScroll('preview'),
  SCROLL_SYNC_DELAY
);

export function toggleScrollSync() {
  scrollSync.send('TOGGLE');
}

/* Setup */

/** Restores the saved layout and keeps the page in step with it from then on. */
export function initLayout() {
  const savedWidth = Number(getStorageItem(STORAGE_KEYS.EDITOR_WIDTH)) || null;
  pane = createMachine(editorPaneMachine, {
    value: getStorageItem(STORAGE_KEYS.EDITOR_COLLAPSED) === 'true' ? 'collapsed' : 'open',
    context: { width: savedWidth },
  });
  reflectState(pane, editorPane);
  renderPane(pane.state);
  pane.subscribe((state, previous) => {
    renderPane(state);
    if (state.value !== previous.value) {
      setStorageItem(STORAGE_KEYS.EDITOR_COLLAPSED, state.value === 'collapsed' ? 'true' : 'false');
    }
    if (state.context.width !== previous.context.width && state.context.width) {
      setStorageItem(STORAGE_KEYS.EDITOR_WIDTH, String(state.context.width));
    }
  });

  mobileView = createMachine(mobileViewMachine, {
    value: getStorageItem(STORAGE_KEYS.MOBILE_VIEW) === 'preview' ? 'preview' : 'editor',
  });
  reflectState(mobileView, mobileViewSwitcher);
  renderMobileView(mobileView.state);
  mobileView.subscribe((state) => {
    renderMobileView(state);
    setStorageItem(STORAGE_KEYS.MOBILE_VIEW, state.value);
  });

  resize = createMachine(resizeMachine);
  reflectState(resize, resizeHandle);
  resize.subscribe(renderResize);

  scrollSync = createMachine(scrollSyncMachine, {
    value: getStorageItem(STORAGE_KEYS.SCROLL_SYNC) === 'true' ? 'idle' : 'off',
  });
  reflectState(scrollSync, scrollSyncToggle);
  renderScrollSync(scrollSync.state);
  scrollSync.subscribe((state, previous) => {
    renderScrollSync(state);
    if ((state.value === 'off') !== (previous.value === 'off')) {
      setStorageItem(STORAGE_KEYS.SCROLL_SYNC, state.value === 'off' ? 'false' : 'true');
    }
  });
}
