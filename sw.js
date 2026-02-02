const CACHE_NAME = 'dienstplan-pro-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './calculator.js',
  './holidays.js',
  './storage.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
