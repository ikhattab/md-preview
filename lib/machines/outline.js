import { defineMachine } from '../machine.js';

const headings = { set: (_, event) => ({ hasHeadings: event.present }) };

export const outlineMachine = defineMachine({
  id: 'outline',
  description:
    "The list of the document's headings. It shows only while open and the document has " +
    'headings (data-state is empty when it has none). On wide screens it is a side panel that ' +
    'stays open between visits; on narrow ones it covers the preview, opens only on request, ' +
    'and closes after jumping to a heading.',
  element: '#outlinePanel',
  initial: 'closed',
  context: { hasHeadings: false },
  states: {
    closed: { on: { OPEN: { to: 'open' }, HEADINGS: headings } },
    open: { on: { CLOSE: { to: 'closed' }, HEADINGS: headings } },
  },
});

/** Whether the outline panel is on screen. */
export function isOutlineShown(state) {
  return state.value === 'open' && state.context.hasHeadings;
}
