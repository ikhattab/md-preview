import { dom } from './dom.js';
import {
  EXPORT_PRINT_CSS,
  EXPORT_RESET_CSS,
  IMPORT_MAX_BYTES,
  IMPORTABLE_EXTENSIONS,
} from './constants.js';
import { slugifyFilename } from './utils.js';
import { ensureHljs, ensureKatex, getHljsCss, getKatexCss } from './lazy-vendors.js';
import {
  showToast,
  updatePreview,
  prepareMermaidForRerender,
  renderMermaidDiagrams,
  prepareExportClone,
  getExportDocumentTitle,
  initMermaid,
} from './preview.js';
import { applyThemeVisual, getCurrentTheme } from './theme.js';
import { editorHasContent, saveContent } from './content.js';
import { debouncedLint, getCurrentLintWarnings, isLintEnabled } from './lint.js';
import { updateLineGutter, resetGutterCache } from './gutter.js';
import { escapeHtml } from './utils.js';

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
  exportDialogTitle,
  exportDialogDesc,
  exportFilenameInput,
  exportThemeSelect,
  exportEmbedImages,
  exportEmbedImagesField,
  exportCancelBtn,
  exportDownloadBtn,
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
let exportFormat = 'html';

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

function applyImportedContent(text, filename) {
  editor.value = text;
  lastImportedFilename = filename;
  updatePreview({ force: true });
  saveContent();
  resetGutterCache();
  refreshGutter();
  debouncedLint(editor.value);
  showToast(`Imported ${filename}`);
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
  applyImportedContent(text, filename);
}

function importMarkdownText(text, filename) {
  if (editorHasContent()) {
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

function triggerImport() {
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

async function inlineImages(rootEl) {
  const images = rootEl.querySelectorAll('img');
  await Promise.all(
    [...images].map(async (img) => {
      const src = img.getAttribute('src');
      if (!src || src.startsWith('data:')) return;

      try {
        const resp = await fetch(src);
        if (!resp.ok) return;
        const blob = await resp.blob();
        img.src = await blobToDataUrl(blob);
      } catch {
        // Keep original src on failure
      }
    })
  );
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

function assembleExportDocument({ title, theme, css, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="en" data-theme="${theme}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
${css}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

async function buildExportHtml(options) {
  const { theme, embedImages, extraCss = '', title: titleOverride } = options;
  const originalTheme = getCurrentTheme();
  const exportTheme = theme === 'current' ? originalTheme : theme;
  const themeChanged = exportTheme !== originalTheme;

  if (themeChanged) {
    applyThemeVisual(exportTheme);
    initMermaid();
    prepareMermaidForRerender();
    await renderMermaidDiagrams();
  }

  try {
    const clone = prepareExportClone(preview);
    if (embedImages) {
      await inlineImages(clone);
    }

    const css = await collectInlineCss(exportTheme, extraCss);
    const title = titleOverride?.trim() || getExportDocumentTitle();

    return assembleExportDocument({
      title,
      theme: exportTheme,
      css,
      bodyHtml: clone.outerHTML,
    });
  } finally {
    if (themeChanged) {
      applyThemeVisual(originalTheme);
      initMermaid();
      prepareMermaidForRerender();
      await renderMermaidDiagrams();
    }
  }
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
  await Promise.all(
    images.map(
      (img) =>
        new Promise((resolve) => {
          if (img.complete) {
            if (typeof img.decode === 'function') {
              img.decode().then(resolve).catch(resolve);
            } else {
              resolve();
            }
            return;
          }
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => resolve(), { once: true });
        })
    )
  );
}

function printHtmlDocument(html) {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('title', 'PDF export');
    iframe.style.cssText =
      'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      iframe.remove();
      resolve();
    };

    const fallbackTimer = window.setTimeout(cleanup, 120_000);

    const onAfterPrint = () => {
      window.clearTimeout(fallbackTimer);
      cleanup();
    };

    iframe.srcdoc = html;

    waitForIframeLoad(iframe)
      .then(async () => {
        const win = iframe.contentWindow;
        const doc = iframe.contentDocument;
        if (!win || !doc) {
          throw new Error('Print frame unavailable');
        }

        win.addEventListener('afterprint', onAfterPrint, { once: true });
        await waitForDocumentAssets(doc);
        win.focus();
        win.print();
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

function downloadMarkdown() {
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

function getExportPrimaryButtonLabel() {
  return EXPORT_DIALOG_COPY[exportFormat]?.primaryLabel ?? 'Download';
}

function openExportDialog(format = 'html') {
  if (!exportDialog) return;
  exportFormat = format === 'pdf' ? 'pdf' : 'html';
  const copy = EXPORT_DIALOG_COPY[exportFormat];

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
    exportEmbedImagesField.hidden = exportFormat === 'pdf';
  }
  if (exportEmbedImages && exportFormat === 'html') {
    exportEmbedImages.checked = true;
  }
  if (exportDownloadBtn) {
    exportDownloadBtn.textContent = getExportPrimaryButtonLabel();
  }
  exportDialog.showModal();
  exportFilenameInput?.focus();
  exportFilenameInput?.select();
}

async function handleExportDownload() {
  if (!editorHasContent()) {
    showToast('Nothing to export');
    return;
  }

  const filename = exportFilenameInput?.value || 'export';
  const theme = exportThemeSelect?.value || 'current';
  const embedImages = exportEmbedImages?.checked ?? true;
  const copy = EXPORT_DIALOG_COPY[exportFormat];
  const primaryLabel = getExportPrimaryButtonLabel();

  if (exportDownloadBtn) {
    exportDownloadBtn.disabled = true;
    exportDownloadBtn.textContent = copy.busyLabel;
  }

  try {
    if (exportFormat === 'pdf') {
      const htmlContent = await buildExportHtml({
        theme,
        embedImages: false,
        extraCss: EXPORT_PRINT_CSS,
        title: filename,
      });
      exportDialog?.close();
      await printHtmlDocument(htmlContent);
      showToast('Print dialog opened');
    } else {
      const htmlContent = await buildExportHtml({ theme, embedImages });
      downloadHtml(filename, htmlContent);
      showToast('Exported HTML');
      exportDialog?.close();
    }
  } catch (err) {
    console.warn(`${exportFormat} export failed:`, err);
    showToast('Export failed');
  } finally {
    if (exportDownloadBtn) {
      exportDownloadBtn.disabled = false;
      exportDownloadBtn.textContent = primaryLabel;
    }
  }
}

export function bindImportExportListeners() {
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

  const editorWrapper = document.querySelector('.editor-wrapper');
  if (editorWrapper) {
    editorWrapper.addEventListener('dragover', (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
      }
    });
    editorWrapper.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      readImportFile(file);
    });
  }

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

  if (exportHtmlBtn) {
    exportHtmlBtn.addEventListener('click', () => {
      closeExportMenu({ returnFocus: false });
      openExportDialog('html');
      exportMenuBtn?.focus();
    });
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => {
      closeExportMenu({ returnFocus: false });
      openExportDialog('pdf');
      exportMenuBtn?.focus();
    });
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

  if (exportCancelBtn) {
    exportCancelBtn.addEventListener('click', () => exportDialog?.close());
  }

  if (exportDownloadBtn) {
    exportDownloadBtn.addEventListener('click', (e) => {
      e.preventDefault();
      handleExportDownload();
    });
  }

  if (exportDialog) {
    exportDialog.addEventListener('cancel', (e) => {
      e.preventDefault();
      exportDialog.close();
    });
  }
}
