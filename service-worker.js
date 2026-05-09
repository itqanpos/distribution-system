const CACHE_NAME = 'hesaby-app-v3';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/dashboard.html',
  '/pos.html',
  '/invoices.html',
  '/purchases.html',
  '/cashbox.html',
  '/accounting.html',
  '/reports.html',
  '/sales-returns.html',
  '/purchase-returns.html',
  '/orders.html',
  '/payments.html',
  '/inventory.html',
  '/notifications.html',
  '/customers.html',
  '/products.html',
  '/settings.html',
  '/css/dashboard.css',
  '/css/pos.css',
  '/css/invoices.css',
  '/css/purchases.css',
  '/css/cashbox.css',
  '/css/accounting.css',
  '/css/reports.css',
  '/css/sales-returns.css',
  '/css/purchase-returns.css',
  '/css/orders.css',
  '/css/payments.css',
  '/css/inventory.css',
  '/css/notifications.css',
  '/css/customers.css',
  '/css/products.css',
  '/css/settings.css',
  '/js/supabase.js',
  '/js/db-local.js',
  '/js/sync.js',
  '/js/print.js',
  '/js/dashboard.js',
  '/js/pos.js',
  '/js/invoices.js',
  '/js/purchases.js',
  '/js/cashbox.js',
  '/js/accounting.js',
  '/js/reports.js',
  '/js/sales-returns.js',
  '/js/purchase-returns.js',
  '/js/orders.js',
  '/js/payments.js',
  '/js/inventory.js',
  '/js/notifications.js',
  '/js/customers.js',
  '/js/products.js',
  '/js/settings.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Return cached response if available, otherwise fetch from network
      return cachedResponse || fetch(event.request).then((response) => {
        // Cache the fetched response for future offline use
        return caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, response.clone());
          return response;
        });
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    })
  );
});
