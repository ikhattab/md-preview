import { dom } from './dom.js';
import { STORAGE_KEYS } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { syncHljsThemeStyles } from './lazy-vendors.js';
import { createMachine, reflectState } from './machine.js';
import { readerTheme, shownTheme, themeMachine } from './machines/theme.js';

const { html } = dom;

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function getSystemTheme() {
  return systemDark.matches ? 'dark' : 'light';
}

/** @type {ReturnType<typeof createMachine> | null} */
let theme = null;

function showTheme(shown) {
  html.setAttribute('data-theme', shown);
  syncHljsThemeStyles(shown === 'dark');
}

/**
 * Only a theme the reader picked is saved. Until then the app follows the system setting,
 * including when it changes while the app is open.
 */
export function loadTheme() {
  const saved = getStorageItem(STORAGE_KEYS.THEME);
  const chosen = saved === 'light' || saved === 'dark' ? saved : null;
  theme = createMachine(themeMachine, {
    value: chosen ? 'chosen' : 'system',
    context: { system: getSystemTheme(), chosen },
  });
  reflectState(theme, html, { attribute: 'themeState' });
  showTheme(shownTheme(theme.context));

  theme.subscribe((state, previous, event) => {
    const shown = shownTheme(state.context);
    if (shown !== shownTheme(previous.context)) showTheme(shown);
    if (event.type === 'TOGGLE') setStorageItem(STORAGE_KEYS.THEME, state.context.chosen);
  });
  systemDark.addEventListener('change', () => {
    theme.send({ type: 'SYSTEM_CHANGED', theme: getSystemTheme() });
  });
}

export function toggleTheme() {
  theme.send('TOGGLE');
}

/** The reader's theme, ignoring any export in progress. */
export function getCurrentTheme() {
  return theme ? readerTheme(theme.context) : 'light';
}

/** Shows `exportTheme` on the page until `endExportTheme()`. */
export function showExportTheme(exportTheme) {
  theme.send({ type: 'OVERRIDE', theme: exportTheme });
}

export function endExportTheme() {
  theme.send('CLEAR_OVERRIDE');
}
