/* =============================================
   Service Worker - PWA Cache
   Version: 4.1.0

   Changelog من v4.0.0:
   - [SW-1] CACHE_VERSION = 4.1.0 (لإبطال الكاش القديم)
   - [SW-2] PRECACHE_ASSETS كاملة (toast, dashboard, invoices, ...)
   - [SW-3] networkFirstNavigation: يبحث في STATIC_CACHE أولاً
   - [SW-4] offline.html مخصص بدل index.html
   - [SW-5] message handler: فحص event.waitUntil
   - [SW-6] isStaticAsset: يشمل .map
   - [SW-7] cacheFirst: لا throw عند الفشل، Response فاضل
   - [SW-8] staleWhileRevalidate: تعليق صحيح
   ============================================= */

const CACHE_VERSION = '4.1.0';
const STATIC_CACHE  = `hesaby-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `hesaby-runtime-${CACHE_VERSION}`;
const MAX_RUNTIME_ENTRIES = 120;
const SYNC_TAG = 'hesaby-sync-queue';
const OFFLINE_URL = './offline.html';

// ✅ [SW-2] قائمة كاملة — بعضها قد لا يوجد، install يتسامح
const PRECACHE_ASSETS = [
    // Root
    './',
    './manifest.json',

    // HTML
    './index.html',
    './signup.html',
    './dashboard.html',
    './pos.html',
    './invoices.html',
    './purchases.html',
    './returns.html',
    './customers.html',
    './products.html',
    './settings.html',
    './offline.html',

    // CSS
    './css/main.css',
    './css/pos.css',
    './css/dashboard.css',
    './css/invoices.css',
    './css/purchases.css',
    './css/returns.css',
    './css/customers.css',
    './css/products.css',
    './css/settings.css',

    // JS core
    './js/config.js',
    './js/utils.js',
    './js/toast.js',
    './js/db.js',
    './js/auth.js',

    // JS pages
    './js/dashboard.js',
    './js/pos.js',
    './js/invoices.js',
    './js/purchases.js',
    './js/returns.js',
    './js/customers.js',
    './js/products.js',
    './js/settings.js',

    // JS services
    './js/services/invoiceService.js',
    './js/services/purchaseService.js',

    // Icons
    './icons/icon-192x192.png',
    './icons/icon-512x512.png'
];

/* ============================================
   Install — tolerant of missing files
   ============================================ */
self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(STATIC_CACHE);
        const results = await Promise.allSettled(
            PRECACHE_ASSETS.map(url => cache.add(url))
        );
        const failed = results
            .map((r, i) => r.status === 'rejected' ? PRECACHE_ASSETS[i] : null)
            .filter(Boolean);
        if (failed.length) {
            console.warn('[SW] ملفات لم تُخزَّن:', failed);
        }
    })());
});

/* ============================================
   Activate — حذف الكاشات القديمة
   ============================================ */
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(
            keys.filter(k => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
                .map(k => caches.delete(k))
        );
        await self.clients.claim();
    })());
});

/* ============================================
   Message Handler — ✅ [SW-5] فحص waitUntil
   ============================================ */
self.addEventListener('message', (event) => {
    const data = event.data || {};
    const tasks = [];

    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (data.type === 'CLEAR_CACHE') {
        tasks.push((async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        })());
    }

    if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
        tasks.push((async () => {
            const cache = await caches.open(RUNTIME_CACHE);
            await Promise.allSettled(data.urls.map(u => cache.add(u)));
        })());
    }

    if (tasks.length) {
        if (typeof event.waitUntil === 'function') {
            event.waitUntil(Promise.all(tasks));
        } else {
            // fallback: shush, best-effort
            Promise.all(tasks).catch(() => {});
        }
    }
});

/* ============================================
   Helpers
   ============================================ */
function isSupabaseUrl(url) {
    return url.hostname === 'supabase.co' ||
           url.hostname.endsWith('.supabase.co');
}

function isSameOrigin(url) {
    return url.origin === self.location.origin;
}

function isNavigation(request) {
    return request.mode === 'navigate' ||
           (request.method === 'GET' &&
            (request.headers.get('accept') || '').includes('text/html'));
}

// ✅ [SW-6] .map مُضاف
function isStaticAsset(url) {
    return /\.(css|js|mjs|map|woff2?|ttf|eot|otf|png|jpg|jpeg|gif|svg|webp|ico|json)$/i.test(url.pathname);
}

async function trimCache(cacheName, maxEntries) {
    try {
        const cache = await caches.open(cacheName);
        const keys = await cache.keys();
        if (keys.length <= maxEntries) return;
        const excess = keys.length - maxEntries;
        await Promise.all(keys.slice(0, excess).map(k => cache.delete(k)));
    } catch { /* ignore */ }
}

/* ============================================
   Offline Response — ✅ [SW-4]
   ============================================ */
async function offlineResponse() {
    // حاول offline.html أولاً
    try {
        const staticCache = await caches.open(STATIC_CACHE);
        const offline = await staticCache.match(OFFLINE_URL);
        if (offline) return offline;

        const runtimeCache = await caches.open(RUNTIME_CACHE);
        const offlineRuntime = await runtimeCache.match(OFFLINE_URL);
        if (offlineRuntime) return offlineRuntime;
    } catch { /* ignore */ }

    // آخر ملاذ: HTML مضمّن
    return new Response(
        `<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">
         <meta name="viewport" content="width=device-width,initial-scale=1">
         <title>غير متصل</title>
         <style>
            body { font-family: 'Cairo', Arial, sans-serif; padding: 40px; text-align: center;
                   background: #f5f5f5; color: #333; min-height: 100vh;
                   display: grid; place-items: center; margin: 0; }
            .box { max-width: 400px; }
            h1 { color: #333; margin-bottom: 12px; }
            p { color: #666; line-height: 1.7; }
            button { padding: 12px 28px; background: #4f46e5; color: #fff; border: none;
                     border-radius: 10px; font-weight: 700; cursor: pointer;
                     font-size: 15px; font-family: inherit; margin-top: 16px; }
            button:hover { background: #4338ca; }
         </style></head>
         <body><div class="box">
            <h1>لا يوجد اتصال</h1>
            <p>لا يمكن الوصول إلى الصفحة المطلوبة الآن. تحقق من الشبكة ثم أعد المحاولة.</p>
            <button onclick="location.reload()">إعادة المحاولة</button>
         </div></body></html>`,
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
}

/* ============================================
   Strategies
   ============================================ */

// HTML: Network-first
// ✅ [SW-3] يبحث في RUNTIME ثم STATIC (لنفس الـ URL) قبل offline
async function networkFirstNavigation(request) {
    try {
        const response = await fetch(request);
        if (response && response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone()).catch(() => {});
            trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES);
        }
        return response;
    } catch (err) {
        // 1) حاول في RUNTIME_CACHE بنفس الـ URL
        try {
            const runtimeCache = await caches.open(RUNTIME_CACHE);
            const runtimeHit = await runtimeCache.match(request, { ignoreSearch: true });
            if (runtimeHit) return runtimeHit;
        } catch { /* ignore */ }

        // 2) ✅ [SW-3] حاول في STATIC_CACHE بنفس الـ URL
        try {
            const staticCache = await caches.open(STATIC_CACHE);
            const staticHit = await staticCache.match(request, { ignoreSearch: true });
            if (staticHit) return staticHit;
        } catch { /* ignore */ }

        // 3) offline page
        return offlineResponse();
    }
}

// JS/CSS/assets: Stale-While-Revalidate
// ✅ [SW-8] تعليق صحيح — ignoreSearch: false للـ JS/CSS
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const networkPromise = fetch(request).then(response => {
        if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => {});
        }
        return response;
    }).catch(() => null);

    if (cached) {
        networkPromise.catch(() => {});
        return cached;
    }

    const fresh = await networkPromise;
    if (fresh) return fresh;

    throw new Error('Resource unavailable offline');
}

// ✅ [SW-7] cacheFirst — لا throw، Response 503
async function cacheFirst(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => {});
            trimCache(cacheName, MAX_RUNTIME_ENTRIES);
        }
        return response;
    } catch (err) {
        // ✅ لا throw — Response فاضل
        return new Response('Offline — resource unavailable', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

/* ============================================
   Fetch Router
   ============================================ */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // تجاهل غير GET
    if (request.method !== 'GET') return;

    // تجاهل Supabase
    if (isSupabaseUrl(url)) return;

    // تجاهل طلبات Range
    if (request.headers.get('range')) return;

    // نفس المصدر
    if (isSameOrigin(url)) {
        if (isNavigation(request)) {
            event.respondWith(networkFirstNavigation(request));
            return;
        }
        if (isStaticAsset(url)) {
            event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
            return;
        }
        event.respondWith(cacheFirst(request, RUNTIME_CACHE));
        return;
    }

    // مصادر خارجية (CDN، خطوط): cache-first
    event.respondWith(cacheFirst(request, RUNTIME_CACHE));
});

/* ============================================
   Background Sync
   ============================================ */
self.addEventListener('sync', (event) => {
    if (event.tag === SYNC_TAG) {
        event.waitUntil((async () => {
            const clients = await self.clients.matchAll({
                type: 'window',
                includeUncontrolled: true
            });
            clients.forEach(c => {
                try { c.postMessage({ type: 'SYNC_NOW' }); } catch {}
            });
        })());
    }
});

/* ============================================
   Notification Click
   ============================================ */
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil((async () => {
        const all = await self.clients.matchAll({ type: 'window' });
        const url = event.notification?.data?.url || './';
        for (const client of all) {
            if (client.url.includes(self.location.origin)) {
                client.focus();
                if ('navigate' in client) client.navigate(url);
                return;
            }
        }
        if (self.clients.openWindow) self.clients.openWindow(url);
    })());
});
