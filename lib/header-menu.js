import { dom } from './dom.js';
import { MOBILE_BREAKPOINT } from './constants.js';
import { createMachine, reflectState } from './machine.js';
import { headerMenuMachine } from './machines/menus.js';

const { headerMenu, headerMenuBtn } = dom;

// The menu's states and events are in lib/machines/menus.js.
const menu = createMachine(headerMenuMachine);
reflectState(menu, headerMenu);
menu.subscribe(({ value }) => {
  const open = value === 'open';
  headerMenu?.classList.toggle('open', open);
  headerMenuBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
});

export function closeHeaderMenu({ returnFocus = false } = {}) {
  if (menu.send('CLOSE') && returnFocus) {
    headerMenuBtn.focus();
  }
}

/**
 * On mobile the header controls live in a panel behind the "More options" button.
 * On desktop the button is hidden and the panel is laid out inline.
 */
export function bindHeaderMenuListeners() {
  if (!headerMenu || !headerMenuBtn) return;

  headerMenuBtn.addEventListener('click', () => menu.send('TOGGLE'));

  // Toggles and the Export submenu keep the panel open; other actions close it. This runs in
  // the capture phase so focus is back on the menu button before an action opens a dialog,
  // and the dialog returns focus there when it closes.
  headerMenu.addEventListener(
    'click',
    (e) => {
      const control = e.target.closest('button, a');
      if (!control || control.matches('[aria-pressed], [aria-haspopup]')) return;
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
    if (headerMenu.contains(e.target) || headerMenuBtn.contains(e.target)) return;
    closeHeaderMenu();
  });

  // The Export submenu inside handles its own Escape first and marks the event as handled.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented || !menu.matches('open')) return;
    e.preventDefault();
    closeHeaderMenu({ returnFocus: true });
  });

  window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).addEventListener('change', () => {
    closeHeaderMenu();
  });
}
