import { dom } from './dom.js';
import { STORAGE_KEYS } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { iconEl, Icons } from './icons.js';

const { remoteImagesToggle } = dom;

const SVG_NS = 'http://www.w3.org/2000/svg';
const BLOCKED_SRC_ATTR = 'data-blocked-src';
// Blocking covers images only; audio and video sources are left alone.
const MEDIA_ELEMENTS = new Set(['video', 'audio', 'source', 'track']);
// CSS escapes and image-set() can hide a URL from the url() scan below, so treat them as remote.
const OPAQUE_CSS = /\\|image-set|@import/i;
const CSS_URL = /url\(\s*['"]?([^'")\s]*)/gi;
// Mermaid fetches image shapes and CSS from classDef or themeCSS while it renders, before its
// output reaches the sanitizer, so any diagram that could reference an image is held back.
const MERMAID_IMAGE_HINT = /img|image|url|@import|\\/i;

let blockingEnabled = false;
// Attribute values, <style> text, and Mermaid sources blocked in the current preview, and the
// ones the reader chose to load. Only exact matches are let through, so new content is blocked.
const blockedSources = new Set();
const allowedSources = new Set();

function isRemoteUrl(value) {
  let url;
  try {
    url = new URL(value.trim(), window.location.href);
  } catch {
    return false;
  }
  return (
    (url.protocol === 'http:' || url.protocol === 'https:') && url.origin !== window.location.origin
  );
}

/** Opaque CSS is returned whole, since the URLs it loads can't be listed. */
function remoteUrlsInCss(css) {
  if (OPAQUE_CSS.test(css)) return [css];
  return [...css.matchAll(CSS_URL)].map(([, url]) => url).filter(isRemoteUrl);
}

function remoteUrlsInAttribute(node, name, value) {
  switch (name) {
    case 'src':
      return !MEDIA_ELEMENTS.has(node.localName) && isRemoteUrl(value) ? [value] : [];
    case 'srcset':
      return value.split(/[\s,]+/).filter(isRemoteUrl);
    case 'poster':
    case 'background':
      return isRemoteUrl(value) ? [value] : [];
    case 'style':
      return remoteUrlsInCss(value);
    case 'href':
    case 'xlink:href':
      return node.namespaceURI === SVG_NS && node.localName !== 'a' && isRemoteUrl(value)
        ? [value]
        : [];
    default:
      return node.namespaceURI === SVG_NS ? remoteUrlsInCss(value) : [];
  }
}

function appearsInAllowedSource(url) {
  for (const source of allowedSources) {
    if (source.includes(url)) return true;
  }
  return false;
}

function setToggleState() {
  if (!remoteImagesToggle) return;
  const label = blockingEnabled ? 'Block remote images (on)' : 'Block remote images (off)';
  remoteImagesToggle.classList.toggle('active', blockingEnabled);
  remoteImagesToggle.setAttribute('aria-pressed', blockingEnabled ? 'true' : 'false');
  remoteImagesToggle.title = label;
  remoteImagesToggle.setAttribute('data-tooltip', label);
}

export function loadRemoteImagePreference() {
  blockingEnabled = getStorageItem(STORAGE_KEYS.BLOCK_REMOTE_IMAGES) === 'true';
  setToggleState();
}

export function resetRemoteImageAllowance() {
  blockedSources.clear();
  allowedSources.clear();
}

export function toggleRemoteImageBlocking() {
  blockingEnabled = !blockingEnabled;
  resetRemoteImageAllowance();
  setStorageItem(STORAGE_KEYS.BLOCK_REMOTE_IMAGES, blockingEnabled ? 'true' : 'false');
  setToggleState();
}

/** Call before each preview render so the list only holds what the reader can see. */
export function clearBlockedSources() {
  blockedSources.clear();
}

export function allowBlockedSources() {
  blockedSources.forEach((source) => allowedSources.add(source));
}

/**
 * DOMPurify hook body. Runs on the inert sanitizer document, so stripping an
 * attribute here means the browser never requests it. Blocked <img> elements
 * keep their URL in a data attribute so a placeholder can replace them.
 */
export function blockRemoteImageSources(node, _data, config) {
  if (node.localName === 'img') node.removeAttribute(BLOCKED_SRC_ATTR);
  if (!blockingEnabled) return;

  // Mermaid builds its markup from the diagram source, so values from its sanitize calls
  // are allowed when each URL appears in something the reader loaded.
  const isAllowed = config?.SANITIZE_NAMED_PROPS
    ? (value) => allowedSources.has(value)
    : (_value, urls) => urls.every(appearsInAllowedSource);

  let blockedImageUrl = null;
  for (const { name, value } of [...node.attributes]) {
    const urls = remoteUrlsInAttribute(node, name, value);
    if (urls.length === 0 || isAllowed(value, urls)) continue;
    node.removeAttribute(name);
    blockedSources.add(value);
    if (name === 'src' || name === 'srcset') blockedImageUrl ??= urls[0];
  }

  if (node.localName === 'style') {
    const css = node.textContent;
    const urls = remoteUrlsInCss(css);
    if (urls.length > 0 && !isAllowed(css, urls)) {
      node.textContent = '';
      blockedSources.add(css);
    }
  }

  if (node.localName === 'img' && blockedImageUrl && !node.hasAttribute('src')) {
    node.setAttribute(BLOCKED_SRC_ATTR, blockedImageUrl);
  }
}

function describeImage(img, url) {
  const alt = img.getAttribute('alt')?.trim();
  if (alt) return alt;
  try {
    return `Image from ${new URL(url, window.location.href).host}`;
  } catch {
    return 'Remote image';
  }
}

function createBlockedPlaceholder({ label, status, title }, onLoadImages) {
  const placeholder = document.createElement('span');
  placeholder.className = 'blocked-image';
  if (title) placeholder.title = title;

  const statusEl = document.createElement('span');
  statusEl.className = 'sr-only';
  statusEl.textContent = status;

  const labelEl = document.createElement('span');
  labelEl.className = 'blocked-image-alt';
  labelEl.textContent = label;

  const loadBtn = document.createElement('button');
  loadBtn.type = 'button';
  loadBtn.className = 'blocked-image-load';
  loadBtn.textContent = 'Load images';
  loadBtn.addEventListener('click', (e) => {
    // The placeholder may sit inside a link.
    e.preventDefault();
    e.stopPropagation();
    onLoadImages();
  });

  placeholder.append(iconEl(Icons.ImageOff, { width: 16, height: 16 }), statusEl, labelEl, loadBtn);
  return placeholder;
}

export function renderBlockedImagePlaceholders(root, onLoadImages) {
  root.querySelectorAll(`img[${BLOCKED_SRC_ATTR}]`).forEach((img) => {
    const url = img.getAttribute(BLOCKED_SRC_ATTR);
    const placeholder = createBlockedPlaceholder(
      { label: describeImage(img, url), status: 'Remote image blocked: ', title: url },
      onLoadImages
    );
    img.replaceWith(placeholder);
  });
}

export function mayLoadRemoteImages(mermaidSource) {
  return (
    blockingEnabled && MERMAID_IMAGE_HINT.test(mermaidSource) && !allowedSources.has(mermaidSource)
  );
}

export function replaceWithBlockedDiagram(diagramEl, onLoadImages) {
  blockedSources.add(diagramEl.dataset.mermaidSource);
  const placeholder = createBlockedPlaceholder(
    { label: 'Diagram may load remote images', status: 'Blocked: ' },
    onLoadImages
  );
  diagramEl.replaceWith(placeholder);
}
