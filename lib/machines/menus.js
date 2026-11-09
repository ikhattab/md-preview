import { defineMachine } from '../machine.js';

const menu = {
  initial: 'closed',
  states: {
    closed: { on: { OPEN: { to: 'open' }, TOGGLE: { to: 'open' } } },
    open: { on: { CLOSE: { to: 'closed' }, TOGGLE: { to: 'closed' } } },
  },
};

export const headerMenuMachine = defineMachine({
  id: 'headerMenu',
  description:
    'The "More options" panel that holds the header controls on narrow screens. Toggles and ' +
    'the Export submenu keep it open; other actions, Escape, clicking or tabbing away, and ' +
    'resizing to a wide screen close it.',
  element: '#headerMenu',
  ...menu,
});

export const exportMenuMachine = defineMachine({
  id: 'exportMenu',
  description:
    'The Export menu of formats. Choosing one, Escape, or clicking or tabbing away closes it.',
  element: '#exportMenu',
  ...menu,
});
