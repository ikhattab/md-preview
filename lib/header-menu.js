import { dom } from './dom.js';
import { MOBILE_BREAKPOINT } from './constants.js';

const { headerMenu, headerMenuBtn } = dom;

function isHeaderMenuOpen() {
  return headerMenu.classList.contains('open');
}

function openHeaderMenu() {
  headerMenu.classList.add('open');
  headerMenuBtn.setAttribute('aria-expanded', 'true');
}

export function closeHeaderMenu({ returnFocus = false } = {}) {
  if (!isHeaderMenuOpen()) return;
  headerMenu.classList.remove('open');
  headerMenuBtn.setAttribute('aria-expanded', 'false');
  if (returnFocus) {
    headerMenuBtn.focus();
  }
}

/**
 * On mobile the header controls live in a panel behind the "More options" button.
 * On desktop the button is hidden and the panel is laid out inline.
 */
export function bindHeaderMenuListeners() {
  if (!headerMenu || !headerMenuBtn) return;

  headerMenuBtn.addEventListener('click', () => {
    if (isHeaderMenuOpen()) {
      closeHeaderMenu();
    } else {
      openHeaderMenu();
    }
  });

  // Toggles and the Export submenu keep the panel open; other actions close it. This runs in
  // the capture phase so focus is back on the menu button before an action opens a dialog,
  // and the dialog returns focus there when it closes.
  headerMenu.addEventListener(
    'click',
    (e) => {
      const control = e.target.closest('button, a');
      if (!isHeaderMenuOpen() || !control || control.matches('[aria-pressed], [aria-haspopup]')) {
        return;
      }
      closeHeaderMenu({ returnFocus: true });
    },
    true
  );

  headerMenu.addEventListener('focusout', (e) => {
    const next = e.relatedTarget;
    if (next && next !== headerMenuBtn && !headerMenu.contains(next)) {
      closeHeaderMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (!isHeaderMenuOpen()) return;
    if (headerMenu.contains(e.target) || headerMenuBtn.contains(e.target)) return;
    closeHeaderMenu();
  });

  document.addEventListener('keydown', (e) => {
    // The Export submenu handles Escape first and marks the event as handled.
    if (e.key !== 'Escape' || e.defaultPrevented || !isHeaderMenuOpen()) return;
    e.preventDefault();
    closeHeaderMenu({ returnFocus: true });
  });

  window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).addEventListener('change', () => {
    closeHeaderMenu();
  });
}
