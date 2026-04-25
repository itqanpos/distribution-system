/* =============================================
   نقطة البيع - حسابي (إصدار مستقر)
   ============================================= */

'use strict';

// Utils احتياطي
if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        getToday: () => new Date().toISOString().split('T')[0]
    };
}

const POS = {
    products: [],
    customers: [],
    cart: [],
    selectedProduct: null,
    selectedUnit: null,
    selectedCustomer: null,

    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadInitialData();
    },

    cacheElements() {
        this.el = {};
        const ids = [
            'userProfileBtn', 'userDropdown', 'menuToggle', 'sidebar',
            'logoutBtn', 'productSearchInput', 'customerSearchInput',
            'customerList', 'customerBalanceDisplay', 'productListContainer',
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
        // القائمة والمستخدم
        this.el.userProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation(); this.el.userDropdown.classList.toggle('show');
        });
        document.addEventListener('click', () => { this.el.userDropdown?.classList.remove('show'); });
        this.el.menuToggle.addEventListener('click', () => { this.el.sidebar.classList.toggle('mobile-open'); });
        this.el.logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        // البحث
        this.el.productSearchInput.addEventListener('input', () => this.filterProducts());
        this.el.customerSearchInput.addEventListener('input', () => this.onCustomerSearch());

        // أزرار رئيسية
        this.el.payBtn.addEventListener('click', () => this.openPaymentModal());
        this.el.holdBtn.addEventListener('click', () => this.holdInvoice());
        this.el.heldInvoicesBtn.addEventListener('click', () => this.loadHeldInvoices());

        // مودال الوحدة
        this.el.addToCartBtn.addEventListener('click', () => this.addToCartFromModal());
        this.el.closeUnitModalBtn.addEventListener('click', () => this.closeModal('unitQuantityModal'));

        // مودال الدفع
        this.el.confirmAndPrintBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.completePayment();
        });
        this.el.closePaymentModalBtn.addEventListener('click', () => this.closeModal('paymentModal'));
        this.el.paymentMethod.addEventListener('change', () => this.togglePaymentFields());
        this.el.cashAmount.addEventListener('input', () => this.updatePaymentPreview());
        this.el.transferAmount.addEventListener('input', () => this.updatePaymentPreview());

        // مودال المعلقة
        this.el.closeHeldModalBtn.addEventListener('click', () => this.closeModal('heldInvoicesModal'));
    },

    async loadInitialData() {
        await this.loadData();
        this.restoreCartFromStorage();
    },

    async loadData() {
        try {
            if (window.DB) {
                this.products = await DB.getProducts();
                this.customers = await DB.getParties('customer');
            } else {
                console.warn('DB not available, using test data');
                this.products = [{ id: '1', name: 'منتج تجريبي', units: [{ name: 'قطعة', price: 10, stock: 50, factor: 1 }] }];
                this.customers = [];
            }
            this.populateCustomerList();
        } catch (e) {
            console.error(e);
            this.showToast('فشل تحميل البيانات');
        }
    },

    populateCustomerList() {
        const list = this.el.customerList;
        list.innerHTML = '<option value="نقدي (بدون عميل)" data-id="cash">نقدي (بدون عميل)</option>' +
            this.customers.map(c => `<option value="${c.name}" data-id="${c.id}">${c.name} (${c.phone || ''})</option>`).join('');
    },

    filterProducts() {
        const term = this.el.productSearchInput.value.trim().toLowerCase();
        const container = this.el.productListContainer;
        if (!term) { container.innerHTML = '<div class="empty-message">🔍 ابدأ بكتابة اسم المنتج للبحث</div>'; return; }
        const filtered = this.products.filter(p => p.name.toLowerCase().includes(term));
        if (!filtered.length) { container.innerHTML = '<div class="empty-message">❌ لا توجد منتجات</div>'; return; }
        container.innerHTML = filtered.map(p => {
            const u = p.units[0];
            return `<div class="product-item" data-id="${p.id}">
                <div class="product-info"><h4>${p.name}</h4><p>المخزون: ${u.stock} ${u.name}</p></div>
                <div class="product-price">${Utils.formatMoney(u.price)}</div>
            </div>`;
        }).join('');
        container.querySelectorAll('.product-item').forEach(item => {
            item.addEventListener('click', () => this.openUnitModal(item.dataset.id));
        });
    },

    onCustomerSearch() {
        const val = this.el.customerSearchInput.value;
        if (val === 'نقدي (بدون عميل)') {
            this.selectedCustomer = null;
            this.el.customerBalanceDisplay.innerHTML = '';
            return;
        }
        const option = Array.from(this.el.customerList.querySelectorAll('option')).find(o => o.value === val);
        if (option) {
            this.selectedCustomer = this.customers.find(c => c.id === option.dataset.id);
            if (this.selectedCustomer) {
                const bal = this.selectedCustomer.balance || 0;
                this.el.customerBalanceDisplay.innerHTML = bal >= 0 ? `رصيد للعميل: ${Utils.formatMoney(bal)}` : `رصيد على العميل: ${Utils.formatMoney(-bal)}`;
            }
        } else {
            this.selectedCustomer = null;
            this.el.customerBalanceDisplay.innerHTML = '';
        }
    },

    // ========== السلة ==========
    calculateTotals() {
        const subtotal = this.cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const discountVal = parseFloat(this.el.discountValue.value) || 0;
        const discountType = this.el.discountType.value;
        let discount = 0;
        if (discountType === 'amount') discount = discountVal;
        else discount = subtotal * discountVal / 100;
        const net = subtotal - discount;

        this.el.itemTypesCount.textContent = this.cart.length;
        const pieces = this.cart.reduce((s, item) => s + (item.quantity * (item.factor || 1)), 0);
        this.el.totalPieces.textContent = pieces.toFixed(2);
        this.el.subtotal.textContent = Utils.formatMoney(subtotal);
        this.el.netTotal.textContent = Utils.formatMoney(net);
        return { subtotal, discount, net };
    },

    renderCart() {
        const container = this.el.cartItemsContainer;
        if (!this.cart.length) { container.innerHTML = '<div style="padding:20px; text-align:center;">السلة فارغة</div>'; this.calculateTotals(); return; }
        container.innerHTML = this.cart.map((item, idx) => `
            <div class="cart-item-row">
                <div><span class="cart-item-name">${item.productName}</span><br><span class="cart-item-unit">${item.unitName}</span></div>
                <div><input type="number" value="${item.quantity}" min="0.001" onchange="window.POSCartUpdate(${idx}, this.value, 'qty')"></div>
                <div><input type="number" value="${item.price}" step="0.01" onchange="window.POSCartUpdate(${idx}, this.value, 'price')"></div>
                <div>${Utils.formatMoney(item.price * item.quantity)}</div>
                <div><i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" onclick="window.POSCartRemove(${idx})"></i></div>
            </div>`).join('');
        this.calculateTotals();
    },

    // ========== مودال الوحدة ==========
    openUnitModal(productId) {
        this.selectedProduct = this.products.find(p => p.id === productId);
        if (!this.selectedProduct) return;
        this.el.modalProductName.textContent = this.selectedProduct.name;
        const container = this.el.unitButtons;
        container.innerHTML = this.selectedProduct.units.map((u, idx) =>
            `<button class="unit-btn ${idx === 0 ? 'active' : ''}" data-index="${idx}">${u.name}</button>`
        ).join('');
        container.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectUnit(parseInt(btn.dataset.index)));
        });
        this.selectedUnit = this.selectedProduct.units[0];
        this.el.selectedPrice.value = this.selectedUnit.price;
        this.el.stockInfo.textContent = `المخزون: ${this.selectedUnit.stock} ${this.selectedUnit.name}`;
        this.el.selectedQuantity.max = this.selectedUnit.stock;
        this.el.selectedQuantity.value = 1;
        this.showModal('unitQuantityModal');
    },

    selectUnit(index) {
        this.selectedUnit = this.selectedProduct.units[index];
        this.el.unitButtons.querySelectorAll('.unit-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
        this.el.selectedPrice.value = this.selectedUnit.price;
        this.el.stockInfo.textContent = `المخزون: ${this.selectedUnit.stock} ${this.selectedUnit.name}`;
        this.el.selectedQuantity.max = this.selectedUnit.stock;
    },

    addToCartFromModal() {
        const qty = parseFloat(this.el.selectedQuantity.value);
        const price = parseFloat(this.el.selectedPrice.value);
        if (qty <= 0 || qty > this.selectedUnit.stock) { alert('كمية غير صالحة'); return; }
        const existing = this.cart.find(i => i.productId === this.selectedProduct.id && i.unitName === this.selectedUnit.name);
        if (existing) existing.quantity += qty;
        else this.cart.push({
            productId: this.selectedProduct.id,
            productName: this.selectedProduct.name,
            unitName: this.selectedUnit.name,
            quantity: qty,
            price: price,
            factor: this.selectedUnit.factor || 1
        });
        this.renderCart();
        this.closeModal('unitQuantityModal');
        this.el.productSearchInput.value = '';
        this.filterProducts();
    },

    // ========== الدفع ==========
    openPaymentModal() {
        if (!this.cart.length) { alert('السلة فارغة'); return; }
        const totals = this.calculateTotals();
        this.el.paySubtotal.textContent = Utils.formatMoney(totals.subtotal);
        this.el.payDiscount.textContent = Utils.formatMoney(totals.discount);
        this.el.payNet.textContent = Utils.formatMoney(totals.net);
        const bal = this.selectedCustomer?.balance || 0;
        this.el.currentBalance.textContent = Utils.formatMoney(Math.abs(bal));
        this.el.cashAmount.value = '';
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
        const net = parseFloat(this.el.payNet.textContent.replace(/[^0-9.-]+/g, ''));
        const method = this.el.paymentMethod.value;
        let paid = 0;
        if (method === 'cash') paid = parseFloat(this.el.cashAmount.value) || 0;
        else if (method === 'transfer') paid = parseFloat(this.el.transferAmount.value) || 0;
        else if (method === 'mixed') paid = (parseFloat(this.el.cashAmount.value) || 0) + (parseFloat(this.el.transferAmount.value) || 0);
        const diff = paid - net;
        const currentBal = this.selectedCustomer?.balance || 0;
        const newBal = currentBal + diff;
        this.el.remainingDisplay.textContent = diff >= 0 ? `فائض ${Utils.formatMoney(diff)}` : `متبقي ${Utils.formatMoney(-diff)}`;
        this.el.balanceAfterLabel.textContent = newBal >= 0 ? 'رصيد للعميل بعد الدفع:' : 'رصيد على العميل بعد الدفع:';
        this.el.balanceAfter.textContent = (newBal >= 0 ? '' : '-') + Utils.formatMoney(Math.abs(newBal));
    },

    async completePayment() {
        try {
            const totals = this.calculateTotals();
            const method = this.el.paymentMethod.value;
            let cashPaid = 0, transferPaid = 0;
            if (method === 'cash') cashPaid = parseFloat(this.el.cashAmount.value) || 0;
            else if (method === 'transfer') transferPaid = parseFloat(this.el.transferAmount.value) || 0;
            else if (method === 'mixed') {
                cashPaid = parseFloat(this.el.cashAmount.value) || 0;
                transferPaid = parseFloat(this.el.transferAmount.value) || 0;
            }
            const totalPaid = cashPaid + transferPaid;
            const diff = totalPaid - totals.net;
            const notes = this.el.paymentNotes.value;

            if (this.selectedCustomer) {
                this.selectedCustomer.balance = (this.selectedCustomer.balance || 0) + diff;
                if (window.DB) await DB.saveParty(this.selectedCustomer);
            }

            const invoice = {
                id: crypto.randomUUID(),
                type: 'sale',
                date: Utils.getToday(),
                customer_id: this.selectedCustomer?.id || null,
                customer_name: this.selectedCustomer?.name || 'نقدي',
                items: this.cart,
                subtotal: totals.subtotal,
                discount: totals.discount,
                total: totals.net,
                paid: totalPaid,
                remaining: diff >= 0 ? 0 : -diff,
                status: diff >= 0 ? 'paid' : 'partial',
                notes
            };

            if (window.DB) {
                await DB.saveInvoice(invoice);
                // تحديث المخزون
                for (const item of this.cart) {
                    const prod = this.products.find(p => p.id === item.productId);
                    if (prod) {
                        const unit = prod.units.find(u => u.name === item.unitName);
                        if (unit) {
                            prod.units[0].stock -= item.quantity * (unit.factor || 1);
                            await DB.saveProduct(prod);
                        }
                    }
                }
                if (cashPaid > 0) await DB.saveTransaction({ id: crypto.randomUUID(), date: Utils.getToday(), type: 'income', amount: cashPaid, description: `فاتورة ${invoice.id}`, payment_method: 'cash' });
                if (transferPaid > 0) await DB.saveTransaction({ id: crypto.randomUUID(), date: Utils.getToday(), type: 'income', amount: transferPaid, description: `فاتورة ${invoice.id}`, payment_method: 'bank' });
            }

            if (window.printSaleReceipt) {
                printSaleReceipt(invoice, this.selectedCustomer || { name: 'نقدي', balance: 0 }, this.cart, totals);
            } else {
                alert(`تم البيع. الفاتورة ${invoice.id}`);
            }

            // إعادة تعيين
            this.cart = [];
            this.renderCart();
            this.el.discountValue.value = 0;
            this.selectedCustomer = null;
            this.el.customerSearchInput.value = '';
            this.el.customerBalanceDisplay.innerHTML = '';
            this.closeModal('paymentModal');
            await this.loadData();
            this.filterProducts();
            this.showToast('تم البيع بنجاح');
        } catch (error) {
            console.error('خطأ في الدفع:', error);
            alert('حدث خطأ أثناء إتمام الدفع. راجع وحدة التحكم.');
        }
    },

    // ========== تعليق ==========
    async holdInvoice() {
        if (!this.cart.length) { alert('السلة فارغة'); return; }
        try {
            const totals = this.calculateTotals();
            const invoice = {
                id: crypto.randomUUID(),
                type: 'sale',
                date: Utils.getToday(),
                customer_id: this.selectedCustomer?.id || null,
                customer_name: this.selectedCustomer?.name || 'نقدي',
                items: this.cart,
                subtotal: totals.subtotal,
                discount: totals.discount,
                total: totals.net,
                paid: 0,
                remaining: totals.net,
                status: 'held',
                notes: 'فاتورة معلقة'
            };
            if (window.DB) await DB.saveInvoice(invoice);
            alert(`تم تعليق الفاتورة ${invoice.id}`);
            this.cart = [];
            this.renderCart();
            this.selectedCustomer = null;
            this.el.customerSearchInput.value = '';
            this.el.customerBalanceDisplay.innerHTML = '';
            await this.loadData();
        } catch (error) {
            console.error('خطأ في التعليق:', error);
            alert('فشل تعليق الفاتورة');
        }
    },

    // ========== فواتير معلقة ==========
    async loadHeldInvoices() {
        if (!window.DB) return;
        try {
            const invoices = (await DB.getInvoices()).filter(i => i.type === 'sale' && i.status === 'held');
            const container = this.el.heldInvoicesList;
            if (!invoices.length) { container.innerHTML = '<p style="text-align:center;padding:20px;">لا توجد فواتير معلقة</p>'; }
            else {
                container.innerHTML = invoices.map(inv => `
                    <div class="held-invoice-item" data-id="${inv.id}" style="padding:15px; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:10px; cursor:pointer; display:flex; justify-content:space-between;">
                        <div><strong>${inv.id.substring(0,8)}</strong><br>${inv.customer_name} - ${Utils.formatMoney(inv.total)}</div>
                        <div><i class="fas fa-play"></i></div>
                    </div>
                `).join('');
                container.querySelectorAll('.held-invoice-item').forEach(item => {
                    item.addEventListener('click', () => this.resumeInvoice(item.dataset.id));
                });
            }
            this.showModal('heldInvoicesModal');
        } catch (e) {
            console.error(e);
            alert('فشل تحميل الفواتير المعلقة');
        }
    },

    async resumeInvoice(id) {
        const inv = (await DB.getInvoices()).find(i => i.id === id);
        if (!inv) return;
        this.cart = inv.items;
        this.selectedCustomer = this.customers.find(c => c.id === inv.customer_id) || null;
        if (this.selectedCustomer) this.el.customerSearchInput.value = this.selectedCustomer.name;
        else this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
        this.onCustomerSearch();
        this.renderCart();
        if (window.supabase) await supabase.from('invoices').delete().eq('id', id);
        this.closeModal('heldInvoicesModal');
        this.showToast('تم تحميل الفاتورة المعلقة');
    },

    // ========== مساعدات ==========
    showModal(id) { this.el[id].style.display = 'flex'; },
    closeModal(id) { this.el[id].style.display = 'none'; },
    showToast(msg) {
        const toast = this.el.toast;
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },
    saveCartToStorage() {
        if (this.cart.length > 0) {
            localStorage.setItem('pos_held_cart', JSON.stringify({
                cart: this.cart,
                customer: this.selectedCustomer,
                discountType: this.el.discountType.value,
                discountValue: this.el.discountValue.value
            }));
        } else localStorage.removeItem('pos_held_cart');
    },
    restoreCartFromStorage() {
        const saved = localStorage.getItem('pos_held_cart');
        if (!saved) return;
        try {
            const held = JSON.parse(saved);
            this.cart = held.cart;
            this.selectedCustomer = held.customer;
            this.el.discountType.value = held.discountType;
            this.el.discountValue.value = held.discountValue;
            if (this.selectedCustomer) this.el.customerSearchInput.value = this.selectedCustomer.name;
            else this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
            this.onCustomerSearch();
            this.renderCart();
            this.showToast('تم استعادة السلة المحفوظة');
        } catch (e) {}
        localStorage.removeItem('pos_held_cart');
    }
};

// دوال عامة للتواصل من HTML
window.POS = POS;
window.POSCartUpdate = (idx, val, type) => {
    if (type === 'qty') {
        const q = parseFloat(val);
        if (q <= 0) POS.cart.splice(idx, 1);
        else POS.cart[idx].quantity = q;
    } else if (type === 'price') {
        POS.cart[idx].price = parseFloat(val) || 0;
    }
    POS.renderCart();
};
window.POSCartRemove = (idx) => {
    POS.cart.splice(idx, 1);
    POS.renderCart();
};

// بدء التطبيق بعد تحميل الصفحة بالكامل
window.addEventListener('DOMContentLoaded', () => POS.init());
window.addEventListener('beforeunload', () => POS.saveCartToStorage());
