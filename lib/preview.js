import { marked } from 'marked';
import markedAlert from 'marked-alert';
import markedFootnote from 'marked-footnote';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import { markedHighlight } from 'marked-highlight';
import DOMPurify from 'dompurify';
import { dom } from './dom.js';
import {
  FENCED_CODE_LANG,
  MATH_PATTERN,
  TOAST_ACTION_DURATION_MS,
  TOAST_DURATION_MS,
} from './constants.js';
import { escapeHtml } from './utils.js';
import { renderFrontmatter, splitFrontmatter } from './frontmatter.js';
import {
  ensureHljs,
  ensureKatex,
  ensureMermaid,
  getHljs,
  getMermaid,
  isKatexConfigured,
} from './lazy-vendors.js';
import { iconEl, Icons, labelIconButton } from './icons.js';
import { openMediaViewer } from './media-viewer.js';
import { useExtension, walkExtensionTokens } from './marked-walk.js';
import { groupBalancedBlocks, patchBlocks } from './preview-blocks.js';
import {
  allowBlockedSources,
  blockRemoteImageSources,
  clearBlockedSources,
  getBlockedSourceCount,
  getRemoteImagePolicyVersion,
  isRemoteImageBlockingEnabled,
  mayLoadRemoteImages,
  renderBlockedImagePlaceholders,
  replaceWithBlockedDiagram,
} from './remote-images.js';

const { editor, preview, html } = dom;

// Never reset, so every diagram, including a reused one, has a unique element and SVG id.
let mermaidCounter = 0;
let previewRafId = null;
let lastRenderedMarkdown = null;
// What the preview shows, one entry per block. See preview-blocks.js.
let renderedBlocks = [];
let openElementCache = new Map();
// The rendered HTML of each top-level token from the latest marked.parse() call.
let parsedBlocks = [];
// Highlighted code by language and source, from this render and the one before.
let highlighted = new Map();
let previouslyHighlighted = new Map();
const PNG_SCALE = 3;
let toastTimeout = null;
let toastDuration = TOAST_DURATION_MS;
let toastHeld = false;
let toastId = 0;
const renderListeners = [];
const BLANK_LINE = /\n[ \t]*\n/;

// DOMPurify prefixes every id with this so heading ids like "links" or "title"
// can't clobber document properties (GitHub uses the same prefix).
const USER_CONTENT_ID_PREFIX = 'user-content-';

const PURIFY_CONFIG = {
  ADD_TAGS: ['mark', 'kbd', 'input'],
  SANITIZE_NAMED_PROPS: true,
};

const PURIFY_SVG_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
};

const ALERT_ICONS = {
  note: Icons.Info,
  tip: Icons.Lightbulb,
  important: Icons.MessageSquareWarning,
  warning: Icons.TriangleAlert,
  caution: Icons.OctagonAlert,
};

function prefixId(id) {
  return id.startsWith(USER_CONTENT_ID_PREFIX) ? id : `${USER_CONTENT_ID_PREFIX}${id}`;
}

// Point in-page links and ARIA id references (footnote references are described by the
// "Footnotes" heading) at the prefixed ids.
function prefixInPageReferences(node, _data, config) {
  if (!config?.SANITIZE_NAMED_PROPS || node.nodeType !== Node.ELEMENT_NODE) return;

  const href = node.nodeName === 'A' ? node.getAttribute('href') : null;
  if (href && href.length > 1 && href.startsWith('#')) {
    node.setAttribute('href', `#${prefixId(href.slice(1))}`);
  }

  const describedBy = node.getAttribute('aria-describedby');
  if (describedBy) {
    node.setAttribute(
      'aria-describedby',
      describedBy.split(/\s+/).filter(Boolean).map(prefixId).join(' ')
    );
  }
}

DOMPurify.addHook('afterSanitizeAttributes', prefixInPageReferences);

const NEW_TAB_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

function openLinksInNewTab(node) {
  if (node.nodeName !== 'A') return;
  const href = node.getAttribute('href');
  if (!href || href.startsWith('#')) return;

  let url;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return;
  }
  if (!NEW_TAB_LINK_PROTOCOLS.has(url.protocol)) return;

  node.setAttribute('target', '_blank');
  node.setAttribute('rel', 'noopener noreferrer');
}

