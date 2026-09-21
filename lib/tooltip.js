const VIEWPORT_PAD = 8;
const GAP = 8;

let tooltipEl = null;
let tooltipsBound = false;
let activeTooltipEl = null;

function getTooltipElement() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'gutter-tooltip';
    tooltipEl.setAttribute('role', 'tooltip');
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

function repositionActiveTooltip() {
  if (!activeTooltipEl || !tooltipEl) return;
  positionTooltip(activeTooltipEl, tooltipEl);
}

export function showTooltip(anchor) {
  const message = anchor.getAttribute('data-tooltip');
  if (!message) return;

  const tooltip = getTooltipElement();
  tooltip.textContent = message;
  positionTooltip(anchor, tooltip);
  tooltip.classList.add('visible');
  activeTooltipEl = anchor;
}

export function hideTooltip() {
  if (tooltipEl) {
    tooltipEl.classList.remove('visible');
  }
  activeTooltipEl = null;
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
      if (el && activeTooltipEl === el && !el.contains(e.relatedTarget)) {
        hideTooltip();
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
      hideTooltip();
    }
  });

  document.addEventListener('scroll', repositionActiveTooltip, true);
  window.addEventListener('resize', repositionActiveTooltip);
}
