import { marked } from 'marked';

// marked's own walkTokens copies its results array for every token, which takes quadratic time
// on large documents (markedjs/marked#4120). Extensions are registered without their walkTokens
// callbacks, and walkExtensionTokens() runs them instead, as a processAllTokens hook.
const callbacks = [];

/** Registers a marked extension, leaving its walkTokens callback to walkExtensionTokens(). */
export function useExtension(extension) {
  const { walkTokens, ...rest } = extension;
  // marked runs the most recently registered callback first.
  if (walkTokens) callbacks.unshift(walkTokens);
  marked.use(rest);
}

/** Visits every token in the same order as marked's walkTokens. */
export function walkExtensionTokens(tokens) {
  // A live iterator, like marked's: marked-footnote appends to the top-level tokens mid-walk.
  for (const token of tokens) {
    callbacks.forEach((callback) => callback(token));
    switch (token.type) {
      case 'table':
        token.header.forEach((cell) => walkExtensionTokens(cell.tokens));
        token.rows.forEach((row) => row.forEach((cell) => walkExtensionTokens(cell.tokens)));
        break;
      case 'list':
        walkExtensionTokens(token.items);
        break;
      default: {
        const childTokens = marked.defaults.extensions?.childTokens?.[token.type];
        if (childTokens) {
          childTokens.forEach((name) => walkExtensionTokens(token[name].flat(Infinity)));
        } else if (token.tokens) {
          walkExtensionTokens(token.tokens);
        }
      }
    }
  }
  return tokens;
}
