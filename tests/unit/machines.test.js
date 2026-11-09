import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMachine } from '../../lib/machine.js';
import { exportDialogMachine } from '../../lib/machines/export-dialog.js';
import { readerTheme, shownTheme, themeMachine } from '../../lib/machines/theme.js';
import { toastMachine } from '../../lib/machines/toast.js';
import { documentMachine, isOwnWork } from '../../lib/machines/document.js';
import { importMachine } from '../../lib/machines/import.js';
import {
  editorPaneMachine,
  mobileViewMachine,
  resizeMachine,
  scrollSyncMachine,
} from '../../lib/machines/layout.js';
import { dropOverlayMachine, tooltipMachine } from '../../lib/machines/overlays.js';

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

const entry = (id, action = null) => ({ id, message: `toast ${id}`, action, duration: 1000 });
const undo = { label: 'Undo' };

test('toast: an offer waits behind a newer toast and comes back after it', () => {
  const { machine, values } = run(toastMachine, [
    { type: 'SHOW', toast: entry(1, undo) },
    { type: 'SHOW', toast: entry(2) },
    { type: 'TIMEOUT', id: 1 },
    { type: 'TIMEOUT', id: 2 },
  ]);
  assert.deepEqual(values, ['shown', 'shown', 'shown', 'shown']);
  assert.equal(machine.context.current.id, 1);
  assert.equal(machine.context.suspended, null);

  machine.send({ type: 'TIMEOUT', id: 1 });
  assert.equal(machine.value, 'hidden');
});

test('toast: dismissing an offer withdraws it even while it waits', () => {
  const { machine } = run(toastMachine, [
    { type: 'SHOW', toast: entry(1, undo) },
    { type: 'SHOW', toast: entry(2) },
    { type: 'DISMISS', id: 1 },
    { type: 'TIMEOUT', id: 2 },
  ]);
  assert.equal(machine.value, 'hidden');
});

test('toast: stays while held, including when a new one arrives', () => {
  const { values } = run(toastMachine, [
    { type: 'SHOW', toast: entry(1) },
    { type: 'HOLD' },
    { type: 'TIMEOUT', id: 1 },
    { type: 'SHOW', toast: entry(2) },
    { type: 'RELEASE' },
    { type: 'TIMEOUT', id: 2 },
  ]);
  assert.deepEqual(values, ['shown', 'held', 'held', 'held', 'shown', 'hidden']);
});

const edit = (text) => ({ type: 'EDITED', isGuide: text === 'GUIDE', blank: !/\S/.test(text) });

test("document: an imported file keeps its name until it's cleared", () => {
  const { machine, values } = run(documentMachine, [
    { type: 'IMPORTED', filename: 'notes.md' },
    edit('# Notes, edited'),
    edit('  '),
    edit('# Fresh'),
  ]);
  assert.deepEqual(values, ['file', 'file', 'empty', 'draft']);
  assert.equal(machine.context.filename, null);
});

test('document: only drafts and files are the reader’s own work, and Undo restores either', () => {
  const { machine } = run(documentMachine, [edit('GUIDE')]);
  assert.equal(isOwnWork(machine.state), false);
  machine.send(edit('# Mine'));
  assert.equal(isOwnWork(machine.state), true);
  machine.send({ type: 'OPENED_GUIDE' });
  machine.send({ type: 'RESTORED', value: 'file', filename: 'a.markdown' });
  assert.deepEqual(machine.state, { value: 'file', context: { filename: 'a.markdown' } });
});

test('import: asks before replacing work, and the latest file wins', () => {
  const { machine, values } = run(importMachine, [
    { type: 'FILE', filename: 'a.md' },
    { type: 'FILE', filename: 'b.md' },
    { type: 'READ', run: 1, text: 'A', needsConfirmation: true },
    { type: 'READ', run: 2, text: 'B', needsConfirmation: true },
    { type: 'CONFIRM' },
  ]);
  assert.deepEqual(values, ['reading', 'reading', 'reading', 'confirming', 'idle']);
  assert.equal(machine.context.text, 'B');
  assert.equal(machine.context.filename, 'b.md');
});

