import { dom } from './dom.js';
import { STORAGE_KEYS, DEBOUNCE_DELAY, MOBILE_BREAKPOINT } from './constants.js';
import { getStorageItem, setStorageItem } from './storage.js';
import { debounce } from './utils.js';
import { isMobile, setMobileView } from './layout.js';
import { onPreviewRender, scrollPreviewTo } from './preview.js';
import { closeHeaderMenu } from './header-menu.js';
import { createMachine, reflectState } from './machine.js';
import { isOutlineShown, outlineMachine } from './machines/outline.js';

const { preview, outlineToggle, outlinePanel, outlineList, outlineClose, headerMenuBtn } = dom;

// Top-level headings only: this leaves out the hidden "Footnotes" heading and headings quoted
// inside blockquotes.
const HEADING_SELECTOR = ':scope > :is(h1, h2, h3, h4, h5, h6)';

// A heading becomes the current section once it scrolls into the top part of the preview.
const ACTIVE_OFFSET_PX = 80;

// The outline's states and events are in lib/machines/outline.js.
const outline = createMachine(outlineMachine);
reflectState(outline, outlinePanel, {
  describe: (state) => (state.context.hasHeadings ? state.value : 'empty'),
});

let renderedOutlineKey = null;
let activeLink = null;
let activeFrame = null;

function getHeadings() {
  return [...preview.querySelectorAll(HEADING_SELECTOR)].filter((heading) => heading.id);
}

function getOutlineKey(headings) {
  return headings.map((h) => `${h.tagName} ${h.id} ${h.textContent}`).join('\n');
}

function renderOutline(headings) {
  const topLevel = Math.min(...headings.map((h) => Number(h.tagName[1])));
  const items = headings.map((heading) => {
    const link = document.createElement('a');
    link.className = 'outline-link';
    link.href = `#${heading.id}`;
    link.textContent = heading.textContent.trim();
    const item = document.createElement('li');
    item.className = 'outline-item';
    item.dataset.depth = String(Number(heading.tagName[1]) - topLevel);
    item.append(link);
    return item;
  });
  outlineList.replaceChildren(...items);
  activeLink = null;
}

function renderPanel(state) {
  const shown = isOutlineShown(state);
  const { hasHeadings } = state.context;
  outlineToggle.classList.toggle('active', shown);
  outlineToggle.setAttribute('aria-pressed', shown ? 'true' : 'false');
  outlineToggle.disabled = !hasHeadings;
  let label = state.value === 'open' ? 'Hide outline' : 'Show outline';
  if (!hasHeadings) label = 'Outline (no headings)';
  outlineToggle.title = label;
  outlineToggle.setAttribute('data-tooltip', label);

  outlinePanel.hidden = !shown;
  if (shown) updateActiveLink();
}

function refreshOutline() {
  const headings = getHeadings();
  const key = getOutlineKey(headings);
  if (key !== renderedOutlineKey) {
    renderedOutlineKey = key;
    renderOutline(headings);
  }
  outline.send({ type: 'HEADINGS', present: headings.length > 0 });
}

const debouncedRefreshOutline = debounce(refreshOutline, DEBOUNCE_DELAY);

function findActiveHeading(headings) {
  const top = preview.getBoundingClientRect().top;
  const atBottom = preview.scrollTop + preview.clientHeight >= preview.scrollHeight - 2;
  // At the bottom, later headings can't reach the top of the pane, so the last one in view wins.
  const limit = atBottom ? preview.clientHeight : ACTIVE_OFFSET_PX;
  let active = null;
  for (const heading of headings) {
    if (heading.getBoundingClientRect().top - top > limit) break;
    active = heading;
  }
  return active;
}

function updateActiveLink() {
  const heading = findActiveHeading(getHeadings());
  const link = heading ? outlineList.querySelector(`a[href="#${CSS.escape(heading.id)}"]`) : null;
  if (link === activeLink) return;

  activeLink?.removeAttribute('aria-current');
  activeLink = link;
  if (!link) return;
  link.setAttribute('aria-current', 'location');

  // Keep the current entry visible in a long outline without scrolling anything else.
  const linkTop = link.offsetTop;
  if (linkTop < outlineList.scrollTop) {
    outlineList.scrollTop = linkTop;
  } else if (linkTop + link.offsetHeight > outlineList.scrollTop + outlineList.clientHeight) {
    outlineList.scrollTop = linkTop + link.offsetHeight - outlineList.clientHeight;
  }
}

function scheduleActiveLinkUpdate() {
  if (outlinePanel.hidden || activeFrame !== null) return;
  activeFrame = requestAnimationFrame(() => {
    activeFrame = null;
    updateActiveLink();
  });
}

/**
 * On desktop the outline is a side panel and stays open between visits. On mobile it covers
 * the preview, so it only opens on request and closes after jumping to a heading.
 */
function setOutlineOpen(open) {
  outline.send(open ? 'OPEN' : 'CLOSE');
  if (!isMobile()) {
    setStorageItem(STORAGE_KEYS.OUTLINE_OPEN, open ? 'true' : 'false');
  }
}

function toggleOutline() {
  const isOpen = outline.matches('open');
  if (isOpen || !isMobile()) {
    setOutlineOpen(!isOpen);
    return;
  }
  // The menu holding the Outline button closes, so focus moves into the outline instead.
  closeHeaderMenu();
  setMobileView('preview');
  setOutlineOpen(true);
  (activeLink ?? outlineList.querySelector('.outline-link'))?.focus({ preventScroll: true });
}

// On mobile the Outline button is inside the closed header menu, so focus goes to the menu button.
function closeOutlineAndRefocus() {
  setOutlineOpen(false);
  (isMobile() ? headerMenuBtn : outlineToggle)?.focus({ preventScroll: true });
}

function handleOutlineClick(event) {
  const link = event.target.closest('a.outline-link');
  if (!link) return;
  event.preventDefault();
  const target = document.getElementById(link.getAttribute('href').slice(1));
  if (!target || !preview.contains(target)) return;

  if (isMobile()) setOutlineOpen(false);
  scrollPreviewTo(target);
  // Move focus along with the reader, so keyboard and screen reader users continue from there.
  target.tabIndex = -1;
  target.focus({ preventScroll: true });
}

function restoreOpenState() {
  const open = !isMobile() && getStorageItem(STORAGE_KEYS.OUTLINE_OPEN) === 'true';
  outline.send(open ? 'OPEN' : 'CLOSE');
}

export function initOutline() {
  if (!outlineToggle || !outlinePanel || !outlineList) return;

  outline.subscribe(renderPanel);
  onPreviewRender(debouncedRefreshOutline);
  refreshOutline();
  restoreOpenState();

  outlineToggle.addEventListener('click', toggleOutline);
  outlineClose?.addEventListener('click', closeOutlineAndRefocus);
  outlineList.addEventListener('click', handleOutlineClick);
  preview.addEventListener('scroll', scheduleActiveLinkUpdate, { passive: true });
  // On mobile the panel covers most of the preview; tapping the part still showing closes it.
  preview.addEventListener('click', () => {
    if (outline.matches('open') && isMobile()) setOutlineOpen(false);
  });

  outlinePanel.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isMobile()) return;
    e.preventDefault();
    closeOutlineAndRefocus();
  });

  window
    .matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`)
    .addEventListener('change', restoreOpenState);
}
