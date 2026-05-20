/* =============================================
   service-worker.js – نظام نقاط البيع (POS)
   الإصدار 2.1 – أمان محسّن، عدم تخزين صفحات محمية
   ============================================= */
const CACHE_NAME = 'hesaby-app-v8';

// الصفحات العامة فقط هي التي تُخزَّن (لا تحتوي على بيانات مستخدم)
const PUBLIC_PAGES = [
  '/',
  '/index.html',
  '/signup.html',
  '/offline.html'
];

// الأصول الثابتة التي تُخزَّن فور التثبيت
const PRECACHE_ASSETS = [
  ...PUBLIC_PAGES,
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/js/supabase.js',
  '/js/db-local.js'
];

// استثناءات: لا تُخزَّن مؤقتاً أبداً
const API_PATTERNS = [
  '/rest/v1/',
  '/auth/v1/',
  '/rpc/',
  '/api/',
  'supabase.co'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker: تخزين الأصول الأساسية');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => {
            console.log('🗑️ حذف الكاش القديم:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // تجاهل طلبات API
  if (isApiRequest(url)) {
    return;
  }

  // طلبات التنقل (صفحات HTML)
  if (event.request.mode === 'navigate') {
    if (isPublicPage(path)) {
      // الصفحات العامة فقط: stale-while-revalidate
      event.respondWith(staleWhileRevalidate(event.request));
    } else {
      // الصفحات المحمية: network first بدون تخزين
      event.respondWith(networkFirstNoCache(event.request));
    }
    return;
  }

  // الأصول الثابتة → Cache First مع تحديث خلفي
  if (isStaticAsset(path)) {
    event.respondWith(cacheFirstWithRefresh(event.request));
    return;
  }

  // أي طلب آخر → Network First مع Fallback
  event.respondWith(networkFirstWithFallback(event.request));
});

// ==================== استراتيجيات ====================

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => {});

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await networkPromise;
    if (networkResponse) return networkResponse;
  } catch (error) {}

  // Fallback إلى offline.html
  if (request.mode === 'navigate') {
    const offlinePage = await cache.match('/offline.html');
    return offlinePage || new Response('أنت غير متصل بالإنترنت', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
  return new Response('غير متصل', { status: 503 });
}

async function networkFirstNoCache(request) {
  try {
    const response = await fetch(request);
    return response;
  } catch (error) {
    // لا تخزين، لكن نعرض offline.html عند الفشل
    const cache = await caches.open(CACHE_NAME);
    const offlinePage = await cache.match('/offline.html');
    return offlinePage || new Response('أنت غير متصل بالإنترنت', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

async function cacheFirstWithRefresh(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    fetch(request)
      .then((response) => {
        if (response.ok) {
          cache.put(request, response);
        }
      })
      .catch(() => {});
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return new Response('المورد غير متوفر', { status: 408 });
  }
}

async function networkFirstWithFallback(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    return new Response('غير متصل', { status: 503 });
  }
}

// ==================== دوال مساعدة ====================

function isApiRequest(url) {
  const href = url.href;
  return API_PATTERNS.some(pattern => href.includes(pattern));
}

function isPublicPage(path) {
  return PUBLIC_PAGES.some(p => path.endsWith(p) || path === p);
}

function isStaticAsset(path) {
  const staticExtensions = ['.css', '.js', '.woff2', '.woff', '.ttf', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.json'];
  return staticExtensions.some(ext => path.endsWith(ext)) || path.startsWith('/icons/') || path.startsWith('/fonts/');
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
