/**
 * Finite state machines, defined as data.
 *
 * A definition lists every state and the events each one accepts. A state ignores any event it
 * doesn't list, so it can't be pushed into a situation it wasn't designed for.
 *
 *   defineMachine({
 *     id: 'exportDialog',
 *     description: 'The HTML and PDF export dialog.',
 *     element: '#exportDialog',
 *     initial: 'closed',
 *     context: { format: null },
 *     states: {
 *       closed: { on: { OPEN: { to: 'open', set: (ctx, event) => ({ format: event.format }) } } },
 *       open: { on: { CANCEL: { to: 'closed' } } },
 *     },
 *   });
 *
 * A transition is `{ to, when, set }`, every part optional, or a list of them: the first whose
 * `when(context, event)` passes is taken. `to` defaults to staying in the current state, and
 * `set(context, event)` returns the context fields to change.
 *
 * Definitions live in lib/machines/ and are pure, so they're unit tested in tests/unit and
 * documented in docs/state-machines.md (`npm run docs:machines`). The module that runs a machine
 * performs its side effects in a `subscribe` listener and writes the state to `data-state` on
 * the definition's `element`.
 */

/**
 * @typedef {{ type: string, [key: string]: unknown }} MachineEvent
 * @typedef {{ to?: string, when?: (context: object, event: MachineEvent) => boolean,
 *   set?: (context: object, event: MachineEvent) => object }} Transition
 * @typedef {{ on?: Record<string, Transition | Transition[]> }} StateNode
 * @typedef {{ id: string, description: string, element?: string, initial: string,
 *   context?: object, states: Record<string, StateNode> }} MachineDefinition
 * @typedef {{ value: string, context: object }} MachineState
 */

function transitionsOf(node, type) {
  const transitions = node.on?.[type];
  if (!transitions) return [];
  return Array.isArray(transitions) ? transitions : [transitions];
}

/**
 * Checks a definition and returns it unchanged.
 * @param {MachineDefinition} definition
 * @returns {MachineDefinition}
 */
export function defineMachine(definition) {
  const { id, initial, states } = definition;
  if (!states[initial]) {
    throw new Error(`Machine "${id}" starts in "${initial}", which isn't one of its states`);
  }
  for (const [name, node] of Object.entries(states)) {
    for (const type of Object.keys(node.on ?? {})) {
      for (const { to } of transitionsOf(node, type)) {
        if (to !== undefined && !states[to]) {
          throw new Error(`Machine "${id}" goes from "${name}" on ${type} to unknown "${to}"`);
        }
      }
    }
  }
  return definition;
}

/**
 * The state `event` leads to from `state`, or null when the state ignores it.
 * @param {MachineDefinition} definition
 * @param {MachineState} state
 * @param {MachineEvent} event
 * @returns {MachineState | null}
 */
export function transition(definition, state, event) {
  const node = definition.states[state.value];
  const taken = transitionsOf(node, event.type).find(
    ({ when }) => !when || when(state.context, event)
  );
  if (!taken) return null;
  return {
    value: taken.to ?? state.value,
    context: taken.set ? { ...state.context, ...taken.set(state.context, event) } : state.context,
  };
}

/**
 * Runs a machine.
 * @param {MachineDefinition} definition
 * @param {{ value?: string, context?: object, name?: string | null }} [options] `value` starts
 *   somewhere other than the definition's `initial`, such as a state restored from storage, and
 *   `context` adds to the definition's. `name` is the machine's key in `window.__machines`, the
 *   definition's id by default; null leaves it out, for machines with many instances.
 */
export function createMachine(
  definition,
  { value = definition.initial, context, name = definition.id } = {}
) {
  if (!definition.states[value]) {
    throw new Error(`Machine "${definition.id}" can't start in unknown state "${value}"`);
  }
  /** @type {MachineState} */
  let state = { value, context: { ...definition.context, ...context } };
  const listeners = new Set();
  // Events sent by a listener wait until every listener has seen the current change.
  const queue = [];
  let dispatching = false;

  function process(event) {
    const next = transition(definition, state, event);
    if (!next) return false;
    const previous = state;
    state = next;
    for (const listener of [...listeners]) listener(state, previous, event);
    return true;
  }

  const machine = {
    id: definition.id,
    get state() {
      return state;
    },
    get value() {
      return state.value;
    },
    get context() {
      return state.context;
    },
    /** Whether the machine is in one of `values`. */
    matches(...values) {
      return values.includes(state.value);
    },
    /**
     * @param {MachineEvent | string} event an event, or just its type
     * @returns {boolean} whether the current state accepted it; always true while another
     *   event is still being handled, since this one is queued until then
     */
    send(event) {
      const normalized = typeof event === 'string' ? { type: event } : event;
      if (dispatching) {
        queue.push(normalized);
        return true;
      }
      dispatching = true;
      try {
        const accepted = process(normalized);
        while (queue.length > 0) process(queue.shift());
        return accepted;
      } finally {
        dispatching = false;
        queue.length = 0;
      }
    },
    /**
     * @param {(state: MachineState, previous: MachineState, event: MachineEvent) => void} listener
     *   called after every accepted event
     * @returns {() => void} unsubscribes
     */
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };

  // In development, every running machine can be inspected from the console.
  if (import.meta.env?.DEV && name !== null) {
    globalThis.__machines ??= {};
    globalThis.__machines[name] = machine;
  }
  return machine;
}

/**
 * Keeps a data attribute on `element`, `data-state` by default, equal to the machine's state, so
 * CSS, tests, and anyone inspecting the page can see it.
 * @param {ReturnType<typeof createMachine>} machine
 * @param {HTMLElement | null | undefined} element
 * @param {{ attribute?: string, describe?: (state: MachineState) => string }} [options]
 *   `attribute` is the dataset key; `describe` gives the value to show, the state by default
 */
export function reflectState(
  machine,
  element,
  { attribute = 'state', describe = (state) => state.value } = {}
) {
  if (!element) return;
  const write = (state) => {
    element.dataset[attribute] = describe(state);
  };
  write(machine.state);
  machine.subscribe(write);
}
