/* =============================================
   purchase-invoice.js - إنشاء فاتورة شراء
   ============================================= */
'use strict';

const PurchaseInvoice = {
    state: {
        products: [],
        suppliers: [],
        cart: [],
        selectedProduct: null,
        selectedUnit: null,
        selectedSupplierId: null,
        isDBReady: false,
        isProcessing: false,
        netTotal: 0
    },
    cache: { productMap: new Map(), supplierMap: new Map() },
    el: {},

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadInitialData();
    },

    cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay', 'logoutBtn',
            'supplierSearchInput', 'productSearchInput', 'supplierDropdown', 'productDropdown',
            'cartItemsContainer', 'itemTypesCount', 'totalPieces', 'subtotal', 'netTotal', 'savePurchaseBtn',
            'unitCostModal', 'modalProductName', 'unitButtons', 'selectedQuantity', 'selectedCost', 'stockInfo', 'addToCartBtn', 'closeUnitModalBtn',
            'sidebarAvatar', 'sidebarUserName', 'moreMenuBtn', 'moreDropdown'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    bindEvents() {
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
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        this.el.productSearchInput?.addEventListener('input', () => this.filterProducts());
        this.el.productDropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                this.openUnitCostModal(item.dataset.id);
                this.hideProductDropdown();
                this.el.productSearchInput.value = '';
            }
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-header')) this.hideProductDropdown();
        });

        this.el.supplierSearchInput?.addEventListener('input', () => this.filterSuppliers());
        this.el.supplierDropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                if (item.dataset.id === 'none') {
                    this.state.selectedSupplierId = null;
                    this.el.supplierSearchInput.value = 'بدون مورد';
                } else {
                    this.state.selectedSupplierId = item.dataset.id;
                    const sup = this.cache.supplierMap.get(item.dataset.id);
                    this.el.supplierSearchInput.value = sup?.name || '';
                }
                this.hideSupplierDropdown();
            }
        });

        this.el.addToCartBtn?.addEventListener('click', () => this.addToCart());
        this.el.closeUnitModalBtn?.addEventListener('click', () => this.closeModal('unitCostModal'));
        this.el.savePurchaseBtn?.addEventListener('click', () => this.savePurchase());
    },

    async loadInitialData() {
        this.state.isDBReady = !!(window.DB && window.supabase);
        await this.loadSuppliersAndProducts();
        this.buildCache();
    },

    async loadSuppliersAndProducts() {
        try {
            if (this.state.isDBReady) {
                this.state.products = await DB.getProducts() || [];
                this.state.suppliers = (await DB.getParties('supplier')) || [];
            } else if (window.localDB) {
                this.state.products = await localDB.getAll('products') || [];
                this.state.suppliers = (await localDB.getAll('parties') || []).filter(p => p.type === 'supplier');
            }
            this.buildCache();
        } catch (e) {
            console.error(e);
            if (window.Toast) Toast.error('فشل تحميل البيانات');
        }
    },

    buildCache() {
        this.cache.productMap.clear();
        this.cache.supplierMap.clear();
        for (const p of this.state.products) { this.cache.productMap.set(String(p.id), p); }
        for (const s of this.state.suppliers) { this.cache.supplierMap.set(String(s.id), s); }
    },

    filterSuppliers() {
        const term = this.el.supplierSearchInput?.value.trim().toLowerCase() || '';
        const dropdown = this.el.supplierDropdown;
        if (!dropdown) return;

        let filtered = this.state.suppliers;
        if (term) filtered = filtered.filter(s => s.name?.toLowerCase().includes(term) || (s.phone && s.phone.includes(term)));

        let html = `<div class="dropdown-item" data-id="none"><div class="item-info"><h4>بدون مورد</h4></div></div>`;
        filtered.forEach(s => {
            html += `<div class="dropdown-item" data-id="${s.id}">
                        <div class="item-info"><h4>${Utils.escapeHTML(s.name)}</h4><small>${s.phone || ''}</small></div>
                    </div>`;
        });
        dropdown.innerHTML = html;
        dropdown.classList.add('show');
    },
    hideSupplierDropdown() { this.el.supplierDropdown?.classList.remove('show'); },

    filterProducts() {
        const term = this.el.productSearchInput?.value.trim().toLowerCase() || '';
        const dropdown = this.el.productDropdown;
        if (!dropdown) return;
        if (!term) { dropdown.classList.remove('show'); return; }

        const filtered = this.state.products.filter(p => p.name?.toLowerCase().includes(term));
        dropdown.innerHTML = filtered.length ? filtered.map(p => `
            <div class="dropdown-item" data-id="${p.id}">
                <div class="item-info"><h4>${Utils.escapeHTML(p.name)}</h4></div>
                <div class="item-price">${Utils.formatMoney(p.units?.[0]?.price || 0)}</div>
            </div>
        `).join('') : '<div class="dropdown-item" style="color:#94a3b8;">لا توجد نتائج</div>';
        dropdown.classList.add('show');
    },
    hideProductDropdown() { this.el.productDropdown?.classList.remove('show'); },

    openUnitCostModal(productId) {
        const product = this.cache.productMap.get(String(productId));
        if (!product || !product.units?.length) {
            if (window.Toast) Toast.info('المنتج غير موجود');
            return;
        }
        this.state.selectedProduct = product;
        this.el.modalProductName.textContent = Utils.escapeHTML(product.name);

        const container = this.el.unitButtons;
        container.innerHTML = product.units.map((u, idx) => `
            <button class="unit-btn ${idx === 0 ? 'active' : ''}" data-index="${idx}">${Utils.escapeHTML(u.name)}</button>
        `).join('');
        container.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectUnit(+btn.dataset.index));
        });
        this.state.selectedUnit = product.units[0];
        this.el.selectedCost.value = '';
        this.el.selectedQuantity.value = 1;
        this.showModal('unitCostModal');
    },

    selectUnit(index) {
        if (!this.state.selectedProduct?.units) return;
        this.state.selectedUnit = this.state.selectedProduct.units[index];
        this.el.unitButtons.querySelectorAll('.unit-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });
    },

    addToCart() {
        const qty = +this.el.selectedQuantity?.value || 0;
        const cost = +this.el.selectedCost?.value || 0;

        if (qty <= 0) { if (window.Toast) Toast.error('الكمية غير صالحة'); return; }
        if (cost < 0) { if (window.Toast) Toast.error('التكلفة غير صالحة'); return; }

        const unit = this.state.selectedUnit;
        const product = this.state.selectedProduct;
        if (!product || !unit) return;

        const existing = this.state.cart.find(i => i.productId === product.id && i.unitName === unit.name);
        if (existing) {
            existing.quantity = Utils.round(existing.quantity + qty, 3);
            existing.cost = cost; // تحديث التكلفة
        } else {
            this.state.cart.push({
                productId: product.id,
                productName: product.name,
                unitName: unit.name,
                quantity: qty,
                cost: cost,
                factor: unit.factor || 1
            });
        }
        this.renderCart();
        this.closeModal('unitCostModal');
    },

    renderCart() {
        const container = this.el.cartItemsContainer;
        if (!container) return;

        container.innerHTML = `<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>التكلفة</span><span>الإجمالي</span><span></span></div>`;
        if (!this.state.cart.length) {
            container.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>');
            this.updateTotals();
            return;
        }

        this.state.cart.forEach((item, idx) => {
            const safeName = Utils.escapeHTML(item.productName);
            const safeUnit = Utils.escapeHTML(item.unitName);
            const lineTotal = Utils.formatMoney(Utils.round(item.cost * item.quantity, 2));
            const row = document.createElement('div');
            row.className = 'cart-item-row';
            row.innerHTML = `
                <div><span class="cart-item-name">${safeName}</span><br><span class="cart-item-unit">${safeUnit}</span></div>
                <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}"></div>
                <div><input type="number" value="${item.cost}" step="0.01" class="cart-cost-input" data-idx="${idx}"></div>
                <div>${lineTotal}</div>
                <div><i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" data-idx="${idx}"></i></div>
            `;
            container.appendChild(row);
        });

        // أحداث التعديل
        container.addEventListener('change', (e) => {
            if (e.target.classList.contains('cart-qty-input')) {
                const idx = +e.target.dataset.idx;
                const qty = +e.target.value;
                if (isNaN(qty) || qty <= 0) this.state.cart.splice(idx, 1);
                else this.state.cart[idx].quantity = qty;
                this.renderCart();
            } else if (e.target.classList.contains('cart-cost-input')) {
                const idx = +e.target.dataset.idx;
                const cost = +e.target.value;
                if (!isNaN(cost) && cost >= 0) this.state.cart[idx].cost = cost;
                this.renderCart();
            }
        });
        container.addEventListener('click', (e) => {
            if (e.target.closest('.fa-trash')) {
                const idx = +e.target.closest('.fa-trash').dataset.idx;
                this.state.cart.splice(idx, 1);
                this.renderCart();
            }
        });

        this.updateTotals();
    },

    updateTotals() {
        let subtotal = 0;
        for (const item of this.state.cart) subtotal += Utils.round(item.cost * item.quantity);
        subtotal = Utils.round(subtotal, 2);
        this.state.netTotal = subtotal;

        if (this.el.subtotal) this.el.subtotal.textContent = Utils.formatMoney(subtotal);
        if (this.el.netTotal) this.el.netTotal.textContent = Utils.formatMoney(subtotal);
        if (this.el.itemTypesCount) this.el.itemTypesCount.textContent = this.state.cart.length;
        let pieces = 0;
        for (const item of this.state.cart) pieces += item.quantity * (item.factor || 1);
        if (this.el.totalPieces) this.el.totalPieces.textContent = Math.round(pieces);
    },

    async savePurchase() {
        if (!this.state.cart.length) {
            if (window.Toast) Toast.error('السلة فارغة');
            return;
        }
        if (!this.state.selectedSupplierId) {
            if (window.Toast) Toast.error('يرجى اختيار مورد');
            return;
        }

        this.state.isProcessing = true;
        this.el.savePurchaseBtn.disabled = true;
        this.el.savePurchaseBtn.textContent = 'جاري الحفظ...';

        try {
            const supplier = this.cache.supplierMap.get(this.state.selectedSupplierId);
            const invoiceNumber = this.state.isDBReady ? await DB.generateInvoiceNumber() : 'PUR-' + Date.now();
            
            const purchaseData = {
                id: Utils.generateUUID(),
                invoice_number: invoiceNumber,
                date: Utils.getToday(),
                supplier_id: this.state.selectedSupplierId,
                supplier_name: supplier?.name || '',
                items: this.state.cart.map(item => ({...item})),
                total: this.state.netTotal,
                paid: 0,
                remaining: this.state.netTotal,
                status: 'unpaid'
            };

            let result;
            if (window.PurchaseService && window.PurchaseService.createPurchaseInvoice) {
                result = await PurchaseService.createPurchaseInvoice(purchaseData);
            } else if (this.state.isDBReady) {
                result = await DB.createPurchaseInvoice(purchaseData);
            } else {
                throw new Error('خدمة المشتريات غير متاحة');
            }

            if (result && result.success) {
                if (window.Toast) Toast.success('تم حفظ فاتورة الشراء بنجاح');
                this.resetForm();
            } else {
                throw new Error(result?.error || 'فشل غير معروف');
            }
        } catch (e) {
            console.error(e);
            if (window.Toast) Toast.error(e.message || 'فشل حفظ الفاتورة');
        } finally {
            this.state.isProcessing = false;
            this.el.savePurchaseBtn.disabled = false;
            this.el.savePurchaseBtn.textContent = 'حفظ فاتورة الشراء';
        }
    },

    resetForm() {
        this.state.cart = [];
        this.state.selectedSupplierId = null;
        if (this.el.supplierSearchInput) this.el.supplierSearchInput.value = '';
        this.renderCart();
    },

    showModal(id) { const m = this.el[id]; if (m) m.classList.add('open'); },
    closeModal(id) { const m = this.el[id]; if (m) m.classList.remove('open'); }
};

window.PurchaseInvoice = PurchaseInvoice;
window.addEventListener('DOMContentLoaded', () => PurchaseInvoice.init());
