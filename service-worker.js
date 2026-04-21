const CACHE_NAME = 'hesaby-v1';
const urlsToCache = [
  './',
  './index.html',
  './dashboard.html',
  './pos.html',
  './products.html',
  './customers.html',
  './sales.html',
  './invoices.html',
  './purchases.html',
  './cashbox.html',
  './accounting.html',
  './reports.html',
  './sales-returns.html',
  './purchase-returns.html',
  './reps.html',
  './settings.html',
  './party-details.html',
  './js/supabase.js',
  './js/print.js',
  './manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(response => response || fetch(event.request)));
});
