import { dom } from './dom.js';
import {
  DEFAULT_CONTENT,
  EXPORT_PRINT_CSS,
  EXPORT_RESET_CSS,
  IMPORT_MAX_BYTES,
  IMPORTABLE_EXTENSIONS,
  PRINT_IMAGE_TIMEOUT_MS,
} from './constants.js';
import { slugifyFilename } from './utils.js';
import { ensureHljs, ensureKatex, getHljsCss, getKatexCss } from './lazy-vendors.js';
import {
  showToast,
  updatePreview,
  ensureMermaidReadyForExport,
  prepareExportClone,
  getExportDocumentTitle,
} from './preview.js';
import { applyThemeVisual, getCurrentTheme } from './theme.js';
import {
  editorHasContent,
  editorHasOwnContent,
  normalizeEditorPosition,
  saveContent,
} from './content.js';
import { debouncedLint, getCurrentLintWarnings, isLintEnabled } from './lint.js';
import { updateLineGutter, resetGutterCache } from './gutter.js';
import { resetRemoteImageAllowance } from './remote-images.js';
import { escapeHtml } from './utils.js';
import { bindDropImport } from './drop-import.js';
import { bindFileLaunch } from './file-launch.js';
import { showImportedDocument, showWelcomeGuide } from './layout.js';

const {
  editor,
  preview,
  exportMenu,
  exportMenuBtn,
  exportMenuPopover,
  exportMdBtn,
  exportHtmlBtn,
  exportPdfBtn,
  exportDialog,
  exportDialogForm,
  exportDialogTitle,
  exportDialogDesc,
  exportFilenameInput,
  exportThemeSelect,
  exportEmbedImages,
  exportEmbedImagesField,
  exportCancelBtn,
  exportDownloadBtn,
  welcomeBtn,
  importBtn,
  importFileInput,
  importConfirmDialog,
  importConfirmDesc,
  importConfirmCancelBtn,
  importConfirmReplaceBtn,
} = dom;

let lastImportedFilename = null;
let pendingImportText = null;
let pendingImportFilename = null;
let dismissReplaceUndo = null;

const EXPORT_DIALOG_COPY = {
  html: {
    title: 'Export HTML',
    desc: 'Download a self-contained HTML file with the same styles and rendered content.',
    defaultTheme: 'current',
    primaryLabel: 'Download',
    busyLabel: 'Exporting…',
  },
  pdf: {
    title: 'Export PDF',
    desc: "Opens your browser's print dialog — choose Save as PDF.",
    defaultTheme: 'light',
    primaryLabel: 'Print / Save PDF',
    busyLabel: 'Preparing…',
  },
};

