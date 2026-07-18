import { dom } from './dom.js';
import { EXPORT_RESET_CSS, IMPORT_MAX_BYTES, IMPORTABLE_EXTENSIONS } from './constants.js';
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
  exportDialog,
  exportFilenameInput,
  exportThemeSelect,
  exportEmbedImages,
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

async function rewriteBundledKaTeXFontUrls(css) {
  const urlRegex = /url\((['"]?)([^)'"]+)\1\)/g;
  let result = css;
  const matches = [...css.matchAll(urlRegex)];

  for (const match of matches) {
    const path = match[2];
    if (path.startsWith('data:') || path.startsWith('http') || path.startsWith('//')) {
      continue;
    }

    const absoluteUrl = new URL(path.startsWith('/') ? path : `/${path}`, window.location.origin)
      .href;

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
    const linkEl = sheet.ownerNode;
    if (linkEl?.disabled) continue;
    if (linkEl?.tagName === 'LINK' && linkEl.getAttribute('rel') === 'stylesheet') {
      const href = linkEl.getAttribute('href') || '';
      if (href.includes('styles') && !href.includes('highlight') && !href.includes('katex')) {
        try {
          return [...sheet.cssRules].map((rule) => rule.cssText).join('\n');
        } catch {
          if (sheet.href) {
            return fetchCssText(sheet.href);
          }
        }
      }
    }
  }

  const stylesLink = document.querySelector('link[href*="styles"][rel="stylesheet"]');
  if (stylesLink?.href) {
    return fetchCssText(stylesLink.href);
  }

  return '';
}

async function collectInlineCss(exportTheme) {
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
    katexCss = await rewriteBundledKaTeXFontUrls(katexCss);
    parts.push(katexCss);
  }

  parts.push(EXPORT_RESET_CSS);

  return parts.join('\n');
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
  const { theme, embedImages } = options;
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

    const css = await collectInlineCss(exportTheme);
    const title = getExportDocumentTitle();

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

function openExportDialog() {
  if (!exportDialog) return;
  if (exportFilenameInput) {
    exportFilenameInput.value = getDefaultExportFilename();
  }
  if (exportThemeSelect) {
    exportThemeSelect.value = 'current';
  }
  if (exportEmbedImages) {
    exportEmbedImages.checked = true;
  }
  exportDialog.showModal();
  exportFilenameInput?.focus();
  exportFilenameInput?.select();
}

async function handleExportDownload() {
  const filename = exportFilenameInput?.value || 'export';
  const theme = exportThemeSelect?.value || 'current';
  const embedImages = exportEmbedImages?.checked ?? true;

  if (exportDownloadBtn) {
    exportDownloadBtn.disabled = true;
    exportDownloadBtn.textContent = 'Exporting…';
  }

  try {
    const htmlContent = await buildExportHtml({ theme, embedImages });
    downloadHtml(filename, htmlContent);
    showToast('Exported HTML');
    exportDialog?.close();
  } catch (err) {
    console.warn('HTML export failed:', err);
    showToast('Export failed');
  } finally {
    if (exportDownloadBtn) {
      exportDownloadBtn.disabled = false;
      exportDownloadBtn.textContent = 'Download';
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
      openExportDialog();
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
