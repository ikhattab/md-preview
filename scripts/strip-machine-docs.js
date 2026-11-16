/**
 * Vite plugin that drops the `description` and `element` fields from the state machine
 * definitions in production builds. They document each machine for docs/state-machines.md and
 * for people reading the source, and the running app never reads them.
 */

const MACHINE_FILE = /\/lib\/machines\/[^/]+\.js$/;
// A top-level field of a definition, as Prettier formats it: one string, or strings joined by +.
const STRING = String.raw`(?:'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")`;
const DOC_FIELD = new RegExp(
  String.raw`^ {2}(?:description|element):\s*${STRING}(?:\s*\+\s*${STRING})*,\n`,
  'gm'
);
const LEFTOVER = /^ {2}(?:description|element):/m;

export function stripMachineDocs() {
  return {
    name: 'strip-machine-docs',
    apply: 'build',
    transform(code, id) {
      if (!MACHINE_FILE.test(id)) return null;
      const stripped = code.replace(DOC_FIELD, '');
      if (LEFTOVER.test(stripped)) {
        this.error(
          `Couldn't strip the docs fields from ${id}; keep each one a string or a + of strings.`
        );
      }
      return { code: stripped, map: null };
    },
  };
}
