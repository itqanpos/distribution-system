/* =============================================
   Service Worker - PWA Cache
   ============================================= */
const CACHE_VERSION = 'v3.0.0';
const CACHE_NAME = `hesaby-${CACHE_VERSION}`;

const ASSETS = [
    './',
    './index.html',
    './signup.html',
    './pos.html',
    './dashboard.html',
    './invoices.html',
    './purchases.html',
    './customers.html',
    './products.html',
    './css/main.css',
    './css/pos.css',
    './js/config.js',
    './js/utils.js',
    './js/db.js',
    './js/auth.js',
    './js/pos.js',
    './manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS).catch(() => {}))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip Supabase requests
    if (url.hostname.includes('supabase')) return;
    
    // Skip non-GET
    if (request.method !== 'GET') return;
    
    event.respondWith(
        caches.match(request).then(cached => {
            const fetched = fetch(request).then(response => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                }
                return response;
            }).catch(() => cached);
            
            return cached || fetched;
        })
    );
});
