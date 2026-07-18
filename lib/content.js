import { dom } from './dom.js';
import { STORAGE_KEYS, DEFAULT_CONTENT, DEBOUNCE_DELAY } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { debounce } from './utils.js';
import { updatePreview } from './preview.js';

const { editor, preview } = dom;

export function saveContent() {
  setStorageItem(STORAGE_KEYS.CONTENT, editor.value);
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

export const debouncedSave = debounce(saveContent, DEBOUNCE_DELAY);
