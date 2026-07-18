import { dom } from './dom.js';

const { editor, lineGutter } = dom;

const WARNING_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';

let lastGutterLineCount = 0;
let lastGutterErrorSig = '';
let gutterTooltip = null;
let gutterTooltipsBound = false;

function buildErrorMap(warnings) {
  const errorMap = new Map();
  warnings.forEach((w) => {
    const existing = errorMap.get(w.line);
    if (existing) {
      errorMap.set(w.line, `${existing}\n${w.message}`);
    } else {
      errorMap.set(w.line, w.message);
    }
  });
  return errorMap;
}

function buildErrorSig(errorMap) {
  if (errorMap.size === 0) return '';
  return [...errorMap.entries()].map(([line, msg]) => `${line}:${msg}`).join('|');
}

function getGutterTooltip() {
  if (!gutterTooltip) {
    gutterTooltip = document.createElement('div');
    gutterTooltip.className = 'gutter-tooltip';
    gutterTooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(gutterTooltip);
  }
  return gutterTooltip;
}

function showGutterTooltip(icon) {
  const tooltip = getGutterTooltip();
  const message = icon.getAttribute('data-tooltip');
  if (!message) return;

  tooltip.textContent = message;
  tooltip.classList.add('visible');

  const rect = icon.getBoundingClientRect();
  tooltip.style.left = `${rect.right + 8}px`;
  tooltip.style.top = `${rect.top + rect.height / 2}px`;
  tooltip.style.transform = 'translateY(-50%)';
}

function hideGutterTooltip() {
  if (gutterTooltip) {
    gutterTooltip.classList.remove('visible');
  }
}

export function initGutterTooltips() {
  if (!lineGutter || gutterTooltipsBound) return;
  gutterTooltipsBound = true;

  lineGutter.addEventListener(
    'mouseover',
    (e) => {
      const icon = e.target.closest('.line-error-icon');
      if (icon) showGutterTooltip(icon);
    },
    true
  );

  lineGutter.addEventListener(
    'mouseout',
    (e) => {
      const icon = e.target.closest('.line-error-icon');
      if (icon && !icon.contains(e.relatedTarget)) {
        hideGutterTooltip();
      }
    },
    true
  );

  lineGutter.addEventListener('focusin', (e) => {
    const icon = e.target.closest('.line-error-icon');
    if (icon) showGutterTooltip(icon);
  });

  lineGutter.addEventListener('focusout', (e) => {
    const icon = e.target.closest('.line-error-icon');
    if (icon) hideGutterTooltip();
  });
}

/**
 * Update line number gutter with line numbers and error indicators
 */
export function updateLineGutter({ lintEnabled, warnings }) {
  if (!lineGutter || !editor) return;

  const content = editor.value;
  let lineCount = 1;
  for (let i = 0; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) lineCount++;
  }

  const errorMap = lintEnabled && warnings.length > 0 ? buildErrorMap(warnings) : new Map();
  const errorSig = buildErrorSig(errorMap);

  if (lineCount === lastGutterLineCount && errorSig === lastGutterErrorSig) {
    return;
  }

  lastGutterLineCount = lineCount;
  lastGutterErrorSig = errorSig;

  let gutterHTML = '';
  for (let i = 1; i <= lineCount; i++) {
    const errorMsg = errorMap.get(i);
    const hasError = !!errorMsg;
    gutterHTML += `<div class="line-number${hasError ? ' has-error' : ''}">`;
    if (hasError) {
      const escapedMsg = errorMsg
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      gutterHTML += `<span class="line-error-icon" data-tooltip="${escapedMsg}" tabindex="0" role="img" aria-label="Lint warning on line ${i}">${WARNING_SVG}</span>`;
    }
    gutterHTML += `<span class="line-number-text">${i}</span></div>`;
  }

  lineGutter.innerHTML = gutterHTML;
}

export function resetGutterCache() {
  lastGutterLineCount = 0;
  lastGutterErrorSig = '';
}

export function syncGutterScroll() {
  if (lineGutter && editor) {
    lineGutter.scrollTop = editor.scrollTop;
  }
}
