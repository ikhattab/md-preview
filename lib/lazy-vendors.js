/**
 * Lazy-loaded vendor modules (highlight.js, KaTeX, Mermaid)
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
};

const HLJS_LANGS = Object.keys(HLJS_LANG_LOADERS);

let hljs = null;
let hljsLightCss = null;
let hljsDarkCss = null;
let hljsLightLink = null;
let hljsDarkLink = null;
let hljsLoading = null;

let katexConfigured = false;
let katexCssText = null;
let katexLoading = null;

let mermaidApi = null;
let mermaidLoading = null;

/**
 * @returns {import('highlight.js').HLJSApi | null}
 */
export function getHljs() {
  return hljs;
}

export function getHljsCss() {
  return { light: hljsLightCss, dark: hljsDarkCss };
}

export function getKatexCss() {
  return katexCssText;
}

export function isKatexConfigured() {
  return katexConfigured;
}

/**
 * @returns {typeof import('mermaid').default | null}
 */
export function getMermaid() {
  return mermaidApi;
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
  if (hljs) {
    return Promise.resolve(hljs);
  }
  if (hljsLoading) {
    return hljsLoading;
  }

  hljsLoading = (async () => {
    const core = await import('highlight.js/lib/core');
    hljs = core.default;

    await Promise.all(
      HLJS_LANGS.map(async (lang) => {
        const mod = await HLJS_LANG_LOADERS[lang]();
        hljs.registerLanguage(lang, mod.default);
      })
    );

    const [lightInline, darkInline] = await Promise.all([
      import('highlight.js/styles/github.css?inline'),
      import('highlight.js/styles/github-dark.css?inline'),
    ]);
    hljsLightCss = lightInline.default;
    hljsDarkCss = darkInline.default;
    installHljsThemeLinks();
    onReady?.();
    return hljs;
  })().catch((err) => {
    console.warn('Highlight.js load failed:', err);
    hljsLoading = null;
    throw err;
  });

  return hljsLoading;
}

/**
 * @param {() => void} [onReady]
 */
export function ensureKatex(onReady) {
  if (katexConfigured) {
    return Promise.resolve();
  }
  if (katexLoading) {
    return katexLoading;
  }

  katexLoading = (async () => {
    const [markedKatexMod, cssInline] = await Promise.all([
      import('marked-katex-extension'),
      import('katex/dist/katex.min.css?inline'),
    ]);
    katexCssText = cssInline.default;
    marked.use(
      markedKatexMod.default({
        throwOnError: false,
        nonStandard: true,
      })
    );
    katexConfigured = true;
    onReady?.();
  })().catch((err) => {
    console.warn('KaTeX load failed:', err);
    katexLoading = null;
    throw err;
  });

  return katexLoading;
}

/**
 * @param {(api: typeof import('mermaid').default) => void} [onReady]
 */
export function ensureMermaid(onReady) {
  if (mermaidApi) {
    return Promise.resolve(mermaidApi);
  }
  if (mermaidLoading) {
    return mermaidLoading;
  }

  mermaidLoading = import('mermaid')
    .then((mod) => {
      mermaidApi = mod.default;
      onReady?.(mermaidApi);
      return mermaidApi;
    })
    .catch((err) => {
      console.warn('Mermaid load failed:', err);
      mermaidLoading = null;
      throw err;
    });

  return mermaidLoading;
}