DOMPurify.addHook('afterSanitizeAttributes', openLinksInNewTab);

// Registered for every sanitize call, including the ones Mermaid makes for diagram labels.
DOMPurify.addHook('afterSanitizeAttributes', blockRemoteImageSources);

// Separates blocks in a single sanitize call. The nonce keeps markers typed into the document
// from being mistaken for these.
const BLOCK_MARKER_ATTR = 'data-md-block';
let blockMarkerNonce = null;
// getBlockedSourceCount() at each marker, to tell which blocks had remote sources blocked.
let blockedCountsAtMarkers = null;

function isBlockMarker(node, nonce) {
  return node.nodeName === 'HR' && node.getAttribute(BLOCK_MARKER_ATTR) === nonce;
}

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (blockedCountsAtMarkers && isBlockMarker(node, blockMarkerNonce)) {
    blockedCountsAtMarkers.push(getBlockedSourceCount());
  }
});

/**
 * Sanitizes the HTML of each block in one pass.
 * @returns {{ nodes: Node[], blockedSources: boolean }[] | null} null when a marker didn't end
 *   up between blocks, so the blocks can't be told apart
 */
function sanitizeBlocks(htmls) {
  const nonce = Math.random().toString(36).slice(2);
  const marker = `<hr ${BLOCK_MARKER_ATTR}="${nonce}">`;
  const counts = [];
  blockMarkerNonce = nonce;
  blockedCountsAtMarkers = counts;
  let fragment;
  try {
    fragment = DOMPurify.sanitize(htmls.map((blockHtml) => marker + blockHtml).join(''), {
      ...PURIFY_CONFIG,
      RETURN_DOM_FRAGMENT: true,
    });
  } finally {
    blockMarkerNonce = null;
    blockedCountsAtMarkers = null;
  }
  counts.push(getBlockedSourceCount());

  const blocks = [];
  for (const node of [...fragment.childNodes]) {
    if (isBlockMarker(node, nonce)) {
      blocks.push({ nodes: [], blockedSources: counts[blocks.length + 1] > counts[blocks.length] });
    } else {
      blocks.at(-1)?.nodes.push(node);
    }
  }
  return blocks.length === htmls.length && counts.length === htmls.length + 1 ? blocks : null;
}

function sanitizeMermaidSvg(rawSvg) {
  return DOMPurify.sanitize(rawSvg, PURIFY_SVG_CONFIG);
}

function getToast() {
  let toast = document.getElementById('mdToast');
  if (toast) return toast;

  toast = document.createElement('div');
  toast.id = 'mdToast';
  toast.className = 'md-toast';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  // Keep an action toast open while someone is pointing at or tabbing through it.
  const hold = () => {
    toastHeld = true;
    clearTimeout(toastTimeout);
  };
  const release = () => {
    if (toast.matches(':hover') || toast.contains(document.activeElement)) return;
    toastHeld = false;
    if (toast.classList.contains('visible')) scheduleToastHide();
  };
  toast.addEventListener('pointerenter', hold);
  toast.addEventListener('pointerleave', release);
  toast.addEventListener('focusin', hold);
  toast.addEventListener('focusout', () => setTimeout(release));
  document.body.appendChild(toast);
  return toast;
}

function scheduleToastHide() {
  clearTimeout(toastTimeout);
  if (toastHeld) return;
  toastTimeout = setTimeout(hideToast, toastDuration);
}

function toastHasKeyboardFocus(toast) {
  return toast.querySelector(':focus-visible') !== null;
}

function hideToast({ returnFocus = true } = {}) {
  const toast = document.getElementById('mdToast');
  if (!toast) return;
  clearTimeout(toastTimeout);
  toastHeld = false;
  // Keyboard users would otherwise be left on a hidden button; pointer users keep
  // their place (focusing the editor would pop up the keyboard on touch devices).
  const hadKeyboardFocus = returnFocus && toastHasKeyboardFocus(toast);
  toast.classList.remove('visible');
  if (hadKeyboardFocus) editor?.focus();
}

