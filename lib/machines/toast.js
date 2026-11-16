import { defineMachine } from '../machine.js';

/**
 * @typedef {{ id: number, message: string, action: object | null, duration: number }} ToastEntry
 */

const isCurrent = (context, event) => context.current?.id === event.id;
const isSuspended = (context, event) => context.suspended?.id === event.id;
const hasSuspended = (context) => context.suspended !== null;

// A toast with an action, such as Undo, is an offer the reader could still want. When another
// toast replaces it, the latest such offer waits and comes back once the newer toast is gone.
const show = {
  to: 'shown',
  set: (context, event) => ({
    current: event.toast,
    suspended: context.current?.action ? context.current : context.suspended,
  }),
};

// Ends the current toast: the waiting offer comes back if there is one.
const end = (guard) => [
  {
    to: 'shown',
    when: (context, event) => guard(context, event) && hasSuspended(context),
    set: (context) => ({ current: context.suspended, suspended: null }),
  },
  { to: 'hidden', when: guard, set: () => ({ current: null }) },
];

const forgetSuspended = {
  when: isSuspended,
  set: () => ({ suspended: null }),
};

export const toastMachine = defineMachine({
  id: 'toast',
  description:
    'The status message at the bottom of the window. It hides after a while unless the ' +
    "reader is pointing at or tabbing through it. A toast with an action isn't lost when " +
    'another one arrives: it comes back once the newer toast is gone.',
  element: '#mdToast',
  initial: 'hidden',
  context: { current: null, suspended: null },
  states: {
    hidden: { on: { SHOW: show } },
    shown: {
      on: {
        SHOW: show,
        HOLD: { to: 'held' },
        TIMEOUT: end(isCurrent),
        DISMISS: [...end(isCurrent), forgetSuspended],
      },
    },
    held: {
      on: {
        // Still held: the reader is pointing at or tabbing through the toast.
        SHOW: { ...show, to: 'held' },
        RELEASE: { to: 'shown' },
        DISMISS: [...end(isCurrent), forgetSuspended],
      },
    },
  },
});
