import { defineMachine } from '../machine.js';

// Each file read has a run number, so when files arrive close together only the latest one's
// result counts.
const isCurrentRun = (context, event) => event.run === context.run;
const needsConfirmation = (_, event) => event.needsConfirmation;

const startReading = {
  to: 'reading',
  set: (context, event) => ({ run: context.run + 1, filename: event.filename, text: null }),
};

export const importMachine = defineMachine({
  id: 'import',
  description:
    'Opening a file from the Import button, a drop, or the operating system. Replacing the ' +
    "reader's own work asks first; the latest file wins when several arrive close together.",
  element: '#importConfirmDialog',
  initial: 'idle',
  context: { run: 0, filename: null, text: null },
  states: {
    idle: { on: { FILE: startReading } },
    reading: {
      on: {
        FILE: startReading,
        READ: [
          {
            to: 'confirming',
            when: (context, event) =>
              isCurrentRun(context, event) && needsConfirmation(context, event),
            set: (_, event) => ({ text: event.text }),
          },
          { to: 'idle', when: isCurrentRun, set: (_, event) => ({ text: event.text }) },
        ],
        FAILED: { to: 'idle', when: isCurrentRun },
      },
    },
    confirming: {
      on: {
        FILE: startReading,
        CONFIRM: { to: 'idle' },
        CANCEL: { to: 'idle', set: () => ({ text: null }) },
      },
    },
  },
});
