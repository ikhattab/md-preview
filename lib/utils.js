/**
 * Debounce function to limit how often a function is called
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Escape HTML for safe insertion into the DOM
 */
export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Throttle function to limit how often a function is called
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Count lines in a string without allocating a split array
 */
export function countLines(text) {
  if (!text) return 1;
  let count = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}

export function slugifyFilename(filename) {
  const base = filename.replace(/\.[^.]+$/, '');
  const slug = base
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 50);
  return slug || 'export';
}

// Chromium reports "macOS" in userAgentData and "MacIntel" in navigator.platform, and the two can
// disagree when the user agent is emulated, so any Apple signal counts.
const isApplePlatform = [navigator.userAgentData?.platform, navigator.platform].some((value) =>
  /mac|iphone|ipad/i.test(value ?? '')
);

/** Whether the platform's shortcut modifier (Cmd on Apple devices, Ctrl elsewhere) is held. */
export function hasShortcutModifier(event) {
  return isApplePlatform ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
}

/** Display form of a shortcut key for tooltips, such as "⌘O" or "Ctrl+O". */
export function formatShortcut(key) {
  return isApplePlatform ? `⌘${key}` : `Ctrl+${key}`;
}

/** Value for `aria-keyshortcuts`, such as "Meta+O" or "Control+O". */
export function ariaShortcut(key) {
  return `${isApplePlatform ? 'Meta' : 'Control'}+${key}`;
}
