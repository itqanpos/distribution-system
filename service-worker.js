/* =============================================
   service-worker.js – نظام نقاط البيع (POS)
   الإصدار 2.0 – دعم Offline كامل، تحديث آمن، تخزين مرن
   ============================================= */
const CACHE_NAME = 'hesaby-app-v7'; // ← زِد الإصدار مع كل تحديث

// الأصول التي يجب تخزينها فور التثبيت (الشاشة الرئيسية والموارد الأساسية)
const PRECACHE_ASSETS = [
  '/',
  '/index.html',
  '/signup.html',
  '/expired.html',
  '/offline.html', // صفحة fallback عند عدم الاتصال
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/js/supabase.js',
  '/js/db-local.js'
];

// استثناءات: لا تُخزَّن مؤقتاً أبداً (طلبات API حقيقية)
const API_PATTERNS = [
  '/rest/v1/',
  '/auth/v1/',
  '/rpc/',
  '/api/',
  'supabase.co'
];

// تثبيت الـ Service Worker
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('📦 Service Worker: تخزين الأصول الأساسية');
      return cache.addAll(PRECACHE_ASSETS);
    })
  );
  // تفعيل فوري للـ SW الجديد (مع clients.claim لاحقاً)
  self.skipWaiting();
});

// تفعيل الـ SW الجديد: تنظيف الكاش القديم + السيطرة على جميع العملاء
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
    }).then(() => {
      // السيطرة على جميع العملاء المفتوحة فوراً
      return clients.claim();
    }).then(() => {
      // إخطار جميع العملاء بوجود تحديث
      return self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_ACTIVATED', cacheName: CACHE_NAME });
        });
      });
    })
  );
});

// استراتيجية التخزين المؤقت للطلبات
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // تجاهل طلبات API (تترك للشبكة أو طبقة IndexedDB)
  if (isApiRequest(url)) {
    return; // لا نتدخل، تُمرر مباشرة
  }

  // طلبات التنقل (صفحات HTML) → Stale-While-Revalidate
  if (event.request.mode === 'navigate' || path.endsWith('.html')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // الأصول الثابتة (CSS, JS, خطوط, أيقونات) → Cache First مع تحديث خلفي
  if (isStaticAsset(path)) {
    event.respondWith(cacheFirstWithRefresh(event.request));
    return;
  }

  // أي طلب آخر (صور المنتجات، إلخ) → Network First مع Fallback
  event.respondWith(networkFirstWithFallback(event.request));
});

// ==================== دوال الاستراتيجيات ====================

/**
 * Stale-While-Revalidate (مثالي للصفحات المحمية):
 * يُظهر النسخة المخزنة فوراً، ويُحدث الكاش في الخلفية.
 * هذا يضمن عدم فقدان المستخدم لواجهة التطبيق حتى لو انقطع الاتصال فجأة.
 */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  // بدء تحديث الشبكة في الخلفية (لا ننتظره)
  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch((error) => {
      console.warn('⚠️ فشل تحديث الخلفية:', request.url, error);
    });

  // إعادة المخزن فوراً إن وُجد
  if (cachedResponse) {
    return cachedResponse;
  }

  // لا يوجد في الكاش → انتظر الشبكة
  try {
    const networkResponse = await networkPromise;
    return networkResponse;
  } catch (error) {
    // لا يوجد كاش ولا شبكة → صفحة fallback
    if (request.mode === 'navigate') {
      const offlinePage = await cache.match('/offline.html');
      return offlinePage || new Response('أنت غير متصل بالإنترنت. يرجى المحاولة لاحقاً.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
    throw error;
  }
}

/**
 * Cache First مع تحديث خلفي (للأصول الثابتة):
 * يُرجع المخزن فوراً، ويُحدثه من الشبكة للزيارة القادمة.
 */
async function cacheFirstWithRefresh(request) {
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    // تحديث في الخلفية
    fetch(request)
      .then((response) => {
        if (response.ok) {
          cache.put(request, response);
        }
      })
      .catch(() => {});
    return cachedResponse;
  }

  // لم يُوجد في الكاش → جلبه من الشبكة
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // لا شبكة ولا كاش → خطأ
    return new Response('المورد غير متوفر', { status: 408 });
  }
}

/**
 * Network First مع Fallback (للموارد غير الحرجة):
 * يحاول الشبكة أولاً، ثم يرجع للكاش إذا فشل.
 */
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

function isStaticAsset(path) {
  const staticExtensions = ['.css', '.js', '.woff2', '.woff', '.ttf', '.png', '.jpg', '.jpeg', '.svg', '.ico', '.json'];
  return staticExtensions.some(ext => path.endsWith(ext)) || path.startsWith('/icons/') || path.startsWith('/fonts/');
}

// ==================== رسائل من العميل ====================

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // يسمح للعميل بطلب تفعيل SW الجديد يدوياً (تحديث آمن)
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'GET_CACHE_SIZE') {
    // إرسال حجم الكاش للعميل (لأغراض تشخيصية)
    caches.open(CACHE_NAME).then(async (cache) => {
      const keys = await cache.keys();
      let totalSize = 0;
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const blob = await response.blob();
          totalSize += blob.size;
        }
      }
      event.ports[0].postMessage({ size: totalSize, itemCount: keys.length });
    });
  }
});
