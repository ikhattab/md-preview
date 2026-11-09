# AGENTS.md

mdfor.dev is a private, offline-capable markdown editor: plain ES modules, no framework. [CONTRIBUTING.md](CONTRIBUTING.md) holds the project rules (privacy, lazy loading, sanitizing); follow them.

## State machines

Every piece of state that changes over time is a machine. [docs/state-machines.md](docs/state-machines.md) diagrams them all: read the relevant one before changing how a dialog, toggle, menu, load, or layout behaves.

- The definition in `lib/machines/` is the behavior. A state ignores any event it doesn't list, so new behavior starts as a new transition there.
- Definitions stay pure (no DOM, storage, timers, or imports beyond `lib/machine.js`) so Node can test and document them. Pass what a guard needs, like `isMobile()` or editor contents, in the event.
- The feature module runs the machine and does the side effects in `subscribe`, reacting to `(state, previous, event)`.
- `reflectState` writes the state to `data-state`. E2E tests assert on that attribute; prefer it to classes.
- After changing a definition: add a case to `tests/unit/machines.test.js` and run `npm run docs:machines`. `npm run check` fails until the docs match.
- In `npm run dev`, `window.__machines` holds each running machine (`__machines.exportDialog.value`).

## Testing

`npm run test:e2e` builds and serves `dist/`, but reuses a server already running on port 4173, so stop any leftover `vite preview` first or the tests run against a stale build. The e2e tests fail on any console error.