function isImportableFile(file) {
  const name = file.name.toLowerCase();
  return IMPORTABLE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function refreshGutter() {
  updateLineGutter({
    lintEnabled: isLintEnabled(),
    warnings: getCurrentLintWarnings(),
  });
}

function setEditorContent(text) {
  editor.value = text;
  resetRemoteImageAllowance();
  updatePreview({ force: true });
  saveContent();
  resetGutterCache();
  refreshGutter();
  debouncedLint(editor.value);
}

function applyImportedContent(text, filename) {
  setEditorContent(text);
  lastImportedFilename = filename;
  showImportedDocument();
  showToast(`Imported ${filename}`);
}

/**
 * Swap in another document while offering an Undo toast that brings the reader's work back.
 * @param {() => () => void} showDocument lays out the new document and returns how to undo that
 */
function replaceDocument(text, { filename, showDocument, message, undoneMessage }) {
  const previous = { text: editor.value, filename: lastImportedFilename };
  setEditorContent(text);
  lastImportedFilename = filename;
  const restoreLayout = showDocument();

  const toast = showToast(message, {
    action: {
      label: 'Undo',
      onClick: () => {
        dismissReplaceUndo = null;
        setEditorContent(previous.text);
        lastImportedFilename = previous.filename;
        restoreLayout();
        showToast(undoneMessage);
      },
    },
  });
  dismissReplaceUndo = toast.dismiss;
}

function replaceWithImportedContent(text, filename) {
  replaceDocument(text, {
    filename,
    showDocument: showImportedDocument,
    message: `Replaced with ${filename}`,
    undoneMessage: 'Import undone',
  });
}

// Undo would discard anything typed since the replacement, so stop offering it.
function handleEditorInputAfterReplace() {
  dismissReplaceUndo?.();
  dismissReplaceUndo = null;
}

// Undo makes a confirmation unnecessary, and nothing needs undoing if the editor held no work.
export function openWelcomeGuide() {
  if (editorHasOwnContent()) {
    replaceDocument(DEFAULT_CONTENT, {
      filename: null,
      showDocument: showWelcomeGuide,
      message: 'Opened the welcome guide',
      undoneMessage: 'Your document is back',
    });
  } else {
    if (editor.value !== DEFAULT_CONTENT) setEditorContent(DEFAULT_CONTENT);
    lastImportedFilename = null;
    showWelcomeGuide();
  }
  normalizeEditorPosition();
}

function clearPendingImport() {
  pendingImportText = null;
  pendingImportFilename = null;
}

function openImportConfirmDialog(filename, text) {
  pendingImportText = text;
  pendingImportFilename = filename;
  if (importConfirmDesc) {
    importConfirmDesc.textContent = `Importing "${filename}" will replace everything in the editor.`;
  }
  importConfirmDialog?.showModal();
  importConfirmReplaceBtn?.focus();
}

function confirmImportReplace() {
  if (pendingImportText === null) return;
  const text = pendingImportText;
  const filename = pendingImportFilename || 'file';
  clearPendingImport();
  importConfirmDialog?.close();
  replaceWithImportedContent(text, filename);
}

function importMarkdownText(text, filename) {
  if (editorHasOwnContent()) {
    openImportConfirmDialog(filename, text);
  } else {
    applyImportedContent(text, filename);
  }
}

function readImportFile(file) {
  if (!isImportableFile(file)) {
    showToast('Unsupported file type');
    return;
  }
  if (file.size > IMPORT_MAX_BYTES) {
    showToast('File too large (max 2 MB)');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const text = typeof reader.result === 'string' ? reader.result : '';
    importMarkdownText(text, file.name);
  };
  reader.onerror = () => {
    showToast('Import failed');
  };
  reader.readAsText(file, 'UTF-8');
}

export function triggerImport() {
  importFileInput?.click();
}

function handleImportFileSelect(event) {
  const input = event.target;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  readImportFile(file);
}

async function fetchCssText(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch CSS: ${url}`);
  return resp.text();
}

function isExcludedExportStylesheet(sheet) {
  const href = sheet.href || '';
  return /highlight|katex/i.test(href);
}

async function readStylesheetText(sheet) {
  try {
    return [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
  } catch {
    if (sheet.href && !isExcludedExportStylesheet(sheet)) {
      return fetchCssText(sheet.href);
    }
    return '';
  }
}

function isAppStylesheetCss(text) {
  return text.includes('--font-sans') && text.includes('.prose');
}

async function inlineCssUrls(css, baseUrl = window.location.href) {
  const urlRegex = /url\((['"]?)([^)'"]+)\1\)/g;
  let result = css;
  const matches = [...css.matchAll(urlRegex)];

  for (const match of matches) {
    const path = match[2];
    if (path.startsWith('data:') || path.startsWith('http') || path.startsWith('//')) {
      continue;
    }

    const absoluteUrl = new URL(path, baseUrl).href;

    try {
      const resp = await fetch(absoluteUrl);
      if (resp.ok) {
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob);
        result = result.replace(match[0], `url("${dataUrl}")`);
      } else {
        result = result.replace(match[0], `url("${absoluteUrl}")`);
      }
    } catch {
      result = result.replace(match[0], `url("${absoluteUrl}")`);
    }
  }

  return result;
}

async function readSameOriginStylesheet() {
  for (const sheet of document.styleSheets) {
    if (sheet.ownerNode?.disabled || isExcludedExportStylesheet(sheet)) {
      continue;
    }

    const text = await readStylesheetText(sheet);
    if (isAppStylesheetCss(text)) {
      return text;
    }
  }

  const stylesLink = document.querySelector('link[href*="styles"][rel="stylesheet"]');
  if (stylesLink?.href) {
    return fetchCssText(stylesLink.href);
  }

  return '';
}

async function collectInlineCss(exportTheme, extraCss = '') {
  const isDark = exportTheme === 'dark';
  const parts = [];

  const appCss = await readSameOriginStylesheet();
  if (appCss) parts.push(appCss);

  await ensureHljs();
  await ensureKatex();

  const { light, dark } = getHljsCss();
  if (isDark && dark) {
    parts.push(dark);
  } else if (light) {
    parts.push(light);
  }

  let katexCss = getKatexCss();
  if (katexCss) {
    katexCss = await inlineCssUrls(katexCss);
    parts.push(katexCss);
  }

  parts.push(EXPORT_RESET_CSS);
  if (extraCss) {
    parts.push(extraCss);
  }

  return inlineCssUrls(parts.join('\n'));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Replace image sources with data URLs. Images that can't be fetched (network
 * error, non-OK response, or no CORS headers) keep their original URL.
 * @returns {Promise<number>} how many images could not be embedded
 */
async function inlineImages(rootEl) {
  const images = rootEl.querySelectorAll('img');
  const embedded = await Promise.all(
    [...images].map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return true;

      try {
        const resp = await fetch(src);
        if (!resp.ok) return false;
        const blob = await resp.blob();
        img.src = await blobToDataUrl(blob);
        return true;
      } catch {
        return false;
      }
    })
  );
  return embedded.filter((ok) => !ok).length;
}

function getHtmlExportToast(failedImageCount) {
  if (failedImageCount === 0) return 'Exported HTML';
  const images = failedImageCount === 1 ? '1 image' : `${failedImageCount} images`;
  return `Exported HTML — ${images} couldn't be embedded (kept as links)`;
}

function getDefaultExportFilename() {
  if (lastImportedFilename) {
    return slugifyFilename(lastImportedFilename);
  }
  const h1 = preview.querySelector('h1');
  if (h1?.textContent?.trim()) {
    const slug = h1.textContent
      .trim()
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .slice(0, 50);
    if (slug) return slug;
  }
  return 'export';
}

function getPrintSuggestedTitle(filename) {
  const raw = String(filename).trim() || 'export';
  const withoutExt = raw.replace(/\.pdf$/i, '');
  return withoutExt.replace(/[^\w\s.-]/g, '').trim() || 'export';
}

function applyPrintDocumentTitle(doc, printTitle) {
  doc.title = printTitle;
  const titleEl = doc.querySelector('title');
  if (titleEl) {
    titleEl.textContent = printTitle;
  }
}

function assembleExportDocument({ title, theme, css, bodyHtml }) {
  const safeTitle = getPrintSuggestedTitle(title);
  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(safeTitle)}</title>
  <style>
${css}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function buildExportHtml({ theme, embedImages, extraCss = '', title: titleOverride }) {
  await ensureMermaidReadyForExport();

  const clone = prepareExportClone(preview);
  const failedImageCount = embedImages ? await inlineImages(clone) : 0;

  const css = await collectInlineCss(theme, extraCss);
  const title = getPrintSuggestedTitle(titleOverride?.trim() || getExportDocumentTitle());

  const html = assembleExportDocument({
    title,
    theme,
    css,
    bodyHtml: clone.outerHTML,
  });

  return { html, failedImageCount };
}

function waitForIframeLoad(iframe) {
  return new Promise((resolve, reject) => {
    iframe.addEventListener('load', () => resolve(), { once: true });
    iframe.addEventListener('error', () => reject(new Error('Failed to load print document')), {
      once: true,
    });
  });
}

async function waitForDocumentAssets(doc) {
  if (doc.fonts?.ready) {
    try {
      await doc.fonts.ready;
    } catch {
      // Continue if font loading fails
    }
  }

  const images = [...doc.images];
  // The print frame has no viewport, so lazy images outside it would never start loading.
  images.forEach((img) => {
    img.loading = 'eager';
  });
  await Promise.all(images.map(waitForImage));
}

function waitForImage(img) {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, PRINT_IMAGE_TIMEOUT_MS);
    const done = () => {
      window.clearTimeout(timer);
      resolve();
    };
    if (img.complete) {
      if (typeof img.decode === 'function') {
        img.decode().then(done, done);
      } else {
        done();
      }
      return;
    }
    img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });
}

