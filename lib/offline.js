/**
 * Offline support: registers the service worker (sw.js) and offers a reload when a
 * new version is ready. Its states and events are in lib/machines/app-update.js.
 */

import { UPDATE_CHECK_INTERVAL_MS } from './constants.js';
import { showToast } from './preview.js';
import { createMachine } from './machine.js';
import { appUpdateMachine } from './machines/app-update.js';

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }
  // Keep the worker's install traffic out of the way of startup.
  if (document.readyState === 'complete') {
    register();
  } else {
    window.addEventListener('load', register, { once: true });
  }
}

function offerReload(update, message) {
  showToast(message, {
    action: { label: 'Reload', onClick: () => update.send('RELOAD') },
  });
}

async function register() {
  const { serviceWorker } = navigator;
  const update = createMachine(appUpdateMachine);
  const controlled = Boolean(serviceWorker.controller);

  let registration;
  try {
    registration = await serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return;
  }

  update.subscribe((state, previous, event) => {
    if (event.type === 'CONTROLLER_CHANGED' && previous.value === 'installing') {
      cacheFilesLoadedBeforeControl();
    } else if (state.value === 'updateReady' && previous.value !== 'updateReady') {
      offerReload(update, 'Update available');
    } else if (state.value === 'outdated' && previous.value !== 'outdated') {
      offerReload(update, 'Updated in another tab');
    } else if (event.type === 'RELOAD') {
      // Ask the waiting version to take over; the page reloads once it has. With none waiting,
      // such as after another tab took the update, reload straight away.
      if (previous.value === 'updateReady' && registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      } else {
        location.reload();
      }
    } else if (event.type === 'CONTROLLER_CHANGED' && state.value === 'reloading') {
      location.reload();
    }
  });

  update.send({ type: 'REGISTERED', controlled });
  serviceWorker.addEventListener('controllerchange', () => update.send('CONTROLLER_CHANGED'));

  // Only a returning visit has something to update; the first install isn't one.
  if (registration.waiting && serviceWorker.controller) {
    update.send('UPDATE_READY');
  }
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && serviceWorker.controller) {
        update.send('UPDATE_READY');
      }
    });
  });

  // Long-lived tabs and installed apps rarely navigate, so check on return.
  let lastCheck = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (
      document.visibilityState !== 'visible' ||
      Date.now() - lastCheck < UPDATE_CHECK_INTERVAL_MS
    ) {
      return;
    }
    lastCheck = Date.now();
    registration.update().catch(() => {
      // Offline or the host is unreachable; the next check will try again.
    });
  });
}

/**
 * On a first visit the worker takes over after the page has started loading, so files
 * such as highlight.js never passed through it. Resource timing reports a zero
 * `workerStart` for those, including any still in flight when the worker took over.
 */
function cacheFilesLoadedBeforeControl() {
  new PerformanceObserver((list) => {
    const urls = list
      .getEntries()
      .filter((entry) => entry.workerStart === 0 && entry.name.startsWith(location.origin + '/'))
      .map((entry) => entry.name);
    if (urls.length > 0) {
      navigator.serviceWorker.controller?.postMessage({ type: 'CACHE_LOADED', urls });
    }
  }).observe({ type: 'resource', buffered: true });
}
