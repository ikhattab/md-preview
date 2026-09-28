/**
 * mdfor.dev service worker — lets the app open offline.
 *
 * The shell (`/`, entry script, CSS, fonts) is precached on install. Lazy chunks
 * (highlight.js, KaTeX, Mermaid) are cached the first time they load. A new version
 * waits until the page asks for it (see lib/offline.js) so a deploy never swaps
 * code under someone mid-edit.
 *
 * The BUILD line below is filled in by scripts/service-worker.js at build time.
 */

const BUILD = { version: 'dev', precache: [], assets: [] };

const SHELL = '/';
const PRECACHE = `md-precache-${BUILD.version}`;
const RUNTIME = 'md-runtime';

// Every hashed file in the build. Only these are cached at runtime, so a host's
// fallback page for a missing file can't end up cached under a chunk's URL.
const known = new Set(BUILD.assets);

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(removeStaleCaches().then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  const { data } = event;
  if (data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  } else if (data?.type === 'CACHE_LOADED' && Array.isArray(data.urls)) {
    event.waitUntil(cacheLoaded(data.urls));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    if (url.pathname === SHELL) event.respondWith(shellResponse(request));
  } else if (known.has(url.pathname)) {
    event.respondWith(assetResponse(event, request));
  }
});

async function precache() {
  const cache = await caches.open(PRECACHE);
  await Promise.all([
    // The shell isn't hashed, so skip the HTTP cache to get this deploy's copy.
    cache.add(new Request(SHELL, { cache: 'reload' })),
    cache.addAll(BUILD.precache),
  ]);
}

async function removeStaleCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith('md-precache-') && name !== PRECACHE)
      .map((name) => caches.delete(name))
  );

  // Lazy chunks whose hash didn't change are kept; ones from older builds go.
  const runtime = await caches.open(RUNTIME);
  const cached = await runtime.keys();
  await Promise.all(
    cached
      .filter((request) => !known.has(new URL(request.url).pathname))
      .map((request) => runtime.delete(request))
  );
}

async function shellResponse(request) {
  const cached = await caches.match(SHELL, { cacheName: PRECACHE });
  return cached ?? fetch(request);
}

async function assetResponse(event, request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    const copy = response.clone();
    event.waitUntil(caches.open(RUNTIME).then((cache) => cache.put(request, copy)));
  }
  return response;
}

/**
 * Cache built files the page loaded before this worker controlled it (the first
 * visit), so what was used then, such as highlighting, also works offline.
 * @param {string[]} urls
 */
async function cacheLoaded(urls) {
  const paths = new Set();
  for (const value of urls) {
    try {
      const url = new URL(value, self.location.origin);
      if (url.origin === self.location.origin && known.has(url.pathname)) paths.add(url.pathname);
    } catch {
      // Ignore anything that isn't a URL.
    }
  }

  const cache = await caches.open(RUNTIME);
  await Promise.allSettled(
    [...paths].map(async (path) => {
      if (!(await caches.match(path, { ignoreVary: true }))) await cache.add(path);
    })
  );
}
