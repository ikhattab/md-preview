import { dom } from './dom.js';
import { STORAGE_KEYS, LINT_DEBOUNCE_DELAY } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { debounce } from './utils.js';
import { updateLineGutter, resetGutterCache } from './gutter.js';
import { iconEl, Icons } from './icons.js';

const { editor, lintToggle, lintCount, lintPanel, lintList } = dom;

let lintEnabled = false;
let currentLintWarnings = [];

const LINT_RULES = [
  {
    id: 'MD009',
    name: 'Trailing spaces',
    check: (lines) => {
      const warnings = [];
      lines.forEach((line, i) => {
        if (/[ \t]+$/.test(line) && !/  $/.test(line)) {
          warnings.push({ line: i + 1, message: 'Trailing spaces' });
        }
      });
      return warnings;
    },
  },
  {
    id: 'MD010',
    name: 'Hard tabs',
    check: (lines) => {
      const warnings = [];
      lines.forEach((line, i) => {
        if (/\t/.test(line)) {
          warnings.push({ line: i + 1, message: 'Hard tabs used instead of spaces' });
        }
      });
      return warnings;
    },
  },
  {
    id: 'MD012',
    name: 'Multiple blank lines',
    check: (lines) => {
      const warnings = [];
      let blankCount = 0;
      lines.forEach((line, i) => {
        if (line.trim() === '') {
          blankCount++;
          if (blankCount > 1) {
            warnings.push({ line: i + 1, message: 'Multiple consecutive blank lines' });
          }
        } else {
          blankCount = 0;
        }
      });
      return warnings;
    },
  },
  {
    id: 'MD018',
    name: 'No space after hash',
    check: (lines) => {
      const warnings = [];
      lines.forEach((line, i) => {
        if (/^#{1,6}[^#\s]/.test(line.trim())) {
          warnings.push({ line: i + 1, message: 'No space after hash on heading' });
        }
      });
      return warnings;
    },
  },
  {
    id: 'MD022',
    name: 'Heading blank lines',
    check: (lines) => {
      const warnings = [];
      lines.forEach((line, i) => {
        if (/^#{1,6}\s/.test(line.trim())) {
          if (i > 0 && lines[i - 1].trim() !== '') {
            warnings.push({ line: i + 1, message: 'Heading should have blank line before' });
          }
          if (i < lines.length - 1 && lines[i + 1].trim() !== '') {
            warnings.push({ line: i + 1, message: 'Heading should have blank line after' });
          }
        }
      });
      return warnings;
    },
  },
  {
    id: 'MD047',
    name: 'End with newline',
    check: (lines, content) => {
      if (content.length > 0 && !content.endsWith('\n')) {
        return [{ line: lines.length, message: 'File should end with newline' }];
      }
      return [];
    },
  },
  {
    id: 'MD037',
    name: 'Spaces in emphasis',
    check: (lines) => {
      const warnings = [];
      lines.forEach((line, i) => {
        if (/(?<!\*)\*\s+[^*]+\s+\*(?!\*)/.test(line) || /(?<!_)_\s+[^_]+\s+_(?!_)/.test(line)) {
          warnings.push({ line: i + 1, message: 'Spaces inside emphasis markers' });
        } else if (
          /\*\*\s+(?:(?!\*\*).)+\s+\*\*/.test(line) ||
          /__\s+(?:(?!__).)+\s+__/.test(line)
        ) {
          warnings.push({ line: i + 1, message: 'Spaces inside bold markers' });
        }
      });
      return warnings;
    },
  },
  {
    id: 'MD041',
    name: 'First line heading',
    check: (lines) => {
      const firstNonEmpty = lines.find((line) => line.trim() !== '');
      if (firstNonEmpty && !/^#\s/.test(firstNonEmpty)) {
        const lineNum = lines.indexOf(firstNonEmpty) + 1;
        return [{ line: lineNum, message: 'First line should be a top-level heading' }];
      }
      return [];
    },
  },
];

export function runLinter(content) {
  const lines = content.split('\n');
  const allWarnings = [];

  LINT_RULES.forEach((rule) => {
    const warnings = rule.check(lines, content);
    warnings.forEach((w) => {
      allWarnings.push({
        line: w.line,
        message: `${rule.id}: ${w.message}`,
        ruleId: rule.id,
      });
    });
  });

  allWarnings.sort((a, b) => a.line - b.line);
  return allWarnings;
}

function getLintState() {
  return { lintEnabled, warnings: currentLintWarnings };
}

function setLintTooltip(enabled) {
  if (!lintToggle) return;
  const label = enabled ? 'Lint markdown (on)' : 'Lint markdown (off)';
  lintToggle.title = label;
  lintToggle.setAttribute('data-tooltip', label);
}

function refreshGutter() {
  updateLineGutter(getLintState());
}

