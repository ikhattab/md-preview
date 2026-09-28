/**
 * MD Preview — Application entry
 * Thin orchestrator wiring modules and event listeners
 */

import './lib/fonts.js';
import './styles.css';

import { dom } from './lib/dom.js';
import { STORAGE_KEYS } from './lib/constants.js';
import { getStorageItem } from './lib/storage.js';
import { bindPreviewLinkListeners, configureMarked, schedulePreviewUpdate } from './lib/preview.js';
import { updateLineGutter, syncGutterScroll } from './lib/gutter.js';
import { initTooltips } from './lib/tooltip.js';
import {
  debouncedLint,
  getCurrentLintWarnings,
  isLintEnabled,
  loadLintPreference,
  runInitialLint,
  toggleLint,
} from './lib/lint.js';
import { loadTheme, setTheme, toggleTheme } from './lib/theme.js';
import {
  bindResizeListeners,
  handleViewportResize,
  initMobileView,
  isMobile,
  loadCollapseState,
  loadEditorWidth,
  loadScrollSyncPreference,
  setMobileView,
  switchToPreviewAfterPaste,
  throttledSyncEditorToPreview,
  throttledSyncPreviewToEditor,
  toggleCollapse,
  toggleScrollSync,
} from './lib/layout.js';
import {
  debouncedSave,
  loadContent,
  normalizeEditorPosition,
  resetPaneScrollPositions,
  saveContent,
} from './lib/content.js';
import { bindImportExportListeners } from './lib/import-export.js';
import { bindShortcuts } from './lib/shortcuts.js';
import { bindHeaderMenuListeners } from './lib/header-menu.js';
import { renderStaticIcons } from './lib/icons.js';
import { initMediaViewer } from './lib/media-viewer.js';
import { registerServiceWorker } from './lib/offline.js';
import { loadRemoteImagePreference, toggleRemoteImageBlocking } from './lib/remote-images.js';

const {
  editor,
  preview,
  themeToggle,
  editorPane,
  collapseBtn,
  scrollSyncToggle,
  lintToggle,
  remoteImagesToggle,
  viewTabs,
} = dom;

if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

function refreshGutter() {
  updateLineGutter({
    lintEnabled: isLintEnabled(),
    warnings: getCurrentLintWarnings(),
  });
}

function setupEventListeners() {
  editor.addEventListener('input', () => {
    schedulePreviewUpdate();
    refreshGutter();
    debouncedSave();
    debouncedLint(editor.value);
  });

  editor.addEventListener('paste', () => {
    setTimeout(() => {
      refreshGutter();
      debouncedSave();
      debouncedLint(editor.value);
      switchToPreviewAfterPaste();
    }, 0);
  });

  bindImportExportListeners();
  bindShortcuts();
  bindHeaderMenuListeners();
  bindPreviewLinkListeners();

  themeToggle.addEventListener('click', toggleTheme);

  if (collapseBtn) {
    collapseBtn.addEventListener('click', toggleCollapse);
  }

  if (editorPane) {
    editorPane.addEventListener('click', (e) => {
      if (
        editorPane.classList.contains('collapsed') &&
        e.target !== collapseBtn &&
        !collapseBtn.contains(e.target)
      ) {
        toggleCollapse();
      }
    });
  }

  bindResizeListeners();

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!getStorageItem(STORAGE_KEYS.THEME)) {
      setTheme(e.matches ? 'dark' : 'light');
    }
  });

  if (scrollSyncToggle) {
    scrollSyncToggle.addEventListener('click', toggleScrollSync);
  }

  if (lintToggle) {
    lintToggle.addEventListener('click', toggleLint);
  }

  if (remoteImagesToggle) {
    remoteImagesToggle.addEventListener('click', () => {
      toggleRemoteImageBlocking();
      schedulePreviewUpdate({ force: true });
    });
  }

  viewTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      setMobileView(tab.dataset.view);
    });
  });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(handleViewportResize, 100);
  });

  editor.addEventListener('scroll', () => {
    syncGutterScroll();
    if (!isMobile()) {
      throttledSyncEditorToPreview();
    }
  });

  preview.addEventListener('scroll', () => {
    if (!isMobile()) {
      throttledSyncPreviewToEditor();
    }
  });

  window.addEventListener('beforeunload', saveContent);
}

function init() {
  renderStaticIcons();
  initMediaViewer();
  initTooltips();
  configureMarked();
  loadTheme();
  loadCollapseState();
  loadEditorWidth();
  loadScrollSyncPreference();
  loadLintPreference();
  loadRemoteImagePreference();
  loadContent();
  refreshGutter();
  resetPaneScrollPositions();
  normalizeEditorPosition();
  setupEventListeners();
  initMobileView();
  runInitialLint();
  registerServiceWorker();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
