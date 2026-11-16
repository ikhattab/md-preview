import { defineMachine } from '../machine.js';

export const previewRenderMachine = defineMachine({
  id: 'previewRender',
  description:
    'Rendering the preview at most once per animation frame. A forced render, needed when ' +
    "something other than the markdown changed, isn't lost when it joins one already waiting.",
  initial: 'idle',
  context: { force: false },
  states: {
    idle: { on: { SCHEDULE: { to: 'scheduled', set: (_, event) => ({ force: event.force }) } } },
    scheduled: {
      on: {
        SCHEDULE: { set: (context, event) => ({ force: context.force || event.force }) },
        FRAME: { to: 'idle', set: () => ({ force: false }) },
      },
    },
  },
});

export const diagramMachine = defineMachine({
  id: 'diagram',
  description:
    'One Mermaid diagram in the preview. A diagram is rendered once, however many preview ' +
    'updates happen meanwhile. One that may load remote images while blocking is on is ' +
    'replaced by a placeholder, and export retries one that failed.',
  element: '.mermaid (each diagram)',
  initial: 'pending',
  states: {
    pending: { on: { RENDER: { to: 'rendering' }, BLOCK: { to: 'blocked' } } },
    rendering: {
      on: { RENDERED: { to: 'rendered' }, FAILED: { to: 'failed' }, BLOCK: { to: 'blocked' } },
    },
    rendered: {},
    failed: { on: { RETRY: { to: 'pending' } } },
    blocked: {},
  },
});
