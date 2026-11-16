import { dom } from './dom.js';
import { STORAGE_KEYS, DEFAULT_CONTENT, DEBOUNCE_DELAY } from './constants.js';
import { getStorageItem, removeStorageItem, setStorageItem } from './storage.js';
import { debounce } from './utils.js';
import { updatePreview } from './preview.js';

const { editor, preview } = dom;

// The untouched welcome guide isn't saved, so the next visit shows the current guide. A saved
// copy would no longer match DEFAULT_CONTENT once the guide changes, and would pass for the
// reader's own work.
export function saveContent() {
  if (editor.value === DEFAULT_CONTENT) {
    removeStorageItem(STORAGE_KEYS.CONTENT);
  } else {
    setStorageItem(STORAGE_KEYS.CONTENT, editor.value);
  }
}

export function loadContent() {
  const savedContent = getStorageItem(STORAGE_KEYS.CONTENT);
  editor.value = savedContent !== null ? savedContent : DEFAULT_CONTENT;
  updatePreview({ force: true });
}

export function normalizeEditorPosition() {
  if (!editor) return;
  editor.setSelectionRange(0, 0);
  editor.scrollTop = 0;
}

export function resetPaneScrollPositions() {
  if (editor) editor.scrollTop = 0;
  if (preview) preview.scrollTop = 0;
}

export function editorHasContent() {
  return editor.value.trim().length > 0;
}

// The sample document from a first visit isn't the reader's work, so replacing it needs no confirmation.
export function editorHasOwnContent() {
  return editorHasContent() && editor.value !== DEFAULT_CONTENT;
}

export const debouncedSave = debounce(saveContent, DEBOUNCE_DELAY);
