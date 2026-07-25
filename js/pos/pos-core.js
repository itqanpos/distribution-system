/* =============================================
   pos-core.js - الأساسيات والأدوات المساعدة
   الوظيفة: تعريف الثوابت، الأدوات المساعدة (U)،
   تفضيلات المستخدم، كائن الحالة الأساسي POS.
   ============================================= */
'use strict';

/**
 * الثوابت الأساسية
 * CASH_CUSTOMER_LABEL: النص المعروض للعميل النقدي الافتراضي
 * CASH_CUSTOMER_STORED: القيمة المخزنة في قاعدة البيانات للعميل النقدي
 */
const CASH_CUSTOMER_LABEL = 'نقدي (بدون عميل)';
const CASH_CUSTOMER_STORED = 'نقدي';

/**
 * Class LRUCache
 * نظام تخزين مؤقت (Cache) يستخدم خوارزمية LRU (Least Recently Used)
 * لتخزين المنتجات والعملاء والباركود بشكل مؤقت مع حد أقصى للحجم
 */
class LRUCache {
    /**
     * @param {number} max - الحد الأقصى لعدد العناصر في الكاش (افتراضي 500)
     */
    constructor(max = 500) {
        this.max = max;
        this.map = new Map(); // استخدام Map للحفاظ على ترتيب الإدخال
    }

    /**
     * جلب قيمة من الكاش
     * @param {string} key - المفتاح
     * @returns {*} القيمة المخزنة أو undefined
     */
    get(key) {
        if (!this.map.has(key)) return undefined;
        const val = this.map.get(key);
        // إعادة ترتيب العنصر ليصبح الأحدث استخداماً
        this.map.delete(key);
        this.map.set(key, val);
        return val;
    }

    /**
     * تخزين قيمة في الكاش
     * @param {string} key - المفتاح
     * @param {*} val - القيمة
     */
    set(key, val) {
        if (this.map.has(key)) this.map.delete(key);
        else if (this.map.size >= this.max) {
            // حذف أقدم عنصر (الأول في الخريطة)
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
        }
        this.map.set(key, val);
    }

    /** حذف عنصر من الكاش */
    delete(key) { this.map.delete(key); }

    /** مسح الكاش بالكامل */
    clear() { this.map.clear(); }
}

/**
 * كائن U - الأدوات المساعدة العامة
 * يحتوي على دوال تنسيق العملات، التواريخ، توليد UUID، الصوت، إلخ
 */
const U = {
    /** تنسيق المبلغ وعرضه بالجنيه المصري */
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',

    /** تنسيق التاريخ بالعربية */
    fmtDate: (d) => {
        if (!d) return '';
        try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
        catch { return d; }
    },

    /** تاريخ اليوم بصيغة YYYY-MM-DD */
    today: () => new Date().toISOString().split('T')[0],

    /** منع هجمات XSS عبر ترميز النص */
    escape: (s) => {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(s || ''));
        return div.innerHTML;
    },

    /** دالة Debounce لتقليل تكرار استدعاء دالة ما */
    debounce: (fn, ms) => {
        let t;
        return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    },

    /** تقريب رقم لعدد معين من المنازل العشرية */
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),

    /** توليد UUID فريد */
    uuid: () => {
        if (crypto?.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },

    /** التحقق من جاهزية قاعدة البيانات السحابية */
    dbReady: () => !!(window.DB && window.supabaseClient),

    /** التحقق من جاهزية قاعدة البيانات المحلية */
    localReady: () => !!(window.localDB?.ready),

    /** جلب قيمة متغير CSS */
    cssVar: (name, fallback = '') => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    },

    /** تشغيل صوت تنبيه (للإضافة/الحذف/النجاح) */
    playBeep: (type = 'add') => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            gain.gain.value = 0.1;
            osc.type = 'sine';
            if (type === 'add') osc.frequency.value = 880;
            else if (type === 'remove') osc.frequency.value = 440;
            else if (type === 'success') osc.frequency.value = 1200;
            else osc.frequency.value = 660;
            osc.start();
            osc.stop(ctx.currentTime + 0.12);
        } catch (e) { /* المتصفح لا يدعم الصوت */ }
    },

    /** عرض رسالة Toast للمستخدم */
    showToast: (msg, type = 'info') => {
        if (window.Toast) {
            if (type === 'error') Toast.error(msg);
            else if (type === 'success') Toast.success(msg);
            else if (type === 'warning') Toast.warning(msg);
            else Toast.info(msg);
        }
    }
};

