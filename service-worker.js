/* =============================================
   service-worker.js - الإصدار النهائي
   ============================================= */
const CACHE_NAME = 'hesaby-v2';
const ASSETS_TO_CACHE = [
    '/distribution-system/',
    '/distribution-system/index.html',
    '/distribution-system/splash.html',
    '/distribution-system/dashboard.html',
    '/distribution-system/pos.html',
    '/distribution-system/invoices.html',
    '/distribution-system/purchases.html',
    '/distribution-system/customers.html',
    '/distribution-system/products.html',
    '/distribution-system/cashbox.html',
    '/distribution-system/settings.html',
    '/distribution-system/reports.html',
    '/distribution-system/sales-returns.html',
    '/distribution-system/purchase-returns.html',
    '/distribution-system/css/dashboard.css',
    '/distribution-system/css/pos.css',
    '/distribution-system/css/invoices.css',
    '/distribution-system/css/purchases.css',
    '/distribution-system/css/customers.css',
    '/distribution-system/css/products.css',
    '/distribution-system/css/cashbox.css',
    '/distribution-system/css/settings.css',
    '/distribution-system/css/reports.css',
    '/distribution-system/css/sales-returns.css',
    '/distribution-system/css/purchase-returns.css',
    '/distribution-system/js/db-local.js',
    '/distribution-system/js/sync.js',
    '/distribution-system/js/supabase.js',
    '/distribution-system/js/print.js',
    '/distribution-system/js/dashboard.js',
    '/distribution-system/js/pos.js',
    '/distribution-system/js/invoices.js',
    '/distribution-system/js/purchases.js',
    '/distribution-system/js/customers.js',
    '/distribution-system/js/products.js',
    '/distribution-system/js/cashbox.js',
    '/distribution-system/js/settings.js',
    '/distribution-system/js/reports.js',
    '/distribution-system/js/sales-returns.js',
    '/distribution-system/js/purchase-returns.js',
    '/distribution-system/icons/icon-192x192.png',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

// التثبيت
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: تخزين الأصول');
                return cache.addAll(ASSETS_TO_CACHE).catch(err => {
                    console.warn('فشل تخزين بعض الأصول:', err);
                });
            })
            .then(() => self.skipWaiting())
    );
});

// التفعيل
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            );
        }).then(() => self.clients.claim())
    );
});

// استراتيجية Network First
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const cloned = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, cloned);
                });
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then(cached => {
                    return cached || new Response('', { status: 503 });
                });
            })
    );
});
