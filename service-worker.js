// service-worker.js
const CACHE_NAME = 'hesaby-v1.2';
const ASSETS_TO_CACHE = [
  '/distribution-system/',
  '/distribution-system/index.html',
  '/distribution-system/dashboard.html',
  '/distribution-system/pos.html',
  '/distribution-system/sales.html',
  '/distribution-system/purchases.html',
  '/distribution-system/customers.html',
  '/distribution-system/products.html',
  '/distribution-system/cashbox.html',
  '/distribution-system/invoices.html',
  '/distribution-system/reports.html',
  '/distribution-system/settings.html',
  '/distribution-system/css/pos.css',
  '/distribution-system/css/products.css',
  '/distribution-system/css/purchases.css',
  '/distribution-system/css/sales.css',
  '/distribution-system/css/dashboard.css',
  '/distribution-system/css/customers.css',
  '/distribution-system/css/cashbox.css',
  '/distribution-system/css/settings.css',
  '/distribution-system/css/reports.css',
  '/distribution-system/js/supabase.js',
  '/distribution-system/js/print.js',
  '/distribution-system/js/pos.js',
  '/distribution-system/js/products.js',
  '/distribution-system/js/purchases.js',
  '/distribution-system/js/sales.js',
  '/distribution-system/js/dashboard.js',
  '/distribution-system/js/customers.js',
  '/distribution-system/js/cashbox.js',
  '/distribution-system/js/settings.js',
  '/distribution-system/js/reports.js',
  '/distribution-system/js/invoices.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Caching files');
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Failed to cache some assets:', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Clearing old cache');
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // استراتيجية Network First مع Fallback إلى Cache
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // تحديث الكاش بالنسخة الجديدة
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // العودة إلى الكاش عند فشل الشبكة
        return caches.match(event.request);
      })
  );
});
