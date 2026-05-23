/* =============================================
   service-worker.js - Advanced PWA Service Worker
   الإصدار 3.2 - إنتاجي كامل
   ============================================= */

// إصدار الكاش - يتغير مع كل تحديث للتطبيق لتفعيل التحميل التلقائي
const CACHE_VERSION = 'v3.2.0';
const CACHE_NAME = `hesaby-app-${CACHE_VERSION}`;
const RUNTIME_CACHE = `hesaby-runtime-${CACHE_VERSION}`;

// قائمة الموارد الثابتة التي سيتم تخزينها فور التثبيت
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/signup.html',
    '/dashboard.html',
    '/pos.html',
    '/admin.html',
    '/expired.html',
    '/offline.html',
    '/icons/icon-192x192.png',
    '/icons/icon-512x512.png',
    '/js/core/db-local.js',
    '/js/core/supabase.js',
    '/js/core/sync.js',
    '/js/core/toast.js',
    '/js/modules/products.js',
    '/js/modules/invoices.js',
    '/js/modules/purchases.js',
    '/js/modules/accounting.js',
    '/js/modules/settings.js',
    '/js/app.js',
    '/manifest.json'
];

// الأنماط التي لا تخزن (طلبات API، Supabase، وغيرها)
const NO_CACHE_PATTERNS = [
    /supabase\.co/,
    /auth\/v1/,
    /rest\/v1/,
    /graphql\/v1/,
    /api\//,
    /chrome-extension/,
    /socket\.io/
];

// ==================== التثبيت (Install) ====================
self.addEventListener('install', (event) => {
    console.log(`[SW] التثبيت ${CACHE_VERSION}...`);

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log(`[SW] تخزين ${PRECACHE_ASSETS.length} ملف أساسي...`);
                // تخزين الملفات مع تجاهل الأخطاء الفردية
                return Promise.allSettled(
                    PRECACHE_ASSETS.map(asset =>
                        cache.add(asset).catch(err => {
                            console.warn(`[SW] فشل تخزين: ${asset}`, err);
                        })
                    )
                );
            })
            .then(() => {
                console.log('[SW] تم التثبيت بنجاح');
                // تفعيل الـ Service Worker فوراً دون انتظار إغلاق التبويبات القديمة
                return self.skipWaiting();
            })
    );
});

// ==================== التفعيل (Activate) ====================
self.addEventListener('activate', (event) => {
    console.log(`[SW] تفعيل ${CACHE_VERSION}...`);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                // حذف الكاشات القديمة
                const deletePromises = cacheNames
                    .filter(name => name.startsWith('hesaby-') && name !== CACHE_NAME && name !== RUNTIME_CACHE)
                    .map(name => {
                        console.log(`[SW] حذف الكاش القديم: ${name}`);
                        return caches.delete(name);
                    });
                return Promise.all(deletePromises);
            })
            .then(() => {
                console.log('[SW] تم التفعيل');
                // السيطرة على جميع العملاء فوراً
                return self.clients.claim();
            })
    );
});

// ==================== استراتيجية الطلب (Fetch) ====================

/**
 * تحديد ما إذا كان الطلب يجب تخزينه
 */
function shouldCache(request) {
    const url = new URL(request.url);

    // تخطي الطلبات غير GET
    if (request.method !== 'GET') return false;

    // تخطي الأنماط المستبعدة
    return !NO_CACHE_PATTERNS.some(pattern => pattern.test(url.href));
}

/**
 * استراتيجية Cache First مع Network Update
 * مناسبة للموارد الثابتة مثل CSS, JS, صور
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) {
        // تحديث الكاش في الخلفية (Stale-While-Revalidate)
        fetch(request).then(response => {
            if (response.ok) {
                caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
            }
        }).catch(() => {});
        return cached;
    }
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // إذا كان الطلب لصفحة HTML، قدم صفحة Offline
        if (request.headers.get('Accept')?.includes('text/html')) {
            return caches.match('/offline.html');
        }
        throw error;
    }
}

/**
 * استراتيجية Network First مع Cache Fallback
 * مناسبة للموارد التي تتغير باستمرار مثل الصفحات
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response.ok) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) return cached;
        // للصفحات HTML، قدم صفحة Offline
        if (request.headers.get('Accept')?.includes('text/html')) {
            return caches.match('/offline.html');
        }
        throw error;
    }
}

/**
 * استراتيجية Network Only
 * للطلبات التي لا يجب تخزينها (API, Auth)
 */