/**
 * @param {string} message
 * @param {{ action?: { label: string, onClick: () => void } }} [options]
 *   An action renders a button; clicking it hides the toast and runs `onClick`.
 * @returns {{ dismiss: () => void }} hides this toast unless a newer one replaced it
 */
export function showToast(message, { action } = {}) {
  const toast = getToast();
  toast.classList.toggle('md-toast-has-action', Boolean(action));

  if (!action) {
    toast.replaceChildren(message);
  } else {
    const text = document.createElement('span');
    text.className = 'md-toast-message';
    text.textContent = message;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'md-toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      // Return focus after the action runs, since it may reveal the editor.
      const returnFocus = toastHasKeyboardFocus(toast);
      hideToast({ returnFocus: false });
      action.onClick();
      if (returnFocus) editor?.focus();
    });
    toast.replaceChildren(text, button);
  }

  const id = ++toastId;
  toastHeld = false;
  toastDuration = action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS;
  toast.classList.add('visible');
  scheduleToastHide();
  return {
    dismiss: () => {
      if (id === toastId) hideToast();
    },
  };
}

export function schedulePreviewUpdate({ force = false } = {}) {
  if (force) {
    lastRenderedMarkdown = null;
  }
  if (previewRafId !== null) {
    return;
  }
  previewRafId = requestAnimationFrame(() => {
    previewRafId = null;
    updatePreview({ force });
  });
}

export function configureMarked() {
  marked.use({
    breaks: false,
    gfm: true,
    extensions: [
      {
        name: 'mermaidBlock',
        level: 'block',
        start(src) {
          // Only says where the paragraph being lexed should stop, and a paragraph stops at a
          // blank line anyway. Searching the rest of the document would take quadratic time.
          const paragraphEnd = src.search(BLANK_LINE);
          const index = (paragraphEnd === -1 ? src : src.slice(0, paragraphEnd)).indexOf(
            '```mermaid'
          );
          return index === -1 ? undefined : index;
        },
        tokenizer(src) {
          const match = /^```mermaid[^\n]*\n([\s\S]*?)\n```/.exec(src);
          if (match) {
            return {
              type: 'mermaidBlock',
              raw: match[0],
              text: match[1].trim(),
            };
          }
        },
        renderer(token) {
          // No id here, so unchanged diagrams render the same HTML. postProcessPreview() adds it.
          return `<div class="mermaid">${escapeHtml(token.text)}</div>`;
        },
      },
    ],
    renderer: {
      image({ href, title, text }) {
        if (!href) {
          return text ? escapeHtml(text) : '';
        }
        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text || '')}"${titleAttr} loading="lazy" decoding="async">`;
      },
    },
  });

  marked.use(gfmHeadingId());
  useExtension(markedFootnote());

  useExtension(
    markedAlert({
      variants: Object.entries(ALERT_ICONS).map(([type, icon]) => ({
        type,
        icon: iconEl(icon, { class: 'markdown-alert-icon', width: 16, height: 16 }).outerHTML,
      })),
    })
  );

  useExtension(
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight(code, lang) {
        if (lang === 'mermaid') {
          return escapeHtml(code);
        }
        const hljsApi = getHljs();
        if (!hljsApi) {
          ensureHljs(() => schedulePreviewUpdate({ force: true }));
          return escapeHtml(code);
        }
        if (lang && hljsApi.getLanguage(lang)) {
          try {
            return highlightCached(hljsApi, code, lang);
          } catch (e) {
            console.warn('Highlight.js error:', e);
          }
        }
        return escapeHtml(code);
      },
    })
  );

  marked.use({
    hooks: {
      processAllTokens: walkExtensionTokens,
      provideParser() {
        return this.block ? parseTopLevelBlocks : false;
      },
    },
  });
}

/** marked's parser, keeping the HTML of each top-level token in `parsedBlocks`. */
function parseTopLevelBlocks(tokens, options) {
  const parser = new marked.Parser(options);
  parsedBlocks = tokens.map((token) => parser.parse([token]));
  return parsedBlocks.join('');
}

