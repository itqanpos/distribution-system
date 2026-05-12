/* =============================================
   pos.js - نقطة البيع (إصدار نهائي كامل وآمن)
   ============================================= */
'use strict';

// ==================== الأدوات المساعدة ====================
const Utils = {
    formatMoney: (amount, currency = 'ج.م') => {
        return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
    },
    formatDate: (dateStr) => {
        if (!dateStr) return '';
        try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
        catch (e) { return dateStr; }
    },
    getToday: () => new Date().toISOString().split('T')[0],
    escapeHTML: (str) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; },
    debounce: (fn, delay) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; },
    round: (value, decimals = 3) => Number(Math.round(value + 'e' + decimals) + 'e-' + decimals),
    generateUUID: () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
    isDBReady: () => !!(window.DB && window.supabase),
    hasLocalDB: () => !!(window.localDB)
};

// ==================== POS الكائن الرئيسي ====================
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
        netTotal: 0,
        usedCustomerBalance: 0
    },
    cache: {
        productMap: new Map(),
        customerMap: new Map(),
        productUnitsCache: new Map()
    },
    el: {},

    // ==================== التهيئة ====================
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
            'menuToggle', 'sidebar', 'sidebarOverlay',
            'moreMenuBtn', 'moreDropdown', 'holdInvoiceBtn', 'heldInvoicesBtn', 'logoutBtn',
            'productSearchInput', 'customerSearchInput',
            'customerList', 'customerBalanceDisplay', 'productDropdown',
            'cartItemsContainer', 'discountValue', 'discountType',
            'itemTypesCount', 'totalPieces', 'subtotal', 'netTotal',
            'payBtn',
            'unitQuantityModal', 'modalProductName', 'unitButtons', 'selectedQuantity', 'selectedPrice', 'stockInfo', 'addToCartBtn', 'closeUnitModalBtn',
            'paymentModal', 'paySubtotal', 'payDiscount', 'payNet', 'currentBalance', 'currentBalanceLabel',
            'paymentMethod', 'cashField', 'transferField', 'cashAmount', 'transferAmount',
            'remainingDisplay', 'balanceAfterLabel', 'balanceAfter', 'paymentNotes', 'confirmAndPrintBtn', 'closePaymentModalBtn',
            'heldInvoicesModal', 'heldInvoicesList', 'closeHeldModalBtn',
            'receiptModal', 'receiptPrintArea', 'printReceiptBtn', 'cancelReceiptModalBtn', 'closeReceiptModalBtn',
            'sidebarAvatar', 'sidebarUserName', 'toast'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    bindEvents() {
        // القائمة الجانبية وزر النقاط الثلاث
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

        this.el.moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show');
        });

        // أزرار القائمة المنسدلة
        this.el.holdInvoiceBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.holdInvoice();
            this.el.moreDropdown?.classList.remove('show');
        });
        this.el.heldInvoicesBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadHeldInvoices();
            this.el.moreDropdown?.classList.remove('show');
        });
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        // البحث عن المنتج
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
            if (!e.target.closest('.search-header')) this.hideProductDropdown();
        });

        // البحث عن عميل
        this.el.customerSearchInput?.addEventListener('input', () => this.onCustomerSearch());

        // الخصم
        this.el.discountValue?.addEventListener('input', () => {
            this.state.discountValue = parseFloat(this.el.discountValue.value) || 0;
            this.updateTotalsAndUI();
        });
        this.el.discountType?.addEventListener('change', () => {
            this.state.discountType = this.el.discountType.value;
            this.updateTotalsAndUI();
        });

        // أزرار السلة
        this.el.payBtn?.addEventListener('click', () => this.openPaymentModal());

        // مودال إضافة المنتج
        this.el.addToCartBtn?.addEventListener('click', () => this.addToCartFromModal());
        this.el.closeUnitModalBtn?.addEventListener('click', () => this.closeModal('unitQuantityModal'));

        // مودال الدفع
        this.el.confirmAndPrintBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.completePayment();
        });
        this.el.closePaymentModalBtn?.addEventListener('click', () => this.closeModal('paymentModal'));
        this.el.paymentMethod?.addEventListener('change', () => this.togglePaymentFields());
        this.el.cashAmount?.addEventListener('input', () => this.updatePaymentPreview());
        this.el.transferAmount?.addEventListener('input', () => this.updatePaymentPreview());

        // مودال الفواتير المعلقة
        this.el.closeHeldModalBtn?.addEventListener('click', () => this.closeModal('heldInvoicesModal'));

        // مودال الإيصال
        this.el.closeReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.cancelReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.printReceiptBtn?.addEventListener('click', () => this.printReceiptFromModal());
    },

    handleConnectionStatus() { this.updateOnlineStatus(); },
    updateOnlineStatus() {
        const navbar = document.getElementById('mainNavbar');
        if (!navbar) return;
        navbar.classList.toggle('offline', !navigator.onLine);
    },

    initSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) {
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = user.avatar || 'U';
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
        }
    },

    // ==================== تحميل البيانات ====================
    async loadInitialData() {
        this.state.isDBReady = Utils.isDBReady();
        if (!this.state.isDBReady) console.warn('⚠️ وضع الاختبار أو LocalDB');
        await this.loadProductsAndCustomers();
        this.buildCache();
        this.restoreCartFromStorage();
        if (this.state.products.length === 0) this.showToast('لا توجد منتجات. أضف منتجات أولاً.');
    },

    async loadProductsAndCustomers() {
        try {
            if (this.state.isDBReady) {
                this.state.products = await DB.getProducts() || [];
                this.state.customers = await DB.getParties('customer') || [];
            } else if (Utils.hasLocalDB()) {
                this.state.products = await localDB.getAll('products') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.state.customers = allParties.filter(p => p.type === 'customer');
            } else {
                this.state.products = [
                    { id: '1', name: 'بيبسي', units: [
                        { name: 'كرتونة', price: 240, cost: 200, stock: 5, factor: 1, minPrice: 200, maxPrice: 300 },
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
            this.state.products = this.state.products.map(p => {
                if (typeof p.units === 'string') { try { p.units = JSON.parse(p.units); } catch (e) { p.units = []; } }
                return p;
            });
            this.populateCustomerList();
        } catch (e) {
            console.error('فشل تحميل البيانات:', e);
            this.showToast('فشل تحميل البيانات');
            this.state.products = []; this.state.customers = [];
        }
    },

    buildCache() {
        this.cache.productMap.clear(); this.cache.customerMap.clear();
        this.state.products.forEach(p => { this.cache.productMap.set(String(p.id), p); this.cache.productMap.set(p.id, p); });
        this.state.customers.forEach(c => { this.cache.customerMap.set(String(c.id), c); this.cache.customerMap.set(c.id, c); });
    },

    populateCustomerList() {
        const list = this.el.customerList; if (!list) return;
        list.innerHTML = `<option value="نقدي (بدون عميل)" data-id="cash">نقدي (بدون عميل)</option>` +
            this.state.customers.map(c => `<option value="${Utils.escapeHTML(c.name)}" data-id="${Utils.escapeHTML(String(c.id))}">${Utils.escapeHTML(c.name)} (${Utils.escapeHTML(c.phone || '')})</option>`).join('');
    },

    // ==================== البحث عن المنتجات ====================
    getBaseStock(product) { return product?.units?.[0]?.stock || 0; },
    formatStockDisplay(product) {
        const baseUnit = product?.units?.[0]; if (!baseUnit) return '0';
        const stock = baseUnit.stock || 0; const subUnit = product?.units?.[1];
        if (!subUnit || subUnit.factor === 1) return `${Math.floor(stock)} ${Utils.escapeHTML(baseUnit.name)}`;
        const factor = subUnit.factor; const wholeUnits = Math.floor(stock); const remainder = Math.round((stock - wholeUnits) * factor);
        if (remainder === 0) return `${wholeUnits} ${Utils.escapeHTML(baseUnit.name)}`;
        if (wholeUnits === 0) return `${remainder} ${Utils.escapeHTML(subUnit.name)}`;
        return `${wholeUnits} ${Utils.escapeHTML(baseUnit.name)} و ${remainder} ${Utils.escapeHTML(subUnit.name)}`;
    },

    filterProducts() {
        const term = this.el.productSearchInput?.value.trim().toLowerCase() || '';
        const dropdown = this.el.productDropdown; if (!dropdown) return;
        if (!term) { dropdown.classList.remove('show'); return; }
        if (!this.state.products.length) { dropdown.innerHTML = '<div class="dropdown-item" style="color:#dc2626; text-align:center;">⚠️ لا توجد منتجات</div>'; dropdown.classList.add('show'); return; }
        const filtered = this.state.products.filter(p => p.name?.toLowerCase().includes(term));
        dropdown.innerHTML = filtered.length ? filtered.map(p => {
            const safeName = Utils.escapeHTML(p.name); const stockDisplay = this.formatStockDisplay(p); const price = p.units?.[0]?.price || 0;
            return `<div class="dropdown-item" data-id="${Utils.escapeHTML(String(p.id))}"><div class="item-info"><h4>${safeName}</h4><small>${stockDisplay}</small></div><div class="item-price">${Utils.formatMoney(price)}</div></div>`;
        }).join('') : '<div class="dropdown-item" style="color:#94a3b8;">لا توجد نتائج</div>';
        dropdown.classList.add('show');
    },
    hideProductDropdown() { this.el.productDropdown?.classList.remove('show'); },

    // ==================== البحث عن العملاء ====================
    onCustomerSearch() {
        const val = this.el.customerSearchInput?.value || '';
        const balanceDiv = this.el.customerBalanceDisplay; if (!balanceDiv) return;
        if (val === 'نقدي (بدون عميل)') { this.state.selectedCustomerId = null; balanceDiv.innerHTML = ''; balanceDiv.className = 'customer-balance'; return; }
        const option = Array.from(this.el.customerList?.querySelectorAll('option') || []).find(o => o.value === val);
        if (option && option.dataset.id) {
            const customer = this.cache.customerMap.get(option.dataset.id);
            if (customer) {
                this.state.selectedCustomerId = customer.id;
                const bal = customer.balance || 0;
                if (bal > 0) { balanceDiv.innerHTML = `العميل دائن بـ ${Utils.formatMoney(bal)} (يمكن استخدامه للدفع)`; balanceDiv.className = 'customer-balance positive'; }
                else if (bal < 0) { balanceDiv.innerHTML = `العميل مدين بـ ${Utils.formatMoney(-bal)}`; balanceDiv.className = 'customer-balance negative'; }
                else { balanceDiv.innerHTML = 'لا يوجد رصيد'; balanceDiv.className = 'customer-balance'; }
                return;
            }
        }
        this.state.selectedCustomerId = null; balanceDiv.innerHTML = ''; balanceDiv.className = 'customer-balance';
    },
    getSelectedCustomer() { return this.state.selectedCustomerId ? this.cache.customerMap.get(this.state.selectedCustomerId) || null : null; },

    // ==================== السلة والحسابات ====================
    calculateTotals() {
        let subtotal = 0; for (const item of this.state.cart) subtotal += Utils.round(item.price * item.quantity);
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
        const pieces = this.state.cart.reduce((s, item) => s + (item.quantity * (item.factor || 1)), 0);
        if (this.el.totalPieces) this.el.totalPieces.textContent = Math.round(pieces);
    },

    renderCart() {
        const container = this.el.cartItemsContainer; if (!container) return;
        container.innerHTML = `<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span></div>`;
        if (!this.state.cart.length) { container.innerHTML += '<div class="empty-cart-message">السلة فارغة</div>'; this.updateTotalsAndUI(); return; }
        this.state.cart.forEach((item, idx) => {
            const row = document.createElement('div'); row.className = 'cart-item-row';
            const safeName = Utils.escapeHTML(item.productName); const safeUnit = Utils.escapeHTML(item.unitName);
            const lineTotal = Utils.formatMoney(Utils.round(item.price * item.quantity, 2));
            row.innerHTML = `
                <div><span class="cart-item-name">${safeName}</span><br><span class="cart-item-unit">${safeUnit}</span></div>
                <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}" aria-label="الكمية"></div>
                <div><input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}" aria-label="السعر"></div>
                <div>${lineTotal}</div>
                <div><i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" data-idx="${idx}" aria-label="حذف"></i></div>
            `;
            container.appendChild(row);
        });
        container.querySelectorAll('.cart-qty-input').forEach(input => { input.addEventListener('change', (e) => { const idx = parseInt(e.target.dataset.idx); const qty = parseFloat(e.target.value); if (isNaN(qty) || qty <= 0) this.state.cart.splice(idx, 1); else this.state.cart[idx].quantity = qty; this.renderCart(); }); });
        container.querySelectorAll('.cart-price-input').forEach(input => { input.addEventListener('change', (e) => { const idx = parseInt(e.target.dataset.idx); const price = parseFloat(e.target.value); if (!isNaN(price) && price >= 0) this.state.cart[idx].price = price; this.renderCart(); }); });
        container.querySelectorAll('.fa-trash').forEach(icon => { icon.addEventListener('click', (e) => { const idx = parseInt(e.target.dataset.idx); this.state.cart.splice(idx, 1); this.renderCart(); }); });
        this.updateTotalsAndUI();
    },

    // ==================== إضافة منتج للسلة ====================
    openUnitModal(productId) {
        const product = this.cache.productMap.get(String(productId)) || this.cache.productMap.get(productId);
        if (!product) { this.showToast('المنتج غير موجود'); return; }
        if (!product.units?.length) { this.showToast('المنتج لا يحتوي على وحدات'); return; }
        this.state.selectedProduct = product;
        this.el.modalProductName.textContent = Utils.escapeHTML(product.name);
        const container = this.el.unitButtons;
        container.innerHTML = product.units.map((u, idx) => `<button class="unit-btn ${idx === 0 ? 'active' : ''}" data-index="${idx}">${Utils.escapeHTML(u.name)}</button>`).join('');
        container.querySelectorAll('.unit-btn').forEach(btn => { btn.addEventListener('click', () => { const index = parseInt(btn.dataset.index); this.selectUnit(index); }); });
        this.state.selectedUnit = product.units[0]; this.updateUnitModalInfo(); this.showModal('unitQuantityModal');
    },

    selectUnit(index) {
        if (!this.state.selectedProduct?.units) return;
        this.state.selectedUnit = this.state.selectedProduct.units[index];
        const container = this.el.unitButtons; container.querySelectorAll('.unit-btn').forEach((btn, i) => { btn.classList.toggle('active', i === index); });
        this.updateUnitModalInfo();
    },

    updateUnitModalInfo() {
        const product = this.state.selectedProduct; const unit = this.state.selectedUnit; if (!product || !unit) return;
        const baseUnit = product.units[0]; const baseStock = baseUnit.stock || 0; const factor = unit.factor || 1;
        let availableStock;
        if (unit === baseUnit) { availableStock = Math.floor(baseStock); }
        else { const wholeBase = Math.floor(baseStock); const remainderPieces = Math.round((baseStock - wholeBase) * factor); availableStock = wholeBase * factor + remainderPieces; }
        const maxAvailable = Math.max(0, availableStock);
        this.el.selectedPrice.value = unit.price || 0; this.el.selectedQuantity.max = maxAvailable; this.el.selectedQuantity.value = maxAvailable > 0 ? 1 : 0;
        if (unit === baseUnit) { this.el.stockInfo.textContent = `المخزون المتاح: ${maxAvailable} ${baseUnit.name}`; }
        else { const wholeBase = Math.floor(baseStock); const remainderPieces = Math.round((baseStock - wholeBase) * factor); let detail = `(${wholeBase} ${baseUnit.name}`; if (remainderPieces > 0) detail += ` و ${remainderPieces} ${unit.name}`; detail += ')'; this.el.stockInfo.textContent = `المخزون المتاح: ${maxAvailable} ${unit.name} ${detail}`; }
    },

    addToCartFromModal() {
        const qty = parseFloat(this.el.selectedQuantity?.value) || 0; const maxAvailable = parseFloat(this.el.selectedQuantity?.max) || 0;
        if (qty <= 0 || qty > maxAvailable) { alert(`الكمية غير متاحة. الحد الأقصى: ${maxAvailable} ${this.state.selectedUnit?.name || ''}`); return; }
        const price = parseFloat(this.el.selectedPrice?.value) || 0; if (price < 0) { alert('السعر لا يمكن أن يكون سالبًا'); return; }
        const unit = this.state.selectedUnit;
        if (unit) {
            if (unit.minPrice > 0 && price < unit.minPrice) { alert(`لا يمكن البيع بأقل من السعر الأدنى: ${Utils.formatMoney(unit.minPrice)}`); return; }
            if (unit.maxPrice > 0 && price > unit.maxPrice) { alert(`لا يمكن البيع بأعلى من السعر الأقصى: ${Utils.formatMoney(unit.maxPrice)}`); return; }
        }
        const existing = this.state.cart.find(i => i.productId === this.state.selectedProduct.id && i.unitName === unit.name);
        if (existing) existing.quantity = Utils.round(existing.quantity + qty, 3);
        else this.state.cart.push({ productId: this.state.selectedProduct.id, productName: this.state.selectedProduct.name, unitName: unit.name, quantity: qty, price: price, factor: unit.factor || 1, isBaseUnit: unit === this.state.selectedProduct.units[0] });
        this.renderCart(); this.closeModal('unitQuantityModal');
    },

    // ==================== المودالات العامة ====================
    showModal(id) { const m = this.el[id]; if (m) m.classList.add('open'); },
    closeModal(id) { const m = this.el[id]; if (m) m.classList.remove('open'); },

    // ==================== الدفع ====================
    openPaymentModal() {
        if (!this.state.cart.length) { alert('السلة فارغة'); return; }
        const totals = this.calculateTotals();
        this.el.paySubtotal.textContent = Utils.formatMoney(totals.subtotal);
        this.el.payDiscount.textContent = Utils.formatMoney(totals.discount);
        this.el.payNet.textContent = Utils.formatMoney(totals.net);
        const customer = this.getSelectedCustomer();
        const bal = customer?.balance || 0;
        this.el.currentBalance.textContent = Utils.formatMoney(Math.abs(bal));
        this.el.currentBalance.classList.toggle('text-success', bal >= 0);
        this.el.currentBalance.classList.toggle('text-danger', bal < 0);

        // التعامل الآمن مع عنصر استخدام الرصيد (قد لا يكون موجودًا)
        const useBalanceCheckbox = document.getElementById('useCustomerBalanceCheckbox');
        const balanceAmountEl = document.getElementById('customerBalanceAmount');
        if (useBalanceCheckbox) {
            if (customer && bal > 0) {
                useBalanceCheckbox.style.display = 'block';
                if (balanceAmountEl) balanceAmountEl.textContent = `الرصيد المتاح: ${Utils.formatMoney(bal)}`;
                useBalanceCheckbox.checked = true;
            } else {
                useBalanceCheckbox.style.display = 'none';
                useBalanceCheckbox.checked = false;
            }
        }

        this.el.cashAmount.value = '';
        this.el.transferAmount.value = '';
        this.el.paymentMethod.value = 'cash';
        this.togglePaymentFields();
        this.updatePaymentPreview();
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
        const method = this.el.paymentMethod?.value || 'cash';
        let cashPaid = 0, transferPaid = 0;
        if (method === 'cash') cashPaid = parseFloat(this.el.cashAmount?.value) || 0;
        else if (method === 'transfer') transferPaid = parseFloat(this.el.transferAmount?.value) || 0;
        else if (method === 'mixed') {
            cashPaid = parseFloat(this.el.cashAmount?.value) || 0;
            transferPaid = parseFloat(this.el.transferAmount?.value) || 0;
        }
        const customer = this.getSelectedCustomer();
        let usedBalance = 0;
        const useBalanceCheckbox = document.getElementById('useCustomerBalanceCheckbox');
        if (customer && useBalanceCheckbox?.checked && customer.balance > 0) {
            usedBalance = Math.min(customer.balance, net);
        }
        this.state.usedCustomerBalance = usedBalance;
        const totalPaid = Utils.round(cashPaid + transferPaid + usedBalance, 2);
        const diff = Utils.round(totalPaid - net, 2);
        const currentBal = customer?.balance || 0;
        const newBal = Utils.round(currentBal - usedBalance + diff, 2);
        this.el.remainingDisplay.textContent = diff >= 0 ? `فائض ${Utils.formatMoney(diff)}` : `متبقي ${Utils.formatMoney(-diff)}`;
        this.el.balanceAfterLabel.textContent = newBal >= 0 ? 'رصيد للعميل بعد الدفع:' : 'رصيد على العميل بعد الدفع:';
        this.el.balanceAfter.textContent = Utils.formatMoney(Math.abs(newBal));
        this.el.balanceAfter.classList.toggle('text-success', newBal >= 0);
        this.el.balanceAfter.classList.toggle('text-danger', newBal < 0);
    },

    getBaseQuantityReduction(item) {
        const product = this.cache.productMap.get(String(item.productId));
        if (!product?.units) return 0;
        const baseUnit = product.units[0];
        if (item.unitName === baseUnit.name) return item.quantity;
        const selectedUnit = product.units.find(u => u.name === item.unitName);
        const factor = selectedUnit?.factor || 1;
        return item.quantity / factor;
    },

    // ✅ إتمام الدفع مع خصم رصيد العميل تلقائياً
    async completePayment() {
        if (this.state.isProcessing) { this.showToast('جاري معالجة الدفع...'); return; }
        this.state.isProcessing = true;
        this.el.confirmAndPrintBtn.disabled = true;
        this.showToast('جاري حفظ الفاتورة...');

        try {
            const totals = this.calculateTotals();
            const method = this.el.paymentMethod?.value || 'cash';
            let cashPaid = 0, transferPaid = 0;
            if (method === 'cash') cashPaid = parseFloat(this.el.cashAmount?.value) || 0;
            else if (method === 'transfer') transferPaid = parseFloat(this.el.transferAmount?.value) || 0;
            else if (method === 'mixed') {
                cashPaid = parseFloat(this.el.cashAmount?.value) || 0;
                transferPaid = parseFloat(this.el.transferAmount?.value) || 0;
            }
            const usedBalance = this.state.usedCustomerBalance || 0;
            const totalPaid = Utils.round(cashPaid + transferPaid + usedBalance, 2);

            if (totalPaid < totals.net && method !== 'credit') {
                alert('المبلغ المدفوع غير كافٍ لتغطية الفاتورة');
                this.state.isProcessing = false;
                this.el.confirmAndPrintBtn.disabled = false;
                return;
            }

            const diff = Utils.round(totalPaid - totals.net, 2);
            const notes = this.el.paymentNotes?.value || '';
            const invoiceNumber = this.state.isDBReady ? await DB.generateInvoiceNumber() : this.generateLocalInvoiceNumber();

            const invoice = {
                id: Utils.generateUUID(), invoice_number: invoiceNumber, type: 'sale', date: Utils.getToday(),
                customer_id: this.state.selectedCustomerId || null,
                customer_name: this.getSelectedCustomer()?.name || 'نقدي',
                items: JSON.parse(JSON.stringify(this.state.cart)),
                subtotal: totals.subtotal, discount: totals.discount, total: totals.net,
                paid: totalPaid, remaining: diff >= 0 ? 0 : -diff,
                status: diff >= 0 ? 'paid' : 'partial', notes: notes,
                used_customer_balance: usedBalance
            };

            const customer = this.getSelectedCustomer();
            const oldCustomerBalance = customer ? customer.balance : 0;

            if (this.state.isDBReady) {
                await DB.saveInvoice(invoice);
                for (const item of this.state.cart) {
                    const prod = this.cache.productMap.get(String(item.productId));
                    if (prod) {
                        const reduction = this.getBaseQuantityReduction(item);
                        prod.units[0].stock = Utils.round(Math.max(0, prod.units[0].stock - reduction), 3);
                        await DB.saveProduct(prod);
                    }
                }
                if (customer) {
                    customer.balance = Utils.round((customer.balance || 0) - usedBalance + diff, 2);
                    await DB.saveParty(customer);
                }
                if (cashPaid > 0) await DB.saveTransaction({ id: Utils.generateUUID(), date: Utils.getToday(), type: 'income', amount: cashPaid, description: `فاتورة ${invoiceNumber}`, payment_method: 'cash' });
                if (transferPaid > 0) await DB.saveTransaction({ id: Utils.generateUUID(), date: Utils.getToday(), type: 'income', amount: transferPaid, description: `فاتورة ${invoiceNumber}`, payment_method: 'bank' });
            } else if (Utils.hasLocalDB()) {
                await localDB.put('invoices', invoice);
                if (customer) {
                    customer.balance = Utils.round((customer.balance || 0) - usedBalance + diff, 2);
                    await localDB.put('parties', customer);
                }
            }

            this.closeModal('paymentModal');
            await this.loadProductsAndCustomers();
            this.buildCache();
            this.showReceiptModal(invoice, customer || { name: 'نقدي', balance: 0 }, this.state.cart, totals, oldCustomerBalance);
            this.resetCart();
            this.showToast('تم البيع بنجاح');

        } catch (error) {
            console.error('خطأ في الدفع:', error);
            alert('حدث خطأ أثناء الدفع: ' + (error.message || ''));
        } finally {
            this.state.isProcessing = false;
            this.el.confirmAndPrintBtn.disabled = false;
        }
    },

    generateLocalInvoiceNumber() {
        const year = new Date().getFullYear().toString().slice(-2);
        const key = `inv_counter_${year}`;
        let num = parseInt(localStorage.getItem(key) || '0', 10) + 1;
        localStorage.setItem(key, num.toString());
        return year + '-' + String(num).padStart(4, '0');
    },

    resetCart() {
        this.state.cart = []; this.state.selectedCustomerId = null;
        this.state.discountValue = 0; this.state.discountType = 'amount'; this.state.usedCustomerBalance = 0;
        if (this.el.discountValue) this.el.discountValue.value = 0;
        if (this.el.discountType) this.el.discountType.value = 'amount';
        if (this.el.customerSearchInput) this.el.customerSearchInput.value = '';
        if (this.el.customerBalanceDisplay) { this.el.customerBalanceDisplay.innerHTML = ''; this.el.customerBalanceDisplay.className = 'customer-balance'; }
        this.renderCart();
    },

    // ==================== تعليق واسترجاع الفواتير ====================
    async holdInvoice() {
        if (!this.state.cart.length) { alert('السلة فارغة'); return; }
        try {
            const totals = this.calculateTotals();
            const invoiceNumber = this.state.isDBReady ? await DB.generateInvoiceNumber() : this.generateLocalInvoiceNumber();
            const invoice = {
                id: Utils.generateUUID(), invoice_number: invoiceNumber, type: 'sale', date: Utils.getToday(),
                customer_id: this.state.selectedCustomerId || null,
                customer_name: this.getSelectedCustomer()?.name || 'نقدي',
                items: JSON.parse(JSON.stringify(this.state.cart)),
                subtotal: totals.subtotal, discount: totals.discount, total: totals.net,
                paid: 0, remaining: totals.net, status: 'held', notes: 'فاتورة معلقة'
            };
            if (this.state.isDBReady) await DB.saveInvoice(invoice);
            else if (Utils.hasLocalDB()) await localDB.put('invoices', invoice);
            alert(`تم تعليق الفاتورة ${invoiceNumber}`);
            this.resetCart();
            await this.loadProductsAndCustomers(); this.buildCache();
            this.showToast('تم تعليق الفاتورة');
        } catch (error) { console.error(error); alert('فشل تعليق الفاتورة'); }
    },

    async loadHeldInvoices() {
        let invoices = [];
        try {
            if (this.state.isDBReady) { invoices = (await DB.getInvoices()).filter(i => i.type === 'sale' && i.status === 'held'); }
            else if (Utils.hasLocalDB()) { const all = await localDB.getAll('invoices') || []; invoices = all.filter(i => i.type === 'sale' && i.status === 'held'); }
        } catch (e) { console.error('خطأ تحميل المعلقة:', e); }
        const container = this.el.heldInvoicesList; if (!container) return;
        if (!invoices.length) { container.innerHTML = '<p style="text-align:center; padding:20px;">لا توجد فواتير معلقة</p>'; }
        else {
            container.innerHTML = invoices.map(inv => {
                const customer = this.cache.customerMap.get(String(inv.customer_id)); const name = customer?.name || 'نقدي';
                const invNumber = Utils.escapeHTML(inv.invoice_number || inv.id?.substring(0, 8) || ''); const total = Utils.formatMoney(inv.total);
                return `<div class="held-invoice-item" data-id="${Utils.escapeHTML(String(inv.id))}" style="padding:15px; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:10px; cursor:pointer; display:flex; justify-content:space-between;"><div><strong>${invNumber}</strong><br>${Utils.escapeHTML(name)} - ${total}</div><div><i class="fas fa-play"></i></div></div>`;
            }).join('');
            container.querySelectorAll('.held-invoice-item').forEach(item => { item.addEventListener('click', () => this.resumeInvoice(item.dataset.id)); });
        }
        this.showModal('heldInvoicesModal');
    },

    async resumeInvoice(id) {
        let inv;
        try {
            if (this.state.isDBReady) { const invoices = await DB.getInvoices(); inv = invoices.find(i => String(i.id) === String(id)); if (inv && window.supabase) await supabase.from('invoices').delete().eq('id', id); }
            else if (Utils.hasLocalDB()) { const held = await localDB.getAll('invoices'); inv = held.find(i => String(i.id) === String(id)); if (inv && localDB.delete) await localDB.delete('invoices', id).catch(() => {}); }
            if (!inv) { alert('الفاتورة غير موجودة'); return; }
            this.state.cart = JSON.parse(JSON.stringify(inv.items || []));
            this.state.selectedCustomerId = inv.customer_id || null;
            if (inv.customer_id) { const customer = this.cache.customerMap.get(String(inv.customer_id)); if (customer) this.el.customerSearchInput.value = customer.name || ''; }
            else this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
            this.onCustomerSearch(); this.renderCart(); this.closeModal('heldInvoicesModal');
            this.showToast('تم تحميل الفاتورة المعلقة');
        } catch (err) { console.error('خطأ في استرجاع الفاتورة:', err); alert('فشل استرجاع الفاتورة المعلقة'); }
    },

    // ==================== حفظ واسترجاع السلة ====================
    saveCartToStorage() {
        if (this.state.cart.length > 0) {
            const data = { cart: this.state.cart, customerId: this.state.selectedCustomerId, discountType: this.state.discountType, discountValue: this.state.discountValue };
            localStorage.setItem('pos_held_cart', JSON.stringify(data));
        } else localStorage.removeItem('pos_held_cart');
    },

    restoreCartFromStorage() {
        const saved = localStorage.getItem('pos_held_cart'); if (!saved) return;
        try {
            const held = JSON.parse(saved);
            this.state.cart = held.cart || []; this.state.selectedCustomerId = held.customerId || null;
            this.state.discountType = held.discountType || 'amount'; this.state.discountValue = held.discountValue || 0;
            if (this.el.discountType) this.el.discountType.value = this.state.discountType;
            if (this.el.discountValue) this.el.discountValue.value = this.state.discountValue;
            if (this.state.selectedCustomerId) { const customer = this.cache.customerMap.get(String(this.state.selectedCustomerId)); if (customer && this.el.customerSearchInput) this.el.customerSearchInput.value = customer.name || ''; }
            else if (this.el.customerSearchInput) this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
            this.onCustomerSearch(); this.renderCart();
            this.showToast('تم استعادة السلة المحفوظة');
        } catch (e) { console.warn('فشل استعادة السلة:', e); }
        localStorage.removeItem('pos_held_cart');
    },

    // ==================== توست ====================
    showToast(msg) {
        const t = this.el.toast; if (!t) return;
        t.textContent = msg; t.classList.add('show');
        clearTimeout(this._toastTimer); this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    },

    // ==================== الإيصال والطباعة ====================
    showReceiptModal(invoice, customer, items, totals, oldBalance = 0) {
        let settings = {};
        try { settings = JSON.parse(localStorage.getItem('app_settings') || '{}'); } catch(e) {}
        const companyName = settings?.company?.name || 'حسابي';
        const companyPhone = settings?.company?.phone || '';
        const footerMsg = settings?.print?.footer_message || 'شكراً لتعاملكم معنا';

        const itemsRows = items.map(item => {
            const lineTotal = Utils.round((item.price || 0) * (item.quantity || 0), 2);
            return `<tr><td>${Utils.escapeHTML(item.productName)} - ${Utils.escapeHTML(item.unitName)}</td><td>${item.quantity}</td><td>${Utils.formatMoney(item.price)}</td><td>${Utils.formatMoney(lineTotal)}</td></tr>`;
        }).join('');

        const newBalance = customer?.balance || 0;
        const usedBalance = invoice.used_customer_balance || 0;
        const paymentInfoHTML = customer && customer.name !== 'نقدي' ? `
            <div class="payment-info-box">
                <div class="payment-row"><span>الرصيد السابق:</span> <span>${Utils.formatMoney(oldBalance)}</span></div>
                ${usedBalance > 0 ? `<div class="payment-row"><span>تم خصم من الرصيد:</span> <span>${Utils.formatMoney(usedBalance)}</span></div>` : ''}
                <div class="payment-row"><span>المدفوع:</span> <span>${Utils.formatMoney(invoice.paid)}</span></div>
                <div class="payment-row"><span>الرصيد الحالي:</span> <span>${Utils.formatMoney(newBalance)}</span></div>
            </div>
        ` : '';

        this.el.receiptPrintArea.innerHTML = `
            <div class="company-name">${Utils.escapeHTML(companyName)}</div>
            <div class="company-info">${companyPhone ? 'هاتف: ' + Utils.escapeHTML(companyPhone) : ''}</div>
            <div class="divider"></div>
            <p style="font-size:13px;"><strong>العميل:</strong> ${Utils.escapeHTML(customer?.name || 'نقدي')}</p>
            <p style="font-size:13px;"><strong>رقم الفاتورة:</strong> ${invoice.invoice_number || invoice.id?.substring(0,8)}</p>
            <p style="font-size:13px;"><strong>التاريخ:</strong> ${Utils.formatDate(invoice.date)}</p>
            <div class="divider"></div>
            <table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${itemsRows}</tbody></table>
            <div class="totals"><p><strong>الإجمالي:</strong> ${Utils.formatMoney(totals.subtotal)}</p>${totals.discount > 0 ? `<p><strong>الخصم:</strong> ${Utils.formatMoney(totals.discount)}</p>` : ''}<p><strong>الصافي:</strong> ${Utils.formatMoney(totals.net)}</p></div>
            ${paymentInfoHTML}
            <div class="divider"></div>
            <div class="footer">${Utils.escapeHTML(footerMsg)}</div>
        `;
        this.showModal('receiptModal');
    },

    printReceiptFromModal() {
        const printContent = this.el.receiptPrintArea.innerHTML;
        const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
        const companyName = settings?.company?.name || 'حسابي';
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) { alert('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }
        printWindow.document.write(`<html><head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;text-align:right;padding:20px;color:#000;background:white;width:80mm;margin:0 auto;}.company-name{text-align:center;font-size:18px;font-weight:bold;margin-bottom:4px;}.company-info{text-align:center;font-size:12px;color:#444;margin-bottom:12px;}.divider{border-top:1px dashed #000;margin:10px 0;}table{width:100%;border-collapse:collapse;font-size:13px;}th,td{padding:3px 4px;border-bottom:1px dotted #ddd;text-align:right;}th{background:#f5f5f5;font-size:11px;}.totals{font-size:14px;margin-top:8px;}.totals p{margin:3px 0;}.footer{text-align:center;margin-top:12px;font-size:13px;font-weight:bold;color:#333;}</style></head><body><div class="company-name">${Utils.escapeHTML(companyName)}</div><div class="divider"></div>${printContent}</body></html>`);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
};

// ==================== بدء التشغيل ====================
window.POS = POS;
window.addEventListener('DOMContentLoaded', () => POS.init());
window.addEventListener('beforeunload', () => POS.saveCartToStorage());
