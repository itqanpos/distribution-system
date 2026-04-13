// service-worker.js - تعديل استراتيجية التخزين لتجنب مشاكل التوجيه
const CACHE_NAME = 'fooddist-v5';
const urlsToCache = [
  './',
  './index.html',
  './dashboard.html',
  './sales.html',
  './pos.html',
  './invoices.html',
  './purchases.html',
  './cashbox.html',
  './reports.html',
  './accounting.html',
  './customers.html',
  './customer-details.html',
  './reps.html',
  './products.html',
  './settings.html',
  './rep-dashboard.html',
  './rep-pos.html',
  './rep-customers.html',
  './rep-orders.html',
  './rep-collections.html',
  './manifest.json',
  './js/auth.js',
  './js/storage.js',
  './js/utils.js',
  './js/ui.js',
  './js/print.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        urlsToCache.map(url => fetch(url).then(response => {
          if (response.ok) return cache.put(url, response);
        }).catch(err => console.warn('Cache failed for', url))
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

// استراتيجية: الشبكة أولاً، ثم الكاش (لتجنب تقديم index.html قديم)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('/__/') || event.request.url.includes('chrome-extension')) return;

  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then(cached => {
        if (cached) return cached;
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
