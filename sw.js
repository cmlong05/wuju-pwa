const CACHE = 'wuju-v1';
const PRECACHE = [
  '/wuju-pwa/',
  '/wuju-pwa/index.html',
  '/wuju-pwa/css/style.css',
  '/wuju-pwa/js/db.js',
  '/wuju-pwa/js/app.js',
  '/wuju-pwa/manifest.json',
  'https://unpkg.com/dexie@4.0.4/dist/dexie.js'
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
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
