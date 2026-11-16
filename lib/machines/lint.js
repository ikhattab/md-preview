import { defineMachine } from '../machine.js';

export const lintMachine = defineMachine({
  id: 'lint',
  description:
    'Checking the markdown for common problems, when turned on (saved). Results arrive a ' +
    'moment after typing stops and show in the gutter and the lint panel.',
  element: '#lintToggle',
  initial: 'off',
  context: { warnings: [] },
  states: {
    off: { on: { TOGGLE: { to: 'on' } } },
    on: {
      on: {
        TOGGLE: { to: 'off', set: () => ({ warnings: [] }) },
        RESULTS: { set: (_, event) => ({ warnings: event.warnings }) },
      },
    },
  },
});
