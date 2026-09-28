/**
 * Offline support: registers the service worker (sw.js) and offers a reload when a
 * new version is ready.
 */

import { UPDATE_CHECK_INTERVAL_MS } from './constants.js';
import { showToast } from './preview.js';

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

async function register() {
  const { serviceWorker } = navigator;
  const wasControlled = Boolean(serviceWorker.controller);

  let registration;
  try {
    registration = await serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('Service worker registration failed:', err);
    return;
  }

  let reloadRequested = false;
  serviceWorker.addEventListener('controllerchange', () => {
    if (reloadRequested) {
      location.reload();
    } else if (!wasControlled) {
      cacheFilesLoadedBeforeControl();
    }
  });

  const offerUpdate = () => {
    showToast('Update available', {
      action: {
        label: 'Reload',
        onClick: () => {
          if (!registration.waiting) {
            location.reload();
            return;
          }
          reloadRequested = true;
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        },
      },
    });
  };

  // Only a returning visit has something to update; the first install isn't one.
  if (registration.waiting && serviceWorker.controller) {
    offerUpdate();
  }
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && serviceWorker.controller) {
        offerUpdate();
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
