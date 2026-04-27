/* =============================================
   نقطة البيع - حسابي (إصدار نهائي - سلة موسعة)
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

const POS = {
    products: [],
    customers: [],
    cart: [],
    selectedProduct: null,
    selectedUnit: null,
    selectedCustomer: null,
    isDBReady: false,

    init() {
        this.cacheElements();
        this.bindEvents();
        this.handleConnectionStatus();
        window.addEventListener('online', () => this.updateOnlineStatus());
        window.addEventListener('offline', () => this.updateOnlineStatus());
        
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
        this.el.userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => { this.el.userDropdown?.classList.remove('show'); });
        this.el.menuToggle.addEventListener('click', () => { this.el.sidebar.classList.toggle('mobile-open'); });
        this.el.logoutBtn.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.productSearchInput.addEventListener('input', () => this.filterProducts());
        this.el.customerSearchInput.addEventListener('input', () => this.onCustomerSearch());

        this.el.discountValue.addEventListener('input', () => this.calculateTotals());
        this.el.discountType.addEventListener('change', () => this.calculateTotals());

        this.el.payBtn.addEventListener('click', () => this.openPaymentModal());
        this.el.holdBtn.addEventListener('click', () => this.holdInvoice());
        this.el.heldInvoicesBtn.addEventListener('click', () => this.loadHeldInvoices());

        this.el.addToCartBtn.addEventListener('click', () => this.addToCartFromModal());
        this.el.closeUnitModalBtn.addEventListener('click', () => this.closeModal('unitQuantityModal'));

        this.el.confirmAndPrintBtn.addEventListener('click', async (e) => { e.preventDefault(); await this.completePayment(); });
        this.el.closePaymentModalBtn.addEventListener('click', () => this.closeModal('paymentModal'));
        this.el.paymentMethod.addEventListener('change', () => this.togglePaymentFields());
        this.el.cashAmount.addEventListener('input', () => this.updatePaymentPreview());
        this.el.transferAmount.addEventListener('input', () => this.updatePaymentPreview());

        this.el.closeHeldModalBtn.addEventListener('click', () => this.closeModal('heldInvoicesModal'));

        // تفويض النقر على المنتجات
        this.el.productListContainer.addEventListener('click', (e) => {
            const item = e.target.closest('.product-item');
            if (item && item.dataset.id) {
                this.openUnitModal(item.dataset.id);
            }
        });
    },

    handleConnectionStatus() { this.updateOnlineStatus(); },
    updateOnlineStatus() {
        const navbar = document.getElementById('mainNavbar');
        if (!navbar) return;
        if (navigator.onLine) {
            navbar.classList.remove('offline');
        } else {
            navbar.classList.add('offline');
        }
    },

    async loadInitialData() {
        this.isDBReady = !!(window.DB && window.supabase);
        if (!this.isDBReady) { console.warn('⚠️ وضع الاختبار'); this.showToast('وضع الاختبار - البيانات محلية'); }
        await this.loadData();
        this.restoreCartFromStorage();
    },

    async loadData() {
        try {
            if (this.isDBReady) {
                this.products = await DB.getProducts();
                this.customers = await DB.getParties('customer');
            } else {
                this.products = [
                    { id: '1', name: 'بيبسي', units: [{ name: 'كرتونة', price: 240, cost: 200, stock: 5, factor: 1 }, { name: 'علبة', price: 10, cost: 8.33, stock: 0, factor: 24 }] }
                ];
                this.customers = [{ id: '101', name: 'عميل تجريبي', balance: 500 }];
            }
            this.populateCustomerList();
        } catch (e) { console.error(e); this.showToast('فشل تحميل البيانات'); }
    },

    populateCustomerList() {
        const list = this.el.customerList;
        list.innerHTML = '<option value="نقدي (بدون عميل)" data-id="cash">نقدي (بدون عميل)</option>' +
            this.customers.map(c => `<option value="${c.name}" data-id="${c.id}">${c.name} (${c.phone || ''})</option>`).join('');
    },

    formatStockDisplay(product) {
        const baseUnit = product.units?.[0];
        if (!baseUnit) return '0';
        const stock = baseUnit.stock || 0;
        const subUnit = product.units?.[1];
        if (!subUnit || subUnit.factor === 1) return `${Math.floor(stock)} ${baseUnit.name}`;
        const factor = subUnit.factor;
        const wholeUnits = Math.floor(stock);
        const remainder = Math.round((stock - wholeUnits) * factor);
        if (remainder === 0) return `${wholeUnits} ${baseUnit.name}`;
        if (wholeUnits === 0) return `${remainder} ${subUnit.name}`;
        return `${wholeUnits} ${baseUnit.name} و ${remainder} ${subUnit.name}`;
    },

    filterProducts() {
        const term = this.el.productSearchInput.value.trim().toLowerCase();
        const container = this.el.productListContainer;
        if (!term) { container.innerHTML = '<div class="empty-message">🔍 ابدأ بكتابة اسم المنتج للبحث</div>'; return; }
        const filtered = this.products.filter(p => p.name.toLowerCase().includes(term));
        if (!filtered.length) { container.innerHTML = '<div class="empty-message">❌ لا توجد منتجات</div>'; return; }
        container.innerHTML = filtered.map(p => {
            return `<div class="product-item" data-id="${p.id}">
                <div class="product-info"><h4>${p.name}</h4><p>المخزون: ${this.formatStockDisplay(p)}</p></div>
                <div class="product-price">${Utils.formatMoney(p.units[0].price)}</div>
            </div>`;
        }).join('');
    },

    onCustomerSearch() {
        const val = this.el.customerSearchInput.value;
        if (val === 'نقدي (بدون عميل)') { this.selectedCustomer = null; this.el.customerBalanceDisplay.innerHTML = ''; return; }
        const option = Array.from(this.el.customerList.querySelectorAll('option')).find(o => o.value === val);
        if (option) {
            this.selectedCustomer = this.customers.find(c => c.id === option.dataset.id);
            if (this.selectedCustomer) {
                const bal = this.selectedCustomer.balance || 0;
                this.el.customerBalanceDisplay.innerHTML = bal >= 0 ? `رصيد للعميل: ${Utils.formatMoney(bal)}` : `رصيد على العميل: ${Utils.formatMoney(-bal)}`;
            }
        } else { this.selectedCustomer = null; this.el.customerBalanceDisplay.innerHTML = ''; }
    },

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
        this.el.totalPieces.textContent = pieces.toFixed(0);
        this.el.subtotal.textContent = Utils.formatMoney(subtotal);
        this.el.netTotal.textContent = Utils.formatMoney(net);
        return { subtotal, discount, net };
    },

    renderCart() {
        const container = this.el.cartItemsContainer;
        container.innerHTML = `
            <div class="cart-header-row">
                <span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span>
            </div>
        `;
        if (!this.cart.length) {
            container.innerHTML += '<div class="empty-cart-message">السلة فارغة</div>';
            this.calculateTotals();
            return;
        }
        this.cart.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'cart-item-row';
            row.innerHTML = `
                <div><span class="cart-item-name">${item.productName}</span><br><span class="cart-item-unit">${item.unitName}</span></div>
                <div><input type="number" value="${item.quantity}" min="0.001" onchange="window.POSCartUpdate(${idx}, this.value, 'qty')"></div>
                <div><input type="number" value="${item.price}" step="0.01" onchange="window.POSCartUpdate(${idx}, this.value, 'price')"></div>
                <div>${Utils.formatMoney(item.price * item.quantity)}</div>
                <div><i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" onclick="window.POSCartRemove(${idx})"></i></div>
            `;
            container.appendChild(row);
        });
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
        this.updateUnitModalInfo();
        this.showModal('unitQuantityModal');
    },

    selectUnit(index) {
        this.selectedUnit = this.selectedProduct.units[index];
        this.el.unitButtons.querySelectorAll('.unit-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
        this.updateUnitModalInfo();
    },

    updateUnitModalInfo() {
        if (!this.selectedProduct || !this.selectedUnit) return;
        const baseUnit = this.selectedProduct.units[0];
        const baseStock = baseUnit.stock || 0;
        const selectedUnit = this.selectedUnit;
        const factor = selectedUnit.factor || 1;
        let availableStock = 0;

        if (selectedUnit === baseUnit) {
            availableStock = Math.floor(baseStock);
        } else {
            const wholeBase = Math.floor(baseStock);
            const remainderPieces = Math.round((baseStock - wholeBase) * factor);
            availableStock = wholeBase * factor + remainderPieces;
        }

        this.el.selectedPrice.value = selectedUnit.price;
        this.el.selectedQuantity.max = availableStock > 0 ? availableStock : 0;
        this.el.selectedQuantity.value = availableStock > 0 ? 1 : 0;

        if (selectedUnit === baseUnit) {
            this.el.stockInfo.textContent = `المخزون المتاح: ${availableStock} ${baseUnit.name}`;
        } else {
            const wholeBase = Math.floor(baseStock);
            const remainderPieces = Math.round((baseStock - wholeBase) * factor);
            let detail = `(${wholeBase} ${baseUnit.name}`;
            if (remainderPieces > 0) detail += ` و ${remainderPieces} ${selectedUnit.name}`;
            detail += ')';
            this.el.stockInfo.textContent = `المخزون المتاح: ${availableStock} ${selectedUnit.name} ${detail}`;
        }
    },

    addToCartFromModal() {
        const qty = parseFloat(this.el.selectedQuantity.value);
        const maxAvailable = parseFloat(this.el.selectedQuantity.max) || 0;
        if (qty <= 0 || qty > maxAvailable) { alert(`الكمية غير متاحة. الحد الأقصى: ${maxAvailable} ${this.selectedUnit.name}`); return; }

        const price = parseFloat(this.el.selectedPrice.value);
        const existing = this.cart.find(i => i.productId === this.selectedProduct.id && i.unitName === this.selectedUnit.name);
        if (existing) existing.quantity += qty;
        else this.cart.push({
            productId: this.selectedProduct.id,
            productName: this.selectedProduct.name,
            unitName: this.selectedUnit.name,
            quantity: qty,
            price: price,
            factor: this.selectedUnit.factor || 1,
            isBaseUnit: this.selectedUnit === this.selectedProduct.units[0]
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
        this.el.cashAmount.value = ''; this.el.transferAmount.value = '';
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

    getBaseQuantityReduction(item) {
        const baseUnit = this.products.find(p => p.id === item.productId)?.units[0];
        if (!baseUnit) return 0;
        if (item.unitName === baseUnit.name) return item.quantity;
        const selectedUnit = this.products.find(p => p.id === item.productId)?.units.find(u => u.name === item.unitName);
        const factor = selectedUnit?.factor || 1;
        return item.quantity / factor;
    },

    generateLocalInvoiceNumber() {
        const year = new Date().getFullYear().toString().slice(-2);
        const key = `inv_counter_${year}`;
        let num = parseInt(localStorage.getItem(key) || '0', 10);
        num += 1;
        localStorage.setItem(key, num.toString());
        return year + '-' + String(num).padStart(4, '0');
    },

    async completePayment() {
        try {
            const totals = this.calculateTotals();
            const method = this.el.paymentMethod.value;
            let cashPaid = 0, transferPaid = 0;
            if (method === 'cash') cashPaid = parseFloat(this.el.cashAmount.value) || 0;
            else if (method === 'transfer') transferPaid = parseFloat(this.el.transferAmount.value) || 0;
            else if (method === 'mixed') { cashPaid = parseFloat(this.el.cashAmount.value) || 0; transferPaid = parseFloat(this.el.transferAmount.value) || 0; }
            const totalPaid = cashPaid + transferPaid;
            const diff = totalPaid - totals.net;
            const notes = this.el.paymentNotes.value;

            if (this.selectedCustomer) {
                this.selectedCustomer.balance = (this.selectedCustomer.balance || 0) + diff;
                if (this.isDBReady) await DB.saveParty(this.selectedCustomer);
                else if (window.localDB) await localDB.put('parties', this.selectedCustomer);
            }

            const invoiceNumber = this.isDBReady ? await DB.generateInvoiceNumber() : this.generateLocalInvoiceNumber();

            const invoice = {
                id: crypto.randomUUID(),
                invoice_number: invoiceNumber,
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
                notes: notes || null
            };

            if (this.isDBReady) {
                await DB.saveInvoice(invoice);
                for (const item of this.cart) {
                    const prod = this.products.find(p => p.id === item.productId);
                    if (prod) {
                        const reduction = this.getBaseQuantityReduction(item);
                        prod.units[0].stock = Math.max(0, prod.units[0].stock - reduction);
                        await DB.saveProduct(prod);
                    }
                }
                if (cashPaid > 0) await DB.saveTransaction({ id: crypto.randomUUID(), date: Utils.getToday(), type: 'income', amount: cashPaid, description: `فاتورة ${invoiceNumber}`, payment_method: 'cash' });
                if (transferPaid > 0) await DB.saveTransaction({ id: crypto.randomUUID(), date: Utils.getToday(), type: 'income', amount: transferPaid, description: `فاتورة ${invoiceNumber}`, payment_method: 'bank' });
            } else {
                if (window.localDB) {
                    await localDB.put('invoices', invoice);
                    for (const item of this.cart) {
                        const prod = this.products.find(p => p.id === item.productId);
                        if (prod) {
                            const reduction = this.getBaseQuantityReduction(item);
                            prod.units[0].stock = Math.max(0, prod.units[0].stock - reduction);
                            await localDB.put('products', prod);
                        }
                    }
                }
            }

            if (window.printSaleReceipt) printSaleReceipt(invoice, this.selectedCustomer || { name: 'نقدي', balance: 0 }, this.cart, totals);
            else alert(`تم البيع بنجاح. رقم الفاتورة: ${invoiceNumber}`);

            this.cart = []; this.renderCart(); this.el.discountValue.value = 0; this.selectedCustomer = null;
            this.el.customerSearchInput.value = ''; this.el.customerBalanceDisplay.innerHTML = '';
            this.closeModal('paymentModal');
            await this.loadData();
            this.showToast('تم البيع بنجاح');
        } catch (error) { console.error('خطأ في الدفع:', error); alert('حدث خطأ: ' + error.message); }
    },

    async holdInvoice() {
        if (!this.cart.length) { alert('السلة فارغة'); return; }
        try {
            const totals = this.calculateTotals();
            const invoiceNumber = this.isDBReady ? await DB.generateInvoiceNumber() : this.generateLocalInvoiceNumber();
            const invoice = {
                id: crypto.randomUUID(), invoice_number: invoiceNumber, type: 'sale', date: Utils.getToday(),
                customer_id: this.selectedCustomer?.id || null,
                customer_name: this.selectedCustomer?.name || 'نقدي',
                items: this.cart, subtotal: totals.subtotal, discount: totals.discount,
                total: totals.net, paid: 0, remaining: totals.net, status: 'held', notes: 'فاتورة معلقة'
            };
            if (this.isDBReady) await DB.saveInvoice(invoice);
            else if (window.localDB) await localDB.put('invoices', invoice);

            alert(`تم تعليق الفاتورة ${invoiceNumber}`);
            this.cart = []; this.renderCart(); this.selectedCustomer = null;
            this.el.customerSearchInput.value = ''; this.el.customerBalanceDisplay.innerHTML = '';
            await this.loadData(); this.showToast('تم تعليق الفاتورة');
        } catch (error) { console.error(error); alert('فشل تعليق الفاتورة: ' + error.message); }
    },

    async loadHeldInvoices() {
        let invoices = [];
        if (this.isDBReady) { try { invoices = (await DB.getInvoices()).filter(i => i.type === 'sale' && i.status === 'held'); } catch (e) {} }
        else if (window.localDB) { invoices = (await localDB.getAll('invoices')).filter(i => i.type === 'sale' && i.status === 'held'); }

        const container = this.el.heldInvoicesList;
        if (!invoices.length) container.innerHTML = '<p style="text-align:center;padding:20px;">لا توجد فواتير معلقة</p>';
        else {
            container.innerHTML = invoices.map(inv => {
                const name = this.customers.find(c => c.id === inv.customer_id)?.name || 'نقدي';
                const invNumber = inv.invoice_number || inv.id.substring(0,8);
                return `<div class="held-invoice-item" data-id="${inv.id}" style="padding:15px; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:10px; cursor:pointer; display:flex; justify-content:space-between;"><div><strong>${invNumber}</strong><br>${name} - ${Utils.formatMoney(inv.total)}</div><div><i class="fas fa-play"></i></div></div>`;
            }).join('');
            container.querySelectorAll('.held-invoice-item').forEach(item => item.addEventListener('click', () => this.resumeInvoice(item.dataset.id)));
        }
        this.showModal('heldInvoicesModal');
    },

    async resumeInvoice(id) {
        let inv;
        if (this.isDBReady) {
            inv = (await DB.getInvoices()).find(i => i.id === id);
            if (inv) await supabase.from('invoices').delete().eq('id', id);
        } else if (window.localDB) {
            const held = await localDB.getAll('invoices');
            inv = held.find(i => i.id === id);
            if (inv) await localDB.delete('invoices', id);
        }
        if (!inv) return;
        this.cart = inv.items;
        this.selectedCustomer = this.customers.find(c => c.id === inv.customer_id) || null;
        if (this.selectedCustomer) this.el.customerSearchInput.value = this.selectedCustomer.name;
        else this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
        this.onCustomerSearch(); this.renderCart(); this.closeModal('heldInvoicesModal'); this.showToast('تم تحميل الفاتورة المعلقة');
    },

    showModal(id) { this.el[id].style.display = 'flex'; },
    closeModal(id) { this.el[id].style.display = 'none'; },
    showToast(msg) { const t = this.el.toast; t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); },
    saveCartToStorage() {
        if (this.cart.length > 0) localStorage.setItem('pos_held_cart', JSON.stringify({ cart: this.cart, customer: this.selectedCustomer, discountType: this.el.discountType.value, discountValue: this.el.discountValue.value }));
        else localStorage.removeItem('pos_held_cart');
    },
    restoreCartFromStorage() {
        const saved = localStorage.getItem('pos_held_cart'); if (!saved) return;
        try {
            const held = JSON.parse(saved); this.cart = held.cart; this.selectedCustomer = held.customer;
            this.el.discountType.value = held.discountType; this.el.discountValue.value = held.discountValue;
            if (this.selectedCustomer) this.el.customerSearchInput.value = this.selectedCustomer.name;
            else this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
            this.onCustomerSearch(); this.renderCart(); this.showToast('تم استعادة السلة المحفوظة');
        } catch (e) {}
        localStorage.removeItem('pos_held_cart');
    }
};

window.POS = POS;
window.POSCartUpdate = (idx, val, type) => {
    if (type === 'qty') { const q = parseFloat(val); if (q <= 0) POS.cart.splice(idx, 1); else POS.cart[idx].quantity = q; }
    else if (type === 'price') { POS.cart[idx].price = parseFloat(val) || 0; }
    POS.renderCart();
};
window.POSCartRemove = (idx) => { POS.cart.splice(idx, 1); POS.renderCart(); };

window.addEventListener('DOMContentLoaded', () => POS.init());
window.addEventListener('beforeunload', () => POS.saveCartToStorage());