function handleLintItemActivate(line) {
  scrollToLine(line);
}

function bindLintItem(li, line) {
  li.setAttribute('role', 'button');
  li.setAttribute('tabindex', '0');
  li.addEventListener('click', () => handleLintItemActivate(line));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleLintItemActivate(line);
    }
  });
}

export function updateLintUI(warnings) {
  currentLintWarnings = warnings;

  if (lintToggle) {
    lintToggle.classList.toggle('has-warnings', warnings.length > 0);
  }

  if (lintCount) {
    lintCount.textContent = warnings.length > 0 ? warnings.length : '';
  }

  if (lintList) {
    lintList.innerHTML = '';
    if (warnings.length === 0 && lintEnabled) {
      const li = document.createElement('li');
      li.className = 'lint-item';

      const iconSpan = document.createElement('span');
      iconSpan.className = 'lint-item-icon';
      iconSpan.setAttribute('aria-hidden', 'true');
      iconSpan.style.color = 'var(--link-color)';
      iconSpan.appendChild(iconEl(Icons.CircleCheck, { width: 14, height: 14 }));

      const srOnly = document.createElement('span');
      srOnly.className = 'sr-only';
      srOnly.textContent = 'No issues found.';

      const message = document.createElement('span');
      message.className = 'lint-item-message';
      message.style.color = 'var(--text-muted)';
      message.textContent = 'No issues found';

      li.append(iconSpan, srOnly, message);
      lintList.appendChild(li);
    } else {
      warnings.forEach((warning) => {
        const li = document.createElement('li');
        li.className = 'lint-item';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'lint-item-icon';
        iconSpan.setAttribute('aria-hidden', 'true');
        iconSpan.appendChild(iconEl(Icons.TriangleAlert, { width: 14, height: 14 }));

        const srOnly = document.createElement('span');
        srOnly.className = 'sr-only';
        srOnly.textContent = `Warning on line ${warning.line}: ${warning.message}`;

        const lineSpan = document.createElement('span');
        lineSpan.className = 'lint-item-line';
        lineSpan.textContent = `L${warning.line}`;

        const messageSpan = document.createElement('span');
        messageSpan.className = 'lint-item-message';
        messageSpan.textContent = warning.message;

        li.append(iconSpan, srOnly, lineSpan, messageSpan);
        bindLintItem(li, warning.line);
        lintList.appendChild(li);
      });
    }
  }

  if (lintPanel && lintEnabled) {
    lintPanel.classList.add('visible');
  }

  refreshGutter();
}

export function scrollToLine(lineNumber) {
  if (!editor) return;

  const lines = editor.value.split('\n');
  let charIndex = 0;

  for (let i = 0; i < lineNumber - 1 && i < lines.length; i++) {
    charIndex += lines[i].length + 1;
  }

  editor.focus();
  editor.setSelectionRange(charIndex, charIndex);

  const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 24;
  const targetScroll = (lineNumber - 1) * lineHeight - editor.clientHeight / 3;
  editor.scrollTop = Math.max(0, targetScroll);
}

export function toggleLint() {
  lintEnabled = !lintEnabled;
  setStorageItem(STORAGE_KEYS.LINT_ENABLED, lintEnabled ? 'true' : 'false');

  if (lintToggle) {
    if (lintEnabled) {
      lintToggle.classList.add('active');
      setLintTooltip(true);
      updateLintUI(runLinter(editor.value));
    } else {
      lintToggle.classList.remove('active');
      lintToggle.classList.remove('has-warnings');
      setLintTooltip(false);
      if (lintCount) lintCount.textContent = '';
      if (lintPanel) lintPanel.classList.remove('visible');
      currentLintWarnings = [];
      resetGutterCache();
      refreshGutter();
    }
    lintToggle.setAttribute('aria-pressed', lintEnabled ? 'true' : 'false');
  }
}

export function loadLintPreference() {
  const savedState = getStorageItem(STORAGE_KEYS.LINT_ENABLED);
  lintEnabled = savedState === 'true';

  if (lintToggle) {
    lintToggle.classList.toggle('active', lintEnabled);
    setLintTooltip(lintEnabled);
    lintToggle.setAttribute('aria-pressed', lintEnabled ? 'true' : 'false');
  }
}

export function isLintEnabled() {
  return lintEnabled;
}

export function getCurrentLintWarnings() {
  return currentLintWarnings;
}

export const debouncedLint = debounce((content) => {
  if (!lintEnabled) return;
  updateLintUI(runLinter(content));
}, LINT_DEBOUNCE_DELAY);

export function runInitialLint() {
  if (!lintEnabled || !editor) return;
  updateLintUI(runLinter(editor.value));
}

export function refreshGutterFromLint() {
  refreshGutter();
}
