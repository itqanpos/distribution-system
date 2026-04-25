/* =============================================
   نقطة البيع - حسابي (نظام التوزيع)
   المنطق البرمجي الكامل
   ============================================= */

'use strict';

// ==================== كائن Utils احتياطي ====================
if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        getToday: () => new Date().toISOString().split('T')[0]
    };
}

// ==================== كائن نقطة البيع الرئيسي ====================
const POS = {
    // المتغيرات الأساسية
    products: [],
    customers: [],
    cart: [],
    selectedProduct: null,
    selectedUnit: null,
    selectedCustomer: null,
    settings: {},

    // اختصارات عناصر DOM
    elements: {},

    // ========== التهيئة العامة ==========
    init() {
        this.cacheElements();
        this.bindEvents();
        this.initAuth();
        this.loadInitialData();
    },

    // تخزين مراجع العناصر المستخدمة بكثرة
    cacheElements() {
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
        ids.forEach(id => {
            this.elements[id] = document.getElementById(id);
        });
    },

    // ربط الأحداث
    bindEvents() {
        // القائمة والمستخدم
        this.elements.userProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.userDropdown.classList.toggle('show');
        });
        document.addEventListener('click', () => {
            this.elements.userDropdown.classList.remove('show');
        });
        this.elements.menuToggle.addEventListener('click', () => {
            this.elements.sidebar.classList.toggle('mobile-open');
        });
        this.elements.logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        // البحث
        this.elements.productSearchInput.addEventListener('input', () => this.filterProducts());
        this.elements.customerSearchInput.addEventListener('input', () => this.onCustomerSearch());

        // أزرار الإجراءات
        this.elements.payBtn.addEventListener('click', () => this.openPaymentModal());
        this.elements.holdBtn.addEventListener('click', () => this.holdInvoice());
        this.elements.heldInvoicesBtn.addEventListener('click', () => this.loadHeldInvoices());

        // أحداث المودالات
        this.elements.addToCartBtn.addEventListener('click', () => this.addToCartFromModal());
        this.elements.confirmAndPrintBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await this.completePayment();
        });
        this.elements.closeUnitModalBtn.addEventListener('click', () => this.closeModal('unitQuantityModal'));
        this.elements.closePaymentModalBtn.addEventListener('click', () => this.closeModal('paymentModal'));
        this.elements.closeHeldModalBtn.addEventListener('click', () => this.closeModal('heldInvoicesModal'));

        // الدفع
        this.elements.paymentMethod.addEventListener('change', () => this.togglePaymentFields());
        this.elements.cashAmount.addEventListener('input', () => this.updatePaymentPreview());
        this.elements.transferAmount.addEventListener('input', () => this.updatePaymentPreview());
    },

    // ========== المصادقة ==========
    initAuth() {
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
    },

    // ========== تحميل البيانات ==========
    async loadInitialData() {
        await this.loadData();
        await this.restoreCartFromStorage();
    },

    async loadData() {
        try {
            if (window.DB) {
                this.products = await DB.getProducts();
                this.customers = await DB.getParties('customer');
                this.settings = await DB.getSettings().catch(() => ({}));
            } else {
                console.warn('DB غير معرف، استخدم بيانات وهمية للاختبار');
                this.products = [{ id: '1', name: 'منتج تجريبي', units: [{ name: 'قطعة', price: 10, stock: 50, factor: 1 }] }];
                this.customers = [];
            }
            this.populateCustomerList();
            this.applyFilters(); // لإظهار أي منتجات إن وجدت
        } catch (e) {
            console.error(e);
            this.showToast('فشل تحميل البيانات');
        }
    },

    populateCustomerList() {
        const list = this.elements.customerList;
        list.innerHTML = '<option value="نقدي (بدون عميل)" data-id="cash">نقدي (بدون عميل)</option>' +
            this.customers.map(c => `<option value="${c.name}" data-id="${c.id}">${c.name} (${c.phone || ''})</option>`).join('');
    },

    // ========== عرض المنتجات ==========
    filterProducts() {
        const term = this.elements.productSearchInput.value.trim().toLowerCase();
        const container = this.elements.productListContainer;
        if (!term) {
            container.innerHTML = '<div class="empty-message">🔍 ابدأ بكتابة اسم المنتج للبحث</div>';
            return;
        }
        const filtered = this.products.filter(p => p.name.toLowerCase().includes(term));
        if (!filtered.length) {
            container.innerHTML = '<div class="empty-message">❌ لا توجد منتجات</div>';
            return;
        }
        container.innerHTML = filtered.map(p => {
            const u = p.units[0];
            return `<div class="product-item" data-id="${p.id}">
                <div class="product-info"><h4>${p.name}</h4><p>المخزون: ${u.stock} ${u.name}</p></div>
                <div class="product-price">${Utils.formatMoney(u.price)}</div>
            </div>`;
        }).join('');

        // ربط الأحداث (تفويض)
        container.querySelectorAll('.product-item').forEach(item => {
            item.addEventListener('click', () => this.openUnitModal(item.dataset.id));
        });
    },

    // ========== العميل ==========
    onCustomerSearch() {
        const val = this.elements.customerSearchInput.value;
        if (val === 'نقدي (بدون عميل)') {
            this.selectedCustomer = null;
            this.elements.customerBalanceDisplay.innerHTML = '';
            return;
        }
        const option = Array.from(this.elements.customerList.querySelectorAll('option'))
            .find(o => o.value === val);
        if (option) {
            this.selectedCustomer = this.customers.find(c => c.id === option.dataset.id);
            if (this.selectedCustomer) {
                const balance = this.selectedCustomer.balance || 0;
                const text = balance >= 0 ? `رصيد للعميل: ${Utils.formatMoney(balance)}` : `رصيد على العميل: ${Utils.formatMoney(-balance)}`;
                this.elements.customerBalanceDisplay.innerHTML = text;
            }
        } else {
            this.selectedCustomer = null;
            this.elements.customerBalanceDisplay.innerHTML = '';
        }
    },

    // ========== إدارة السلة ==========
    calculateTotals() {
        const subtotal = this.cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const discountVal = parseFloat(this.elements.discountValue.value) || 0;
        const discountType = this.elements.discountType.value;
        let discount = 0;
        if (discountType === 'amount') discount = discountVal;
        else discount = subtotal * discountVal / 100;
        const net = subtotal - discount;

        this.elements.itemTypesCount.textContent = this.cart.length;
        const pieces = this.cart.reduce((s, item) => s + (item.quantity * (item.factor || 1)), 0);
        this.elements.totalPieces.textContent = pieces.toFixed(2);
        this.elements.subtotal.textContent = Utils.formatMoney(subtotal);
        this.elements.netTotal.textContent = Utils.formatMoney(net);

        return { subtotal, discount, net };
    },

    renderCart() {
        const container = this.elements.cartItemsContainer;
        if (!this.cart.length) {
            container.innerHTML = '<div style="padding:20px; text-align:center;">السلة فارغة</div>';
            this.calculateTotals();
            return;
        }
        container.innerHTML = this.cart.map((item, idx) => `
            <div class="cart-item-row">
                <div><span class="cart-item-name">${item.productName}</span><br><span class="cart-item-unit">${item.unitName}</span></div>
                <div><input type="number" value="${item.quantity}" min="0.001" onchange="POS.updateQty(${idx}, this.value)"></div>
                <div><input type="number" value="${item.price}" step="0.01" onchange="POS.updatePrice(${idx}, this.value)"></div>
                <div>${Utils.formatMoney(item.price * item.quantity)}</div>
                <div><i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" onclick="POS.removeItem(${idx})"></i></div>
            </div>`).join('');
        this.calculateTotals();
    },

    updateQty(idx, val) {
        const q = parseFloat(val);
        if (q <= 0) this.cart.splice(idx, 1);
        else this.cart[idx].quantity = q;
        this.renderCart();
    },

    updatePrice(idx, val) {
        this.cart[idx].price = parseFloat(val) || 0;
        this.renderCart();
    },

    removeItem(idx) {
        this.cart.splice(idx, 1);
        this.renderCart();
    },

    // ========== مودال اختيار الوحدة ==========
    openUnitModal(productId) {
        this.selectedProduct = this.products.find(p => p.id === productId);
        if (!this.selectedProduct) return;
        this.elements.modalProductName.textContent = this.selectedProduct.name;
        const container = this.elements.unitButtons;
        container.innerHTML = this.selectedProduct.units.map((u, idx) =>
            `<button class="unit-btn ${idx === 0 ? 'active' : ''}" data-index="${idx}">${u.name}</button>`
        ).join('');

        // ربط الأحداث
        container.querySelectorAll('.unit-btn').forEach(btn => {
            btn.addEventListener('click', () => this.selectUnit(parseInt(btn.dataset.index)));
        });

        this.selectedUnit = this.selectedProduct.units[0];
        this.elements.selectedPrice.value = this.selectedUnit.price;
        this.elements.stockInfo.textContent = `المخزون المتاح: ${this.selectedUnit.stock} ${this.selectedUnit.name}`;
        this.elements.selectedQuantity.max = this.selectedUnit.stock;
        this.elements.selectedQuantity.value = 1;
        this.showModal('unitQuantityModal');
    },

    selectUnit(index) {
        this.selectedUnit = this.selectedProduct.units[index];
        // تحديث الأزرار النشطة
        this.elements.unitButtons.querySelectorAll('.unit-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });
        this.elements.selectedPrice.value = this.selectedUnit.price;
        this.elements.stockInfo.textContent = `المخزون المتاح: ${this.selectedUnit.stock} ${this.selectedUnit.name}`;
        this.elements.selectedQuantity.max = this.selectedUnit.stock;
    },

    addToCartFromModal() {
        const qty = parseFloat(this.elements.selectedQuantity.value);
        const price = parseFloat(this.elements.selectedPrice.value);
        if (qty <= 0 || qty > this.selectedUnit.stock) {
            alert('كمية غير صالحة');
            return;
        }
        const existing = this.cart.find(i => i.productId === this.selectedProduct.id && i.unitName === this.selectedUnit.name);
        if (existing) {
            existing.quantity += qty;
        } else {
            this.cart.push({
                productId: this.selectedProduct.id,
                productName: this.selectedProduct.name,
                unitName: this.selectedUnit.name,
                quantity: qty,
                price: price,
                factor: this.selectedUnit.factor || 1
            });
        }
        this.renderCart();
        this.closeModal('unitQuantityModal');
        this.elements.productSearchInput.value = '';
        this.filterProducts();
    },

    // ========== الدفع ==========
    openPaymentModal() {
        if (!this.cart.length) {
            alert('السلة فارغة');
            return;
        }
        const totals = this.calculateTotals();
        this.elements.paySubtotal.textContent = Utils.formatMoney(totals.subtotal);
        this.elements.payDiscount.textContent = Utils.formatMoney(totals.discount);
        this.elements.payNet.textContent = Utils.formatMoney(totals.net);
        const balance = this.selectedCustomer?.balance || 0;
        this.elements.currentBalance.textContent = Utils.formatMoney(Math.abs(balance));
        this.elements.cashAmount.value = '';
        this.elements.transferAmount.value = '';
        this.elements.remainingDisplay.textContent = Utils.formatMoney(0);
        this.elements.paymentMethod.value = 'cash';
        this.togglePaymentFields();
        this.updatePaymentPreview();
        this.showModal('paymentModal');
    },

    togglePaymentFields() {
        const method = this.elements.paymentMethod.value;
        this.elements.cashField.style.display = (method === 'cash' || method === 'mixed') ? 'block' : 'none';
        this.elements.transferField.style.display = (method === 'transfer' || method === 'mixed') ? 'block' : 'none';
        this.updatePaymentPreview();
    },

    updatePaymentPreview() {
        const net = parseFloat(this.elements.payNet.textContent.replace(/[^0-9.-]+/g, ''));
        const method = this.elements.paymentMethod.value;
        let paid = 0;
        if (method === 'cash') paid = parseFloat(this.elements.cashAmount.value) || 0;
        else if (method === 'transfer') paid = parseFloat(this.elements.transferAmount.value) || 0;
        else if (method === 'mixed') paid = (parseFloat(this.elements.cashAmount.value) || 0) + (parseFloat(this.elements.transferAmount.value) || 0);
        else if (method === 'credit') paid = 0;
        const diff = paid - net;
        const currentBal = this.selectedCustomer?.balance || 0;
        const newBal = currentBal + diff;
        this.elements.remainingDisplay.textContent = diff >= 0 ? `فائض ${Utils.formatMoney(diff)}` : `متبقي ${Utils.formatMoney(-diff)}`;
        const sign = newBal >= 0 ? '' : '-';
        this.elements.balanceAfter.textContent = sign + Utils.formatMoney(Math.abs(newBal));
    },

    async completePayment() {
        const totals = this.calculateTotals();
        const method = this.elements.paymentMethod.value;
        let cashPaid = 0, transferPaid = 0;
        if (method === 'cash') cashPaid = parseFloat(this.elements.cashAmount.value) || 0;
        else if (method === 'transfer') transferPaid = parseFloat(this.elements.transferAmount.value) || 0;
        else if (method === 'mixed') {
            cashPaid = parseFloat(this.elements.cashAmount.value) || 0;
            transferPaid = parseFloat(this.elements.transferAmount.value) || 0;
        }
        const totalPaid = cashPaid + transferPaid;
        const diff = totalPaid - totals.net;
        const notes = this.elements.paymentNotes.value;

        // تحديث العميل
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
                        const quantityInBase = item.quantity * (unit.factor || 1);
                        prod.units[0].stock -= quantityInBase;
                        await DB.saveProduct(prod);
                    }
                }
            }
            // المعاملات المالية
            if (cashPaid > 0) await DB.saveTransaction({ id: crypto.randomUUID(), date: Utils.getToday(), type: 'income', amount: cashPaid, description: `فاتورة ${invoice.id}`, payment_method: 'cash' });
            if (transferPaid > 0) await DB.saveTransaction({ id: crypto.randomUUID(), date: Utils.getToday(), type: 'income', amount: transferPaid, description: `فاتورة ${invoice.id}`, payment_method: 'bank' });
        }

        // طباعة
        if (window.printSaleReceipt) {
            printSaleReceipt(invoice, this.selectedCustomer || { name: 'نقدي', balance: 0 }, this.cart, totals);
        } else {
            alert(`تم البيع. الفاتورة ${invoice.id}`);
        }

        // إعادة تعيين
        this.cart = [];
        this.renderCart();
        this.elements.discountValue.value = 0;
        this.selectedCustomer = null;
        this.elements.customerSearchInput.value = '';
        this.elements.customerBalanceDisplay.innerHTML = '';
        this.closeModal('paymentModal');
        await this.loadData();
        this.filterProducts();
    },

    // ========== تعليق ==========
    async holdInvoice() {
        if (!this.cart.length) { alert('السلة فارغة'); return; }
        const totals = this.calculateTotals();
        const invoice = {
            id: crypto.randomUUID(), type: 'sale', date: Utils.getToday(),
            customer_id: this.selectedCustomer?.id || null,
            customer_name: this.selectedCustomer?.name || 'نقدي',
            items: this.cart, subtotal: totals.subtotal, discount: totals.discount, total: totals.net,
            paid: 0, remaining: totals.net, status: 'held', notes: 'فاتورة معلقة'
        };
        if (window.DB) await DB.saveInvoice(invoice);
        alert(`تم تعليق الفاتورة ${invoice.id}`);
        this.cart = [];
        this.renderCart();
        this.selectedCustomer = null;
        this.elements.customerSearchInput.value = '';
        this.elements.customerBalanceDisplay.innerHTML = '';
        await this.loadData();
    },

    // ========== فواتير معلقة ==========
    async loadHeldInvoices() {
        if (!window.DB) return;
        const invoices = (await DB.getInvoices()).filter(i => i.type === 'sale' && i.status === 'held');
        const container = this.elements.heldInvoicesList;
        if (!invoices.length) {
            container.innerHTML = '<p style="text-align:center;padding:20px;">لا توجد فواتير معلقة</p>';
        } else {
            container.innerHTML = invoices.map(inv => `
                <div class="held-invoice-item" data-id="${inv.id}">
                    <div><strong>${inv.id}</strong><br>${inv.customer_name} - ${Utils.formatMoney(inv.total)}</div>
                    <div><i class="fas fa-play"></i></div>
                </div>
            `).join('');
            // ربط الأحداث
            container.querySelectorAll('.held-invoice-item').forEach(item => {
                item.addEventListener('click', () => this.resumeInvoice(item.dataset.id));
            });
        }
        this.showModal('heldInvoicesModal');
    },

    async resumeInvoice(id) {
        const inv = (await DB.getInvoices()).find(i => i.id === id);
        if (!inv) return;
        this.cart = inv.items;
        this.selectedCustomer = this.customers.find(c => c.id === inv.customer_id) || null;
        if (this.selectedCustomer) {
            this.elements.customerSearchInput.value = this.selectedCustomer.name;
        } else {
            this.elements.customerSearchInput.value = 'نقدي (بدون عميل)';
        }
        this.onCustomerSearch();
        this.renderCart();
        await supabase.from('invoices').delete().eq('id', id);
        this.closeModal('heldInvoicesModal');
        this.showToast('تم تحميل الفاتورة المعلقة');
    },

    // ========== وظائف مساعدة ==========
    showModal(id) { this.elements[id].style.display = 'flex'; },
    closeModal(id) { this.elements[id].style.display = 'none'; },

    showToast(msg) {
        const toast = this.elements.toast;
        toast.textContent = msg;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    },

    // حفظ واستعادة السلة من localStorage
    saveCartToStorage() {
        if (this.cart.length > 0) {
            const heldCart = {
                cart: this.cart,
                customer: this.selectedCustomer,
                discountType: this.elements.discountType.value,
                discountValue: this.elements.discountValue.value
            };
            localStorage.setItem('pos_held_cart', JSON.stringify(heldCart));
        } else {
            localStorage.removeItem('pos_held_cart');
        }
    },

    async restoreCartFromStorage() {
        const saved = localStorage.getItem('pos_held_cart');
        if (!saved) return;
        try {
            const held = JSON.parse(saved);
            this.cart = held.cart;
            this.selectedCustomer = held.customer;
            this.elements.discountType.value = held.discountType;
            this.elements.discountValue.value = held.discountValue;
            if (this.selectedCustomer) {
                this.elements.customerSearchInput.value = this.selectedCustomer.name;
            } else {
                this.elements.customerSearchInput.value = 'نقدي (بدون عميل)';
            }
            this.onCustomerSearch();
            this.renderCart();
            this.showToast('تم استعادة السلة المحفوظة');
        } catch (e) {}
        localStorage.removeItem('pos_held_cart');
    }
};

// ==================== دوال عامة (للتوافق مع onclick في HTML) ====================
window.POS = POS;
// يمكن إضافة دوال فردية لتجنب مشاكل النطاق
window.updateQty = (idx, val) => POS.updateQty(idx, val);
window.updatePrice = (idx, val) => POS.updatePrice(idx, val);
window.removeItem = (idx) => POS.removeItem(idx);
window.calculateTotals = () => POS.calculateTotals();

// ==================== بدء التطبيق ====================
document.addEventListener('DOMContentLoaded', () => {
    POS.init();

    // حفظ السلة عند الخروج
    window.addEventListener('beforeunload', () => {
        POS.saveCartToStorage();
    });
});
