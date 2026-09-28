import { dom } from './dom.js';

const { dropOverlay, dropOverlayTitle, dropOverlayHint } = dom;

// Types we know aren't markdown. Anything else is checked by extension on drop,
// because browsers often report .md files with an empty or generic type.
const UNSUPPORTED_TYPE = /^(image|audio|video|font)\/|^application\/(pdf|zip)$/;

// Set while something inside the page is being dragged (editor text, preview
// images), so those drags keep their native behavior.
let internalDrag = false;
let dropAllowed = false;

function isExternalFileDrag(event) {
  return !internalDrag && (event.dataTransfer?.types.includes('Files') ?? false);
}

function isModalOpen() {
  return document.querySelector('dialog[open]') !== null;
}

function describeDrag(dataTransfer) {
  const files = [...(dataTransfer.items ?? [])].filter((item) => item.kind === 'file');
  if (files[0] && UNSUPPORTED_TYPE.test(files[0].type)) {
    return {
      allowed: false,
      title: "Can't open this file",
      hint: 'Drop a .md, .markdown, or .txt file',
    };
  }
  return {
    allowed: true,
    title: 'Drop to open',
    hint:
      files.length > 1
        ? 'Only the first file will be opened'
        : 'Markdown or plain text, up to 2 MB',
  };
}

function showOverlay(dataTransfer) {
  const { allowed, title, hint } = describeDrag(dataTransfer);
  dropAllowed = allowed;
  if (!dropOverlay) return;
  dropOverlay.dataset.state = allowed ? 'ready' : 'unsupported';
  if (dropOverlayTitle) dropOverlayTitle.textContent = title;
  if (dropOverlayHint) dropOverlayHint.textContent = hint;
  dropOverlay.classList.add('visible');
}

function hideOverlay() {
  dropOverlay?.classList.remove('visible');
}

function isOverlayVisible() {
  return dropOverlay?.classList.contains('visible') ?? false;
}

/**
 * Accept files dropped anywhere in the window and pass the first one to `onFile`.
 * While a file is dragged over the page, a full-window overlay shows what will happen.
 */
export function bindDropImport(onFile) {
  document.addEventListener('dragstart', () => {
    internalDrag = true;
  });
  document.addEventListener('dragend', () => {
    internalDrag = false;
  });

  window.addEventListener('dragenter', (e) => {
    if (!isExternalFileDrag(e) || isModalOpen()) return;
    showOverlay(e.dataTransfer);
  });

  window.addEventListener('dragover', (e) => {
    if (!isExternalFileDrag(e)) return;
    // Always cancel, so a dropped file never makes the browser navigate away from the app.
    e.preventDefault();
    if (isModalOpen()) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    if (!isOverlayVisible()) showOverlay(e.dataTransfer);
    e.dataTransfer.dropEffect = dropAllowed ? 'copy' : 'none';
  });

  window.addEventListener('drop', (e) => {
    if (!isExternalFileDrag(e)) return;
    e.preventDefault();
    hideOverlay();
    if (isModalOpen() || !dropAllowed) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  });

  // The overlay covers the window and its contents ignore pointer events, so it
  // only sees dragleave when the drag leaves the window or is cancelled.
  dropOverlay?.addEventListener('dragleave', hideOverlay);
}
