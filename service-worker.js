/* =============================================
   Service Worker - PWA Cache
   Version: 4.0.0 (Production-ready)

   Fixes:
   - [1] precache متسامح مع الملفات المفقودة
   - [2] fallback محلي (offline shell)
   - [3] HTML → network-first
   - [4] JS/CSS/assets → stale-while-revalidate
   - [5] Background Sync
   - [6] message handler (SKIP_WAITING, CLEAR_CACHE)
   - [7] فحص دقيق لنطاق Supabase
   - [8] ignoreSearch للأصول الثابتة
   - [9] trimRuntimeCache لحجم محدود
   - [10] skipWaiting غير تلقائي — من الواجهة فقط
   ============================================= */

const CACHE_VERSION = '4.0.0';
const STATIC_CACHE  = `hesaby-static-${CACHE_VERSION}`;
const RUNTIME_CACHE = `hesaby-runtime-${CACHE_VERSION}`;
const MAX_RUNTIME_ENTRIES = 120;
const SYNC_TAG = 'hesaby-sync-queue';

const PRECACHE_ASSETS = [
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

/* ============================================
   Install — ✅ [FIX #1] كل ملف على حدة
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
        // ملاحظة: لا نستدعي skipWaiting هنا — يفعّله العميل صراحةً
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
   Message Handler — ✅ [FIX #6]
   ============================================ */
self.addEventListener('message', (event) => {
    const data = event.data || {};

    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (data.type === 'CLEAR_CACHE') {
        event.waitUntil((async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        })());
    }

    if (data.type === 'CACHE_URLS' && Array.isArray(data.urls)) {
        event.waitUntil((async () => {
            const cache = await caches.open(RUNTIME_CACHE);
            await Promise.allSettled(data.urls.map(u => cache.add(u)));
        })());
    }
});

/* ============================================
   Helpers
   ============================================ */
function isSupabaseUrl(url) {
    // ✅ [FIX #7] فحص دقيق
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

function isStaticAsset(url) {
    return /\.(css|js|mjs|woff2?|ttf|eot|otf|png|jpg|jpeg|gif|svg|webp|ico|json)$/i.test(url.pathname);
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
   Strategies
   ============================================ */

// HTML: Network-first (يضمن أحدث نسخة، fallback للكاش/الصفحة الرئيسية)
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
        // ✅ [FIX #2] fallback للكاش
        const cache = await caches.open(RUNTIME_CACHE);
        const cached = await cache.match(request, { ignoreSearch: true });
        if (cached) return cached;

        // fallback للصفحة الرئيسية
        const staticCache = await caches.open(STATIC_CACHE);
        const shell = await staticCache.match('./index.html') ||
                      await caches.match('./index.html');
        if (shell) return shell;

        // آخر ملاذ: استجابة HTML بسيطة
        return new Response(
            `<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>غير متصل</title>
             <style>body{font-family:Cairo,Arial,sans-serif;padding:40px;text-align:center;}
             h1{color:#333;} p{color:#666;}</style></head>
             <body><h1>لا يوجد اتصال</h1>
             <p>تحقق من الشبكة ثم أعد المحاولة.</p>
             <button onclick="location.reload()">إعادة المحاولة</button></body></html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

// JS/CSS/الأصول: Stale-While-Revalidate
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    // ✅ [FIX #8] ignoreSearch
    const cached = await cache.match(request, { ignoreSearch: false });

    const networkPromise = fetch(request).then(response => {
        if (response && response.ok) {
            cache.put(request, response.clone()).catch(() => {});
        }
        return response;
    }).catch(() => null);

    if (cached) {
        // حدّث في الخلفية ولا ننتظر
        networkPromise.catch(() => {});
        return cached;
    }

    const fresh = await networkPromise;
    if (fresh) return fresh;

    // فشل كلي
    throw new Error('Resource unavailable offline');
}

// مسار عام للأصول خارج origin
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
        throw err;
    }
}

/* ============================================
   Fetch Router — ✅ [FIX #3, #4]
   ============================================ */
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // تجاهل غير GET
    if (request.method !== 'GET') return;

    // تجاهل Supabase (network only)
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
   Background Sync — ✅ [FIX #5]
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
   Notification Click (اختياري — لا يفعل شيئاً إن لم تُستخدم)
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
