// service-worker.js - نسخة مصححة
const CACHE_NAME = 'fooddist-v' + new Date().getTime(); // تحديث تلقائي
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
  './js/database.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.3/dist/dexie.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching all files');
      return cache.addAll(urlsToCache).catch(err => {
        console.error('Failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('./index.html');
        }
      });
    })
  );
});
