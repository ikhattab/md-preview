import { defineMachine } from '../machine.js';

const autoCollapseAllowed = (context) => context.autoCollapse;
const collapsedForReading = (context) => context.collapsedForReading;
const resized = { set: (_, event) => ({ width: event.width }) };

export const editorPaneMachine = defineMachine({
  id: 'editorPane',
  description:
    'The editor beside the preview on wide screens: open, or collapsed so the preview fills ' +
    'the window. Importing a file or pasting a whole document collapses it for reading, ' +
    'unless the reader reopened it after that before, which means they want to edit. Both the ' +
    'state and the width are saved.',
  element: '#editorPane',
  initial: 'open',
  context: { width: null, autoCollapse: true, collapsedForReading: false },
  states: {
    open: {
      on: {
        TOGGLE: { to: 'collapsed', set: () => ({ collapsedForReading: false }) },
        SHOW_FOR_READING: {
          to: 'collapsed',
          when: autoCollapseAllowed,
          set: () => ({ collapsedForReading: true }),
        },
        RESIZED: resized,
      },
    },
    collapsed: {
      on: {
        TOGGLE: [
          // Reopened right after a collapse for reading: later ones leave it open.
          {
            to: 'open',
            when: collapsedForReading,
            set: () => ({ collapsedForReading: false, autoCollapse: false }),
          },
          { to: 'open' },
        ],
        // Undoing an import puts back the editor that the import collapsed.
        RESTORE: {
          to: 'open',
          when: collapsedForReading,
          set: () => ({ collapsedForReading: false }),
        },
      },
    },
  },
});

export const mobileViewMachine = defineMachine({
  id: 'mobileView',
  description:
    'Which pane a narrow screen shows: the editor or the preview, chosen with the tabs and ' +
    'saved. Wide screens show both and ignore it.',
  element: '#mobileViewSwitcher',
  initial: 'editor',
  states: {
    editor: { on: { SHOW_PREVIEW: { to: 'preview' } } },
    preview: { on: { SHOW_EDITOR: { to: 'editor' } } },
  },
});

export const resizeMachine = defineMachine({
  id: 'resize',
  description:
    'Dragging the handle between the editor and the preview. A cancelled drag, such as an ' +
    'interrupted touch, puts the width back.',
  element: '#resizeHandle',
  initial: 'idle',
  context: { startX: 0, startWidth: 0, width: 0 },
  states: {
    idle: {
      on: {
        START: {
          to: 'dragging',
          set: (_, event) => ({ startX: event.x, startWidth: event.width, width: event.width }),
        },
      },
    },
    dragging: {
      on: {
        MOVE: {
          set: (context, event) => ({
            width: Math.max(
              event.minWidth,
              Math.min(context.startWidth + event.x - context.startX, event.maxWidth)
            ),
          }),
        },
        END: { to: 'idle' },
        CANCEL: { to: 'idle', set: (context) => ({ width: context.startWidth }) },
      },
    },
  },
});

// Following a pane's scroll moves the other pane, which reports a scroll of its own. Until the
// leading pane settles, the other one's scrolls are those echoes and are ignored.
const leading = (pane) => ({
  SCROLLED: { when: (_, event) => event.pane === pane },
  SETTLED: { to: 'idle' },
  TOGGLE: { to: 'off' },
});

export const scrollSyncMachine = defineMachine({
  id: 'scrollSync',
  description:
    'Keeping the editor and preview scrolled to the same place, when turned on (saved). The ' +
    "pane being scrolled leads, and the other follows until it's been still briefly.",
  element: '#scrollSyncToggle',
  initial: 'off',
  states: {
    off: { on: { TOGGLE: { to: 'idle' } } },
    idle: {
      on: {
        SCROLLED: [
          { to: 'editor', when: (_, event) => event.pane === 'editor' },
          { to: 'preview' },
        ],
        TOGGLE: { to: 'off' },
      },
    },
    editor: { on: leading('editor') },
    preview: { on: leading('preview') },
  },
});
