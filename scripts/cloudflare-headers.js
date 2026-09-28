import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Parse a Cloudflare Pages `_headers` file. Supports path rules with splats (`*`)
 * and placeholders (`:name`), and detached headers (`! Name`). Throws on anything
 * else so the preview server never silently diverges from production.
 * @see https://developers.cloudflare.com/pages/configuration/headers/
 */
export function parseHeadersFile(text) {
  const rules = [];
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) return;
    const fail = (reason) => {
      throw new Error(`_headers line ${index + 1}: ${reason}: ${line}`);
    };

    if (!/^\s/.test(rawLine)) {
      if (!line.startsWith('/')) fail('only path rules are supported');
      rules.push({ pattern: patternToRegExp(line), set: [], detach: [] });
      return;
    }

    const rule = rules.at(-1);
    if (!rule) fail('header without a path rule');
    if (line.startsWith('!')) {
      rule.detach.push(line.slice(1).trim().toLowerCase());
      return;
    }
    const colon = line.indexOf(':');
    if (colon <= 0) fail('expected "Name: value"');
    rule.set.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  });
  return rules;
}

function patternToRegExp(pattern) {
  const source = pattern
    .split(/(\*|:[A-Za-z]\w*)/)
    .map((part, i) => {
      if (i % 2 === 0) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return part === '*' ? '.*' : '[^/]+';
    })
    .join('');
  return new RegExp(`^${source}$`);
}

/** @returns {Map<string, string>} header name to value for the given pathname */
export function headersForPath(rules, pathname) {
  const matching = rules.filter((rule) => rule.pattern.test(pathname));
  const headers = new Map();
  for (const rule of matching) {
    for (const [name, value] of rule.set) {
      const key = name.toLowerCase();
      const existing = headers.get(key);
      headers.set(key, existing ? { name, value: `${existing.value}, ${value}` } : { name, value });
    }
  }
  for (const rule of matching) {
    for (const key of rule.detach) headers.delete(key);
  }
  return new Map([...headers.values()].map(({ name, value }) => [name, value]));
}

/** Vite plugin that applies the built `_headers` file in `vite preview`. */
export function cloudflareHeaders() {
  return {
    name: 'cloudflare-headers',
    configurePreviewServer(server) {
      const file = resolve(server.config.root, server.config.build.outDir, '_headers');
      if (!existsSync(file)) return;
      const rules = parseHeadersFile(readFileSync(file, 'utf8'));
      server.middlewares.use((req, res, next) => {
        const { pathname } = new URL(req.url, 'http://localhost');
        for (const [name, value] of headersForPath(rules, pathname)) {
          res.setHeader(name, value);
        }
        next();
      });
    },
  };
}
