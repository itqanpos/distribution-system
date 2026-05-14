/* =============================================================
   pos.js - نظام "حسابي" لنقطة البيع (إصدار Premium المطور)
   ============================================================= */
'use strict';

const Utils = {
    // تنسيق المبالغ مع ضمان الأرقام الإنجليزية
    formatMoney: (amount, currency = 'ج.م') => {
        const formatted = Number(amount).toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        });
        return `${formatted} ${currency}`;
    },

    // تنسيق التاريخ مع استخدام الأرقام الإنجليزية بناءً على تفضيلات المستخدم
    formatDate: (dateStr) => {
        if (!dateStr) return '';
        try { 
            return new Date(dateStr).toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric' 
            }); 
        }
        catch (e) { return dateStr; }
    },

    getToday: () => new Date().toISOString().split('T')[0],

    escapeHTML: (str) => { 
        if (!str) return '';
        const d = document.createElement('div'); 
        d.appendChild(document.createTextNode(String(str))); 
        return d.innerHTML; 
    },

    debounce: (fn, delay) => { 
        let timer; 
        return (...args) => { 
            clearTimeout(timer); 
            timer = setTimeout(() => fn(...args), delay); 
        }; 
    },

    round: (value, decimals = 3) => Number(Math.round(value + 'e' + decimals) + 'e-' + decimals),

    generateUUID: () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? 
        crypto.randomUUID() : 
        'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { 
            const r = Math.random() * 16 | 0; 
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); 
        }),

    isDBReady: () => !!(window.DB && window.supabase),
    hasLocalDB: () => !!(window.localDB)
};

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
        discountValue: 0,
        discountType: 'amount',
        discount: 0,
        netTotal: 0,
        usedCustomerBalance: 0,
        tenantId: null // لدعم نظام SaaS
    },
    cache: { productMap: new Map(), customerMap: new Map() },
    el: {},

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.handleConnectionStatus();
        
        // جلب معرف المستأجر (Tenant ID) من نظام App
        this.state.tenantId = window.App?.getTenantId?.() || null;

        window.addEventListener('online', () => this.updateOnlineStatus());
        window.addEventListener('offline', () => this.updateOnlineStatus());
        document.addEventListener('visibilitychange', () => { 
            if (document.visibilityState === 'hidden') this.saveCartToStorage(); 
        });

        if (window.App) { 
            if (!App.requireAuth()) return; 
            App.initUserInterface(); 
        }

        this.loadInitialData();
        this.initSidebarUser();
    },

    cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay', 'moreMenuBtn', 'moreDropdown', 'holdInvoiceBtn', 'heldInvoicesBtn', 'logoutBtn',
            'productSearchInput', 'customerSearchInput', 'customerList', 'customerBalanceDisplay', 'productDropdown',
            'cartItemsContainer', 'discountValue', 'discountType', 'itemTypesCount', 'totalPieces', 'subtotal', 'netTotal', 'payBtn',
            'unitQuantityModal', 'modalProductName', 'unitButtons', 'selectedQuantity', 'selectedPrice', 'stockInfo', 'addToCartBtn', 'closeUnitModalBtn',
            'paymentModal', 'paySubtotal', 'payDiscount', 'payNet', 'currentBalance', 'paymentMethod', 'cashField', 'transferField', 'cashAmount', 'transferAmount',
            'remainingDisplay', 'balanceAfterLabel', 'balanceAfter', 'paymentNotes', 'confirmAndPrintBtn', 'closePaymentModalBtn',
            'heldInvoicesModal', 'heldInvoicesList', 'closeHeldModalBtn',
            'receiptModal', 'receiptPrintArea', 'printReceiptBtn', 'cancelReceiptModalBtn', 'closeReceiptModalBtn',
            'sidebarAvatar', 'sidebarUserName', 'toast'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    bindEvents() {
        this.el.menuToggle?.addEventListener('click', () => { 
            this.el.sidebar?.classList.toggle('open'); 
            this.el.sidebarOverlay?.classList.toggle('show'); 
        });

        this.el.sidebarOverlay?.addEventListener('click', () => { 
            this.el.sidebar?.classList.remove('open'); 
            this.el.sidebarOverlay?.classList.remove('show'); 
        });

        this.el.moreMenuBtn?.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            this.el.moreDropdown?.classList.toggle('show'); 
        });

        document.addEventListener('click', (e) => { 
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show'); 
        });

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

        const debouncedSearch = Utils.debounce(() => this.filterProducts(), 150);
        this.el.productSearchInput?.addEventListener('input', debouncedSearch);

        this.el.productDropdown?.addEventListener('click', (e) => { 
            const item = e.target.closest('.dropdown-item'); 
            if (item?.dataset.id) { 
                this.openUnitModal(item.dataset.id); 
                this.hideProductDropdown(); 
                this.el.productSearchInput.value = ''; 
            } 
        });

        this.el.customerSearchInput?.addEventListener('input', () => this.onCustomerSearch());
        
        this.el.discountValue?.addEventListener('input', () => { 
            this.state.discountValue = +this.el.discountValue.value || 0; 
            this.updateTotalsAndUI(); 
        });

        this.el.discountType?.addEventListener('change', () => { 
            this.state.discountType = this.el.discountType.value; 
            this.updateTotalsAndUI(); 
        });

        this.el.payBtn?.addEventListener('click', () => this.openPaymentModal());
        this.el.addToCartBtn?.addEventListener('click', () => this.addToCartFromModal());
        this.el.closeUnitModalBtn?.addEventListener('click', () => this.closeModal('unitQuantityModal'));
        
        this.el.confirmAndPrintBtn?.addEventListener('click', async (e) => { 
            e.preventDefault(); 
            await this.completePayment(); 
        });

        this.el.closePaymentModalBtn?.addEventListener('click', () => this.closeModal('paymentModal'));
        this.el.paymentMethod?.addEventListener('change', () => this.togglePaymentFields());
        
        const updatePayment = () => this.updatePaymentPreview();
        this.el.cashAmount?.addEventListener('input', updatePayment);
        this.el.transferAmount?.addEventListener('input', updatePayment);

        this.el.closeHeldModalBtn?.addEventListener('click', () => this.closeModal('heldInvoicesModal'));
        this.el.closeReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.cancelReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.printReceiptBtn?.addEventListener('click', () => this.printReceiptFromModal());
    },

    handleConnectionStatus() { this.updateOnlineStatus(); },
    
    updateOnlineStatus() { 
        const n = document.getElementById('mainNavbar'); 
        if (n) n.classList.toggle('offline', !navigator.onLine); 
    },

    initSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) { 
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = user.fullName?.charAt(0) || 'U'; 
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || 'مدير النظام'; 
        }
    },

    async loadInitialData() {
        this.state.isDBReady = Utils.isDBReady();
        await this.loadProductsAndCustomers();
        this.buildCache();
        this.restoreCartFromStorage();
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
            }

            this.state.products.forEach(p => { 
                if (typeof p.units === 'string') {
                    try { p.units = JSON.parse(p.units); } catch(e) { p.units = []; }
                }
            });
            this.populateCustomerList();
        } catch (e) { this.showToast('⚠️ فشل مزامنة البيانات'); }
    },

    buildCache() {
        this.cache.productMap.clear(); 
        this.cache.customerMap.clear();
        this.state.products.forEach(p => this.cache.productMap.set(String(p.id), p));
        this.state.customers.forEach(c => this.cache.customerMap.set(String(c.id), c));
    },

    populateCustomerList() {
        if (!this.el.customerList) return;
        this.el.customerList.innerHTML = `<option value="نقدي (بدون عميل)" data-id="cash">نقدي (بدون عميل)</option>` +
            this.state.customers.map(c => `<option value="${Utils.escapeHTML(c.name)}" data-id="${c.id}">${Utils.escapeHTML(c.name)}</option>`).join('');
    },

    filterProducts() {
        const term = this.el.productSearchInput?.value.trim().toLowerCase() || '';
        const dropdown = this.el.productDropdown; 
        if (!dropdown) return;

        if (!term) { dropdown.classList.remove('show'); return; }
        
        const filtered = this.state.products.filter(p => 
            p.name?.toLowerCase().includes(term) || 
            p.barcode?.includes(term)
        );

        if (!filtered.length) {
            dropdown.innerHTML = '<div class="dropdown-item" style="color:#94a3b8; text-align:center;">لا توجد نتائج</div>';
        } else {
            dropdown.innerHTML = filtered.map(p => `
                <div class="dropdown-item" data-id="${p.id}">
                    <div class="item-info"><h4>${Utils.escapeHTML(p.name)}</h4></div>
                    <div class="item-price">${Utils.formatMoney(p.units[0]?.price || 0)}</div>
                </div>`).join('');
        }
        dropdown.classList.add('show');
    },

    hideProductDropdown() { this.el.productDropdown?.classList.remove('show'); },

    onCustomerSearch() {
        const val = this.el.customerSearchInput?.value || '';
        const balanceDiv = this.el.customerBalanceDisplay;
        if (!balanceDiv) return;

        if (val === 'نقدي (بدون عميل)' || !val) {
            this.state.selectedCustomerId = null;
            balanceDiv.innerHTML = '';
            return;
        }

        const option = Array.from(this.el.customerList?.querySelectorAll('option') || []).find(o => o.value === val);
        if (option?.dataset.id && option.dataset.id !== 'cash') {
            const customer = this.cache.customerMap.get(option.dataset.id);
            if (customer) {
                this.state.selectedCustomerId = customer.id;
                const bal = customer.balance || 0;
                if (bal > 0) {
                    balanceDiv.innerHTML = `رصيد متاح: ${Utils.formatMoney(bal)}`;
                    balanceDiv.className = 'customer-balance positive';
                } else if (bal < 0) {
                    balanceDiv.innerHTML = `مديونية: ${Utils.formatMoney(Math.abs(bal))}`;
                    balanceDiv.className = 'customer-balance negative';
                } else {
                    balanceDiv.innerHTML = 'الرصيد: 0.00';
                    balanceDiv.className = 'customer-balance';
                }
                return;
            }
        }
        this.state.selectedCustomerId = null;
        balanceDiv.innerHTML = '';
    },

    getSelectedCustomer() { 
        return this.state.selectedCustomerId ? this.cache.customerMap.get(String(this.state.selectedCustomerId)) : null; 
    },

    calculateTotals() {
        let subtotal = 0;
        this.state.cart.forEach(item => subtotal += Utils.round(item.price * item.quantity, 2));
        
        let discount = 0;
        if (this.state.discountType === 'amount') {
            discount = Math.min(this.state.discountValue, subtotal);
        } else {
            discount = Utils.round(subtotal * (this.state.discountValue / 100), 2);
        }

        const net = Utils.round(subtotal - discount, 2);
        this.state.subtotal = subtotal;
        this.state.discount = discount;
        this.state.netTotal = net;
        return { subtotal, discount, net };
    },

    updateTotalsAndUI() {
        const { subtotal, net } = this.calculateTotals();
        if (this.el.subtotal) this.el.subtotal.textContent = Utils.formatMoney(subtotal);
        if (this.el.netTotal) this.el.netTotal.textContent = Utils.formatMoney(net);
        if (this.el.itemTypesCount) this.el.itemTypesCount.textContent = this.state.cart.length;
        
        let totalQty = 0;
        this.state.cart.forEach(item => totalQty += item.quantity);
        if (this.el.totalPieces) this.el.totalPieces.textContent = Utils.round(totalQty, 2);
    },

    renderCart() {
        const container = this.el.cartItemsContainer; 
        if (!container) return;
        
        container.innerHTML = `<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span></div>`;
        
        if (!this.state.cart.length) { 
            container.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">سلة المبيعات فارغة</div>'); 
            this.updateTotalsAndUI(); 
            return; 
        }

        this.state.cart.forEach((item, idx) => {
            const lineTotal = Utils.round(item.price * item.quantity, 2);
            const row = `
                <div class="cart-item-row">
                    <div>
                        <span class="cart-item-name">${Utils.escapeHTML(item.productName)}</span><br>
                        <span class="cart-item-unit">${Utils.escapeHTML(item.unitName)}</span>
                    </div>
                    <div><input type="number" value="${item.quantity}" min="0.01" step="0.01" class="cart-qty-input" data-idx="${idx}"></div>
                    <div><input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}"></div>
                    <div>${Utils.formatMoney(lineTotal)}</div>
                    <div><i class="fas fa-trash-alt btn-delete-item" data-idx="${idx}"></i></div>
                </div>`;
            container.insertAdjacentHTML('beforeend', row);
        });

        // المستمعات لتغيير الكمية والسعر مباشرة
        container.querySelectorAll('.cart-qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const val = +e.target.value;
                if (val > 0) this.state.cart[idx].quantity = val;
                else this.state.cart.splice(idx, 1);
                this.renderCart();
            });
        });

        container.querySelectorAll('.cart-price-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const val = +e.target.value;
                if (val >= 0) this.state.cart[idx].price = val;
                this.renderCart();
            });
        });

        container.querySelectorAll('.btn-delete-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.state.cart.splice(+e.target.dataset.idx, 1);
                this.renderCart();
            });
        });

        this.updateTotalsAndUI();
    },

    openUnitModal(productId) {
        const product = this.cache.productMap.get(String(productId));
        if (!product || !product.units?.length) return;

        this.state.selectedProduct = product;
        this.el.modalProductName.textContent = Utils.escapeHTML(product.name);
        
        this.el.unitButtons.innerHTML = product.units.map((u, i) => 
            `<button class="unit-btn ${i === 0 ? 'active' : ''}" data-index="${i}">${Utils.escapeHTML(u.name)}</button>`
        ).join('');

        this.el.unitButtons.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.el.unitButtons.querySelectorAll('.unit-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectUnit(+btn.dataset.index);
            });
        });

        this.selectUnit(0);
        this.showModal('unitQuantityModal');
    },

    selectUnit(index) {
        const unit = this.state.selectedProduct.units[index];
        this.state.selectedUnit = unit;
        
        // جلب المخزون الأساسي وتحويله للوحدة المختارة
        const baseStock = this.state.selectedProduct.units[0].stock || 0;
        const factor = unit.factor || 1;
        const availableInUnit = Utils.round(baseStock * factor, 2);

        this.el.selectedPrice.value = unit.price || 0;
        this.el.selectedQuantity.value = availableInUnit > 0 ? 1 : 0;
        this.el.stockInfo.textContent = `المتاح: ${availableInUnit} ${unit.name}`;
    },

    addToCartFromModal() {
        const qty = +this.el.selectedQuantity.value || 0;
        const price = +this.el.selectedPrice.value || 0;
        const unit = this.state.selectedUnit;

        if (qty <= 0) return;

        // التحقق من السعر الأدنى والأقصى (إجباري حسب تفضيلاتك)
        if (unit.minPrice && price < unit.minPrice) {
            alert(`⚠️ تنبيه: السعر أقل من الحد الأدنى المسموح به (${unit.minPrice})`);
            return;
        }
        if (unit.maxPrice && price > unit.maxPrice) {
            alert(`⚠️ تنبيه: السعر يتجاوز الحد الأقصى المسموح به (${unit.maxPrice})`);
            return;
        }

        const item = {
            productId: this.state.selectedProduct.id,
            productName: this.state.selectedProduct.name,
            unitName: unit.name,
            quantity: qty,
            price: price,
            factor: unit.factor || 1
        };

        const existing = this.state.cart.find(i => i.productId === item.productId && i.unitName === item.unitName);
        if (existing) existing.quantity += qty;
        else this.state.cart.push(item);

        this.renderCart();
        this.closeModal('unitQuantityModal');
    },

    showModal(id) { this.el[id]?.classList.add('open'); },
    closeModal(id) { this.el[id]?.classList.remove('open'); },

    openPaymentModal() {
        if (!this.state.cart.length) return;
        const totals = this.calculateTotals();
        
        this.el.paySubtotal.textContent = Utils.formatMoney(totals.subtotal);
        this.el.payDiscount.textContent = Utils.formatMoney(totals.discount);
        this.el.payNet.textContent = Utils.formatMoney(totals.net);

        const customer = this.getSelectedCustomer();
        const bal = customer?.balance || 0;
        this.el.currentBalance.textContent = Utils.formatMoney(Math.abs(bal));
        this.el.currentBalance.className = bal >= 0 ? 'text-success' : 'text-danger';

        this.el.cashAmount.value = totals.net; // افتراضي كاش كامل
        this.el.transferAmount.value = '';
        this.el.paymentMethod.value = 'cash';
        
        this.togglePaymentFields();
        this.updatePaymentPreview();
        this.showModal('paymentModal');
    },

    togglePaymentFields() {
        const method = this.el.paymentMethod.value;
        this.el.cashField.style.display = (method === 'cash' || method === 'mixed') ? 'block' : 'none';
        this.el.transferField.style.display = (method === 'transfer' || method === 'mixed') ? 'block' : 'none';
        this.updatePaymentPreview();
    },

    updatePaymentPreview() {
        const net = this.state.netTotal;
        const cash = +this.el.cashAmount.value || 0;
        const transfer = +this.el.transferAmount.value || 0;
        const customer = this.getSelectedCustomer();
        
        // استخدام الرصيد المتاح للعميل تلقائياً إذا كان دائن
        let usedBalance = 0;
        if (customer && customer.balance > 0) {
            usedBalance = Math.min(customer.balance, Math.max(0, net - cash - transfer));
        }
        this.state.usedCustomerBalance = usedBalance;

        const totalPaid = Utils.round(cash + transfer + usedBalance, 2);
        const diff = Utils.round(totalPaid - net, 2);
        const nextBalance = Utils.round((customer?.balance || 0) - usedBalance + diff, 2);

        this.el.remainingDisplay.textContent = diff >= 0 ? `فائض: ${Utils.formatMoney(diff)}` : `متبقي: ${Utils.formatMoney(Math.abs(diff))}`;
        this.el.balanceAfter.textContent = Utils.formatMoney(Math.abs(nextBalance));
        this.el.balanceAfter.className = nextBalance >= 0 ? 'text-success' : 'text-danger';
    },

    async completePayment() {
        if (this.state.isProcessing) return;
        this.state.isProcessing = true;
        this.el.confirmAndPrintBtn.disabled = true;

        try {
            const totals = this.calculateTotals();
            const cash = +this.el.cashAmount.value || 0;
            const transfer = +this.el.transferAmount.value || 0;
            const usedBal = this.state.usedCustomerBalance;
            const totalPaid = Utils.round(cash + transfer + usedBal, 2);
            const diff = Utils.round(totalPaid - totals.net, 2);
            
            const invoiceNumber = this.state.isDBReady ? await DB.generateInvoiceNumber() : `INV-${Date.now().toString().slice(-6)}`;

            const invoice = {
                id: Utils.generateUUID(),
                tenant_id: this.state.tenantId, // دعم SaaS
                invoice_number: invoiceNumber,
                type: 'sale',
                date: Utils.getToday(),
                customer_id: this.state.selectedCustomerId,
                customer_name: this.getSelectedCustomer()?.name || 'نقدي',
                items: JSON.stringify(this.state.cart),
                subtotal: totals.subtotal,
                discount: totals.discount,
                total: totals.net,
                paid: totalPaid,
                remaining: diff < 0 ? Math.abs(diff) : 0,
                status: diff >= 0 ? 'paid' : 'partial',
                notes: this.el.paymentNotes.value,
                used_balance: usedBal
            };

            if (this.state.isDBReady) {
                // 1. حفظ الفاتورة
                await DB.saveInvoice(invoice);

                // 2. تحديث المخزون (خصم حسب الـ Factor)
                for (const item of this.state.cart) {
                    const prod = this.cache.productMap.get(String(item.productId));
                    if (prod) {
                        const baseQty = item.quantity / item.factor;
                        prod.units[0].stock = Utils.round(prod.units[0].stock - baseQty, 3);
                        await DB.saveProduct(prod);
                    }
                }

                // 3. تحديث مديونية العميل
                const customer = this.getSelectedCustomer();
                if (customer) {
                    customer.balance = Utils.round(customer.balance - usedBal + diff, 2);
                    await DB.saveParty(customer);
                }

                // 4. تسجيل حركة الصندوق/البنك
                if (cash > 0) await DB.saveTransaction({ 
                    tenant_id: this.state.tenantId,
                    type: 'income', amount: cash, method: 'cash', description: `مبيعات: ${invoiceNumber}` 
                });
                if (transfer > 0) await DB.saveTransaction({ 
                    tenant_id: this.state.tenantId,
                    type: 'income', amount: transfer, method: 'bank', description: `مبيعات: ${invoiceNumber}` 
                });

            } else {
                // حفظ محلي في حالة Offline
                if (Utils.hasLocalDB()) await localDB.put('invoices', invoice);
            }

            this.showToast('✅ تم إتمام العملية بنجاح');
            this.showReceiptModal(invoice, this.getSelectedCustomer(), this.state.cart, totals);
            this.resetCart();
            this.closeModal('paymentModal');
            await this.loadInitialData();

        } catch (error) {
            console.error(error);
            alert('❌ فشل حفظ العملية، يرجى التحقق من الاتصال');
        } finally {
            this.state.isProcessing = false;
            this.el.confirmAndPrintBtn.disabled = false;
        }
    },

    resetCart() {
        this.state.cart = [];
        this.state.selectedCustomerId = null;
        this.state.discountValue = 0;
        this.el.customerSearchInput.value = '';
        this.el.discountValue.value = 0;
        this.renderCart();
    },

    showReceiptModal(invoice, customer, items, totals) {
        // منطق طباعة احترافي RTL مع أرقام إنجليزية
        const html = `
            <div style="text-align:center; font-family: 'Segoe UI', sans-serif;">
                <h3>${invoice.customer_name}</h3>
                <p>فاتورة مبيعات: ${invoice.invoice_number}</p>
                <p>التاريخ: ${Utils.formatDate(invoice.date)}</p>
                <hr>
                <table style="width:100%; font-size:14px;">
                    ${items.map(i => `<tr><td>${i.productName}</td><td>${i.quantity}</td><td>${Utils.formatMoney(i.price)}</td></tr>`).join('')}
                </table>
                <hr>
                <p>الإجمالي: ${Utils.formatMoney(totals.net)}</p>
                <p>المدفوع: ${Utils.formatMoney(invoice.paid)}</p>
                <p>الرصيد الحالي: ${Utils.formatMoney(customer?.balance || 0)}</p>
            </div>
        `;
        this.el.receiptPrintArea.innerHTML = html;
        this.showModal('receiptModal');
    },

    printReceiptFromModal() {
        const printContent = this.el.receiptPrintArea.innerHTML;
        const windowPrint = window.open('', '', 'width=600,height=600');
        windowPrint.document.write(`<div dir="rtl">${printContent}</div>`);
        windowPrint.document.close();
        windowPrint.focus();
        windowPrint.print();
        windowPrint.close();
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        setTimeout(() => t.classList.remove('show'), 3000);
    },

    saveCartToStorage() {
        if (this.state.cart.length) {
            localStorage.setItem('pos_current_cart', JSON.stringify({
                cart: this.state.cart,
                customerId: this.state.selectedCustomerId,
                discount: this.state.discountValue
            }));
        } else {
            localStorage.removeItem('pos_current_cart');
        }
    },

    restoreCartFromStorage() {
        const saved = localStorage.getItem('pos_current_cart');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                this.state.cart = data.cart || [];
                this.state.selectedCustomerId = data.customerId;
                this.state.discountValue = data.discount || 0;
                this.renderCart();
            } catch(e) {}
        }
    }
};

// تشغيل النظام
window.POS = POS;
window.addEventListener('DOMContentLoaded', () => POS.init());
