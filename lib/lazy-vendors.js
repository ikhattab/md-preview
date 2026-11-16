/**
 * Lazy-loaded vendor modules (highlight.js, KaTeX, Pele for Mermaid diagrams)
 * Heavy deps are code-split via dynamic import().
 */

import { marked } from 'marked';

const HLJS_LANG_LOADERS = {
  javascript: () => import('highlight.js/lib/languages/javascript'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  python: () => import('highlight.js/lib/languages/python'),
  bash: () => import('highlight.js/lib/languages/bash'),
  json: () => import('highlight.js/lib/languages/json'),
  css: () => import('highlight.js/lib/languages/css'),
  xml: () => import('highlight.js/lib/languages/xml'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
  sql: () => import('highlight.js/lib/languages/sql'),
  go: () => import('highlight.js/lib/languages/go'),
  rust: () => import('highlight.js/lib/languages/rust'),
  java: () => import('highlight.js/lib/languages/java'),
  php: () => import('highlight.js/lib/languages/php'),
};

const HLJS_LANGS = Object.keys(HLJS_LANG_LOADERS);

let hljsLightCss = null;
let hljsDarkCss = null;
let hljsLightLink = null;
let hljsDarkLink = null;

let katexCssText = null;

/**
 * Loads a vendor module the first time it's needed. `get()` stays null until loading has
 * finished, and a failed load is tried again on the next `ensure()`.
 * @template T
 * @param {string} name for the console warning when loading fails
 * @param {() => Promise<T>} load
 */
function createLoader(name, load) {
  /** @type {T | null} */
  let value = null;
  /** @type {Promise<T> | null} */
  let loading = null;
  return {
    get: () => value,
    /**
     * @param {(value: T) => void} [onReady] runs once loading finishes, unless it already had
     * @returns {Promise<T>}
     */
    ensure(onReady) {
      if (value) return Promise.resolve(value);
      loading ??= load().then(
        (loaded) => {
          value = loaded;
          return loaded;
        },
        (err) => {
          console.warn(`${name} load failed:`, err);
          loading = null;
          throw err;
        }
      );
      if (onReady) {
        // A failure reaches the caller through the returned promise.
        loading.then(onReady, () => undefined);
      }
      return loading;
    },
  };
}

const hljsLoader = createLoader('Highlight.js', async () => {
  const { default: core } = await import('highlight.js/lib/core');
  await Promise.all(
    HLJS_LANGS.map(async (lang) => {
      const mod = await HLJS_LANG_LOADERS[lang]();
      core.registerLanguage(lang, mod.default);
    })
  );

  const [lightInline, darkInline] = await Promise.all([
    import('highlight.js/styles/github.css?inline'),
    import('highlight.js/styles/github-dark.css?inline'),
  ]);
  hljsLightCss = lightInline.default;
  hljsDarkCss = darkInline.default;
  installHljsThemeLinks();
  return core;
});

const katexLoader = createLoader('KaTeX', async () => {
  const [markedKatexMod, cssInline] = await Promise.all([
    import('marked-katex-extension'),
    import('katex/dist/katex.min.css?inline'),
  ]);
  katexCssText = cssInline.default;
  installKatexStyle();
  marked.use(
    markedKatexMod.default({
      throwOnError: false,
      nonStandard: true,
    })
  );
  return true;
});

// The lazy entry loads each diagram type's chunk the first time it's used.
const mermaidLoader = createLoader('Mermaid', () => import('pele/lazy'));

/**
 * @returns {import('highlight.js').HLJSApi | null}
 */
export function getHljs() {
  return hljsLoader.get();
}

export function getHljsCss() {
  return { light: hljsLightCss, dark: hljsDarkCss };
}

export function getKatexCss() {
  return katexCssText;
}

export function isKatexConfigured() {
  return katexLoader.get() !== null;
}

/**
 * @returns {typeof import('pele/lazy') | null}
 */
export function getMermaid() {
  return mermaidLoader.get();
}

function createStyleLink(id, cssText, disabled = false) {
  const blob = new Blob([cssText], { type: 'text/css' });
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = URL.createObjectURL(blob);
  link.id = id;
  link.disabled = disabled;
  document.head.appendChild(link);
  return link;
}

function installHljsThemeLinks() {
  if (hljsLightLink || !hljsLightCss || !hljsDarkCss) {
    return;
  }
  hljsLightLink = createStyleLink('hljs-theme-light', hljsLightCss, false);
  hljsDarkLink = createStyleLink('hljs-theme-dark', hljsDarkCss, true);
}

/**
 * KaTeX CSS references fonts by root-relative URL, which can't resolve inside a
 * blob: stylesheet, so it goes in a <style> element instead (style-src allows it).
 */
function installKatexStyle() {
  if (document.getElementById('katex-css')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'katex-css';
  style.textContent = katexCssText;
  document.head.appendChild(style);
}

/**
 * Sync hljs theme link disabled state with app theme
 */
export function syncHljsThemeStyles(isDark) {
  if (!hljsLightLink || !hljsDarkLink) {
    return;
  }
  hljsLightLink.disabled = isDark;
  hljsDarkLink.disabled = !isDark;
}

/**
 * @param {() => void} [onReady]
 */
export function ensureHljs(onReady) {
  return hljsLoader.ensure(onReady);
}

/**
 * @param {() => void} [onReady]
 */
export function ensureKatex(onReady) {
  return katexLoader.ensure(onReady);
}

/**
 * @param {(api: typeof import('pele/lazy')) => void} [onReady]
 */
export function ensureMermaid(onReady) {
  return mermaidLoader.ensure(onReady);
}
