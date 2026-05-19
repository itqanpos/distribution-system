const CACHE_NAME = 'hesaby-app-v5'; // ← زِد الإصدار لإجبار التحديث

// قائمة الأصول التي تُخزَّن عند التثبيت (ثابتة)
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/signup.html',
  '/expired.html',
  '/css/dashboard.css',
  '/css/pos.css',
  '/css/invoices.css',
  '/css/purchases.css',
  '/css/cashbox.css',
  '/css/accounting.css',
  '/css/reports.css',
  '/css/sales-returns.css',
  '/css/purchase-returns.css',
  '/css/customers.css',
  '/css/products.css',
  '/css/settings.css',
  '/js/supabase.js',
  '/js/db-local.js',
  '/js/sync.js',
  '/js/toast.js',
  '/js/modal.js',
  '/js/services/invoiceService.js',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/manifest.json'
];

// صفحات HTML المحمية (لا تُخزَّن تلقائياً، تُجلَب من الشبكة أولاً)
const PROTECTED_PAGES = [
  '/dashboard.html',
  '/pos.html',
  '/invoices.html',
  '/purchases.html',
  '/cashbox.html',
  '/accounting.html',
  '/reports.html',
  '/sales-returns.html',
  '/purchase-returns.html',
  '/customers.html',
  '/products.html',
  '/settings.html',
  '/admin.html'
];

// تثبيت الـ Service Worker: تخزين الأصول الثابتة فقط
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: تخزين الأصول الثابتة');
      return cache.addAll(STATIC_ASSETS);
    })
  );
  // تخطي الانتظار لتفعيل الـ SW الجديد فوراً
  self.skipWaiting();
});

// استراتيجية Network First للصفحات المحمية، وCache First للأصول الثابتة
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // تجاهل طلبات API أو Supabase
  if (path.includes('/rest/v1/') || path.includes('/auth/v1/') || path.includes('/rpc/')) {
    return; // لا نتدخل، تُمرر للشبكة مباشرة
  }

  // إذا كانت الصفحة محمية → Network First
  if (PROTECTED_PAGES.includes(path) || path.endsWith('.html')) {
    event.respondWith(networkFirst(event.request));
  } else {
    // الأصول الثابتة (CSS, JS, أيقونات) → Cache First
    event.respondWith(cacheFirst(event.request));
  }
});

// استراتيجية الشبكة أولاً مع fallback للكاش
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    // نسخة للكاش للتحديث المستقبلي
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    // لا يوجد إنترنت → استخدم الكاش إن وُجد
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // إذا لم يكن هناك كاش، أرجع صفحة fallback (اختياري)
    return new Response('غير متصل بالإنترنت', { status: 503 });
  }
}

// استراتيجية الكاش أولاً مع التحديث في الخلفية للأصول الثابتة
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    // تحديث في الخلفية
    fetch(request).then((response) => {
      caches.open(CACHE_NAME).then((cache) => {
        cache.put(request, response);
      });
    }).catch(() => {});
    return cachedResponse;
  }
  // لم يُوجد في الكاش → جلبه من الشبكة وتخزينه
  try {
    const networkResponse = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
    return networkResponse;
  } catch (error) {
    return new Response('غير متصل بالإنترنت', { status: 503 });
  }
}

// تفعيل الـ SW الجديد: تنظيف الكاش القديم
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName))
      );
    }).then(() => {
      // السيطرة على جميع العملاء فوراً
      return clients.claim();
    })
  );
});
