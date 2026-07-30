'use strict';

const CASH_CUSTOMER_LABEL = 'نقدي (بدون عميل)';
const CASH_CUSTOMER_STORED = 'نقدي';

class LRUCache {
    constructor(max = 500) {
        this.max = max;
        this.map = new Map();
    }
    get(key) {
        if (!this.map.has(key)) return undefined;
        const val = this.map.get(key);
        this.map.delete(key);
        this.map.set(key, val);
        return val;
    }
    set(key, val) {
        if (this.map.has(key)) this.map.delete(key);
        else if (this.map.size >= this.max) {
            const oldest = this.map.keys().next().value;
            this.map.delete(oldest);
        }
        this.map.set(key, val);
    }
    delete(key) { this.map.delete(key); }
    clear() { this.map.clear(); }
}

const U = {
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    fmtDate: (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } },
    fmtDateTime: (d) => { if (!d) return ''; try { return new Date(d).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; } },
    today: () => new Date().toISOString().split('T')[0],
    now: () => new Date().toISOString(),
    escape: (s) => { const div = document.createElement('div'); div.appendChild(document.createTextNode(s || '')); return div.innerHTML; },
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    uuid: () => (crypto?.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
    dbReady: () => !!(window.DB && window.supabaseClient),
    localReady: () => !!(window.localDB?.ready),
    cssVar: (name, fallback = '') => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; },
    playBeep: (type = 'add') => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            gain.gain.value = 0.1;
            osc.type = 'sine';
            osc.frequency.value = type === 'add' ? 880 : type === 'remove' ? 440 : type === 'success' ? 1200 : 660;
            osc.start(); osc.stop(ctx.currentTime + 0.12);
        } catch (e) {}
    },
    showToast: (msg, type = 'info') => {
        if (window.Toast) {
            if (type === 'error') Toast.error(msg);
            else if (type === 'success') Toast.success(msg);
            else if (type === 'warning') Toast.warning(msg);
            else Toast.info(msg);
        }
    }
};

const UserPrefs = {
    get(key, def) { try { return JSON.parse(localStorage.getItem('pos_prefs'))?.[key] ?? def; } catch { return def; } },
    set(key, val) {
        try { const prefs = JSON.parse(localStorage.getItem('pos_prefs') || '{}'); prefs[key] = val; localStorage.setItem('pos_prefs', JSON.stringify(prefs)); } catch {}
    }
};

const PERMISSIONS = {
    admin: {
        canEditPrice: true, canEditDiscount: true, canDeleteItem: true,
        canDeleteInvoice: true, canOpenDrawer: true, canReprint: true,
        canReturn: true, canVoidInvoice: true, maxDiscountPercent: 100, maxDiscountAmount: Infinity
    },
    accountant: {
        canEditPrice: true, canEditDiscount: true, canDeleteItem: false,
        canDeleteInvoice: false, canOpenDrawer: true, canReprint: true,
        canReturn: true, canVoidInvoice: true, maxDiscountPercent: 20, maxDiscountAmount: 500
    },
    cashier: {
        canEditPrice: false, canEditDiscount: false, canDeleteItem: false,
        canDeleteInvoice: false, canOpenDrawer: true, canReprint: true,
        canReturn: false, canVoidInvoice: false, maxDiscountPercent: 0, maxDiscountAmount: 0
    },
    rep: {
        canEditPrice: false, canEditDiscount: false, canDeleteItem: false,
        canDeleteInvoice: false, canOpenDrawer: false, canReprint: false,
        canReturn: false, canVoidInvoice: false, maxDiscountPercent: 0, maxDiscountAmount: 0
    }
};

window.POS = window.POS || {};
Object.assign(window.POS, {
    state: {
        products: [], customers: [], cart: [],
        selectedProduct: null, selectedUnit: null, selectedCustomerId: null,
        db: false, busy: false, addingItem: false,
        subtotal: 0, discount: 0, discountType: 'amount', discountValue: 0, net: 0,
        taxRate: 0, taxAmount: 0, shipping: 0,
        usedBalance: 0, editingInv: null,
        currentUser: null, resumedInvoiceId: null,
        quickSale: UserPrefs.get('quickSale', false),
        showImages: UserPrefs.get('showImages', true),
        showStock: UserPrefs.get('showStock', true),
        fontSize: UserPrefs.get('fontSize', 14),
        productSort: UserPrefs.get('productSort', 'popular'),
        lowStockThreshold: UserPrefs.get('lowStockThreshold', 5),
        _unitButtonsBound: false, _barcodeStream: null, _barcodeAnimFrame: null,
        _barcodeBuffer: '', _barcodeTimer: null, _lastKeyTime: 0,
        _observer: null, _offlineSales: [], _activityLog: [], _connectionCheckTimer: null,
        _cartRendered: false, _duplicateCallback: null, _thermalDevice: null, _barcodeVideo: null,
        paymentMethods: []
    },
    cache: {
        prods: new LRUCache(800),
        custs: new LRUCache(400),
        barcode: new LRUCache(600)
    },
    el: {},
    permissions: PERMISSIONS,
    can: function(action) {
        const role = (this.state.currentUser?.role || 'cashier').toLowerCase();
        const perms = this.permissions[role] || this.permissions.cashier;
        return perms[action] || false;
    },
    CASH_CUSTOMER_LABEL,
    CASH_CUSTOMER_STORED,
    U,
    UserPrefs
});
