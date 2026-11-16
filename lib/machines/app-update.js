import { defineMachine } from '../machine.js';

export const appUpdateMachine = defineMachine({
  id: 'appUpdate',
  description:
    'Keeping the installed app up to date through the service worker. A new version waits ' +
    'until the reader chooses Reload, so a deploy never swaps code under someone mid-edit. If ' +
    'another tab switches to the new version first, this page runs the old one, whose files ' +
    'the new version no longer keeps offline, so it offers a reload too.',
  initial: 'unregistered',
  states: {
    unregistered: {
      on: {
        REGISTERED: [
          { to: 'current', when: (_, event) => event.controlled },
          // A first visit: the worker takes over the page after it has started loading.
          { to: 'installing' },
        ],
      },
    },
    installing: { on: { CONTROLLER_CHANGED: { to: 'current' } } },
    current: {
      on: { UPDATE_READY: { to: 'updateReady' }, CONTROLLER_CHANGED: { to: 'outdated' } },
    },
    updateReady: { on: { RELOAD: { to: 'reloading' }, CONTROLLER_CHANGED: { to: 'outdated' } } },
    outdated: { on: { RELOAD: { to: 'reloading' } } },
    // The new version takes over, and the page reloads when it does.
    reloading: { on: { CONTROLLER_CHANGED: {} } },
  },
});
