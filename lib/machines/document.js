import { defineMachine } from '../machine.js';

/**
 * What the editor holds. `welcome` is the untouched welcome guide and `file` an imported file
 * the reader may have edited since. Only `draft` and `file` are the reader's own work.
 */
const DOCUMENT_STATES = ['welcome', 'empty', 'draft', 'file'];

const isGuide = (_, event) => event.isGuide;
const isBlank = (_, event) => event.blank;

// After an edit the editor may hold the guide again, nothing, or the reader's own text.
const edited = (ownState) => [
  { to: 'welcome', when: isGuide, set: () => ({ filename: null }) },
  { to: 'empty', when: isBlank, set: () => ({ filename: null }) },
  { to: ownState },
];

const shared = {
  IMPORTED: { to: 'file', set: (_, event) => ({ filename: event.filename }) },
  OPENED_GUIDE: { to: 'welcome', set: () => ({ filename: null }) },
  // Undo puts back whatever the editor held before.
  RESTORED: DOCUMENT_STATES.map((value) => ({
    to: value,
    when: (_, event) => event.value === value,
    set: (_, event) => ({ filename: event.filename }),
  })),
};

export const documentMachine = defineMachine({
  id: 'document',
  description:
    'What the editor holds: the untouched welcome guide, nothing, a draft, or an imported ' +
    "file, whose name exports reuse. Clearing the editor forgets the file's name. The " +
    "untouched guide isn't saved, so the next visit shows the current one.",
  element: '#editor',
  initial: 'welcome',
  context: { filename: null },
  states: {
    welcome: { on: { EDITED: edited('draft'), ...shared } },
    empty: { on: { EDITED: edited('draft'), ...shared } },
    draft: { on: { EDITED: edited('draft'), ...shared } },
    file: { on: { EDITED: edited('file'), ...shared } },
  },
});

/** Whether the editor holds the reader's own work, which replacing should protect. */
export function isOwnWork(state) {
  return state.value === 'draft' || state.value === 'file';
}