function highlightCached(hljsApi, code, lang) {
  const key = `${lang}\n${code}`;
  const value =
    highlighted.get(key) ??
    previouslyHighlighted.get(key) ??
    hljsApi.highlight(code, { language: lang }).value;
  highlighted.set(key, value);
  return value;
}

export function initMermaid() {
  const mermaid = getMermaid();
  if (mermaid) {
    const isDark = html.getAttribute('data-theme') === 'dark';
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'strict',
      fontFamily: '"Hanken Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      htmlLabels: false,
      flowchart: {
        htmlLabels: false,
        useMaxWidth: true,
      },
    });
  }
}

// A rendered diagram depends on its source, the theme, and which remote images may load.
function getMermaidCacheKey(source) {
  return `${html.getAttribute('data-theme')}\n${getRemoteImagePolicyVersion()}\n${source}`;
}

function stashMermaidSource(diagramEl) {
  if (!diagramEl.dataset.mermaidSource) {
    diagramEl.dataset.mermaidSource = diagramEl.textContent.trim();
  }
}

export function prepareMermaidForRerender() {
  preview.querySelectorAll('.mermaid').forEach((el) => {
    if (!el.dataset.mermaidSource) return;
    el.textContent = el.dataset.mermaidSource;
    el.classList.remove('mermaid-rendered', 'mermaid-error-container', 'mermaid-has-toolbar');
    const toolbar = el.querySelector('.mermaid-toolbar');
    if (toolbar) toolbar.remove();
  });
}

async function mermaidSvgToPngBlob(diagramEl) {
  const svg = diagramEl.querySelector('svg');
  if (!svg) throw new Error('No diagram rendered');

  const cloned = svg.cloneNode(true);
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const viewBox = svg.viewBox?.baseVal;
  let width = viewBox?.width || parseFloat(svg.getAttribute('width')) || svg.clientWidth || 0;
  let height = viewBox?.height || parseFloat(svg.getAttribute('height')) || svg.clientHeight || 0;

  if (!width || !height) {
    const bbox = svg.getBBox();
    width = bbox.width || 800;
    height = bbox.height || 600;
  }

  cloned.setAttribute('width', String(width));
  cloned.setAttribute('height', String(height));
  if (!cloned.getAttribute('viewBox')) {
    cloned.setAttribute('viewBox', `0 0 ${width} ${height}`);
  }

  const svgString = new XMLSerializer().serializeToString(cloned);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Failed to load SVG'));
    img.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width * PNG_SCALE);
  canvas.height = Math.ceil(height * PNG_SCALE);
  const ctx = canvas.getContext('2d');
  const isDark = html.getAttribute('data-theme') === 'dark';
  ctx.fillStyle = isDark ? '#221e18' : '#fffdf8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(PNG_SCALE, PNG_SCALE);
  ctx.drawImage(img, 0, 0, width, height);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Failed to create PNG'));
    }, 'image/png');
  });
}

async function exportMermaidPng(diagramEl, mode) {
  try {
    const blob = await mermaidSvgToPngBlob(diagramEl);
    const id = (diagramEl.id || 'diagram').replace(USER_CONTENT_ID_PREFIX, '');

    if (mode === 'download') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Downloaded PNG');
      return;
    }

    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      showToast('Copied PNG');
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${id}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast('Clipboard unavailable — downloaded instead');
    }
  } catch (err) {
    console.warn('Mermaid PNG export failed:', err);
    showToast('Export failed');
  }
}

function createMediaIconButton(className, icon, ariaLabel, onClick) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  labelIconButton(btn, ariaLabel);
  btn.appendChild(iconEl(icon, { width: 14, height: 14 }));
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function attachMermaidToolbar(diagramEl) {
  if (diagramEl.querySelector('.mermaid-toolbar')) return;
  if (!diagramEl.querySelector('svg')) return;

  const toolbar = document.createElement('div');
  toolbar.className = 'mermaid-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Diagram actions');

  const expandBtn = createMediaIconButton(
    'mermaid-btn',
    Icons.Maximize2,
    'View diagram full screen',
    () =>
      openMediaViewer({
        type: 'mermaid',
        sourceEl: diagramEl,
        triggerEl: expandBtn,
      })
  );

  const copyBtn = createMediaIconButton('mermaid-btn', Icons.Copy, 'Copy diagram as PNG', () =>
    exportMermaidPng(diagramEl, 'copy')
  );

  const downloadBtn = createMediaIconButton(
    'mermaid-btn',
    Icons.Download,
    'Download diagram as PNG',
    () => exportMermaidPng(diagramEl, 'download')
  );

  toolbar.append(expandBtn, copyBtn, downloadBtn);
  diagramEl.classList.add('mermaid-has-toolbar');
  diagramEl.appendChild(toolbar);
}

