import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMachine } from '../../lib/machine.js';
import { exportDialogMachine } from '../../lib/machines/export-dialog.js';
import { readerTheme, shownTheme, themeMachine } from '../../lib/machines/theme.js';

/** Sends `events` in order and returns the states the machine went through. */
function run(definition, events, options) {
  const machine = createMachine(definition, options);
  const values = [];
  for (const event of events) {
    machine.send(event);
    values.push(machine.value);
  }
  return { machine, values };
}

test('export dialog: an export runs once, and a cancelled one is forgotten', () => {
  const { machine, values } = run(exportDialogMachine, [
    { type: 'OPEN', format: 'html' },
    { type: 'SUBMIT', theme: 'dark' },
    { type: 'SUBMIT', theme: 'dark' },
    { type: 'CANCEL' },
    { type: 'DONE', run: 1 },
    { type: 'OPEN', format: 'pdf' },
    { type: 'SUBMIT', theme: 'light' },
    { type: 'DONE', run: 1 },
  ]);
  assert.deepEqual(values, [
    'open',
    'exporting',
    'exporting',
    'closed',
    'closed',
    'open',
    'exporting',
    'exporting',
  ]);
  assert.deepEqual(machine.context, { format: 'pdf', theme: 'light', run: 2 });
});

test('export dialog: a PDF prints, and reopening during printing ends the print job', () => {
  const { values } = run(exportDialogMachine, [
    { type: 'OPEN', format: 'pdf' },
    { type: 'SUBMIT', theme: 'light' },
    { type: 'PRINT', run: 1 },
    { type: 'CANCEL' },
    { type: 'OPEN', format: 'html' },
    { type: 'DONE', run: 1 },
  ]);
  assert.deepEqual(values, ['open', 'exporting', 'printing', 'printing', 'open', 'open']);
});

test('export dialog: a failed export goes back to the dialog', () => {
  const { values } = run(exportDialogMachine, [
    { type: 'OPEN', format: 'html' },
    { type: 'SUBMIT', theme: 'light' },
    { type: 'FAILED', run: 1 },
  ]);
  assert.deepEqual(values, ['open', 'exporting', 'open']);
});

test('theme: follows the system until the reader picks one', () => {
  const { machine, values } = run(
    themeMachine,
    [
      { type: 'SYSTEM_CHANGED', theme: 'light' },
      { type: 'TOGGLE' },
      { type: 'SYSTEM_CHANGED', theme: 'dark' },
    ],
    { context: { system: 'dark' } }
  );
  assert.deepEqual(values, ['system', 'chosen', 'chosen']);
  assert.equal(readerTheme(machine.context), 'dark');
});

test('theme: an export shows its theme on top, and the toggle waits for it', () => {
  const { machine } = run(themeMachine, [{ type: 'OVERRIDE', theme: 'dark' }, { type: 'TOGGLE' }]);
  assert.equal(shownTheme(machine.context), 'dark');
  assert.equal(readerTheme(machine.context), 'light');
  assert.equal(machine.value, 'system');

  machine.send('CLEAR_OVERRIDE');
  assert.equal(shownTheme(machine.context), 'light');
});
