import { dom } from './dom.js';
import { STORAGE_KEYS, DEFAULT_CONTENT, DEBOUNCE_DELAY } from './constants.js';
import { getStorageItem, removeStorageItem, setStorageItem } from './storage.js';
import { debounce } from './utils.js';
import { updatePreview } from './preview.js';
import { createMachine, reflectState } from './machine.js';
import { documentMachine, isOwnWork } from './machines/document.js';

const { editor, preview } = dom;

// What the editor holds; see lib/machines/document.js.
const documentFlow = createMachine(documentMachine);
reflectState(documentFlow, editor);

function describeText(text) {
  return { isGuide: text === DEFAULT_CONTENT, blank: !/\S/.test(text) };
}

// The untouched welcome guide isn't saved, so the next visit shows the current guide. A saved
// copy would no longer match DEFAULT_CONTENT once the guide changes, and would pass for the
// reader's own work.
export function saveContent() {
  if (documentFlow.matches('welcome')) {
    removeStorageItem(STORAGE_KEYS.CONTENT);
  } else {
    setStorageItem(STORAGE_KEYS.CONTENT, editor.value);
  }
}

export function loadContent() {
  const savedContent = getStorageItem(STORAGE_KEYS.CONTENT);
  editor.value = savedContent !== null ? savedContent : DEFAULT_CONTENT;
  documentFlow.send({ type: 'EDITED', ...describeText(editor.value) });
  updatePreview({ force: true });
}

/** Call after the reader changes the editor's text. */
export function noteEditorInput() {
  documentFlow.send({ type: 'EDITED', ...describeText(editor.value) });
}

/**
 * Puts `text` in the editor as a new document. `event` says where it came from: IMPORTED with a
 * `filename`, OPENED_GUIDE, or RESTORED with the `value` and `filename` of `getDocument()` from
 * before.
 */
export function replaceEditorText(text, event) {
  editor.value = text;
  documentFlow.send(event);
}

/** What the editor holds, as `{ value, context: { filename } }`. */
export function getDocument() {
  return documentFlow.state;
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
  return /\S/.test(editor.value);
}

// The sample document from a first visit isn't the reader's work, so replacing it needs no confirmation.
export function editorHasOwnContent() {
  return isOwnWork(documentFlow.state) && editorHasContent();
}

export const debouncedSave = debounce(saveContent, DEBOUNCE_DELAY);
