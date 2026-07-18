import { dom } from './dom.js';
import { STORAGE_KEYS } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { syncHljsThemeStyles } from './lazy-vendors.js';
import { prepareMermaidForRerender, renderMermaidDiagrams } from './preview.js';

const { html } = dom;

export function setTheme(theme) {
  html.setAttribute('data-theme', theme);
  setStorageItem(STORAGE_KEYS.THEME, theme);

  syncHljsThemeStyles(theme === 'dark');

  prepareMermaidForRerender();
  renderMermaidDiagrams();
}

export function toggleTheme() {
  const currentTheme = html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
}

export function loadTheme() {
  const savedTheme = getStorageItem(STORAGE_KEYS.THEME);

  if (savedTheme) {
    setTheme(savedTheme);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setTheme(prefersDark ? 'dark' : 'light');
  }
}

export function applyThemeVisual(theme) {
  html.setAttribute('data-theme', theme);
  syncHljsThemeStyles(theme === 'dark');
}

export function getCurrentTheme() {
  return html.getAttribute('data-theme') || 'light';
}
