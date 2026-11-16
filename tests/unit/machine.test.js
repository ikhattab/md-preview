import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMachine, defineMachine, transition } from '../../lib/machine.js';

const door = defineMachine({
  id: 'door',
  description: 'A door with a lock.',
  initial: 'closed',
  context: { opened: 0 },
  states: {
    closed: {
      on: {
        OPEN: [
          {
            to: 'open',
            when: (_, event) => !event.locked,
            set: (ctx) => ({ opened: ctx.opened + 1 }),
          },
          { to: 'closed' },
        ],
        LOCK: { to: 'locked' },
      },
    },
    open: { on: { CLOSE: { to: 'closed' } } },
    locked: { on: { UNLOCK: { to: 'closed' } } },
  },
});

test('rejects a definition that points at a missing state', () => {
  assert.throws(
    () => defineMachine({ id: 'broken', initial: 'a', states: { a: { on: { GO: { to: 'b' } } } } }),
    /unknown "b"/
  );
  assert.throws(() => defineMachine({ id: 'broken', initial: 'z', states: { a: {} } }), /"z"/);
});

test('takes the first transition whose guard passes, and updates context', () => {
  const closed = { value: 'closed', context: { opened: 0 } };
  assert.deepEqual(transition(door, closed, { type: 'OPEN' }), {
    value: 'open',
    context: { opened: 1 },
  });
  assert.deepEqual(transition(door, closed, { type: 'OPEN', locked: true }), {
    value: 'closed',
    context: { opened: 0 },
  });
});

test('ignores events the current state does not list', () => {
  const machine = createMachine(door);
  assert.equal(machine.send('CLOSE'), false);
  assert.equal(machine.value, 'closed');
});

test('can start in a restored state', () => {
  assert.equal(createMachine(door, { value: 'locked' }).value, 'locked');
  assert.throws(() => createMachine(door, { value: 'ajar' }), /"ajar"/);
});

test('tells listeners about each change, and queues events they send', () => {
  const machine = createMachine(door);
  const seen = [];
  machine.subscribe((state, previous, event) => {
    seen.push(`${previous.value} -${event.type}-> ${state.value}`);
    if (event.type === 'OPEN') machine.send('CLOSE');
  });
  machine.subscribe((state) => seen.push(`second listener sees ${state.value}`));

  machine.send('OPEN');
  assert.deepEqual(seen, [
    'closed -OPEN-> open',
    'second listener sees open',
    'open -CLOSE-> closed',
    'second listener sees closed',
  ]);
});

test('stops telling a listener once it unsubscribes', () => {
  const machine = createMachine(door);
  let calls = 0;
  const unsubscribe = machine.subscribe(() => calls++);
  machine.send('OPEN');
  unsubscribe();
  machine.send('CLOSE');
  assert.equal(calls, 1);
});
