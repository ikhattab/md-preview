import { defineMachine } from '../machine.js';

const opposite = (theme) => (theme === 'dark' ? 'light' : 'dark');

/** The theme the reader sees, ignoring any export in progress. */
export function readerTheme(context) {
  return context.chosen ?? context.system;
}

/** The theme the page shows. */
export function shownTheme(context) {
  return context.override ?? readerTheme(context);
}

const followSystem = { set: (_, event) => ({ system: event.theme }) };
const override = {
  OVERRIDE: { set: (_, event) => ({ override: event.theme }) },
  CLEAR_OVERRIDE: { set: () => ({ override: null }) },
};
// Not while an export shows its own theme, which the reader can't see past.
const noExportTheme = (context) => !context.override;
const toggle = {
  to: 'chosen',
  when: noExportTheme,
  set: (context) => ({ chosen: opposite(readerTheme(context)) }),
};

export const themeMachine = defineMachine({
  id: 'theme',
  description:
    "The color theme. It follows the system's until the reader picks one with the toggle, " +
    'which is saved. An export can show its own theme until it finishes.',
  element: 'html (data-theme-state; data-theme holds the theme shown)',
  initial: 'system',
  context: { system: 'light', chosen: null, override: null },
  states: {
    system: { on: { SYSTEM_CHANGED: followSystem, TOGGLE: toggle, ...override } },
    chosen: { on: { SYSTEM_CHANGED: followSystem, TOGGLE: toggle, ...override } },
  },
});
