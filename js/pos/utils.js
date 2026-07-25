/* =============================================
   pos-core.js - الأساسيات والأدوات المساعدة
   الوظيفة: تعريف الثوابت، كلاس LRU Cache،
   أدوات التنسيق والصوت والإشعارات، تفضيلات
   المستخدم، وإنشاء كائن POS الأساسي.
   ============================================= */
'use strict';

/**
 * الثوابت الأساسية
 * CASH_CUSTOMER_LABEL: النص المعروض للعميل النقدي الافتراضي
 * CASH_CUSTOMER_STORED: القيمة المخزنة في قاعدة البيانات للعميل النقدي
 */
const CASH_CUSTOMER_LABEL = 'نقدي (بدون عميل)';
const CASH_CUSTOMER_STORED = 'نقدي';

// ---------- LRU Cache ----------
/**
 * كلاس LRUCache - نظام تخزين مؤقت يستخدم خوارزمية
 * Least Recently Used للتخلص من العناصر القديمة تلقائياً
 * عند الوصول للحجم الأقصى.
 */
class LRUCache {
    /**
     * @param {number} max - الحد الأقصى لعدد العناصر (افتراضي 500)
     */
    constructor(max = 500) {
        this.max = max;
        this.map = new Map();
    }

    /**
     * جلب قيمة من الكاش مع تحديث ترتيبها كأحدث عنصر
     * @param {*} key - المفتاح
     * @returns {*} القيمة أو undefined
     */
    get(key) {
        if (!this.map.has(key)) return undefined;
        const val = this.map.get(key);
        this.map.delete(key);
        this.map.set(key, val);
        return val;
    }

    /**
     * تخزين قيمة في الكاش
     * @param {*} key - المفتاح
     * @param {*} val - القيمة
     */
    set(key, val) {
        if (this.map.has(key)) this.map.delete(key);
        else if (this.map.size >= this.max) {
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
        }
        this.map.set(key, val);
    }

    /** حذف عنصر من الكاش */
    delete(key) { this.map.delete(key); }

    /** مسح جميع العناصر */
    clear() { this.map.clear(); }
}

/**
 * كائن U - الأدوات المساعدة العامة
 * يحتوي على دوال تنسيق العملات، التواريخ، الهروب من XSS،
 * توليد UUID، إصدار الأصوات، وعرض الإشعارات.
 */
const U = {
    /** تنسيق المبلغ مع رمز الجنيه المصري */
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }) + ' ج.م',

    /** تنسيق التاريخ بالعربية */
    fmtDate: (d) => {
        if (!d) return '';
        try {
            return new Date(d).toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch { return d; }
    },

    /** تاريخ اليوم بصيغة YYYY-MM-DD */
    today: () => new Date().toISOString().split('T')[0],

    /** حماية من هجمات XSS عبر ترميز النصوص */
    escape: (s) => {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(s || ''));
        return div.innerHTML;
    },

    /** دالة Debounce لتأخير تنفيذ دالة حتى يتوقف المستخدم عن الإدخال */
    debounce: (fn, ms) => {
        let t;
        return (...a) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...a), ms);
        };
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

    /** جلب قيمة متغير CSS من السمة الحالية */
    cssVar: (name, fallback = '') => {
        const v = getComputedStyle(document.documentElement)
            .getPropertyValue(name).trim();
        return v || fallback;
    },

    /**
     * إصدار صوت تنبيه قصير
     * @param {string} type - نوع الصوت: add, remove, success
     */
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
        } catch (e) { /* المتصفح لا يدعم AudioContext */ }
    },

    /**
     * عرض رسالة منبثقة للمستخدم
     * @param {string} msg - نص الرسالة
     * @param {string} type - info|success|warning|error
     */
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
 * كائن UserPrefs - إدارة تفضيلات المستخدم في localStorage
 * يحفظ إعدادات مثل البيع السريع، حجم الخط، إظهار الصور والمخزون.
 */
const UserPrefs = {
    /**
     * قراءة قيمة من التفضيلات
     * @param {string} key - المفتاح
     * @param {*} def - القيمة الافتراضية
     */
    get(key, def) {
        try {
            return JSON.parse(localStorage.getItem('pos_prefs'))?.[key] ?? def;
        } catch { return def; }
    },

    /**
     * حفظ قيمة في التفضيلات
     * @param {string} key - المفتاح
     * @param {*} val - القيمة
     */
    set(key, val) {
        try {
            const prefs = JSON.parse(localStorage.getItem('pos_prefs') || '{}');
            prefs[key] = val;
            localStorage.setItem('pos_prefs', JSON.stringify(prefs));
        } catch { /* مساحة التخزين ممتلئة */ }
    },

    /** جلب جميع التفضيلات */
    getAll() {
        try {
            return JSON.parse(localStorage.getItem('pos_prefs') || '{}');
        } catch { return {}; }
    }
};

/**
 * كائن POS - الكائن الرئيسي للنظام
 * يُنشئ هيكل POS.state و POS.cache و POS.el
 * ويُعرض الثوابت والأدوات لباقي الملفات.
 */
window.POS = window.POS || {};
Object.assign(window.POS, {
    /** state - حالة النظام المركزية */
    state: {
        products: [],
        customers: [],
        cart: [],
        selectedProduct: null,
        selectedUnit: null,
        selectedCustomerId: null,
        db: false,
        busy: false,
        addingItem: false,
        subtotal: 0,
        discount: 0,
        discountType: 'amount',
        discountValue: 0,
        net: 0,
        usedBalance: 0,
        editingInv: null,
        currentUser: null,
        resumedInvoiceId: null,
        quickSale: UserPrefs.get('quickSale', false),
        showImages: UserPrefs.get('showImages', true),
        showStock: UserPrefs.get('showStock', true),
        fontSize: UserPrefs.get('fontSize', 14),
        _unitButtonsBound: false,
        _barcodeStream: null,
        _barcodeAnimFrame: null,
        _barcodeBuffer: '',
        _barcodeTimer: null,
        _lastKeyTime: 0,
        _observer: null,
        _offlineSales: [],
        _activityLog: [],
        _connectionCheckTimer: null,
        _cartRendered: false,
        _duplicateCallback: null,
        _thermalDevice: null,
        _barcodeVideo: null
    },

    /** cache - نظام التخزين المؤقت */
    cache: {
        prods: new LRUCache(800),
        custs: new LRUCache(400),
        barcode: new LRUCache(600)
    },

    /** el - مراجع عناصر DOM */
    el: {},

    // تعريض الثوابت والأدوات
    CASH_CUSTOMER_LABEL,
    CASH_CUSTOMER_STORED,
    U,
    UserPrefs
});