/**
 * كائن UserPrefs - تفضيلات المستخدم المخزنة محلياً
 * لحفظ إعدادات مثل البيع السريع، حجم الخط، إظهار الصور، إلخ
 */
const UserPrefs = {
    get(key, def) {
        try { return JSON.parse(localStorage.getItem('pos_prefs'))?.[key] ?? def; }
        catch { return def; }
    },
    set(key, val) {
        try {
            const prefs = JSON.parse(localStorage.getItem('pos_prefs') || '{}');
            prefs[key] = val;
            localStorage.setItem('pos_prefs', JSON.stringify(prefs));
        } catch { /* مساحة التخزين ممتلئة */ }
    }
};

/**
 * كائن POS العام - الحالة الأساسية للنظام
 * يتم توسيعه في الملفات اللاحقة
 */
window.POS = window.POS || {};
Object.assign(window.POS, {
    /**
     * state: حالة النظام المركزية
     * تحتوي على المنتجات، العملاء، السلة، الإعدادات، المتغيرات المؤقتة
     */
    state: {
        products: [],          // قائمة المنتجات
        customers: [],         // قائمة العملاء
        cart: [],              // محتويات السلة
        selectedProduct: null, // المنتج المحدد في نافذة الوحدة
        selectedUnit: null,    // الوحدة المحددة
        selectedCustomerId: null, // معرف العميل المحدد
        db: false,             // هل قاعدة البيانات جاهزة
        busy: false,           // هل النظام مشغول بعملية
        addingItem: false,     // هل جاري إضافة عنصر
        subtotal: 0,           // المجموع الفرعي
        discount: 0,           // قيمة الخصم
        discountType: 'amount', // نوع الخصم (مبلغ أو نسبة)
        discountValue: 0,      // قيمة الخصم المدخلة
        net: 0,                // الصافي بعد الخصم
        usedBalance: 0,        // الرصيد المستخدم من العميل
        editingInv: null,      // معرف الفاتورة قيد التعديل
        currentUser: null,     // المستخدم الحالي
        resumedInvoiceId: null, // معرف الفاتورة المستأنفة
        quickSale: UserPrefs.get('quickSale', false), // وضع البيع السريع
        showImages: UserPrefs.get('showImages', true), // إظهار صور المنتجات
        showStock: UserPrefs.get('showStock', true),   // إظهار المخزون
        fontSize: UserPrefs.get('fontSize', 14),       // حجم الخط
        _unitButtonsBound: false,     // هل تم ربط أزرار الوحدات
        _barcodeStream: null,         // بث الكاميرا للباركود
        _barcodeAnimFrame: null,      // إطار الحركة للباركود
        _barcodeBuffer: '',           // مخزن الباركود المؤقت
        _barcodeTimer: null,          // مؤقت الباركود
        _lastKeyTime: 0,              // وقت آخر ضغطة مفتاح
        _observer: null,              // IntersectionObserver للشبكة
        _offlineSales: [],            // مبيعات غير متصلة
        _activityLog: [],             // سجل النشاط
        _connectionCheckTimer: null,  // مؤقت فحص الاتصال
        _cartRendered: false,         // هل تم رسم السلة
        _duplicateCallback: null,     // رد نداء تكرار المنتج
        _thermalDevice: null,         // جهاز الطباعة الحرارية
        _barcodeVideo: null           // عنصر فيديو الباركود
    },

    /**
     * cache: نظام التخزين المؤقت
     * prods: كاش المنتجات
     * custs: كاش العملاء
     * barcode: كاش الباركود
     */
    cache: {
        prods: new LRUCache(800),
        custs: new LRUCache(400),
        barcode: new LRUCache(600)
    },

    /** el: مراجع عناصر DOM (تُملأ في pos-dom.js) */
    el: {},

    // تعريض الثوابت والأدوات لتكون متاحة في باقي الملفات
    CASH_CUSTOMER_LABEL,
    CASH_CUSTOMER_STORED,
    U,
    UserPrefs
});
