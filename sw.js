const CACHE = 'wuju-v41';
const PRECACHE = [
  '/wuju-pwa/',
  '/wuju-pwa/index.html',
  '/wuju-pwa/css/style.css',
  '/wuju-pwa/js/dexie.min.js',
  '/wuju-pwa/js/db.js',
  '/wuju-pwa/js/app.js',
  '/wuju-pwa/js/qr-scanner-worker.min.js',
  '/wuju-pwa/manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first with timeout: try network for 3s, then fall back to cache
  e.respondWith(
    Promise.race([
      fetch(e.request).then(response => {
        // Update cache with fresh response for future offline use
        const cloned = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, cloned));
        return response;
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('network timeout')), 3000)
      )
    ]).catch(() => caches.match(e.request))
  );
});
