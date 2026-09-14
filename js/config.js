/* =============================================
   config.js - Configuration
   Version: 4.0.0 (Fixed)

   Fixes:
   - [1] DEBUG flag يتحكم في console
   - [2] DB_VERSION = 3 (لإضافة failed_sync store)
   - [3] DB_NAME ثابت بدون لاحقة إصدار
   - [4] ENV (development/production)
   - [5] SYNC_INTERVAL/AUTO_SYNC مستخدَمان فعلياً
   - [6] TAX_RATE كقيمة افتراضية فقط
   - [7] posOptions قابلة للتخصيص
   - [8] تحذير أمني عند استخدام المفاتيح الافتراضية

   ⚠️ تحذير: لا تنشر هذا الملف مع مفاتيح حقيقية على GitHub عام.
   استخدم متغيرات بيئة على الخادم، أو Supabase Vault.
   إذا كان المفتاح قد ظهر في commit عام سابق، أعد توليده فوراً.
   ============================================= */

(function() {
    'use strict';

    // كشف البيئة
    const host = typeof location !== 'undefined' ? location.hostname : '';
    const isLocal = host === 'localhost' ||
                    host === '127.0.0.1' ||
                    host.startsWith('192.168.') ||
                    host.endsWith('.local') ||
                    host === '';

    window.APP_CONFIG = {
        /* ============================================
           Supabase
           ============================================
           ملاحظة أمنية: مفتاح anon مصمم للنشر العام.
           الأمان يعتمد على RLS في قاعدة البيانات.
           إذا تغيّر المفتاح أو شُك في تسريبه:
           - Regenerate من Dashboard
           - امسح الجلسات القديمة
           ============================================ */
        SUPABASE_URL: 'https://emvqitmpdkkuyjzegyxf.supabase.co',
        SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU',

        /* ============================================
           App Metadata
           ============================================ */
        APP_NAME: 'نظام POS',
        APP_VERSION: '4.0.0',
        ENV: isLocal ? 'development' : 'production',
        DEBUG: isLocal,  // ✅ [FIX #1] console.* يعتمد عليه

        /* ============================================
           Locale
           ============================================ */
        CURRENCY: 'ج.م',
        DEFAULT_LANG: 'ar',
        DEFAULT_THEME: 'light',
        LOCALE: 'ar-EG',

        /* ============================================
           IndexedDB — ✅ [FIX #2, #3]
           ============================================ */
        DB_NAME: 'hesaby_pos',   // ثابت
        DB_VERSION: 3,           // v2 → v3: أضفنا failed_sync

        /* ============================================
           Sync
           ============================================ */
        AUTO_SYNC: true,
        SYNC_INTERVAL: 30000,          // ms
        SYNC_MAX_RETRIES: 8,
        SYNC_FAILED_STORE: true,       // استخدم failed_sync

        /* ============================================
           Business Defaults
           ============================================
           ⚠️ TAX_RATE هنا مجرد قيمة افتراضية.
           القيمة الفعلية تأتي من settings[tenant].taxRate
           عند وجودها.
           ============================================ */
        TAX_RATE: 0,

        /* ============================================
           POS Options — ✅ [FIX #7]
           ============================================ */
        posOptions: {
            INVOICE_PREFIX: '',         // مثال: "INV-"
            RECEIPT_WIDTH: 80,          // mm
            MAX_CART_ITEMS: 500,
            HELD_INVOICE_TTL_DAYS: 7,   // بعدها تُحذف الفواتير المعلقة تلقائياً
            QTY_DECIMALS: 3,
            PRICE_DECIMALS: 2
        },

        /* ============================================
           Auth Options
           ============================================ */
        authOptions: {
            SESSION_REFRESH_MS: 60 * 60 * 1000,   // ساعة
            WAIT_FOR_SESSION_MS: 5000,
            MIN_PASSWORD_LENGTH: 6
        }
    };

    // ✅ [FIX #1, #7] تحكم في التسجيل حسب البيئة
    if (window.APP_CONFIG.DEBUG) {
        // في التطوير فقط: تعطيل console.info في الإنتاج لاحقاً إذا احتجت
        console.log(`✅ config.js loaded [${window.APP_CONFIG.ENV}]`);
    } else {
        // في الإنتاج: امنع console.log و console.info
        const noop = () => {};
        const origWarn = console.warn.bind(console);
        const origError = console.error.bind(console);
        console.log = noop;
        console.info = noop;
        console.debug = noop;
        // نُبقي warn و error لأغراض التشخيص
        console.warn = origWarn;
        console.error = origError;
    }
})();
