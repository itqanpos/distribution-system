// service-worker.js - نسخة نهائية مصححة
const CACHE_NAME = 'fooddist-v' + new Date().toISOString().replace(/[:.]/g, '-');
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

// تثبيت Service Worker
self.addEventListener('install', event => {
  console.log('[SW] Install event');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching all files');
        return cache.addAll(urlsToCache);
      })
      .catch(err => console.error('[SW] Cache addAll error:', err))
  );
  self.skipWaiting();
});

// تفعيل Service Worker
self.addEventListener('activate', event => {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// استراتيجية "الكاش أولاً" مع تحديث في الخلفية
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      // إرجاع من الكاش فوراً
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(err => console.warn('[SW] Fetch failed:', err));

      return cachedResponse || fetchPromise;
    })
  );
});
