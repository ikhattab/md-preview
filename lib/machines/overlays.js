import { defineMachine } from '../machine.js';

export const mediaViewerMachine = defineMachine({
  id: 'mediaViewer',
  description:
    'The full screen view of a diagram or image. Closing it returns focus to the button or ' +
    'image that opened it.',
  element: '#mediaViewerDialog',
  initial: 'closed',
  context: { trigger: null },
  states: {
    closed: { on: { OPEN: { to: 'open', set: (_, event) => ({ trigger: event.trigger }) } } },
    open: { on: { CLOSE: { to: 'closed', set: () => ({ trigger: null }) } } },
  },
});

const blocked = (_, event) => event.blocked;
const enter = [
  // A dialog is open, so a drop would do nothing.
  { when: blocked },
  { to: 'over', set: (_, event) => ({ allowed: event.allowed }) },
];

export const dropOverlayMachine = defineMachine({
  id: 'dropOverlay',
  description:
    'Dragging a file over the window. The overlay says whether dropping will open it; drags ' +
    'that start inside the page, such as selected text, keep their usual behavior.',
  element: '#dropOverlay (data-state is ready or unsupported while a file is over the window)',
  initial: 'idle',
  context: { allowed: false },
  states: {
    idle: {
      on: {
        DRAG_ENTER: enter,
        INTERNAL_DRAG_START: { to: 'internal' },
      },
    },
    internal: { on: { INTERNAL_DRAG_END: { to: 'idle' } } },
    over: {
      on: {
        DRAG_LEAVE: { to: 'idle' },
        DROP: { to: 'idle' },
      },
    },
  },
});

const forAnchor = (context, event) => context.anchor === event.anchor;

export const tooltipMachine = defineMachine({
  id: 'tooltip',
  description:
    'The tooltip for whatever element with data-tooltip is hovered or focused. It hides when ' +
    'the pointer or focus leaves, and when its element is removed from the page, such as a ' +
    'lint warning icon the gutter redraws.',
  element: '.gutter-tooltip',
  initial: 'hidden',
  context: { anchor: null },
  states: {
    hidden: { on: { SHOW: { to: 'shown', set: (_, event) => ({ anchor: event.anchor }) } } },
    shown: {
      on: {
        SHOW: { set: (_, event) => ({ anchor: event.anchor }) },
        LEAVE: { to: 'hidden', when: forAnchor, set: () => ({ anchor: null }) },
        ANCHOR_REMOVED: { to: 'hidden', set: () => ({ anchor: null }) },
      },
    },
  },
});
