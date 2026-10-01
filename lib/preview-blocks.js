// The preview is a list of blocks, each one or more top-level markdown tokens. A comment node
// marks where each block starts, so post-processing can wrap or replace a block's nodes without
// losing track of them. Comments are invisible to CSS selectors like :first-child and `+`.

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

// HTML comments, then start and end tags with quoted attribute values that may contain `>`.
const TAG = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][^\s/>]*)(?:[^>"']|"[^"]*"|'[^']*')*?(\/?)>/g;

/**
 * Counts the elements still open after `html`, starting with `open` already open. Stray end
 * tags close nothing. Elements with optional end tags, like `<li>`, count as still open, which
 * only makes blocks larger than they need to be.
 */
function countOpenElements(html, open) {
  for (const [, closing, name, selfClosing] of html.matchAll(TAG)) {
    if (!name || selfClosing || VOID_ELEMENTS.has(name.toLowerCase())) continue;
    open = closing ? Math.max(0, open - 1) : open + 1;
  }
  return open;
}

/**
 * Joins each block that leaves an element open, such as raw HTML like `<details>`, with the
 * blocks after it until the element is closed, so every block parses the same on its own as it
 * does in the whole document.
 *
 * @param {string[]} blocks rendered HTML of each top-level token
 * @param {Map<string, number>} cache open element counts from the previous call, by block HTML
 * @returns {{ blocks: string[], cache: Map<string, number> }}
 */
export function groupBalancedBlocks(blocks, cache) {
  const grouped = [];
  const nextCache = new Map();
  let open = 0;
  for (const html of blocks) {
    if (!html) continue;
    if (open > 0) {
      grouped[grouped.length - 1] += html;
      open = countOpenElements(html, open);
      continue;
    }
    grouped.push(html);
    open = cache.get(html) ?? countOpenElements(html, 0);
    nextCache.set(html, open);
  }
  return { blocks: grouped, cache: nextCache };
}

/** Selects the nodes of blocks `start` to `end` (exclusive), or the insertion point between them. */
function blockRange(container, blocks, start, end) {
  const range = document.createRange();
  if (start === 0) range.setStart(container, 0);
  else if (start < blocks.length) range.setStartBefore(blocks[start].marker);
  else range.setStart(container, container.childNodes.length);
  if (end < blocks.length) range.setEndBefore(blocks[end].marker);
  else range.setEnd(container, container.childNodes.length);
  return range;
}

/**
 * Updates `container` to show `htmls`, keeping the nodes of every unchanged block at the start
 * and end of the document. A volatile block is replaced even when its HTML is unchanged.
 *
 * @param {HTMLElement} container
 * @param {Array<{ html: string, marker: Comment, volatile: boolean }>} blocks what `container` shows
 * @param {string[]} htmls the HTML of each block to show
 * @param {object} callbacks
 * @param {(removed: DocumentFragment) => void} callbacks.onRemove gets each removed run of blocks
 * @param {(htmls: string[]) => { fragment: DocumentFragment, blocks: typeof blocks }} callbacks.render
 *   builds the nodes for new blocks, each starting with its marker
 * @returns {typeof blocks} the blocks `container` now shows
 */
export function patchBlocks(container, blocks, htmls, { onRemove, render }) {
  const max = Math.min(blocks.length, htmls.length);
  let prefix = 0;
  while (prefix < max && blocks[prefix].html === htmls[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    blocks[blocks.length - 1 - suffix].html === htmls[htmls.length - 1 - suffix]
  ) {
    suffix++;
  }

  const spans = [];
  const addVolatileSpans = (from, to) => {
    for (let i = from; i < to; i++) {
      if (blocks[i].volatile) spans.push({ start: i, end: i + 1, htmls: [blocks[i].html] });
    }
  };
  addVolatileSpans(0, prefix);
  const changedEnd = blocks.length - suffix;
  if (prefix < changedEnd || prefix < htmls.length - suffix) {
    spans.push({
      start: prefix,
      end: changedEnd,
      htmls: htmls.slice(prefix, htmls.length - suffix),
    });
  }
  addVolatileSpans(changedEnd, blocks.length);
  if (spans.length === 0) return blocks;

  // Remove every changed span before rendering any, so `onRemove` sees all the old nodes first.
  // Live ranges stay collapsed where their span was as other spans are removed and inserted.
  const ranges = spans.map(({ start, end }) => blockRange(container, blocks, start, end));
  ranges.forEach((range) => onRemove(range.extractContents()));
  // In reverse, since a node inserted at a collapsed range's position lands before the range.
  for (let i = spans.length - 1; i >= 0; i--) {
    const { fragment, blocks: rendered } = render(spans[i].htmls);
    ranges[i].insertNode(fragment);
    spans[i].rendered = rendered;
  }

  const next = [];
  let i = 0;
  for (const span of spans) {
    while (i < span.start) next.push(blocks[i++]);
    for (const block of span.rendered) next.push(block);
    i = span.end;
  }
  while (i < blocks.length) next.push(blocks[i++]);
  return next;
}