function showMermaidError(diagram, renderError) {
  const msg = renderError?.message || 'Invalid diagram';
  diagram.innerHTML = `<div class="mermaid-error">Mermaid syntax error: ${escapeHtml(msg)}</div>`;
  diagram.classList.add('mermaid-rendered', 'mermaid-error-container');
}

async function renderSingleMermaidDiagram(diagram) {
  stashMermaidSource(diagram);
  const id = diagram.id || `mermaid-fallback-${mermaidCounter++}`;
  const code = diagram.dataset.mermaidSource;
  const mermaid = getMermaid();
  if (!mermaid) return;

  diagram.dataset.mermaidKey = getMermaidCacheKey(code);
  try {
    const { svg } = await mermaid.render(`${id}-svg`, code);
    diagram.innerHTML = sanitizeMermaidSvg(svg);
    diagram.classList.add('mermaid-rendered');
    attachMermaidToolbar(diagram);
  } catch (renderError) {
    showMermaidError(diagram, renderError);
  }
}

export async function ensureMermaidReadyForExport({ rerenderTheme = false } = {}) {
  if (rerenderTheme) {
    prepareMermaidForRerender();
  } else {
    preview.querySelectorAll('.mermaid').forEach((el) => {
      if (el.querySelector('svg')) return;
      el.classList.remove('mermaid-rendered', 'mermaid-error-container', 'mermaid-has-toolbar');
      el.querySelector('.mermaid-toolbar')?.remove();
    });
  }

  await renderMermaidDiagrams();
}

export async function renderMermaidDiagrams() {
  const diagrams = [...preview.querySelectorAll('.mermaid:not(.mermaid-rendered)')].filter((d) => {
    stashMermaidSource(d);
    if (!mayLoadRemoteImages(d.dataset.mermaidSource)) return true;
    replaceWithBlockedDiagram(d, loadRemoteImages);
    return false;
  });
  if (diagrams.length === 0) return;

  await ensureMermaid(initMermaid);
  const mermaid = getMermaid();
  if (!mermaid) return;

  initMermaid();

  // mermaid.run() ids SVGs by timestamp, which can repeat; render() takes ours.
  for (const diagram of diagrams) {
    await renderSingleMermaidDiagram(diagram);
  }
}

/** Adds the rendered diagrams in `root` to `rendered`, by cache key. */
function takeRenderedDiagrams(root, rendered) {
  root.querySelectorAll('.mermaid.mermaid-rendered[data-mermaid-key]').forEach((el) => {
    const matches = rendered.get(el.dataset.mermaidKey) ?? [];
    matches.push(el);
    rendered.set(el.dataset.mermaidKey, matches);
  });
}

/** Puts back rendered diagrams whose cache key is unchanged, each one at most once. */
function reuseRenderedDiagrams(root, rendered) {
  if (rendered.size === 0) return;
  root.querySelectorAll('.mermaid').forEach((el) => {
    stashMermaidSource(el);
    const match = rendered.get(getMermaidCacheKey(el.dataset.mermaidSource))?.shift();
    if (match) el.replaceWith(match);
  });
}

function unwrapPreviewFigure(figure) {
  const toolbar = figure.querySelector('.preview-figure-toolbar');
  if (toolbar) toolbar.remove();
  const img = figure.querySelector('img');
  if (img && figure.parentNode) {
    figure.parentNode.insertBefore(img, figure);
    figure.remove();
  }
}

