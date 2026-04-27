// service-worker.js - إصدار Offline مع مزامنة
const CACHE_NAME = 'hesaby-v2-offline';
const API_CACHE = 'hesaby-api-v1';

// الأصول الثابتة التي يتم تخزينها عند التثبيت
const STATIC_ASSETS = [
  '/distribution-system/',
  '/distribution-system/splash.html',
  '/distribution-system/index.html',
  '/distribution-system/dashboard.html',
  '/distribution-system/pos.html',
  '/distribution-system/invoices.html',
  '/distribution-system/purchases.html',
  '/distribution-system/customers.html',
  '/distribution-system/products.html',
  '/distribution-system/cashbox.html',
  '/distribution-system/reports.html',
  '/distribution-system/settings.html',
  '/distribution-system/css/pos.css',
  '/distribution-system/css/products.css',
  '/distribution-system/css/purchases.css',
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
  '/distribution-system/js/dashboard.js',
  '/distribution-system/js/customers.js',
  '/distribution-system/js/cashbox.js',
  '/distribution-system/js/settings.js',
  '/distribution-system/js/reports.js',
  '/distribution-system/js/invoices.js',
  '/distribution-system/js/db-local.js',
  '/distribution-system/js/sync.js',
  '/distribution-system/icons/icon-192x192.png',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// تثبيت Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('تخزين الأصول الثابتة');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// تنشيط
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== API_CACHE)
          .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// استراتيجية Network First مع تخزين API
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // طلبات Supabase API
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/rest/v1/')) {
    event.respondWith(networkFirstWithAPICache(event.request));
  } else {
    // طلبات عادية (HTML, CSS, JS)
    event.respondWith(networkFirst(event.request));
  }
});

// استراتيجية Network First للموارد العادية
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    return cached || new Response('', { status: 503 });
  }
}

// استراتيجية Network First مع تخزين API
async function networkFirstWithAPICache(request) {
  try {
    const response = await fetch(request);
    const cache = await caches.open(API_CACHE);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    // إذا لم توجد بيانات مخزنة، أرجع قالبًا JSON فارغًا
    return new Response(JSON.stringify([]), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

// استمع لرسائل المزامنة من الصفحة
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SYNC_NOW') {
    // يمكن تنفيذ مزامنة خلفية (Background Sync) هنا
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({ type: 'SYNC_COMPLETED' });
      });
    });
  }
});
