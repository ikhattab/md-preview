import { defineMachine } from '../machine.js';

export const remoteImagesMachine = defineMachine({
  id: 'remoteImages',
  description:
    'Whether the preview blocks images from other sites until the reader chooses to load ' +
    'them (saved). Turning it on or off, or opening another document, forgets which images ' +
    'were let through.',
  element: '#remoteImagesToggle',
  initial: 'off',
  states: {
    off: { on: { TOGGLE: { to: 'blocking' } } },
    blocking: { on: { TOGGLE: { to: 'off' } } },
  },
});