test('import: a cancelled confirmation drops the file', () => {
  const { machine, values } = run(importMachine, [
    { type: 'FILE', filename: 'a.md' },
    { type: 'READ', run: 1, text: 'A', needsConfirmation: true },
    { type: 'CANCEL' },
  ]);
  assert.deepEqual(values, ['reading', 'confirming', 'idle']);
  assert.equal(machine.context.text, null);
});

test('editor pane: reopening after a collapse for reading stops later ones', () => {
  const { machine, values } = run(editorPaneMachine, [
    { type: 'SHOW_FOR_READING' },
    { type: 'TOGGLE' },
    { type: 'SHOW_FOR_READING' },
  ]);
  assert.deepEqual(values, ['collapsed', 'open', 'open']);
  assert.equal(machine.context.autoCollapse, false);
});

test('editor pane: undo reopens only an editor that reading collapsed', () => {
  assert.deepEqual(run(editorPaneMachine, ['SHOW_FOR_READING', 'RESTORE']).values, [
    'collapsed',
    'open',
  ]);
  assert.deepEqual(run(editorPaneMachine, ['TOGGLE', 'RESTORE']).values, [
    'collapsed',
    'collapsed',
  ]);
});

test('mobile view: switches between the editor and the preview', () => {
  assert.deepEqual(run(mobileViewMachine, ['SHOW_PREVIEW', 'SHOW_PREVIEW', 'SHOW_EDITOR']).values, [
    'preview',
    'preview',
    'editor',
  ]);
});

test('resize: a drag stays within limits, and a cancelled one puts the width back', () => {
  const limits = { minWidth: 200, maxWidth: 900 };
  const { machine } = run(resizeMachine, [
    { type: 'START', x: 500, width: 500 },
    { type: 'MOVE', x: 100, ...limits },
  ]);
  assert.equal(machine.context.width, 200);
  machine.send({ type: 'MOVE', x: 2000, ...limits });
  assert.equal(machine.context.width, 900);
  machine.send('CANCEL');
  assert.deepEqual([machine.value, machine.context.width], ['idle', 500]);
});

test('scroll sync: the leading pane ignores the echo from the other one until it settles', () => {
  const { values } = run(scrollSyncMachine, [
    { type: 'SCROLLED', pane: 'editor' },
    'TOGGLE',
    { type: 'SCROLLED', pane: 'editor' },
    { type: 'SCROLLED', pane: 'preview' },
    { type: 'SCROLLED', pane: 'editor' },
    'SETTLED',
    { type: 'SCROLLED', pane: 'preview' },
    'TOGGLE',
  ]);
  assert.deepEqual(values, ['off', 'idle', 'editor', 'editor', 'editor', 'idle', 'preview', 'off']);
});

test('drop overlay: ignores page drags and drags while a dialog is open', () => {
  assert.deepEqual(
    run(dropOverlayMachine, [
      'INTERNAL_DRAG_START',
      { type: 'DRAG_ENTER', allowed: true },
      'INTERNAL_DRAG_END',
      { type: 'DRAG_ENTER', allowed: true, blocked: true },
      { type: 'DRAG_ENTER', allowed: false },
      'DROP',
    ]).values,
    ['internal', 'internal', 'idle', 'idle', 'over', 'idle']
  );
});

test('tooltip: leaving another element keeps it, and removal hides it', () => {
  const a = { id: 'a' };
  const b = { id: 'b' };
  const { values } = run(tooltipMachine, [
    { type: 'SHOW', anchor: a },
    { type: 'SHOW', anchor: b },
    { type: 'LEAVE', anchor: a },
    'ANCHOR_REMOVED',
  ]);
  assert.deepEqual(values, ['shown', 'shown', 'shown', 'hidden']);
});