function attachImageExpand(img) {
  if (img.closest('.preview-figure')) return;
  if (img.classList.contains('img-load-error')) return;

  const figure = document.createElement('figure');
  figure.className = 'preview-figure';

  const parent = img.parentNode;
  parent.insertBefore(figure, img);
  figure.appendChild(img);

  const toolbar = document.createElement('div');
  toolbar.className = 'preview-figure-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Image actions');

  const expandBtn = createMediaIconButton(
    'mermaid-btn',
    Icons.Maximize2,
    'View image full screen',
    () =>
      openMediaViewer({
        type: 'image',
        sourceEl: img,
        triggerEl: expandBtn,
      })
  );

  toolbar.appendChild(expandBtn);
  figure.classList.add('preview-figure-has-toolbar');
  figure.appendChild(toolbar);

  img.classList.add('preview-figure-img');
  img.addEventListener('click', () => {
    if (!img.classList.contains('img-load-error')) {
      openMediaViewer({
        type: 'image',
        sourceEl: img,
        triggerEl: expandBtn,
      });
    }
  });
}

function loadRemoteImages() {
  allowBlockedSources();
  schedulePreviewUpdate({ force: true });
}

/** Adds the preview's own markup to the newly rendered nodes in `root`. */
function postProcessPreview(root) {
  renderBlockedImagePlaceholders(root, loadRemoteImages);

  root.querySelectorAll('.mermaid').forEach((el) => {
    el.id = `mermaid-${mermaidCounter++}`;
  });

  root.querySelectorAll('img').forEach((img) => {
    if (img.dataset.errorBound) return;
    img.dataset.errorBound = 'true';
    img.addEventListener('error', () => {
      img.classList.add('img-load-error');
      const figure = img.closest('.preview-figure');
      if (figure) unwrapPreviewFigure(figure);
      const fallback = document.createElement('span');
      fallback.className = 'img-load-error-msg';
      fallback.textContent = `Image failed to load: ${img.getAttribute('src') || 'unknown URL'}`;
      img.insertAdjacentElement('afterend', fallback);
    });

    if (img.complete && img.naturalWidth > 0) {
      attachImageExpand(img);
    } else {
      img.addEventListener('load', () => {
        if (!img.classList.contains('img-load-error')) {
          attachImageExpand(img);
        }
      });
    }
  });

  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  root.querySelectorAll('pre').forEach((pre) => {
    if (pre.querySelector('.code-copy-btn')) return;
    const code = pre.querySelector('code');
    if (!code) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy-btn';
    labelIconButton(btn, 'Copy code');
    btn.appendChild(iconEl(Icons.Copy, { width: 14, height: 14 }));
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.textContent);
        showToast('Copied code');
        btn.replaceChildren(iconEl(Icons.CircleCheck, { width: 14, height: 14 }));
        labelIconButton(btn, 'Copied');
        setTimeout(() => {
          btn.replaceChildren(iconEl(Icons.Copy, { width: 14, height: 14 }));
          labelIconButton(btn, 'Copy code');
        }, 2000);
      } catch {
        showToast('Copy failed');
      }
    });

    pre.classList.add('code-block-with-copy');
    pre.appendChild(btn);
  });
}

export function updatePreview({ force = false } = {}) {
  const markdownText = editor.value;

  if (!force && markdownText === lastRenderedMarkdown) {
    return;
  }

  lastRenderedMarkdown = markdownText;

  if (!isKatexConfigured() && MATH_PATTERN.test(markdownText)) {
    ensureKatex(() => schedulePreviewUpdate({ force: true }));
  }

  if (!getHljs() && FENCED_CODE_LANG.test(markdownText)) {
    ensureHljs(() => schedulePreviewUpdate({ force: true }));
  }

  previouslyHighlighted = highlighted;
  highlighted = new Map();
  const frontmatter = splitFrontmatter(markdownText);
  marked.parse(frontmatter ? frontmatter.body : markdownText);
  const grouped = groupBalancedBlocks(
    frontmatter ? [renderFrontmatter(frontmatter.yaml), ...parsedBlocks] : parsedBlocks,
    openElementCache
  );
  openElementCache = grouped.cache;

  // Every block that had remote sources blocked is sanitized again, which refills this.
  clearBlockedSources();
  // Rendering inputs other than the markdown changed, such as which remote images may load.
  if (force) renderedBlocks = [];
  const renderedDiagrams = new Map();
  renderedBlocks = patchBlocks(preview, renderedBlocks, grouped.blocks, {
    onRemove: (removed) => takeRenderedDiagrams(removed, renderedDiagrams),
    render: (htmls) => renderBlocks(htmls, renderedDiagrams),
  });
  renderMermaidDiagrams();
  renderListeners.forEach((listener) => listener());
}

