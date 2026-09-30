import { showToast } from './preview.js';

/**
 * Open a file the OS hands to the installed app (double-click or "Open with"),
 * passing it to `onFile`. The manifest's `file_handlers` registers the file types.
 * Only Chromium browsers have `launchQueue`; elsewhere this does nothing.
 */
export function bindFileLaunch(onFile) {
  if (!('launchQueue' in window)) return;

  window.launchQueue.setConsumer(async ({ files }) => {
    // Normal launches (not from a file) arrive with no files.
    const handle = files?.[0];
    if (!handle) return;
    try {
      onFile(await handle.getFile());
    } catch (err) {
      console.warn('Opening launched file failed:', err);
      showToast('Import failed');
    }
  });
}
