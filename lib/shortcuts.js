import { dom } from './dom.js';
import { downloadMarkdown, triggerImport } from './import-export.js';
import { isMobile, toggleCollapse } from './layout.js';
import { ariaShortcut, formatShortcut, hasShortcutModifier } from './utils.js';

const { importBtn, exportMdBtn } = dom;

const SHORTCUTS = {
  o: { run: triggerImport },
  s: { run: downloadMarkdown },
  '\\': {
    run: toggleCollapse,
    // The editor can't be collapsed on mobile; the Editor/Preview tabs take its place.
    enabled: () => !isMobile(),
  },
};

function isModalOpen() {
  return document.querySelector('dialog[open]') !== null;
}

function handleShortcut(event) {
  if (event.altKey || event.shiftKey || !hasShortcutModifier(event)) return;

  const shortcut = SHORTCUTS[event.key.toLowerCase()];
  if (!shortcut || isModalOpen() || shortcut.enabled?.() === false) return;

  // Always claim the key so the browser's own Open and Save page don't take over.
  event.preventDefault();
  if (event.repeat) return;
  shortcut.run();
}

function describe(button, label, key) {
  button.setAttribute('data-tooltip', `${label} (${formatShortcut(key)})`);
  button.setAttribute('aria-keyshortcuts', ariaShortcut(key));
}

export function bindShortcuts() {
  document.addEventListener('keydown', handleShortcut);
  if (importBtn) describe(importBtn, 'Import a file', 'O');
  // The Export menu shows this one as a visible hint instead of a tooltip.
  exportMdBtn?.setAttribute('aria-keyshortcuts', ariaShortcut('S'));
  for (const hint of document.querySelectorAll('[data-shortcut-hint]')) {
    hint.textContent = formatShortcut(hint.dataset.shortcutHint);
  }
}
