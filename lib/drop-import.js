import { dom } from './dom.js';
import { createMachine, reflectState } from './machine.js';
import { dropOverlayMachine } from './machines/overlays.js';

const { dropOverlay, dropOverlayTitle, dropOverlayHint } = dom;

// Types we know aren't markdown. Anything else is checked by extension on drop,
// because browsers often report .md files with an empty or generic type.
const UNSUPPORTED_TYPE = /^(image|audio|video|font)\/|^application\/(pdf|zip)$/;

// The overlay's states and events are in lib/machines/overlays.js.
const drag = createMachine(dropOverlayMachine);
reflectState(drag, dropOverlay, {
  describe: ({ value, context }) => {
    if (value !== 'over') return value;
    return context.allowed ? 'ready' : 'unsupported';
  },
});

function isFileDrag(event) {
  return !drag.matches('internal') && (event.dataTransfer?.types.includes('Files') ?? false);
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

function enter(dataTransfer) {
  const { allowed, title, hint } = describeDrag(dataTransfer);
  if (!drag.send({ type: 'DRAG_ENTER', allowed, blocked: isModalOpen() })) return;
  if (!drag.matches('over')) return;
  if (dropOverlayTitle) dropOverlayTitle.textContent = title;
  if (dropOverlayHint) dropOverlayHint.textContent = hint;
}

drag.subscribe(({ value }) => {
  dropOverlay?.classList.toggle('visible', value === 'over');
});

/**
 * Accept files dropped anywhere in the window and pass the first one to `onFile`.
 * While a file is dragged over the page, a full-window overlay shows what will happen.
 */
export function bindDropImport(onFile) {
  document.addEventListener('dragstart', () => drag.send('INTERNAL_DRAG_START'));
  document.addEventListener('dragend', () => drag.send('INTERNAL_DRAG_END'));

  window.addEventListener('dragenter', (e) => {
    if (isFileDrag(e)) enter(e.dataTransfer);
  });

  window.addEventListener('dragover', (e) => {
    if (!isFileDrag(e)) return;
    // Always cancel, so a dropped file never makes the browser navigate away from the app.
    e.preventDefault();
    if (drag.matches('idle')) enter(e.dataTransfer);
    e.dataTransfer.dropEffect = drag.matches('over') && drag.context.allowed ? 'copy' : 'none';
  });

  window.addEventListener('drop', (e) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    const allowed = drag.matches('over') && drag.context.allowed;
    drag.send('DROP');
    if (!allowed || isModalOpen()) return;
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  });

  // The overlay covers the window and its contents ignore pointer events, so it
  // only sees dragleave when the drag leaves the window or is cancelled.
  dropOverlay?.addEventListener('dragleave', () => drag.send('DRAG_LEAVE'));
}