async function runPrintJob(targetWindow, printTitle) {
  const doc = targetWindow.document;
  if (!doc) {
    throw new Error('Print document unavailable');
  }

  applyPrintDocumentTitle(doc, printTitle);
  await waitForDocumentAssets(doc);

  const previousTopTitle = document.title;
  document.title = printTitle;

  await new Promise((resolve, reject) => {
    let settled = false;
    const cleanupTimer = { handle: 0 };
    const printMq = window.matchMedia?.('print');

    function finish() {
      if (settled) return;
      settled = true;
      window.clearTimeout(cleanupTimer.handle);
      if (printMq) {
        printMq.removeEventListener('change', onPrintModeEnd);
      }
      document.title = previousTopTitle;
      resolve();
    }

    function onPrintModeEnd(event) {
      if (!event.matches) {
        window.setTimeout(finish, 300);
      }
    }

    function onAfterPrint() {
      window.setTimeout(finish, 300);
    }

    window.addEventListener('afterprint', onAfterPrint, { once: true });
    targetWindow.addEventListener('afterprint', onAfterPrint, { once: true });
    if (printMq) {
      printMq.addEventListener('change', onPrintModeEnd);
    }

    cleanupTimer.handle = window.setTimeout(finish, 120_000);

    window.setTimeout(() => {
      try {
        targetWindow.focus();
        targetWindow.print();
      } catch (err) {
        if (!settled) {
          settled = true;
          window.clearTimeout(cleanupTimer.handle);
          if (printMq) {
            printMq.removeEventListener('change', onPrintModeEnd);
          }
          document.title = previousTopTitle;
        }
        reject(err);
      }
    }, 0);
  });
}

