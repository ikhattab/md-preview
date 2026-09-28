import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Must match the BUILD line in sw.js.
const BUILD_PLACEHOLDER = "{ version: 'dev', precache: [], assets: [] }";

// KaTeX ships its fonts as woff2, woff, and ttf; only woff2 is ever requested by
// browsers that support service workers, and math is lazy, so it's cached on use.
const isLazyFont = (fileName) => /KaTeX_/.test(fileName) || /\.(woff|ttf)$/.test(fileName);

/**
 * Split a build into what the app needs to start (precache) and every hashed file
 * (assets). Everything the entry chunk imports statically must be precached, or
 * the shell wouldn't run offline.
 * @param {Record<string, { type: string, isEntry?: boolean, imports?: string[] }>} bundle
 * @returns {{ precache: string[], assets: string[] }} URL paths, sorted
 */
export function collectBuildFiles(bundle) {
  const precache = new Set();

  const addWithImports = (fileName) => {
    const chunk = bundle[fileName];
    if (chunk?.type !== 'chunk' || precache.has(fileName)) return;
    precache.add(fileName);
    chunk.imports?.forEach(addWithImports);
  };

  const assets = [];
  for (const [fileName, item] of Object.entries(bundle)) {
    if (fileName === 'index.html') continue;
    assets.push(fileName);
    if (item.type === 'chunk') {
      if (item.isEntry) addWithImports(fileName);
    } else if (!isLazyFont(fileName)) {
      precache.add(fileName);
    }
  }

  const toUrls = (names) => names.map((name) => `/${name}`).sort();
  return { precache: toUrls([...precache]), assets: toUrls(assets) };
}

/** Vite plugin that emits `sw.js` with this build's file lists filled in. */
export function serviceWorker() {
  return {
    name: 'service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const source = readFileSync(resolve('sw.js'), 'utf8');
      if (!source.includes(BUILD_PLACEHOLDER)) {
        this.error(`sw.js is missing the build placeholder: ${BUILD_PLACEHOLDER}`);
      }

      const { precache, assets } = collectBuildFiles(bundle);
      const index = bundle['index.html'];
      const version = createHash('sha256')
        .update(source)
        .update(String(index?.source ?? ''))
        .update(precache.join('\n'))
        .digest('hex')
        .slice(0, 10);

      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: source.replace(BUILD_PLACEHOLDER, JSON.stringify({ version, precache, assets })),
      });
    },
  };
}
