import { dom } from './dom.js';
import { iconEl, Icons, labelIconButton, renderStaticIcons } from './icons.js';
import { createMachine, reflectState } from './machine.js';
import { mediaViewerMachine } from './machines/overlays.js';

const { mediaViewerDialog, mediaViewerStage, mediaViewerClose } = dom;

// The viewer's states and events are in lib/machines/overlays.js.
const viewer = createMachine(mediaViewerMachine);
reflectState(viewer, mediaViewerDialog);
viewer.subscribe(({ value }, previous) => {
  if (value === 'open') {
    if (!mediaViewerDialog.open) mediaViewerDialog.showModal();
    return;
  }
  if (mediaViewerDialog.open) mediaViewerDialog.close();
  clearStage();
  previous.context.trigger?.focus?.();
});

function clearStage() {
  if (mediaViewerStage) {
    mediaViewerStage.innerHTML = '';
  }
}

function closeMediaViewer() {
  viewer.send('CLOSE');
}

function handleDialogClick(e) {
  if (e.target === mediaViewerDialog) {
    closeMediaViewer();
  }
}

/**
 * Clone a rendered diagram SVG for the lightbox. Its only ids are for its accessible title and
 * description, which the original still provides, so drop them to keep ids unique.
 */
function cloneMermaidSvgForViewer(svg) {
  const clone = svg.cloneNode(true);
  clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

  clone.style.maxWidth = '100%';
  clone.style.height = 'auto';
  return clone;
}

/**
 * Open a full-viewport lightbox for a mermaid diagram or preview image.
 */
export function openMediaViewer({ type, sourceEl, triggerEl }) {
  if (!mediaViewerDialog || !mediaViewerStage || !sourceEl || !viewer.matches('closed')) return;

  clearStage();

  if (type === 'mermaid') {
    const svg = sourceEl.querySelector('svg');
    if (!svg) return;
    mediaViewerStage.appendChild(cloneMermaidSvgForViewer(svg));
    const label = sourceEl.dataset.mermaidSource ? 'Mermaid diagram' : 'Diagram';
    mediaViewerDialog.setAttribute('aria-label', label);
  } else if (type === 'image') {
    const clone = document.createElement('img');
    clone.src = sourceEl.currentSrc || sourceEl.src;
    clone.alt = sourceEl.alt || '';
    if (sourceEl.title) clone.title = sourceEl.title;
    mediaViewerStage.appendChild(clone);
    mediaViewerDialog.setAttribute(
      'aria-label',
      sourceEl.alt?.trim() ? sourceEl.alt.trim() : 'Image preview'
    );
  } else {
    return;
  }

  viewer.send({ type: 'OPEN', trigger: triggerEl || sourceEl });
}

export function initMediaViewer() {
  if (!mediaViewerDialog) return;

  if (mediaViewerClose && !mediaViewerClose.querySelector('svg')) {
    mediaViewerClose.appendChild(iconEl(Icons.X, { width: 24, height: 24 }));
    labelIconButton(mediaViewerClose, 'Close full size preview');
  }

  mediaViewerClose?.addEventListener('click', () => closeMediaViewer());
  mediaViewerDialog.addEventListener('click', handleDialogClick);
  // Escape closes the dialog directly.
  mediaViewerDialog.addEventListener('close', closeMediaViewer);

  renderStaticIcons(mediaViewerDialog);
}
