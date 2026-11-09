import { createMachine, reflectState } from './machine.js';
import { tooltipMachine } from './machines/overlays.js';

const VIEWPORT_PAD = 8;
const GAP = 8;

let tooltipEl = null;
let tooltipsBound = false;

// The tooltip's states and events are in lib/machines/overlays.js.
const tooltipFlow = createMachine(tooltipMachine);

function getTooltipElement() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'gutter-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
    reflectState(tooltipFlow, tooltipEl);
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function measureTooltip(tooltip) {
  tooltip.classList.add('visible');
  tooltip.style.visibility = 'hidden';
  tooltip.style.left = '0';
  tooltip.style.top = '0';
  tooltip.style.transform = 'none';
  const { width, height } = tooltip.getBoundingClientRect();
  tooltip.style.visibility = '';
  return { width, height };
}

function positionTooltip(anchor, tooltip) {
  const anchorRect = anchor.getBoundingClientRect();
  const { width: tw, height: th } = measureTooltip(tooltip);
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  tooltip.style.transform = 'none';

  if (anchor.classList.contains('line-error-icon')) {
    let left = anchorRect.right + GAP;
    if (left + tw > vw - VIEWPORT_PAD) {
      left = anchorRect.left - GAP - tw;
    }
    left = clamp(left, VIEWPORT_PAD, vw - tw - VIEWPORT_PAD);

    let top = anchorRect.top + anchorRect.height / 2 - th / 2;
    top = clamp(top, VIEWPORT_PAD, vh - th - VIEWPORT_PAD);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    return;
  }

  let left = anchorRect.left + anchorRect.width / 2 - tw / 2;
  left = clamp(left, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, vw - tw - VIEWPORT_PAD));

  let top = anchorRect.top - GAP - th;
  if (top < VIEWPORT_PAD) {
    top = anchorRect.bottom + GAP;
  }
  top = clamp(top, VIEWPORT_PAD, Math.max(VIEWPORT_PAD, vh - th - VIEWPORT_PAD));

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

// Watches for the shown tooltip's element leaving the page, which fires no mouseout or focusout.
const removalObserver = new MutationObserver(() => {
  if (!tooltipFlow.context.anchor?.isConnected) tooltipFlow.send('ANCHOR_REMOVED');
});

tooltipFlow.subscribe(({ value, context }, previous) => {
  const el = getTooltipElement();
  if (value === 'hidden') {
    el.classList.remove('visible');
    removalObserver.disconnect();
    return;
  }
  el.textContent = context.anchor.getAttribute('data-tooltip');
  positionTooltip(context.anchor, el);
  el.classList.add('visible');
  if (previous.value === 'hidden') {
    removalObserver.observe(document.body, { childList: true, subtree: true });
  }
});

function repositionActiveTooltip() {
  if (tooltipFlow.matches('shown')) {
    positionTooltip(tooltipFlow.context.anchor, getTooltipElement());
  }
}

export function showTooltip(anchor) {
  const message = anchor.getAttribute('data-tooltip');
  // Rows in the open header menu already show their label as text.
  if (!message || anchor.closest('.header-menu.open')) return;
  tooltipFlow.send({ type: 'SHOW', anchor });
}

export function hideTooltip(anchor = tooltipFlow.context.anchor) {
  tooltipFlow.send({ type: 'LEAVE', anchor });
}

/**
 * Show fixed-position tooltips for any element with a data-tooltip attribute.
 */
export function initTooltips() {
  if (tooltipsBound) return;
  tooltipsBound = true;

  document.addEventListener(
    'mouseover',
    (e) => {
      const el = e.target.closest('[data-tooltip]');
      if (el) showTooltip(el);
    },
    true
  );

  document.addEventListener(
    'mouseout',
    (e) => {
      const el = e.target.closest('[data-tooltip]');
      if (el && !el.contains(e.relatedTarget)) {
        hideTooltip(el);
      }
    },
    true
  );

  document.addEventListener('focusin', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (el) showTooltip(el);
  });

  document.addEventListener('focusout', (e) => {
    const el = e.target.closest('[data-tooltip]');
    if (el && !el.contains(e.relatedTarget)) {
      hideTooltip(el);
    }
  });

  document.addEventListener('scroll', repositionActiveTooltip, true);
  window.addEventListener('resize', repositionActiveTooltip);
}
