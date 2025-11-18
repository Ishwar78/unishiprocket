// sw.js (uni10) — v8
const CACHE_NAME = 'uni10-v8';
const PRECACHE_URLS = [
  '/',               // HTML shell
  '/index.html',
  '/manifest.json?v=8'
];

// Files we NEVER want cached (always network-first)
const BYPASS_PATHS = [
  '/favicon.ico',
  '/favicon-16.png',
  '/favicon-32.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/uni10-logo.jpg',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting(); // take control faster
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Ensure we fetch fresh copies on install
      await cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' })));
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean old caches
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)));
      await self.clients.claim();
    })()
  );
});

// Utility: should bypass caching for this request?
function shouldBypass(url) {
  const p = url.pathname;
  if (BYPASS_PATHS.some(x => p.endsWith(x))) return true;
  // Also bypass any icon files with querystrings (cache-busted)
  if (/\/favicon\.(ico|png)$/.test(p)) return true;
  if (/\/icon-(192|512)\.png$/.test(p)) return true;
  if (/\/apple-touch-icon\.png$/.test(p)) return true;
  if (/\/uni10-logo\.(png|jpg|jpeg|webp)$/.test(p)) return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Always go network-first for HTML navigations (fresh index.html)
  const isNavigation = request.mode === 'navigate';

  // Bypass for icons/manifest/logo
  if (shouldBypass(url) || isNavigation) {
    event.respondWith(
      (async () => {
        try {
          // no-store ensures browser doesn't persist this response
          return await fetch(request, { cache: 'no-store' });
        } catch (e) {
          // Fallback to cache if offline
          const cached = await caches.match(request, { ignoreSearch: false });
          if (cached) return cached;
          // Last resort: app shell
          return caches.match('/index.html');
        }
      })()
    );
    return;
  }

  // Default: stale-while-revalidate for other static assets
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: false });
      const networkFetch = fetch(request).then((resp) => {
        if (resp && resp.status === 200 && resp.type !== 'opaque') {
          cache.put(request, resp.clone());
        }
        return resp;
      }).catch(() => null);

      return cached || networkFetch || fetch(request);
    })()
  );
});
