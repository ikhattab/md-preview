import { dom } from './dom.js';
import { STORAGE_KEYS } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { syncHljsThemeStyles } from './lazy-vendors.js';

const { html } = dom;

const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

function getSystemTheme() {
  return systemDark.matches ? 'dark' : 'light';
}

export function toggleTheme() {
  const newTheme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
  applyThemeVisual(newTheme);
  setStorageItem(STORAGE_KEYS.THEME, newTheme);
}

/**
 * Only a theme the reader picked is saved. Until then the app follows the system setting,
 * including when it changes while the app is open.
 */
export function loadTheme() {
  applyThemeVisual(getStorageItem(STORAGE_KEYS.THEME) || getSystemTheme());
  systemDark.addEventListener('change', () => {
    if (!getStorageItem(STORAGE_KEYS.THEME)) applyThemeVisual(getSystemTheme());
  });
}

export function applyThemeVisual(theme) {
  html.setAttribute('data-theme', theme);
  syncHljsThemeStyles(theme === 'dark');
}

export function getCurrentTheme() {
  return html.getAttribute('data-theme') || 'light';
}
