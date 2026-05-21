/* =============================================
   pos.js - نقطة البيع (إصدار نهائي محدث)
   مع إيصال حراري مبسط ودعم تعديل الفاتورة الأصلية
   ============================================= */
'use strict';

const Utils = {
    formatMoney: (amount, currency = 'ج.م') => Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency,
    formatDate: (dateStr) => { if (!dateStr) return ''; try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return dateStr; } },
    getToday: () => new Date().toISOString().split('T')[0],
    escapeHTML: (str) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; },
    debounce: (fn, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; },
    round: (value, decimals = 3) => Number(Math.round(value + 'e' + decimals) + 'e-' + decimals),
    generateUUID: () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
    isDBReady: () => !!(window.DB && window.supabase),
    hasLocalDB: () => !!(window.localDB)
};

const POS = {
    state: {
        products: [], customers: [], cart: [],
        selectedProduct: null, selectedUnit: null, selectedCustomerId: null,
        isDBReady: false, isProcessing: false,
        subtotal: 0, discount: 0, discountType: 'amount', discountValue: 0, netTotal: 0,
        usedCustomerBalance: 0,
        editingInvoiceId: null // لتتبع الفاتورة الأصلية التي يتم تعديلها
    },
    cache: { productMap: new Map(), customerMap: new Map() },
    el: {},

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.handleConnectionStatus();
        window.addEventListener('online', () => this.updateOnlineStatus());
        window.addEventListener('offline', () => this.updateOnlineStatus());
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this.saveCartToStorage(); });
        if (window.App) { if (!App.requireAuth()) return; App.initUserInterface(); }
        this.loadInitialData();
        this.initSidebarUser();
    },

    cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay', 'moreMenuBtn', 'moreDropdown', 'holdInvoiceBtn', 'heldInvoicesBtn', 'logoutBtn',
            'productSearchInput', 'customerSearchInput', 'customerList', 'customerBalanceDisplay', 'productDropdown',
            'customerDropdown',
            'cartItemsContainer', 'discountValue', 'discountType', 'itemTypesCount', 'totalPieces', 'subtotal', 'netTotal', 'payBtn',
            'unitQuantityModal', 'modalProductName', 'unitButtons', 'selectedQuantity', 'selectedPrice', 'stockInfo', 'addToCartBtn', 'closeUnitModalBtn',
            'paymentModal', 'paySubtotal', 'payDiscount', 'payNet', 'currentBalance', 'paymentMethod', 'cashField', 'transferField', 'cashAmount', 'transferAmount',
            'remainingDisplay', 'balanceAfterLabel', 'balanceAfter', 'paymentNotes', 'confirmAndPrintBtn', 'closePaymentModalBtn',
            'heldInvoicesModal', 'heldInvoicesList', 'closeHeldModalBtn',
            'receiptModal', 'receiptPrintArea', 'printReceiptBtn', 'cancelReceiptModalBtn', 'closeReceiptModalBtn',
            'sidebarAvatar', 'sidebarUserName'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    bindEvents() {
        this.el.menuToggle?.addEventListener('click', () => { this.el.sidebar.classList.toggle('open'); this.el.sidebarOverlay?.classList.toggle('show'); });
        this.el.sidebarOverlay?.addEventListener('click', () => { this.el.sidebar.classList.remove('open'); this.el.sidebarOverlay.classList.remove('show'); });
        document.querySelectorAll('.menu-item').forEach(link => { link.addEventListener('click', () => { this.el.sidebar.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); }); });

        this.el.moreMenuBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.moreDropdown?.classList.toggle('show'); });
        document.addEventListener('click', (e) => { if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show'); });
        this.el.holdInvoiceBtn?.addEventListener('click', (e) => { e.preventDefault(); this.holdInvoice(); this.el.moreDropdown?.classList.remove('show'); });
        this.el.heldInvoicesBtn?.addEventListener('click', (e) => { e.preventDefault(); this.loadHeldInvoices(); this.el.moreDropdown?.classList.remove('show'); });
        this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        const debouncedSearch = Utils.debounce(() => this.filterProducts(), 150);
        this.el.productSearchInput?.addEventListener('input', debouncedSearch);
        this.el.productDropdown?.addEventListener('click', (e) => { const item = e.target.closest('.dropdown-item'); if (item?.dataset.id) { this.openUnitModal(item.dataset.id); this.hideProductDropdown(); this.el.productSearchInput.value = ''; } });
        document.addEventListener('click', (e) => { if (!e.target.closest('.search-header')) this.hideProductDropdown(); });

        this.el.customerSearchInput?.addEventListener('input', () => this.filterCustomers());
        this.el.customerDropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                if (item.dataset.id === 'cash') {
                    this.state.selectedCustomerId = null;
                    this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
                } else {
                    this.state.selectedCustomerId = item.dataset.id;
                    const cust = this.cache.customerMap.get(item.dataset.id);
                    this.el.customerSearchInput.value = cust?.name || '';
                }
                this.updateCustomerDisplay();
                this.hideCustomerDropdown();
            }
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.customer-box .search-header')) this.hideCustomerDropdown();
        });
        this.el.customerSearchInput?.addEventListener('focus', () => {
            if (!this.el.customerSearchInput.value.trim()) this.filterCustomers();
        });

        this.el.discountValue?.addEventListener('input', () => { this.state.discountValue = +this.el.discountValue.value || 0; this.updateTotalsAndUI(); });
        this.el.discountType?.addEventListener('change', () => { this.state.discountType = this.el.discountType.value; this.updateTotalsAndUI(); });
        this.el.payBtn?.addEventListener('click', () => this.openPaymentModal());

        this.el.addToCartBtn?.addEventListener('click', () => this.addToCartFromModal());
        this.el.closeUnitModalBtn?.addEventListener('click', () => this.closeModal('unitQuantityModal'));
        this.el.confirmAndPrintBtn?.addEventListener('click', async (e) => { e.preventDefault(); await this.completePayment(); });
        this.el.closePaymentModalBtn?.addEventListener('click', () => this.closeModal('paymentModal'));
        this.el.paymentMethod?.addEventListener('change', () => this.togglePaymentFields());
        this.el.cashAmount?.addEventListener('input', () => this.updatePaymentPreview());
        this.el.transferAmount?.addEventListener('input', () => this.updatePaymentPreview());
        this.el.closeHeldModalBtn?.addEventListener('click', () => this.closeModal('heldInvoicesModal'));
        this.el.closeReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.cancelReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.printReceiptBtn?.addEventListener('click', () => this.printReceiptFromModal());
    },

    handleConnectionStatus() { this.updateOnlineStatus(); },
    updateOnlineStatus() { const n = document.getElementById('mainNavbar'); if (n) n.classList.toggle('offline', !navigator.onLine); },

    initSidebarUser() {
        window.App?.getCurrentUser?.().then(user => {
            if (user) {
                if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
                if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
            }
        }).catch(() => {});
    },

    async loadInitialData() {
        this.state.isDBReady = Utils.isDBReady();
        await this.loadProductsAndCustomers();
        this.buildCache();
        this.restoreCartFromStorage();
        this.loadInvoiceForEdit(); // تحميل فاتورة للتعديل إن وجدت
        if (!this.state.products.length && window.Toast) Toast.info('لا توجد منتجات. أضف منتجات أولاً.');
    },

    async loadProductsAndCustomers() {
        try {
            let customers = [];
            if (this.state.isDBReady) {
                this.state.products = await DB.getProducts() || [];
                customers = await DB.getParties('customer') || [];
            } else if (Utils.hasLocalDB()) {
                this.state.products = await localDB.getAll('products') || [];
                customers = await localDB.getAll('parties') || [];
            } else {
                this.state.products = [];
                customers = [];
            }
            this.state.customers = customers.filter(p => p.type === 'customer');
            this.state.products.forEach(p => { if (typeof p.units === 'string') try { p.units = JSON.parse(p.units); } catch {} });
            this.buildCache();
        } catch (e) {
            console.error('فشل تحميل البيانات:', e);
            this.state.products = [];
            this.state.customers = [];
            if (window.Toast) Toast.error('فشل تحميل البيانات');
        }
    },

    buildCache() {
        this.cache.productMap.clear(); this.cache.customerMap.clear();
        for (const p of this.state.products) { this.cache.productMap.set(String(p.id), p); this.cache.productMap.set(p.id, p); }
        for (const c of this.state.customers) { this.cache.customerMap.set(String(c.id), c); this.cache.customerMap.set(c.id, c); }
    },

    // دالة تحميل فاتورة للتعديل
    loadInvoiceForEdit() {
        const invoiceId = localStorage.getItem('edit_invoice_id');
        if (!invoiceId) return;
        localStorage.removeItem('edit_invoice_id');

        if (this.state.isDBReady && window.DB.getInvoiceById) {
            window.DB.getInvoiceById(invoiceId).then(inv => {
                if (inv && inv.type === 'sale' && inv.status !== 'voided') {
                    this.state.cart = (inv.items || []).map(item => ({...item}));
                    this.state.selectedCustomerId = inv.customer_id;
                    this.state.editingInvoiceId = inv.id;
                    if (inv.customer_id) {
                        const cust = this.cache.customerMap.get(String(inv.customer_id));
                        if (cust) {
                            if (this.el.customerSearchInput) {
                                this.el.customerSearchInput.value = cust.name || '';
                            }
                            this.updateCustomerDisplay();
                        }
                    } else {
                        if (this.el.customerSearchInput) {
                            this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
                        }
                    }
                    this.renderCart();
                    if (window.Toast) Toast.info('تم تحميل الفاتورة للتعديل');
                } else {
                    if (window.Toast) Toast.error('الفاتورة غير قابلة للتعديل');
                }
            }).catch(() => {
                if (window.Toast) Toast.error('فشل تحميل الفاتورة للتعديل');
            });
        }
    },

    filterCustomers() {
        const term = this.el.customerSearchInput?.value.trim().toLowerCase() || '';
        const dropdown = this.el.customerDropdown;
        if (!dropdown) return;

        let filtered = this.state.customers;
        if (term && term !== 'نقدي (بدون عميل)') {
            filtered = filtered.filter(c => c.name?.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)));
        }

        let html = `<div class="dropdown-item" data-id="cash">
                    <div class="item-info"><h4>نقدي (بدون عميل)</h4></div>
                    <div class="item-price"></div>
                </div>`;

        filtered.forEach(c => {
            const bal = c.balance || 0;
            const balanceStr = bal > 0 ? `دائن ${Utils.formatMoney(bal)}` : bal < 0 ? `مدين ${Utils.formatMoney(-bal)}` : 'لا رصيد';
            html += `<div class="dropdown-item" data-id="${c.id}">
                        <div class="item-info">
                            <h4>${Utils.escapeHTML(c.name)}</h4>
                            <small style="color:#94a3b8;">${balanceStr}</small>
                        </div>
                        <div class="item-price" style="font-size:12px;">${c.phone || ''}</div>
                    </div>`;
        });
        dropdown.innerHTML = html;
        dropdown.classList.add('show');
    },

    hideCustomerDropdown() { this.el.customerDropdown?.classList.remove('show'); },

    updateCustomerDisplay() {
        const balanceDiv = this.el.customerBalanceDisplay;
        if (!balanceDiv) return;
        if (!this.state.selectedCustomerId) { balanceDiv.innerHTML = ''; return; }
        const customer = this.cache.customerMap.get(this.state.selectedCustomerId);
        if (customer) {
            const bal = customer.balance || 0;
            balanceDiv.innerHTML = bal > 0 ? `العميل دائن بـ ${Utils.formatMoney(bal)}` : bal < 0 ? `مدين بـ ${Utils.formatMoney(-bal)}` : 'لا رصيد';
        } else {
            balanceDiv.innerHTML = '';
        }
    },

    getSelectedCustomer() { return this.state.selectedCustomerId ? this.cache.customerMap.get(this.state.selectedCustomerId) : null; },

    filterProducts() {
        const term = this.el.productSearchInput?.value.trim().toLowerCase() || '';
        const dropdown = this.el.productDropdown; if (!dropdown) return;
        if (!term) { dropdown.classList.remove('show'); return; }
        if (!this.state.products.length) { dropdown.innerHTML = '<div class="dropdown-item" style="color:#dc2626; text-align:center;">⚠️ لا توجد منتجات</div>'; dropdown.classList.add('show'); return; }
        const filtered = this.state.products.filter(p => p.name?.toLowerCase().includes(term));
        dropdown.innerHTML = filtered.length ? filtered.map(p => `<div class="dropdown-item" data-id="${p.id}"><div class="item-info"><h4>${Utils.escapeHTML(p.name)}</h4></div><div class="item-price">${Utils.formatMoney(p.units[0]?.price || 0)}</div></div>`).join('') : '<div class="dropdown-item" style="color:#94a3b8;">لا توجد نتائج</div>';
        dropdown.classList.add('show');
    },
    hideProductDropdown() { this.el.productDropdown?.classList.remove('show'); },

    calculateTotals() {
        let subtotal = 0;
        for (const item of this.state.cart) subtotal += Utils.round(item.price * item.quantity);
        subtotal = Utils.round(subtotal, 2);
        let discount = 0;
        if (this.state.discountType === 'amount') discount = Math.min(this.state.discountValue, subtotal);
        else discount = Utils.round(subtotal * this.state.discountValue / 100, 2);
        const net = Utils.round(subtotal - discount, 2);
        this.state.subtotal = subtotal; this.state.discount = discount; this.state.netTotal = net;
        return { subtotal, discount, net };
    },

    updateTotalsAndUI() {
        const { subtotal, net } = this.calculateTotals();
        if (this.el.subtotal) this.el.subtotal.textContent = Utils.formatMoney(subtotal);
        if (this.el.netTotal) this.el.netTotal.textContent = Utils.formatMoney(net);
        if (this.el.itemTypesCount) this.el.itemTypesCount.textContent = this.state.cart.length;
        let pieces = 0; for (const item of this.state.cart) pieces += item.quantity * (item.factor || 1);
        if (this.el.totalPieces) this.el.totalPieces.textContent = Math.round(pieces);
    },

    renderCart() {
        const container = this.el.cartItemsContainer; if (!container) return;
        container.innerHTML = `<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span></div>`;
        if (!this.state.cart.length) { container.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>'); this.updateTotalsAndUI(); return; }

        let rowsHTML = '';
        this.state.cart.forEach((item, idx) => {
            const safeName = Utils.escapeHTML(item.productName); const safeUnit = Utils.escapeHTML(item.unitName);
            const lineTotal = Utils.formatMoney(Utils.round(item.price * item.quantity, 2));
            rowsHTML += `
                <div class="cart-item-row">
                    <div><span class="cart-item-name">${safeName}</span><br><span class="cart-item-unit">${safeUnit}</span></div>
                    <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}"></div>
                    <div><input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}"></div>
                    <div>${lineTotal}</div>
                    <div><i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" data-idx="${idx}"></i></div>
                </div>`;
        });
        container.insertAdjacentHTML('beforeend', rowsHTML);

        container.addEventListener('change', (e) => {
            if (e.target.classList.contains('cart-qty-input')) { const idx = +e.target.dataset.idx; const qty = +e.target.value; if (isNaN(qty) || qty <= 0) this.state.cart.splice(idx, 1); else this.state.cart[idx].quantity = qty; this.renderCart(); }
            else if (e.target.classList.contains('cart-price-input')) { const idx = +e.target.dataset.idx; const price = +e.target.value; if (!isNaN(price) && price >= 0) this.state.cart[idx].price = price; this.renderCart(); }
        });
        container.addEventListener('click', (e) => {
            if (e.target.closest('.fa-trash')) { const idx = +e.target.closest('.fa-trash').dataset.idx; this.state.cart.splice(idx, 1); this.renderCart(); }
        });
        this.updateTotalsAndUI();
    },

    openUnitModal(productId) {
        const product = this.cache.productMap.get(String(productId)) || this.cache.productMap.get(productId);
        if (!product || !product.units?.length) {
            if (window.Toast) Toast.info('المنتج غير موجود');
            return;
        }
        this.state.selectedProduct = product;
        this.el.modalProductName.textContent = Utils.escapeHTML(product.name);
        const container = this.el.unitButtons;
        container.innerHTML = product.units.map((u, idx) => `<button class="unit-btn ${idx === 0 ? 'active' : ''}" data-index="${idx}">${Utils.escapeHTML(u.name)}</button>`).join('');
        container.querySelectorAll('.unit-btn').forEach(btn => { btn.addEventListener('click', () => { this.selectUnit(+btn.dataset.index); }); });
        this.state.selectedUnit = product.units[0];
        this.updateUnitModalInfo();
        this.showModal('unitQuantityModal');
    },

    selectUnit(index) {
        if (!this.state.selectedProduct?.units) return;
        this.state.selectedUnit = this.state.selectedProduct.units[index];
        this.el.unitButtons.querySelectorAll('.unit-btn').forEach((btn, i) => { btn.classList.toggle('active', i === index); });
        this.updateUnitModalInfo();
    },

    updateUnitModalInfo() {
        const product = this.state.selectedProduct; const unit = this.state.selectedUnit; if (!product || !unit) return;
        const baseUnit = product.units[0]; const baseStock = baseUnit.stock || 0; const factor = unit.factor || 1;
        let availableStock;
        if (unit === baseUnit) { availableStock = Math.floor(baseStock); }
        else { const wholeBase = Math.floor(baseStock); const remainderPieces = Math.round((baseStock - wholeBase) * factor); availableStock = wholeBase * factor + remainderPieces; }
        const maxAvailable = Math.max(0, availableStock);
        this.el.selectedPrice.value = unit.price || 0;
        this.el.selectedQuantity.max = maxAvailable;
        this.el.selectedQuantity.value = maxAvailable > 0 ? 1 : 0;
        this.el.stockInfo.textContent = unit === baseUnit ? `المخزون المتاح: ${maxAvailable} ${baseUnit.name}` : `المخزون المتاح: ${maxAvailable} ${unit.name}`;
    },

    async addToCartFromModal() {
        const qty = +this.el.selectedQuantity?.value || 0;
        if (qty <= 0 || qty > (+this.el.selectedQuantity?.max || 0)) {
            if (typeof ModalConfirm !== 'undefined') {
                await ModalConfirm.show({ title: 'خطأ', message: 'كمية غير متاحة', icon: 'warn', confirmText: 'حسناً', type: 'danger' });
            } else if (window.Toast) Toast.error('كمية غير متاحة');
            return;
        }
        const price = +this.el.selectedPrice?.value || 0;
        if (price < 0) {
            if (window.Toast) Toast.error('السعر لا يمكن أن يكون سالباً');
            return;
        }
        const unit = this.state.selectedUnit;
        if (unit) {
            if (unit.minPrice > 0 && price < unit.minPrice) {
                if (window.Toast) Toast.error(`لا يمكن البيع بأقل من السعر الأدنى: ${Utils.formatMoney(unit.minPrice)}`);
                return;
            }
            if (unit.maxPrice > 0 && price > unit.maxPrice) {
                if (window.Toast) Toast.error(`لا يمكن البيع بأعلى من السعر الأقصى: ${Utils.formatMoney(unit.maxPrice)}`);
                return;
            }
        }
        const existing = this.state.cart.find(i => i.productId === this.state.selectedProduct.id && i.unitName === unit.name);
        if (existing) existing.quantity = Utils.round(existing.quantity + qty, 3);
        else this.state.cart.push({ productId: this.state.selectedProduct.id, productName: this.state.selectedProduct.name, unitName: unit.name, quantity: qty, price, factor: unit.factor || 1, isBaseUnit: unit === this.state.selectedProduct.units[0] });
        this.renderCart(); this.closeModal('unitQuantityModal');
    },

    showModal(id) { const m = this.el[id]; if (m) m.classList.add('open'); },
    closeModal(id) { const m = this.el[id]; if (m) m.classList.remove('open'); },

    openPaymentModal() {
        if (!this.state.cart.length) {
            if (window.Toast) Toast.info('السلة فارغة');
            return;
        }
        const totals = this.calculateTotals();
        this.el.paySubtotal.textContent = Utils.formatMoney(totals.subtotal);
        this.el.payDiscount.textContent = Utils.formatMoney(totals.discount);
        this.el.payNet.textContent = Utils.formatMoney(totals.net);
        const customer = this.getSelectedCustomer();
        const bal = customer?.balance || 0;
        this.el.currentBalance.textContent = Utils.formatMoney(Math.abs(bal));
        this.el.currentBalance.classList.toggle('text-success', bal >= 0);
        this.el.currentBalance.classList.toggle('text-danger', bal < 0);
        this.el.cashAmount.value = ''; this.el.transferAmount.value = '';
        this.el.paymentMethod.value = 'cash';
        this.togglePaymentFields(); this.updatePaymentPreview();
        this.showModal('paymentModal');
    },

    togglePaymentFields() {
        const method = this.el.paymentMethod?.value || 'cash';
        this.el.cashField.style.display = (method === 'cash' || method === 'mixed') ? 'block' : 'none';
        this.el.transferField.style.display = (method === 'transfer' || method === 'mixed') ? 'block' : 'none';
        this.updatePaymentPreview();
    },

    updatePaymentPreview() {
        const net = this.state.netTotal;
        let cashPaid = 0, transferPaid = 0;
        const method = this.el.paymentMethod?.value || 'cash';
        if (method === 'cash') cashPaid = +this.el.cashAmount?.value || 0;
        else if (method === 'transfer') transferPaid = +this.el.transferAmount?.value || 0;
        else if (method === 'mixed') { cashPaid = +this.el.cashAmount?.value || 0; transferPaid = +this.el.transferAmount?.value || 0; }

        const customer = this.getSelectedCustomer();
        let usedBalance = 0;
        if (customer && customer.balance > 0) usedBalance = Math.min(customer.balance, Math.max(0, net - cashPaid - transferPaid));
        this.state.usedCustomerBalance = usedBalance;

        const totalPaid = Utils.round(cashPaid + transferPaid + usedBalance, 2);
        const diff = Utils.round(totalPaid - net, 2);
        const newBal = Utils.round((customer?.balance || 0) - usedBalance + diff, 2);

        this.el.remainingDisplay.textContent = diff >= 0 ? `فائض ${Utils.formatMoney(diff)}` : `متبقي ${Utils.formatMoney(-diff)}`;
        this.el.balanceAfterLabel.textContent = newBal >= 0 ? 'رصيد للعميل بعد الدفع:' : 'رصيد على العميل بعد الدفع:';
        this.el.balanceAfter.textContent = Utils.formatMoney(Math.abs(newBal));
        this.el.balanceAfter.classList.toggle('text-success', newBal >= 0);
        this.el.balanceAfter.classList.toggle('text-danger', newBal < 0);
    },

    async completePayment() {
        if (this.state.isProcessing) {
            if (window.Toast) Toast.info('جاري معالجة الدفع...');
            return;
        }
        this.state.isProcessing = true;
        this.el.confirmAndPrintBtn.disabled = true;

        try {
            const totals = this.calculateTotals();
            let cashPaid = 0, transferPaid = 0;
            const method = this.el.paymentMethod?.value || 'cash';
            if (method === 'cash') cashPaid = +this.el.cashAmount?.value || 0;
            else if (method === 'transfer') transferPaid = +this.el.transferAmount?.value || 0;
            else if (method === 'mixed') { cashPaid = +this.el.cashAmount?.value || 0; transferPaid = +this.el.transferAmount?.value || 0; }
            const usedBalance = this.state.usedCustomerBalance || 0;
            const totalPaid = Utils.round(cashPaid + transferPaid + usedBalance, 2);
            const diff = Utils.round(totalPaid - totals.net, 2);

            const customer = this.getSelectedCustomer();
            const invoiceNumber = this.state.isDBReady ? await DB.generateInvoiceNumber() : this.generateLocalInvoiceNumber();

            const invoice = {
                id: Utils.generateUUID(),
                invoice_number: invoiceNumber,
                date: Utils.getToday(),
                customer_id: this.state.selectedCustomerId || null,
                customer_name: customer?.name || 'نقدي',
                items: this.state.cart.map(item => ({...item})),
                subtotal: totals.subtotal,
                discount: totals.discount,
                total: totals.net,
                cash_paid: cashPaid,
                transfer_paid: transferPaid,
                used_customer_balance: usedBalance,
                paid: totalPaid,
                remaining: diff >= 0 ? 0 : -diff,
                status: diff >= 0 ? 'paid' : 'partial',
                notes: this.el.paymentNotes?.value || ''
            };

            if (this.state.editingInvoiceId) {
                invoice.original_invoice_id = this.state.editingInvoiceId;
            }

            let result;
            if (window.InvoiceService && window.InvoiceService.createSaleInvoice) {
                result = await InvoiceService.createSaleInvoice(invoice);
            } else if (this.state.isDBReady) {
                result = await DB.createSaleInvoice(invoice);
            } else {
                throw new Error('خدمة الفواتير غير متاحة');
            }

            if (!result || !result.success) throw new Error(result?.error || 'فشل غير معروف');

            this.closeModal('paymentModal');
            this._updateLocalStockAfterSale();
            this.buildCache();

            const customerObj = customer || { name: 'نقدي', balance: 0 };
            this.showReceiptModal(
                { ...invoice, invoice_number: result.invoice_number || invoice.invoice_number },
                customerObj,
                this.state.cart,
                totals,
                customer?.balance || 0
            );

            this.resetCart();
            this.state.editingInvoiceId = null;
            if (window.Toast) Toast.success('تم البيع بنجاح');
        } catch (error) {
            console.error('خطأ في الدفع:', error);
            if (typeof ModalConfirm !== 'undefined') {
                await ModalConfirm.show({
                    title: 'خطأ في الدفع',
                    message: error.message || 'حدث خطأ غير متوقع',
                    icon: 'warn',
                    confirmText: 'حسناً',
                    type: 'danger'
                });
            } else if (window.Toast) {
                Toast.error(error.message || 'حدث خطأ غير متوقع');
            } else {
                alert('خطأ: ' + (error.message || 'حدث خطأ غير متوقع'));
            }
        } finally {
            this.state.isProcessing = false;
            this.el.confirmAndPrintBtn.disabled = false;
        }
    },

    _updateLocalStockAfterSale() {
        for (const item of this.state.cart) {
            const product = this.cache.productMap.get(String(item.productId));
            if (!product?.units) continue;
            const baseUnit = product.units[0];
            let reduction;
            if (item.unitName === baseUnit.name) reduction = item.quantity;
            else {
                const unit = product.units.find(u => u.name === item.unitName);
                reduction = item.quantity / (unit?.factor || 1);
            }
            baseUnit.stock = Math.max(0, (baseUnit.stock || 0) - reduction);
        }
    },

    generateLocalInvoiceNumber() {
        const year = new Date().getFullYear().toString().slice(-2);
        const key = `inv_counter_${year}`;
        let num = (parseInt(localStorage.getItem(key) || '0', 10) + 1);
        localStorage.setItem(key, num.toString());
        return year + '-' + String(num).padStart(4, '0');
    },

    resetCart() {
        this.state.cart = []; this.state.selectedCustomerId = null; this.state.discountValue = 0; this.state.discountType = 'amount'; this.state.usedCustomerBalance = 0;
        this.state.editingInvoiceId = null;
        if (this.el.discountValue) this.el.discountValue.value = 0;
        if (this.el.discountType) this.el.discountType.value = 'amount';
        if (this.el.customerSearchInput) { this.el.customerSearchInput.value = ''; this.updateCustomerDisplay(); }
        this.renderCart();
    },

    async holdInvoice() {
        if (!this.state.cart.length) { if (window.Toast) Toast.info('السلة فارغة'); return; }
        const totals = this.calculateTotals();
        const invoiceNumber = this.state.isDBReady ? await DB.generateInvoiceNumber() : this.generateLocalInvoiceNumber();
        const invoice = {
            id: Utils.generateUUID(), invoice_number: invoiceNumber, type: 'sale', date: Utils.getToday(),
            customer_id: this.state.selectedCustomerId || null, customer_name: this.getSelectedCustomer()?.name || 'نقدي',
            items: this.state.cart.map(item => ({...item})),
            subtotal: totals.subtotal, discount: totals.discount, total: totals.net,
            paid: 0, remaining: totals.net, status: 'held', notes: 'فاتورة معلقة'
        };
        try {
            if (this.state.isDBReady && DB.saveInvoice) {
                await DB.saveInvoice(invoice);
            } else if (Utils.hasLocalDB()) {
                await localDB.put('invoices', invoice);
            }
            if (window.Toast) Toast.success(`تم تعليق الفاتورة ${invoiceNumber}`);
            this.resetCart();
        } catch (error) { console.error(error); if (window.Toast) Toast.error('فشل تعليق الفاتورة'); }
    },

    async loadHeldInvoices() {
        let invoices = [];
        try {
            if (this.state.isDBReady) invoices = (await DB.getInvoices()).filter(i => i.type === 'sale' && i.status === 'held');
            else if (Utils.hasLocalDB()) invoices = (await localDB.getAll('invoices')).filter(i => i.type === 'sale' && i.status === 'held');
        } catch (e) { console.error(e); }
        const container = this.el.heldInvoicesList; if (!container) return;
        if (!invoices.length) { container.innerHTML = '<p style="text-align:center; padding:20px;">لا توجد فواتير معلقة</p>'; }
        else {
            container.innerHTML = invoices.map(inv => {
                const customer = this.cache.customerMap.get(String(inv.customer_id)); const name = customer?.name || 'نقدي';
                return `<div class="held-invoice-item" data-id="${inv.id}" style="padding:15px; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:10px; cursor:pointer; display:flex; justify-content:space-between;"><div><strong>${Utils.escapeHTML(inv.invoice_number || inv.id?.substring(0,8))}</strong><br>${Utils.escapeHTML(name)} - ${Utils.formatMoney(inv.total)}</div><div><i class="fas fa-play"></i></div></div>`;
            }).join('');
            container.querySelectorAll('.held-invoice-item').forEach(item => { item.addEventListener('click', () => this.resumeInvoice(item.dataset.id)); });
        }
        this.showModal('heldInvoicesModal');
    },

    async resumeInvoice(id) {
        let inv;
        try {
            if (this.state.isDBReady) {
                inv = await DB.getInvoiceById(id);
                if (inv) { try { await supabase.from('invoices').delete().eq('id', id); } catch {} }
            } else if (Utils.hasLocalDB()) {
                inv = await localDB.getById('invoices', id);
                if (inv && localDB.delete) await localDB.delete('invoices', id).catch(() => {});
            }
            if (!inv) { if (window.Toast) Toast.error('الفاتورة غير موجودة'); return; }
            this.state.cart = inv.items.map(item => ({...item}));
            this.state.selectedCustomerId = inv.customer_id;
            if (inv.customer_id) {
                const cust = this.cache.customerMap.get(String(inv.customer_id));
                if (cust) {
                    this.el.customerSearchInput.value = cust.name || '';
                    this.updateCustomerDisplay();
                }
            } else {
                this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
                this.updateCustomerDisplay();
            }
            this.renderCart();
            this.closeModal('heldInvoicesModal');
            if (window.Toast) Toast.success('تم تحميل الفاتورة المعلقة');
        } catch (err) { console.error(err); if (window.Toast) Toast.error('فشل استرجاع الفاتورة'); }
    },

    // ========== إيصال حراري مبسط ==========
    showReceiptModal(invoice, customer, items, totals, oldBalance = 0) {
        let settings = {};
        try { settings = JSON.parse(localStorage.getItem('app_settings') || '{}'); } catch(e) {}
        const companyName = settings?.company?.name || 'حسابي';
        const companyPhone = settings?.company?.phone || '';
        const footerMsg = settings?.print?.footer_message || 'شكراً لتعاملكم معنا';
        const format = (v) => {
            const num = Number(v);
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        // بناء سطور الأصناف
        let itemsLines = '';
        for (const item of items) {
            const lineTotal = Utils.round((item.price || 0) * (item.quantity || 0), 2);
            itemsLines += `${Utils.escapeHTML(item.productName)} - ${Utils.escapeHTML(item.unitName)}  ${item.quantity}  ${format(item.price)}\n`;
        }

        // تفاصيل الدفع
        let paymentLines = '';
        paymentLines += `نقدى:           ${format(invoice.cash_paid || 0)}\n`;
        paymentLines += `تحويل:          ${format(invoice.transfer_paid || 0)}\n`;
        if (invoice.used_customer_balance > 0) {
            paymentLines += `من رصيد عميل:   ${format(invoice.used_customer_balance)}\n`;
        }
        paymentLines += `المدفوع:        ${format(invoice.paid)}\n`;
        
        // المتبقي أو الفائض
        const diff = Utils.round((invoice.paid || 0) - totals.net, 2);
        if (diff > 0) {
            paymentLines += `فائض:           ${format(diff)}\n`;
        } else if (diff < 0) {
            paymentLines += `متبقى:          ${format(-diff)}\n`;
        }

        // حركة الرصيد (فقط إذا كان العميل حقيقي)
        let balanceLines = '';
        if (customer && customer.name !== 'نقدي') {
            const newBalance = customer.balance || 0;
            const used = invoice.used_customer_balance || 0;
            balanceLines += `الرصيد السابق:  ${format(oldBalance)}\n`;
            if (used > 0) {
                balanceLines += `خصم من رصيد:  -${format(used)}\n`;
            }
            if (diff > 0) {
                balanceLines += `اضافة للرصيد: +${format(diff)}\n`;
            }
            balanceLines += `الرصيد الحالى:  ${format(newBalance)}\n`;
        }

        // تجميع الإيصال كاملاً
        const receiptText = [
            companyName,
            companyPhone ? `هاتف: ${companyPhone}` : '',
            '------------------------------',
            `العميل: ${customer?.name || 'نقدى'}`,
            `رقم الفاتورة: ${invoice.invoice_number || invoice.id?.substring(0,8)}`,
            `التاريخ: ${Utils.formatDate(invoice.date)}`,
            '------------------------------',
            itemsLines.trim(),
            '------------------------------',
            `الاجمالى:       ${format(totals.subtotal)}`,
            totals.discount > 0 ? `الخصم:           ${format(totals.discount)}` : '',
            `الصافى:         ${format(totals.net)}`,
            '------------------------------',
            paymentLines.trim(),
            balanceLines ? '------------------------------' : '',
            balanceLines.trim(),
            balanceLines ? '------------------------------' : '',
            footerMsg
        ].filter(line => line !== '').join('\n');

        // عرض في منطقة الطباعة
        this.el.receiptPrintArea.innerHTML = `<pre style="font-family: 'Cairo', 'Courier New', monospace; font-size: 13px; line-height: 1.5; text-align: right; direction: rtl; white-space: pre-wrap; margin: 0; background: white;">${Utils.escapeHTML(receiptText)}</pre>`;
        
        this.showModal('receiptModal');
    },

    printReceiptFromModal() {
        const content = this.el.receiptPrintArea.innerHTML;
        const settings = JSON.parse(localStorage.getItem('app_settings') || '{}'); const companyName = settings?.company?.name || 'حسابي';
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) { if (window.Toast) Toast.error('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }
        printWindow.document.write(`<html><head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Tahoma;direction:rtl;text-align:right;padding:20px;background:white;width:80mm;margin:0 auto;}.company-name{text-align:center;font-size:18px;font-weight:bold;}.divider{border-top:1px dashed #000;margin:10px 0;}table{width:100%;border-collapse:collapse;font-size:13px;}th,td{padding:3px 4px;border-bottom:1px dotted #ddd;}th{background:#f5f5f5;font-size:11px;}.totals{font-size:14px;margin-top:8px;}.footer{text-align:center;margin-top:12px;font-size:13px;font-weight:bold;}</style></head><body><div class="company-name">${Utils.escapeHTML(companyName)}</div><div class="divider"></div>${content}</body></html>`);
        printWindow.document.close(); printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    },

    saveCartToStorage() {
        if (this.state.cart.length) {
            localStorage.setItem('pos_held_cart', JSON.stringify({
                cart: this.state.cart,
                customerId: this.state.selectedCustomerId,
                discountType: this.state.discountType,
                discountValue: this.state.discountValue,
                timestamp: Date.now()
            }));
        } else {
            localStorage.removeItem('pos_held_cart');
        }
    },
    restoreCartFromStorage() {
        const saved = localStorage.getItem('pos_held_cart');
        if (!saved) return;
        try {
            const held = JSON.parse(saved);
            if (held.timestamp && (Date.now() - held.timestamp) > 2 * 60 * 60 * 1000) { localStorage.removeItem('pos_held_cart'); return; }
            this.state.cart = held.cart || [];
            this.state.selectedCustomerId = held.customerId;
            this.state.discountType = held.discountType || 'amount';
            this.state.discountValue = held.discountValue || 0;
            this.renderCart();
            if (held.customerId) {
                const cust = this.cache.customerMap.get(String(held.customerId));
                if (cust && this.el.customerSearchInput) {
                    this.el.customerSearchInput.value = cust.name || '';
                    this.updateCustomerDisplay();
                }
            }
        } catch {}
        localStorage.removeItem('pos_held_cart');
    }
};

window.POS = POS;
window.addEventListener('DOMContentLoaded', () => POS.init());
window.addEventListener('beforeunload', () => POS.saveCartToStorage());
