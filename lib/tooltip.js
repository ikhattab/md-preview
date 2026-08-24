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

function positionTooltip(anchor, tooltip) {
  const rect = anchor.getBoundingClientRect();

  if (anchor.classList.contains('line-error-icon')) {
    tooltip.style.left = `${rect.right + 8}px`;
    tooltip.style.top = `${rect.top + rect.height / 2}px`;
    tooltip.style.transform = 'translateY(-50%)';
    return;
  }

  tooltip.style.left = `${rect.left + rect.width / 2}px`;
  tooltip.style.top = `${rect.top - 8}px`;
  tooltip.style.transform = 'translate(-50%, -100%)';
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
}
