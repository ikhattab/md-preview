import { defineMachine } from '../machine.js';

export const vendorLoaderMachine = defineMachine({
  id: 'vendorLoader',
  description:
    'Loading a heavy library the first time the preview needs it: highlight.js for code, ' +
    "KaTeX for math, Pele for diagrams. It counts as loaded only once all of it is, and it's " +
    'tried again after a failure. In development these run as hljsLoader, katexLoader, and ' +
    'mermaidLoader.',
  initial: 'idle',
  states: {
    idle: { on: { LOAD: { to: 'loading' } } },
    loading: { on: { LOADED: { to: 'ready' }, FAILED: { to: 'idle' } } },
    ready: {},
  },
});
