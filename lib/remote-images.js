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
let allowedForDocument = false;

function isBlockingActive() {
  return blockingEnabled && !allowedForDocument;
}

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

function firstRemoteSrcsetUrl(srcset) {
  return srcset.split(/[\s,]+/).find(isRemoteUrl);
}

function cssLoadsRemoteImage(css) {
  if (OPAQUE_CSS.test(css)) return true;
  return [...css.matchAll(CSS_URL)].some(([, url]) => isRemoteUrl(url));
}

/** Returns the remote URL an attribute would load, if any. */
function remoteUrlInAttribute(node, name, value) {
  switch (name) {
    case 'src':
      return !MEDIA_ELEMENTS.has(node.localName) && isRemoteUrl(value) ? value : null;
    case 'srcset':
      return firstRemoteSrcsetUrl(value) ?? null;
    case 'poster':
    case 'background':
      return isRemoteUrl(value) ? value : null;
    case 'style':
      return cssLoadsRemoteImage(value) ? value : null;
    case 'href':
    case 'xlink:href':
      return node.namespaceURI === SVG_NS && node.localName !== 'a' && isRemoteUrl(value)
        ? value
        : null;
    default:
      return node.namespaceURI === SVG_NS && cssLoadsRemoteImage(value) ? value : null;
  }
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

export function toggleRemoteImageBlocking() {
  blockingEnabled = !blockingEnabled;
  allowedForDocument = false;
  setStorageItem(STORAGE_KEYS.BLOCK_REMOTE_IMAGES, blockingEnabled ? 'true' : 'false');
  setToggleState();
}

export function allowRemoteImagesForDocument() {
  allowedForDocument = true;
}

export function resetRemoteImageAllowance() {
  allowedForDocument = false;
}

/**
 * DOMPurify hook body. Runs on the inert sanitizer document, so stripping an
 * attribute here means the browser never requests it. Blocked <img> elements
 * keep their URL in a data attribute so a placeholder can replace them.
 */
export function blockRemoteImageSources(node) {
  if (node.localName === 'img') node.removeAttribute(BLOCKED_SRC_ATTR);
  if (!isBlockingActive()) return;

  let blockedImageUrl = null;
  for (const { name, value } of [...node.attributes]) {
    const remoteUrl = remoteUrlInAttribute(node, name, value);
    if (!remoteUrl) continue;
    node.removeAttribute(name);
    if (name === 'src' || name === 'srcset') blockedImageUrl ??= remoteUrl;
  }

  if (node.localName === 'style' && cssLoadsRemoteImage(node.textContent)) {
    node.textContent = '';
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
  return isBlockingActive() && MERMAID_IMAGE_HINT.test(mermaidSource);
}

export function replaceWithBlockedDiagram(diagramEl, onLoadImages) {
  const placeholder = createBlockedPlaceholder(
    { label: 'Diagram may load remote images', status: 'Blocked: ' },
    onLoadImages
  );
  diagramEl.replaceWith(placeholder);
}
