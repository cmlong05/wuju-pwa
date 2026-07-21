const CACHE = 'wuju-v0.4.0';
const PRECACHE = [
  '/wuju-pwa/',
  '/wuju-pwa/index.html',
  '/wuju-pwa/css/style.css',
  '/wuju-pwa/js/dexie.min.js',
  '/wuju-pwa/js/db.js',
  '/wuju-pwa/js/app.js',
  '/wuju-pwa/js/bootstrap.js',
  '/wuju-pwa/js/data-io.js',
  '/wuju-pwa/js/image-utils.js',
  '/wuju-pwa/js/scanner.js',
  '/wuju-pwa/js/ui.js',
  '/wuju-pwa/js/core/dom.js',
  '/wuju-pwa/js/core/app-shell.js',
  '/wuju-pwa/js/views/items.js',
  '/wuju-pwa/js/views/containers.js',
  '/wuju-pwa/js/views/alerts.js',
  '/wuju-pwa/js/zxing-library.min.js',
  '/wuju-pwa/js/zxing-browser.min.js',
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

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'skip-waiting') {
    self.skipWaiting();
    return;
  }
  if (e.data === 'get-version') {
    e.ports[0].postMessage(CACHE);
  }
});

self.addEventListener('fetch', e => {
  // Network-first with no-cache bypass, timeout 3s fallback to SW cache
  var req = new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    Promise.race([
      fetch(req).then(response => {
        const cloned = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, cloned));
        return response;
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('network timeout')), 3000)
      )
    ]).catch(() =>
      caches.match(e.request).then(cached => cached || fetch(e.request))
    )
  );
});