async function networkOnly(request) {
    try {
        return await fetch(request);
    } catch (error) {
        return new Response(
            JSON.stringify({ error: 'غير متصل بالإنترنت' }),
            {
                status: 503,
                statusText: 'Service Unavailable',
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}

// ==================== معالج الطلبات ====================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // تجاهل الطلبات غير HTTP(S)
    if (!url.protocol.startsWith('http')) return;

    // طلبات Supabase API و Auth - Network Only
    if (NO_CACHE_PATTERNS.some(pattern => pattern.test(url.href))) {
        event.respondWith(networkOnly(request));
        return;
    }

    // طلبات التنقل (صفحات HTML) - Network First
    if (request.mode === 'navigate') {
        event.respondWith(networkFirst(request));
        return;
    }

    // الموارد الثابتة (JS, CSS, صور, خطوط) - Cache First
    if (shouldCache(request)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    // الباقي - Network First
    event.respondWith(networkFirst(request));
});

// ==================== رسائل من العملاء ====================
self.addEventListener('message', (event) => {
    const { type, payload } = event.data || {};

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CLEAR_CACHE':
            caches.delete(CACHE_NAME).then(() => {
                caches.delete(RUNTIME_CACHE).then(() => {
                    // إعلام العميل
                    event.source?.postMessage({ type: 'CACHE_CLEARED' });
                });
            });
            break;

        case 'CHECK_VERSION':
            event.source?.postMessage({
                type: 'VERSION_INFO',
                payload: { version: CACHE_VERSION }
            });
            break;

        case 'PRECACHE_URLS':
            if (payload?.urls) {
                caches.open(CACHE_NAME).then(cache => {
                    return Promise.allSettled(
                        payload.urls.map(url => cache.add(url).catch(() => {}))
                    );
                });
            }
            break;

        default:
            console.log('[SW] رسالة غير معروفة:', event.data);
    }
});

// ==================== إشعارات الدفع (Push) - اختياري ====================
self.addEventListener('push', (event) => {
    if (!event.data) return;

    try {
        const data = event.data.json();
        const options = {
            body: data.body || 'إشعار جديد',
            icon: '/icons/icon-192x192.png',
            badge: '/icons/icon-72x72.png',
            vibrate: [200, 100, 200],
            data: {
                url: data.url || '/',
                ...data.extra
            },
            tag: data.tag || 'default',
            renotify: true,
            requireInteraction: data.requireInteraction || false,
            actions: data.actions || []
        };

        event.waitUntil(
            self.registration.showNotification(data.title || 'حسابي', options)
        );
    } catch (e) {
        // البيانات ليست JSON، استخدم النص مباشرة
        event.waitUntil(
            self.registration.showNotification('حسابي', {
                body: event.data.text(),
                icon: '/icons/icon-192x192.png'
            })
        );
    }
});

// ==================== النقر على الإشعار ====================
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clientList) => {
                // البحث عن تبويب مفتوح مسبقاً
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        client.postMessage({
                            type: 'NAVIGATE',
                            payload: { url: urlToOpen }
                        });
                        return;
                    }
                }
                // فتح تبويب جديد
                return clients.openWindow(urlToOpen);
            })
    );
});

// ==================== مزامنة في الخلفية (Background Sync) ====================
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-data') {
        event.waitUntil(
            // إعلام جميع العملاء بمحاولة المزامنة
            clients.matchAll().then(clients => {
                clients.forEach(client => {
                    client.postMessage({ type: 'SYNC_TRIGGERED', payload: {} });
                });
            })
        );
    }
});

// ==================== تحديث دوري للكاش ====================
// تنظيف الكاش القديم كل 24 ساعة
setInterval(() => {
    caches.keys().then(names => {
        const oldCaches = names.filter(name =>
            name.startsWith('hesaby-runtime-') && name !== RUNTIME_CACHE
        );
        return Promise.all(oldCaches.map(name => caches.delete(name)));
    }).catch(() => {});
}, 24 * 60 * 60 * 1000);

console.log(`[SW] Service Worker جاهز - ${CACHE_VERSION}`);