/**
 * @param {() => boolean} beforePrint runs once the print document has loaded; returning false
 *   skips printing
 * @returns {Promise<boolean>} whether printing started
 */
function printHtmlDocumentInIframe(html, printTitle, beforePrint) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', printTitle);
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    let cleanedUp = false;
    let printing = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      iframe.remove();
      resolve(printing);
    };

    const fallbackTimer = window.setTimeout(cleanup, 120_000);
    iframe.srcdoc = html;

    waitForIframeLoad(iframe)
      .then(async () => {
        const win = iframe.contentWindow;
        if (!win) {
          throw new Error('Print frame unavailable');
        }
        if (!beforePrint()) {
          window.clearTimeout(fallbackTimer);
          cleanup();
          return;
        }
        printing = true;
        await runPrintJob(win, printTitle);
        window.clearTimeout(fallbackTimer);
        window.setTimeout(cleanup, 300);
      })
      .catch((err) => {
        window.clearTimeout(fallbackTimer);
        if (!cleanedUp) {
          cleanedUp = true;
          iframe.remove();
        }
        reject(err);
      });
  });
}

function printHtmlDocument(html, filename, beforePrint) {
  const printTitle = getPrintSuggestedTitle(filename);
  return printHtmlDocumentInIframe(html, printTitle, beforePrint);
}

function getMarkdownExportExtension() {
  if (lastImportedFilename?.toLowerCase().endsWith('.markdown')) {
    return '.markdown';
  }
  return '.md';
}

