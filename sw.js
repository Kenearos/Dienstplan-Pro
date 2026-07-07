const CACHE_NAME = 'dienstplan-pro-v8';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './calculator.js',
  './variants.js',
  './holidays.js',
  './storage.js',
  './sync.js',
  './auth-ui.js',
  './image-import.js'
];

self.addEventListener('install', (e) => {
  // Neue Version sofort uebernehmen, nicht auf Schliessen aller Tabs warten.
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim()) // laufende Tabs sofort uebernehmen
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});
