import { defineMachine } from '../machine.js';

// Each export has a run number. Events from a run that was cancelled or replaced carry an old
// number, so they're ignored.
const isCurrentRun = (context, event) => event.run === context.run;
const openFor = { to: 'open', set: (_, event) => ({ format: event.format }) };

export const exportDialogMachine = defineMachine({
  id: 'exportDialog',
  description:
    'The HTML and PDF export dialog, from choosing options until the file downloads or the ' +
    'print dialog closes. The page shows the export theme while an export runs.',
  element: '#exportDialog',
  initial: 'closed',
  context: { format: null, theme: null, run: 0 },
  states: {
    closed: { on: { OPEN: openFor } },
    open: {
      on: {
        SUBMIT: {
          to: 'exporting',
          set: (context, event) => ({ run: context.run + 1, theme: event.theme }),
        },
        CANCEL: { to: 'closed' },
      },
    },
    exporting: {
      on: {
        PRINT: { to: 'printing', when: isCurrentRun },
        DONE: { to: 'closed', when: isCurrentRun },
        FAILED: { to: 'open', when: isCurrentRun },
        CANCEL: { to: 'closed' },
      },
    },
    printing: {
      on: {
        DONE: { to: 'closed', when: isCurrentRun },
        FAILED: { to: 'closed', when: isCurrentRun },
        // The page can only be used again once the print dialog has closed, even when the
        // browser never says so with afterprint.
        OPEN: openFor,
      },
    },
  },
});
