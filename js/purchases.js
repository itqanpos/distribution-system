/* =============================================
   المشتريات - حسابي (متوافق مع الجدول الكامل)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        getToday: () => new Date().toISOString().split('T')[0]
    };
}

const Purchases = {
    purchases: [],
    suppliers: [],
    products: [],
    editingId: null,
    currentFilter: 'all',
    isDBReady: false,

    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadData();
    },

    cacheElements() {
        this.el = {};
        const ids = [
            'menuToggle', 'sidebar', 'logoutBtn', 'userProfileBtn', 'userDropdown',
            'searchInput', 'refreshBtn', 'purchasesBody', 'newPurchaseBtn',
            'totalPurchases', 'paidPurchases', 'unpaidPurchases', 'purchaseCount',
            'purchaseModal', 'modalTitle', 'closeModalBtn', 'cancelModalBtn',
            'purchaseForm', 'purchaseId', 'supplierInput', 'supplierList',
            'purchase
