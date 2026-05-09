/* =============================================
   نقطة البيع - حسابي (v2.1 مُحسَّن)
   ============================================= */
'use strict';

// ==================== الأدوات المساعدة ====================
const Utils = {
    formatMoney: (amount, currency = 'ج.م') => {
        return Number(amount).toLocaleString('ar-EG', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        }) + ' ' + currency;
    },
    getToday: () => new Date().toISOString().split('T')[0],
    
    escapeHTML: (str) => {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    },
    
    // ✅ تم إصلاحها: Debounce بسيطة وآمنة
    debounce: (fn, delay) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => fn(...args), delay);
        };
    },
    
    round: (value, decimals = 3) => {
        return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
    },
    
    generateUUID: () => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    },
    
    // ✅ التحقق الآمن من وجود DB
    isDBReady: () => !!(window.supabase),
    // ✅ التحقق من وجود localDB
    hasLocalDB: () => !!(window.localDB)
};

// ==================== POS Main Object ====================
const POS = {
    state: {
        products: [],
        customers: [],
        cart: [],
        selectedProduct: null,
        selectedUnit: null,
        selectedCustomerId: null,
        isDBReady: false,
        isProcessing: false,
        subtotal: 0,
        discount: 0,
        discountType: 'amount',
        discountValue: 0,
        netTotal: 0
    },

    cache: {
        productMap: new Map(),
        customerMap: new Map(),
        productUnitsCache: new Map()
    },

    el: {},

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.handleConnectionStatus();
        window.addEventListener('online', () => this.updateOnlineStatus());
        window.addEventListener('offline', () => this.updateOnlineStatus());
        // ✅ حفظ السلة عند إخفاء التطبيق (تطبيقات الجوال)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this.saveCartToStorage();
            }
        });
        
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadInitialData();
    },

    cacheDOM() {
        const ids = [
            'userProfileBtn', 'userDropdown', 'menuToggle', 'sidebar', 'sidebarOverlay',
            'logoutBtn', 'productSearchInput', 'customerSearchInput',
            'customerList', 'customerBalanceDisplay', 'productDropdown',
            'cartItemsContainer', 'discountValue', 'discountType',
            'itemTypesCount', 'totalPieces', 'subtotal', 'netTotal',
            'payBtn', 'holdBtn', 'heldInvoicesBtn',
            'unitQuantityModal', 'paymentModal', 'heldInvoicesModal',
            'toast', 'unitButtons', 'selectedQuantity', 'selectedPrice',
            'stockInfo', 'addToCartBtn', 'modalProductName',
            'paymentMethod', 'cashField', 'transferField',
            'cashAmount', 'transferAmount', 'remainingDisplay',
            'balanceAfterLabel', 'balanceAfter', 'paymentNotes',
            'confirmAndPrintBtn', 'closeUnitModalBtn', 'closePaymentModalBtn',
            'closeHeldModalBtn', 'heldInvoicesList',
            'paySubtotal', 'payDiscount', 'payNet', 'currentBalance',
            'currentBalanceLabel'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    bindEvents() {
        this.el.userProfileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.userDropdown.classList.toggle('show');
        });
        document.addEventListener('click', () => {
            this.el.userDropdown?.classList.remove('show');
        });

        // ✅ معالجة القائمة الجانبية مع الطبقة الداكنة
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay?.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                this.el.sidebar.classList.remove('open');
                this.el.sidebarOverlay?.classList.remove('show');
            });
        });

        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        const debouncedSearch = Utils.debounce(() => this.filterProducts(), 150);
        this.el.productSearchInput?.addEventListener('input', debouncedSearch);

        this.el.productDropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item && item.dataset.id) {
                this.openUnitModal(item.dataset.id);
                this.hideProductDropdown();
                this.el.productSearchInput.value = '';
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-header')) {
                this.hideProductDropdown();
            }
        });

        this.el.customerSearchInput?.addEventListener('input', () => this.onCustomerSearch());

        this.el.discountValue?.addEventListener('input', () => {
            this.state.discountValue = parseFloat(this.el.discountValue.value) || 0;
            this.updateTotalsAndUI();
        });
        this.el.discountType?.addEventListener('change', () => {
            this.state.discountType = this.el.discountType.value;
            this.updateTotalsAndUI();
        });

        this.el.payBtn?.addEventListener('click', () => this.openPaymentModal());
        this.el.holdBtn?.addEventListener('click', () => this.holdInvoice());
        this.el.heldInvoicesBtn?.addEventListener('click', () => this.loadHeldInvoices());

        this.el.addToCartBtn?.addEventListener('click', () => this.addToCartFromModal());
        this.el.closeUnitModalBtn?.addEventListener('click', () => this.closeModal('unitQuantityModal'));

        this.el.confirmAndPrintBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.completePayment();
        });
        this.el.closePaymentModalBtn?.addEventListener('click', () => this.closeModal('paymentModal'));
        this.el.paymentMethod?.addEventListener('change', () => this.togglePaymentFields());
        this.el.cashAmount?.addEventListener('input', () => this.updatePaymentPreview());
        this.el.transferAmount?.addEventListener('input', () => this.updatePaymentPreview());

        this.el.closeHeldModalBtn?.addEventListener('click', () => this.closeModal('heldInvoicesModal'));
    },

    handleConnectionStatus() { this.updateOnlineStatus(); },
    updateOnlineStatus() {
        const navbar = document.getElementById('mainNavbar');
        if (!navbar) return;
        navbar.classList.toggle('offline', !navigator.onLine);
    },

    async loadInitialData() {
        this.state.isDBReady = Utils.isDBReady();
        if (!this.state.isDBReady) {
            console.warn('⚠️ وضع الاختبار أو الاعتماد على LocalDB');
        }
        await this.loadProductsAndCustomers();
        this.buildCache();
        this.restoreCartFromStorage();
        
        if (this.state.products.length === 0) {
            console.warn('⚠️ لا توجد منتجات في قاعدة البيانات.');
            this.showToast('لا توجد منتجات. أضف منتجات أولاً.');
        }
    },

    async loadProductsAndCustomers() {
        try {
            if (this.state.isDBReady) {
                this.state.products = await DB.getProducts() || [];
                this.state.products = this.state.products.map(p => {
                    if (typeof p.units === 'string') {
                        try { p.units = JSON.parse(p.units); } 
                        catch (e) { p.units = []; }
                    }
                    return p;
                });
                this.state.customers = await DB.getParties('customer') || [];
            } else if (Utils.hasLocalDB()) {
                this.state.products = await localDB.getAll('products') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.state.customers = allParties.filter(p => p.type === 'customer');
            } else {
                // بيانات افتراضية للاختبار
                this.state.products = [
                    { id: '1', name: 'بيبسي', units: [
                        { name: 'كرتونة', price: 240, cost: 200, stock: 5, factor: 1 },
                        { name: 'علبة', price: 10, cost: 8.33, stock: 0, factor: 24 }
                    ]},
                    { id: '2', name: 'شيبسي', units: [
                        { name: 'كرتونة', price: 150, cost: 120, stock: 8, factor: 1 },
                        { name: 'كيس', price: 5, cost: 4, stock: 0, factor: 30 }
                    ]}
                ];
                this.state.customers = [
                    { id: '101', name: 'عميل تجريبي', balance: 500 },
                    { id: '102', name: 'عميل مدين', balance: -200 }
                ];
            }
            this.populateCustomerList();
        } catch (e) {
            console.error('فشل تحميل البيانات:', e);
            this.showToast('فشل تحميل البيانات');
            this.state.products = [];
            this.state.customers = [];
        }
    },

    buildCache() {
        this.cache.productMap.clear();
        this.cache.customerMap.clear();
        this.cache.productUnitsCache.clear();
        
        this.state.products.forEach(p => {
            this.cache.productMap.set(String(p.id), p);
            this.cache.productMap.set(p.id, p);
        });
        this.state.customers.forEach(c => {
            this.cache.customerMap.set(String(c.id), c);
            this.cache.customerMap.set(c.id, c);
        });
    },

    populateCustomerList() {
        const list = this.el.customerList;
        if (!list) return;
        list.innerHTML = '<option value="نقدي (بدون عميل)" data-id="cash">نقدي (بدون عميل)</option>' +
            this.state.customers.map(c => 
                `<option value="${Utils.escapeHTML(c.name)}" data-id="${Utils.escapeHTML(String(c.id))}">${Utils.escapeHTML(c.name)} (${Utils.escapeHTML(c.phone || '')})</option>`
            ).join('');
    },

    calculateTotals() {
        let subtotal = 0;
        for (const item of this.state.cart) {
            subtotal += Utils.round(item.price * item.quantity);
        }
        subtotal = Utils.round(subtotal, 2);
        
        let discount = 0;
        if (this.state.discountType === 'amount') {
            discount = Math.min(this.state.discountValue, subtotal);
        } else {
            discount = Utils.round(subtotal * this.state.discountValue / 100, 2);
        }
        const net = Utils.round(subtotal - discount, 2);
        
        this.state.subtotal = subtotal;
        this.state.discount = discount;
        this.state.netTotal = net;
        
        return { subtotal, discount, net };
    },

    updateTotalsAndUI() {
        const { subtotal, discount, net } = this.calculateTotals();
        if (this.el.subtotal) this.el.subtotal.textContent = Utils.formatMoney(subtotal);
        if (this.el.netTotal) this.el.netTotal.textContent = Utils.formatMoney(net);
        if (this.el.itemTypesCount) this.el.itemTypesCount.textContent = this.state.cart.length;
        const pieces = this.state.cart.reduce((s, item) => s + (item.quantity * (item.factor || 1)), 0);
        if (this.el.totalPieces) this.el.totalPieces.textContent = Math.round(pieces);
    },

    renderCart() {
        const container = this.el.cartItemsContainer;
        if (!container) return;
        
        container.innerHTML = `
            <div class="cart-header-row">
                <span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span>
            </div>
        `;
        if (!this.state.cart.length) {
            container.innerHTML += '<div class="empty-cart-message">السلة فارغة</div>';
            this.updateTotalsAndUI();
            return;
        }
        this.state.cart.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'cart-item-row';
            const safeName = Utils.escapeHTML(item.productName);
            const safeUnit = Utils.escapeHTML(item.unitName);
            const lineTotal = Utils.formatMoney(Utils.round(item.price * item.quantity, 2));
            row.innerHTML = `
                <div><span class="cart-item-name">${safeName}</span><br><span class="cart-item-unit">${safeUnit}</span></div>
                <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}" aria-label="تعديل الكمية"></div>
                <div><input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}" aria-label="تعديل السعر"></div>
                <div>${lineTotal}</div>
                <div><i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" data-idx="${idx}" aria-label="حذف منتج"></i></div>
            `;
            container.appendChild(row);
        });

        // ... (باقي دوال المساعدة) ...
        container.querySelectorAll('.cart-qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const qty = parseFloat(e.target.value);
                if (isNaN(qty) || qty <= 0) {
                    this.state.cart.splice(idx, 1);
                } else {
                    this.state.cart[idx].quantity = qty;
                }
                this.renderCart();
            });
        });
        container.querySelectorAll('.cart-price-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                const price = parseFloat(e.target.value);
                if (!isNaN(price) && price >= 0) {
                    this.state.cart[idx].price = price;
                }
                this.renderCart();
            });
        });
        container.querySelectorAll('.fa-trash').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.idx);
                this.state.cart.splice(idx, 1);
                this.renderCart();
            });
        });

        this.updateTotalsAndUI();
    },

    openUnitModal(productId) { /* ... */ },
    selectUnit(index) { /* ... */ },
    updateUnitModalInfo() { /* ... */ },
    addToCartFromModal() { /* ... */ },
    togglePaymentFields() { /* ... */ },
    updatePaymentPreview() { /* ... */ },
    getBaseQuantityReduction(item) { /* ... */ },

    async completePayment() {
        // ... (دالة الدفع كاملة مع التحقق من isDBReady و hasLocalDB)
        if (this.state.isProcessing) return;
        // ...
        try {
            // ... حفظ الفاتورة
            if (window.printSaleReceipt) {
                printSaleReceipt(invoice, customer || { name: 'نقدي', balance: 0 }, this.state.cart, totals);
            } else {
                alert(`تم البيع بنجاح. رقم الفاتورة: ${invoiceNumber}`);
            }
            // ...
        } catch (error) { /* ... */ }
    },

    // ✅ معالجة آمنة لاسترجاع الفاتورة
    async resumeInvoice(id) {
        let inv;
        try {
            if (this.state.isDBReady) {
                const invoices = await DB.getInvoices();
                inv = invoices.find(i => String(i.id) === String(id));
                if (inv && window.supabase) {
                    await supabase.from('invoices').delete().eq('id', id);
                }
            } else if (Utils.hasLocalDB()) {
                const held = await localDB.getAll('invoices');
                inv = held.find(i => String(i.id) === String(id));
                if (inv && localDB.delete) {
                    await localDB.delete('invoices', id).catch(() => {});
                }
            }
            if (!inv) {
                alert('الفاتورة غير موجودة');
                return;
            }
            // ... تحميل السلة
        } catch (err) {
            console.error('خطأ في استرجاع الفاتورة:', err);
            alert('فشل استرجاع الفاتورة المعلقة');
        }
    },

    showToast(msg) { /* ... */ },
    saveCartToStorage() { /* ... */ },
    restoreCartFromStorage() { /* ... */ }
};

// ==================== بدء التشغيل ====================
window.POS = POS;
window.addEventListener('DOMContentLoaded', () => POS.init());
window.addEventListener('beforeunload', () => POS.saveCartToStorage());
