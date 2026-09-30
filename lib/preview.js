import { marked } from 'marked';
import markedAlert from 'marked-alert';
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
import {
  allowBlockedSources,
  blockRemoteImageSources,
  clearBlockedSources,
  mayLoadRemoteImages,
  renderBlockedImagePlaceholders,
  replaceWithBlockedDiagram,
} from './remote-images.js';

const { editor, preview, html } = dom;

let mermaidCounter = 0;
let previewRafId = null;
let lastRenderedMarkdown = null;
const PNG_SCALE = 3;
let toastTimeout = null;
let toastDuration = TOAST_DURATION_MS;
let toastHeld = false;
let toastId = 0;

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

function prefixInPageLinkHref(node, _data, config) {
  if (!config?.SANITIZE_NAMED_PROPS || node.nodeName !== 'A') return;
  const href = node.getAttribute('href');
  if (!href || href.length < 2 || !href.startsWith('#')) return;
  if (href.startsWith(`#${USER_CONTENT_ID_PREFIX}`)) return;
  node.setAttribute('href', `#${USER_CONTENT_ID_PREFIX}${href.slice(1)}`);
}

DOMPurify.addHook('afterSanitizeAttributes', prefixInPageLinkHref);

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

function sanitizePreviewHtml(rawHtml) {
  return DOMPurify.sanitize(rawHtml, PURIFY_CONFIG);
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
          const match = src.match(/```mermaid/);
          return match ? match.index : undefined;
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
          const id = `mermaid-${mermaidCounter++}`;
          return `<div class="mermaid" id="${id}">${escapeHtml(token.text)}</div>`;
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

  marked.use(
    markedAlert({
      variants: Object.entries(ALERT_ICONS).map(([type, icon]) => ({
        type,
        icon: iconEl(icon, { class: 'markdown-alert-icon', width: 16, height: 16 }).outerHTML,
      })),
    })
  );

  marked.use(
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
            return hljsApi.highlight(code, { language: lang }).value;
          } catch (e) {
            console.warn('Highlight.js error:', e);
          }
        }
        return escapeHtml(code);
      },
    })
  );
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

  try {
    await mermaid.run({
      nodes: diagrams,
      suppressErrors: true,
    });
    for (const d of diagrams) {
      if (d.querySelector('svg')) {
        d.classList.add('mermaid-rendered');
        attachMermaidToolbar(d);
      } else if (!d.classList.contains('mermaid-rendered')) {
        await renderSingleMermaidDiagram(d);
      }
    }
  } catch (_e) {
    for (const diagram of diagrams) {
      if (!diagram.classList.contains('mermaid-rendered')) {
        await renderSingleMermaidDiagram(diagram);
      }
    }
  }
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

function postProcessPreview() {
  renderBlockedImagePlaceholders(preview, loadRemoteImages);

  preview.querySelectorAll('img').forEach((img) => {
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

  preview.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    table.parentNode.insertBefore(wrap, table);
    wrap.appendChild(table);
  });

  preview.querySelectorAll('pre').forEach((pre) => {
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
  mermaidCounter = 0;

  if (!isKatexConfigured() && MATH_PATTERN.test(markdownText)) {
    ensureKatex(() => schedulePreviewUpdate({ force: true }));
  }

  if (!getHljs() && FENCED_CODE_LANG.test(markdownText)) {
    ensureHljs(() => schedulePreviewUpdate({ force: true }));
  }

  const frontmatter = splitFrontmatter(markdownText);
  const frontmatterHtml = frontmatter ? renderFrontmatter(frontmatter.yaml) : '';
  const bodyHtml = marked.parse(frontmatter ? frontmatter.body : markdownText);
  clearBlockedSources();
  preview.innerHTML = sanitizePreviewHtml(frontmatterHtml + bodyHtml);
  postProcessPreview();
  renderMermaidDiagrams();
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

  clone.querySelectorAll('[data-error-bound]').forEach((el) => {
    el.removeAttribute('data-error-bound');
  });

  clone.querySelectorAll('.mermaid').forEach((el) => {
    el.classList.remove('mermaid-has-toolbar');
    el.removeAttribute('data-mermaid-source');
  });

  return clone;
}

export function getExportDocumentTitle() {
  const h1 = preview.querySelector('h1');
  if (h1?.textContent?.trim()) return h1.textContent.trim();
  return 'Markdown Export';
}