/** Builds the nodes for new blocks, each starting with its marker comment. */
function renderBlocks(htmls, renderedDiagrams) {
  // If the blocks can't be told apart, they're kept together as one.
  const sanitized = sanitizeBlocks(htmls) ?? sanitizeBlocks([htmls.join('')]);
  const blockingImages = isRemoteImageBlockingEnabled();
  const fragment = document.createDocumentFragment();
  const blocks = sanitized.map(({ nodes, blockedSources }, i) => {
    const blockHtml = sanitized.length === htmls.length ? htmls[i] : htmls.join('');
    const marker = document.createComment('');
    fragment.append(marker, ...nodes);
    return {
      html: blockHtml,
      marker,
      // Sanitized again on every render, so the reader is asked about what is still blocked.
      volatile: blockedSources || (blockingImages && blockHtml.includes('class="mermaid"')),
    };
  });
  postProcessPreview(fragment);
  reuseRenderedDiagrams(fragment, renderedDiagrams);
  return { fragment, blocks };
}

/** Runs `listener` after every preview render. */
export function onPreviewRender(listener) {
  renderListeners.push(listener);
}

function decodeFragment(fragment) {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
}

function handlePreviewAnchorClick(event) {
  const link = event.target.closest?.('a[href^="#"]');
  if (!link || !preview.contains(link)) return;

  const id = decodeFragment(link.getAttribute('href').slice(1));
  const target = id ? document.getElementById(id) : null;
  if (!target || !preview.contains(target)) return;

  // The preview pane is the scroll container; don't touch the URL or the window.
  event.preventDefault();
  scrollPreviewTo(target);
}

/** Scrolls the preview so `target` is at its top. */
export function scrollPreviewTo(target) {
  const offset = target.getBoundingClientRect().top - preview.getBoundingClientRect().top;
  preview.scrollTop += offset;
}

export function bindPreviewLinkListeners() {
  preview.addEventListener('click', handlePreviewAnchorClick);
}

export function prepareExportClone(sourceEl) {
  const clone = sourceEl.cloneNode(true);

  clone
    .querySelectorAll(
      '.mermaid-toolbar, .preview-figure-toolbar, .code-copy-btn, .blocked-image-load'
    )
    .forEach((el) => el.remove());
  clone.querySelectorAll('.code-block-with-copy').forEach((pre) => {
    pre.classList.remove('code-block-with-copy');
  });

  clone.querySelectorAll('.preview-figure').forEach((figure) => {
    const img = figure.querySelector('img');
    if (img && figure.parentNode) {
      figure.parentNode.insertBefore(img, figure);
      figure.remove();
      img.classList.remove('preview-figure-img');
    }
  });

  clone.removeAttribute('id');
  clone.removeAttribute('aria-live');
  clone.removeAttribute('aria-label');

  // Drop the block markers.
  const comments = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
  const markers = [];
  while (comments.nextNode()) markers.push(comments.currentNode);
  markers.forEach((comment) => comment.remove());

  clone.querySelectorAll('[data-error-bound]').forEach((el) => {
    el.removeAttribute('data-error-bound');
  });

  clone.querySelectorAll('.mermaid').forEach((el) => {
    el.classList.remove('mermaid-has-toolbar');
    el.removeAttribute('data-mermaid-source');
    el.removeAttribute('data-mermaid-key');
  });

  return clone;
}

export function getExportDocumentTitle() {
  const h1 = preview.querySelector('h1');
  if (h1?.textContent?.trim()) return h1.textContent.trim();
  return 'Markdown Export';
}
