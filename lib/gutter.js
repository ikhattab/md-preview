import { dom } from './dom.js';
import { iconEl, Icons } from './icons.js';

const { editor, lineGutter } = dom;

let lastGutterLineCount = 0;
let lastGutterErrorSig = '';

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

function appendGutterWarningIcons() {
  lineGutter?.querySelectorAll('.line-error-icon').forEach((icon) => {
    if (icon.querySelector('svg')) return;
    icon.appendChild(iconEl(Icons.TriangleAlert, { width: 12, height: 12 }));
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
      gutterHTML += `<span class="line-error-icon" data-tooltip="${escapedMsg}" tabindex="0" role="img" aria-label="Lint warning on line ${i}"></span>`;
    }
    gutterHTML += `<span class="line-number-text">${i}</span></div>`;
  }

  lineGutter.innerHTML = gutterHTML;
  appendGutterWarningIcons();
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
