import { countLines, escapeHtml } from './utils.js';

// Only at the very start of the document: `---`, YAML lines, then `---` or `...`.
const FRONTMATTER_PATTERN = /^\uFEFF?---[ \t]*\n((?:.*\n)*?)(?:---|\.\.\.)[ \t]*(?:\n|$)/;
const KEY_LINE = /^([^\s#][^:]*?):(?:[ \t]+(.*))?$/;
const LIST_ITEM = /^-(?:[ \t]+(.*))?$/;
const BLOCK_SCALAR = /^([|>])[+-]?\d*$/;
const TITLE_KEY = /^["']?title["']?[ \t]*:/im;

/**
 * Split a leading YAML frontmatter block off the markdown source.
 * Returns null when the document doesn't start with one.
 */
export function splitFrontmatter(markdown) {
  const match = FRONTMATTER_PATTERN.exec(markdown);
  if (!match) return null;
  const block = match[0];
  return {
    yaml: match[1],
    body: markdown.slice(block.length),
    lineCount: countLines(block) - (block.endsWith('\n') ? 1 : 0),
  };
}

export function frontmatterHasTitle(yaml) {
  return TITLE_KEY.test(yaml);
}

function unquote(text) {
  const value = text.trim();
  if (value.length >= 2) {
    if (value.startsWith('"') && value.endsWith('"'))
      return value.slice(1, -1).replace(/\\"/g, '"');
    if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function formatScalar(value) {
  if (value.startsWith('[') && value.endsWith(']')) {
    return value.slice(1, -1).split(',').map(unquote).filter(Boolean).join(', ');
  }
  return unquote(value);
}

function dedent(lines) {
  const end = lines.findLastIndex((line) => line.trim() !== '');
  const content = lines.slice(0, end + 1);
  const indent = Math.min(
    ...content.filter((line) => line.trim() !== '').map((line) => line.match(/^\s*/)[0].length)
  );
  return content.map((line) => line.slice(indent));
}

/**
 * Turn an entry into display text. `raw` marks nested YAML shown verbatim.
 */
function formatEntry({ value, block }) {
  const lines = dedent(block);
  if (lines.length === 0) return { text: formatScalar(value), raw: false };

  const blockScalar = BLOCK_SCALAR.exec(value);
  if (blockScalar) {
    const text = blockScalar[1] === '|' ? lines.join('\n') : lines.join(' ').replace(/\s+/g, ' ');
    return { text: text.trim(), raw: false };
  }

  const items = lines.filter((line) => line.trim() !== '').map((line) => LIST_ITEM.exec(line));
  if (!value && items.every(Boolean)) {
    return { text: items.map((item) => unquote(item[1] ?? '')).join(', '), raw: false };
  }

  return { text: (value ? [value, ...lines] : lines).join('\n'), raw: true };
}

/**
 * Parse top-level `key: value` entries. Returns null when the block isn't a
 * simple mapping, so the caller can show it verbatim instead.
 */
function parseEntries(yaml) {
  const entries = [];
  for (const line of yaml.split('\n')) {
    const current = entries.at(-1);
    if (line.trim() === '') {
      current?.block.push(line);
      continue;
    }
    if (current && (/^\s/.test(line) || LIST_ITEM.test(line))) {
      current.block.push(line);
      continue;
    }
    if (line.startsWith('#')) continue;

    const match = KEY_LINE.exec(line);
    if (!match) return null;
    entries.push({ key: unquote(match[1]), value: match[2]?.trim() ?? '', block: [] });
  }
  return entries;
}

/**
 * Render frontmatter as a muted key/value table, like GitHub does.
 */
export function renderFrontmatter(yaml) {
  const entries = parseEntries(yaml);
  if (!entries) {
    return `<pre class="frontmatter frontmatter-raw" aria-label="Front matter"><code>${escapeHtml(yaml.trimEnd())}</code></pre>`;
  }
  if (entries.length === 0) return '';

  const rows = entries
    .map((entry) => {
      const { text, raw } = formatEntry(entry);
      const cellClass = raw ? ' class="frontmatter-raw"' : '';
      return `<tr><th scope="row">${escapeHtml(entry.key)}</th><td${cellClass}>${escapeHtml(text)}</td></tr>`;
    })
    .join('');
  return `<div class="frontmatter"><table aria-label="Front matter"><tbody>${rows}</tbody></table></div>`;
}
