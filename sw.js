const CACHE = 'wuju-v3';
const PRECACHE = [
  '/wuju-pwa/',
  '/wuju-pwa/index.html',
  '/wuju-pwa/css/style.css',
  '/wuju-pwa/js/dexie.min.js',
  '/wuju-pwa/js/db.js',
  '/wuju-pwa/js/app.js',
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
      Promise.all(keys.map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Always try network first, fall back to cache
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
