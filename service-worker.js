// service-worker.js - متوافق مع GitHub Pages للمستودع distribution-system
const REPO_NAME = '/distribution-system';
const CACHE_NAME = 'fooddist-v8' + REPO_NAME;

const urlsToCache = [
  REPO_NAME + '/',
  REPO_NAME + '/index.html',
  REPO_NAME + '/dashboard.html',
  REPO_NAME + '/sales.html',
  REPO_NAME + '/pos.html',
  REPO_NAME + '/invoices.html',
  REPO_NAME + '/purchases.html',
  REPO_NAME + '/cashbox.html',
  REPO_NAME + '/reports.html',
  REPO_NAME + '/accounting.html',
  REPO_NAME + '/customers.html',
  REPO_NAME + '/customer-details.html',
  REPO_NAME + '/reps.html',
  REPO_NAME + '/products.html',
  REPO_NAME + '/settings.html',
  REPO_NAME + '/rep-dashboard.html',
  REPO_NAME + '/rep-pos.html',
  REPO_NAME + '/rep-customers.html',
  REPO_NAME + '/rep-orders.html',
  REPO_NAME + '/rep-collections.html',
  REPO_NAME + '/manifest.json',
  REPO_NAME + '/js/auth.js',
  REPO_NAME + '/js/storage.js',
  REPO_NAME + '/js/utils.js',
  REPO_NAME + '/js/ui.js',
  REPO_NAME + '/js/print.js',
  REPO_NAME + '/icon-192.png',
  REPO_NAME + '/icon-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.allSettled(
        urlsToCache.map(url => fetch(url, { cache: 'no-cache' }).then(response => {
          if (response.ok) return cache.put(url, response);
        }).catch(err => console.warn('Cache failed for', url)))
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

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // فقط نتعامل مع طلبات ضمن نطاق المستودع
  if (url.pathname.startsWith(REPO_NAME) && event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          }
          return response;
        }).catch(() => {
          if (event.request.headers.get('accept').includes('text/html')) {
            return caches.match(REPO_NAME + '/index.html');
          }
        });
      })
    );
  }
});
