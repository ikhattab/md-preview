import { dom } from './dom.js';
import { iconEl, Icons, labelIconButton, renderStaticIcons } from './icons.js';

const { mediaViewerDialog, mediaViewerStage, mediaViewerClose } = dom;

let lastTrigger = null;

function clearStage() {
  if (mediaViewerStage) {
    mediaViewerStage.innerHTML = '';
  }
}

function closeMediaViewer() {
  if (mediaViewerDialog?.open) {
    mediaViewerDialog.close();
  }
}

function handleDialogClick(e) {
  if (e.target === mediaViewerDialog) {
    closeMediaViewer();
  }
}

function handleDialogClose() {
  clearStage();
  if (lastTrigger && typeof lastTrigger.focus === 'function') {
    lastTrigger.focus();
  }
  lastTrigger = null;
}

/**
 * Clone a rendered mermaid SVG for the lightbox. Mermaid scopes node styles to the
 * root SVG id in an embedded <style> block — keep a unique id and rewrite selectors.
 */
function cloneMermaidSvgForViewer(svg) {
  const clone = svg.cloneNode(true);
  const sourceId = svg.getAttribute('id');

  if (sourceId) {
    const viewerId = `${sourceId}-viewer`;
    clone.setAttribute('id', viewerId);
    const styleEl = clone.querySelector('style');
    if (styleEl?.textContent) {
      styleEl.textContent = styleEl.textContent.split(sourceId).join(viewerId);
    }
  }

  clone.style.maxWidth = '100%';
  clone.style.height = 'auto';
  return clone;
}

/**
 * Open a full-viewport lightbox for a mermaid diagram or preview image.
 */
export function openMediaViewer({ type, sourceEl, triggerEl }) {
  if (!mediaViewerDialog || !mediaViewerStage || !sourceEl) return;

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

  lastTrigger = triggerEl || sourceEl;
  mediaViewerDialog.showModal();
}

export function initMediaViewer() {
  if (!mediaViewerDialog) return;

  if (mediaViewerClose && !mediaViewerClose.querySelector('svg')) {
    mediaViewerClose.appendChild(iconEl(Icons.X, { width: 24, height: 24 }));
    labelIconButton(mediaViewerClose, 'Close full size preview');
  }

  mediaViewerClose?.addEventListener('click', () => closeMediaViewer());
  mediaViewerDialog.addEventListener('click', handleDialogClick);
  mediaViewerDialog.addEventListener('close', handleDialogClose);

  renderStaticIcons(mediaViewerDialog);
}