function downloadTextFile(filename, content, { mimeType, extension }) {
  const safeName =
    String(filename)
      .replace(/[^\w\s.-]/g, '')
      .trim() || 'export';
  const ext = extension.startsWith('.') ? extension : `.${extension}`;
  const name = safeName.toLowerCase().endsWith(ext) ? safeName : `${safeName}${ext}`;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadHtml(filename, htmlContent) {
  downloadTextFile(filename, htmlContent, {
    mimeType: 'text/html;charset=utf-8',
    extension: '.html',
  });
}

export function downloadMarkdown() {
  if (!editorHasContent()) {
    showToast('Nothing to export');
    return;
  }
  downloadTextFile(getDefaultExportFilename(), editor.value, {
    mimeType: 'text/markdown;charset=utf-8',
    extension: getMarkdownExportExtension(),
  });
  showToast('Downloaded .md');
}

function isExportMenuOpen() {
  return exportMenuPopover && !exportMenuPopover.hidden;
}

function openExportMenu() {
  if (!exportMenuPopover || !exportMenuBtn) return;
  exportMenuPopover.hidden = false;
  exportMenuBtn.setAttribute('aria-expanded', 'true');
  exportMdBtn?.focus();
}

function closeExportMenu({ returnFocus = true } = {}) {
  if (!exportMenuPopover || !exportMenuBtn) return;
  exportMenuPopover.hidden = true;
  exportMenuBtn.setAttribute('aria-expanded', 'false');
  if (returnFocus) {
    exportMenuBtn.focus();
  }
}

function toggleExportMenu() {
  if (isExportMenuOpen()) {
    closeExportMenu();
  } else {
    openExportMenu();
  }
}

/*
 * The export dialog's flow. Each state allows only the events listed; anything else, such as a
 * second click on the busy Download button, is ignored.
 *
 *   closed     OPEN → open
 *   open       SUBMIT → exporting      CANCEL → closed
 *   exporting  PRINT → printing (PDF)  DONE → closed   FAILED → open   CANCEL → closed
 *   printing   DONE → closed           FAILED → closed  OPEN → open
 *
 * The dialog shows in `open` and `exporting`. While an export runs, the page takes on the
 * export theme, until the print dialog closes for PDF. Each export has a run number, so one
 * that was cancelled stops before downloading or printing, and its events are ignored.
 *
 * @typedef {{ status: 'closed' }
 *   | { status: 'open', format: 'html' | 'pdf' }
 *   | { status: 'exporting' | 'printing', format: 'html' | 'pdf', run: number,
 *       themeOverride: { exportTheme: string, originalTheme: string } | null }} ExportState
 */

/** @type {ExportState} */
let exportState = { status: 'closed' };
let lastExportRun = 0;

function sendExport(event) {
  const state = exportState;
  if (event.run !== undefined && event.run !== state.run) return;

  switch (`${state.status} ${event.type}`) {
    case 'closed OPEN':
      showExportDialog(event.format);
      break;
    case 'open SUBMIT':
      startExport(state.format);
      break;
    case 'exporting PRINT':
      setExportState({ ...state, status: 'printing' });
      break;
    case 'exporting FAILED':
      setExportState({ status: 'open', format: state.format });
      break;
    case 'printing OPEN':
      // The page can only be used again once the print dialog has closed, even when the
      // browser hasn't said so with afterprint.
      setExportState({ status: 'closed' });
      showExportDialog(event.format);
      break;
    case 'open CANCEL':
    case 'exporting CANCEL':
    case 'exporting DONE':
    case 'printing DONE':
    case 'printing FAILED':
      setExportState({ status: 'closed' });
      break;
    default:
      // The event doesn't apply in this state.
      break;
  }
}

function setExportState(next) {
  const previousOverride = exportState.themeOverride;
  exportState = next;
  if (!previousOverride && next.themeOverride) {
    applyThemeVisual(next.themeOverride.exportTheme);
  } else if (previousOverride && !next.themeOverride) {
    applyThemeVisual(previousOverride.originalTheme);
  }
  renderExportDialog();
}

function renderExportDialog() {
  const { status, format } = exportState;
  if (format && exportDownloadBtn) {
    const copy = EXPORT_DIALOG_COPY[format];
    exportDownloadBtn.disabled = status === 'exporting';
    exportDownloadBtn.textContent = status === 'exporting' ? copy.busyLabel : copy.primaryLabel;
  }

  const showDialog = status === 'open' || status === 'exporting';
  if (showDialog && !exportDialog.open) {
    exportDialog.showModal();
  } else if (!showDialog && exportDialog.open) {
    exportDialog.close();
  }
}

function showExportDialog(format) {
  const copy = EXPORT_DIALOG_COPY[format];
  if (exportDialogTitle) {
    exportDialogTitle.textContent = copy.title;
  }
  if (exportDialogDesc) {
    exportDialogDesc.textContent = copy.desc;
  }
  if (exportFilenameInput) {
    exportFilenameInput.value = getDefaultExportFilename();
  }
  if (exportThemeSelect) {
    exportThemeSelect.value = copy.defaultTheme;
  }
  if (exportEmbedImagesField) {
    exportEmbedImagesField.hidden = format === 'pdf';
  }
  if (exportEmbedImages && format === 'html') {
    exportEmbedImages.checked = true;
  }

  setExportState({ status: 'open', format });
  exportFilenameInput?.focus();
  exportFilenameInput?.select();
}

function startExport(format) {
  if (!editorHasContent()) {
    showToast('Nothing to export');
    return;
  }

  const originalTheme = getCurrentTheme();
  const chosenTheme = exportThemeSelect?.value || 'current';
  const theme = chosenTheme === 'current' ? originalTheme : chosenTheme;
  const options = {
    filename: exportFilenameInput?.value || 'export',
    theme,
    embedImages: exportEmbedImages?.checked ?? true,
  };
  const run = ++lastExportRun;

  setExportState({
    status: 'exporting',
    format,
    run,
    themeOverride: theme === originalTheme ? null : { exportTheme: theme, originalTheme },
  });
  runExport(run, format, options);
}

async function runExport(run, format, { filename, theme, embedImages }) {
  const isCurrent = () => exportState.run === run;
  try {
    if (format === 'pdf') {
      const { html } = await buildExportHtml({
        theme,
        embedImages: false,
        extraCss: EXPORT_PRINT_CSS,
        title: filename,
      });
      if (!isCurrent()) return;
      const printing = await printHtmlDocument(html, filename, () => {
        if (!isCurrent()) return false;
        sendExport({ type: 'PRINT', run });
        return true;
      });
      if (printing && isCurrent()) showToast('Print dialog opened');
    } else {
      const { html, failedImageCount } = await buildExportHtml({ theme, embedImages });
      if (!isCurrent()) return;
      downloadHtml(filename, html);
      showToast(getHtmlExportToast(failedImageCount));
    }
    sendExport({ type: 'DONE', run });
  } catch (err) {
    console.warn(`${format} export failed:`, err);
    if (!isCurrent()) return;
    showToast('Export failed');
    sendExport({ type: 'FAILED', run });
  }
}

export function bindImportExportListeners() {
  editor.addEventListener('input', handleEditorInputAfterReplace);

  if (welcomeBtn) {
    welcomeBtn.addEventListener('click', openWelcomeGuide);
  }

  if (importBtn) {
    importBtn.addEventListener('click', triggerImport);
  }

  if (importFileInput) {
    importFileInput.addEventListener('change', handleImportFileSelect);
  }

  if (importConfirmCancelBtn) {
    importConfirmCancelBtn.addEventListener('click', () => {
      clearPendingImport();
      importConfirmDialog?.close();
    });
  }

  if (importConfirmReplaceBtn) {
    importConfirmReplaceBtn.addEventListener('click', (e) => {
      e.preventDefault();
      confirmImportReplace();
    });
  }

  if (importConfirmDialog) {
    importConfirmDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      clearPendingImport();
      importConfirmDialog.close();
    });
  }

  bindDropImport(readImportFile);
  bindFileLaunch(readImportFile);

  if (exportMenuBtn) {
    exportMenuBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleExportMenu();
    });
  }

  if (exportMdBtn) {
    exportMdBtn.addEventListener('click', () => {
      closeExportMenu({ returnFocus: false });
      downloadMarkdown();
      exportMenuBtn?.focus();
    });
  }

  if (exportDialog) {
    for (const [button, format] of [
      [exportHtmlBtn, 'html'],
      [exportPdfBtn, 'pdf'],
    ]) {
      button?.addEventListener('click', () => {
        closeExportMenu({ returnFocus: false });
        sendExport({ type: 'OPEN', format });
        exportMenuBtn?.focus();
      });
    }
  }

  document.addEventListener('click', (e) => {
    if (!isExportMenuOpen()) return;
    if (exportMenu?.contains(e.target)) return;
    closeExportMenu();
  });

  document.addEventListener('keydown', (e) => {
    if (!isExportMenuOpen()) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeExportMenu();
    }
  });

  exportCancelBtn?.addEventListener('click', () => sendExport({ type: 'CANCEL' }));

  exportDownloadBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    sendExport({ type: 'SUBMIT' });
  });

  // Enter in the filename field submits the form, which would otherwise just close the dialog.
  exportDialogForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    sendExport({ type: 'SUBMIT' });
  });

  if (exportDialog) {
    exportDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      sendExport({ type: 'CANCEL' });
    });
    // The dialog can also close without the events above, such as when the browser closes it on
    // a repeated Escape. Once it has, the export is cancelled.
    exportDialog.addEventListener('close', () => sendExport({ type: 'CANCEL' }));
  }
}
