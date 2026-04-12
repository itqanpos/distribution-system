// service-worker.js
const CACHE_NAME = 'fooddist-v2';
const urlsToCache = [
  '/',
  'index.html',
  'dashboard.html',
  'sales.html',
  'pos.html',
  'invoices.html',
  'purchases.html',
  'cashbox.html',
  'reports.html',
  'accounting.html',
  'customers.html',
  'customer-details.html',
  'reps.html',
  'products.html',
  'settings.html',
  'rep-dashboard.html',
  'rep-pos.html',
  'rep-customers.html',
  'rep-orders.html',
  'rep-collections.html',
  'manifest.json',
  'js/auth.js',
  'js/storage.js',
  'js/utils.js',
  'js/ui.js',
  'js/print.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css'
];

// تثبيت Service Worker وتخزين الملفات
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
  self.skipWaiting();
});

// تفعيل Service Worker وتنظيف الكاش القديم
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// استراتيجية "الكاش أولاً ثم الشبكة" للملفات الثابتة
self.addEventListener('fetch', event => {
  // تجاهل طلبات chrome-extension والطلبات غير GET
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // إرجاع الملف من الكاش
        return cachedResponse;
      }
      // إذا لم يكن موجودًا، جلبه من الشبكة وتخزينه للمستقبل
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseToCache);
        });
        return response;
      }).catch(() => {
        // في حال فشل الاتصال وكان المورد غير موجود في الكاش (لصفحات HTML يمكن إرجاع صفحة offline مخصصة)
        if (event.request.headers.get('accept').includes('text/html')) {
          return caches.match('index.html');
        }
      });
    })
  );
});
