const CACHE_NAME = 'fooddist-v1';
const urlsToCache = [
  '/',
  'index.html',
  'dashboard.html',
  'sales.html',
  'pos.html',
  'invoices.html',
  'purchases.html',
  'cashbox.html',
  'reports.html',
  'accounting.html',
  'customers.html',
  'reps.html',
  'products.html',
  'settings.html',
  'js/auth.js',
  'js/storage.js',
  'js/utils.js',
  'js/ui.js',
  'js/print.js',
  'manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
