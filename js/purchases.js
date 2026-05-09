/* =============================================
   المشتريات - حسابي (v2.0 مُحسَّن)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return dateStr; }
        },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase),
        hasLocalDB: () => !!(window.localDB)
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
            'menuToggle', 'sidebar', 'sidebarOverlay', 'logoutBtn', 'userProfileBtn', 'userDropdown',
            'searchInput', 'refreshBtn', 'purchasesBody', 'newPurchaseBtn',
            'totalPurchases', 'paidPurchases', 'unpaidPurchases', 'purchaseCount',
            'purchaseModal', 'modalTitle', 'closeModalBtn', 'cancelModalBtn',
            'purchaseForm', 'purchaseId', 'supplierInput', 'supplierList',
            'purchaseDate', 'invoiceNumber', 'itemsContainer', 'addItemBtn',
            'totalAmount', 'paidAmount', 'paymentMethod', 'remainingAmount',
            'detailsModal', 'detailsContent', 'closeDetailsBtn', 'toast'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
        this.el.filterBtns = document.querySelectorAll('.filter-btn');
    },

    bindEvents() {
        this.el.userProfileBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));

        // القائمة مع الطبقة الداكنة
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

        this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.searchInput?.addEventListener('input', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () => this.loadData());
        this.el.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.el.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.renderTable();
            });
        });

        this.el.newPurchaseBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.purchaseForm?.addEventListener('submit', (e) => { e.preventDefault(); this.savePurchase(); });
        this.el.addItemBtn?.addEventListener('click', () => this.addItemCard());

        this.el.closeDetailsBtn?.addEventListener('click', () => { this.el.detailsModal.classList.remove('open'); });
        window.addEventListener('click', (e) => { if (e.target === this.el.detailsModal) this.el.detailsModal.classList.remove('open'); });
    },

    async loadData() {
        this.isDBReady = Utils.isDBReady();
        try {
            if (this.isDBReady) {
                this.purchases = await DB.getPurchases() || [];
                this.suppliers = await DB.getParties('supplier') || [];
                this.products = await DB.getProducts() || [];
            } else if (Utils.hasLocalDB()) {
                this.purchases = await localDB.getAll('purchases') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.suppliers = allParties.filter(p => p.type === 'supplier');
                this.products = await localDB.getAll('products') || [];
            } else {
                this.purchases = [];
                this.suppliers = [{ id: 's1', name: 'مورد تجريبي' }];
                this.products = [{ id: '1', name: 'بيبسي', units: [{ name: 'كرتونة', price: 240, cost: 200, factor: 1 }, { name: 'علبة', price: 10, cost: 8.33, factor: 24 }] }];
            }
            this.populateSupplierList();
            this.createProductDatalist();
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error('فشل تحميل بيانات المشتريات:', err);
            this.el.purchasesBody.innerHTML = '<tr><td colspan="8" class="empty-message">فشل تحميل البيانات</td></tr>';
        }
    },

    populateSupplierList() {
        if (!this.el.supplierList) return;
        this.el.supplierList.innerHTML = this.suppliers.map(s => `<option value="${Utils.escapeHTML(s.name)}" data-id="${s.id}">${Utils.escapeHTML(s.name)}</option>`).join('');
    },

    escapeHTML: (str) => { const div = document.createElement('div'); div.appendChild(document.createTextNode(str)); return div.innerHTML; },

    createProductDatalist() {
        const old = document.getElementById('productDatalist');
        if (old) old.remove();
        const datalist = document.createElement('datalist');
        datalist.id = 'productDatalist';
        datalist.innerHTML = this.products.map(p => `<option value="${Utils.escapeHTML(p.name)}">${Utils.escapeHTML(p.name)}</option>`).join('');
        document.body.appendChild(datalist);
    },

    updateStats() {
        const total = this.purchases.reduce((s, p) => s + (p.total || 0), 0);
        const paid = this.purchases.reduce((s, p) => s + (p.paid || 0), 0);
        if (this.el.totalPurchases) this.el.totalPurchases.textContent = Utils.formatMoney(total);
        if (this.el.paidPurchases) this.el.paidPurchases.textContent = Utils.formatMoney(paid);
        if (this.el.unpaidPurchases) this.el.unpaidPurchases.textContent = Utils.formatMoney(total - paid);
        if (this.el.purchaseCount) this.el.purchaseCount.textContent = this.purchases.length;
    },

    renderTable() {
        const term = this.el.searchInput?.value.trim().toLowerCase() || '';
        let filtered = this.purchases.filter(p => {
            const matchSearch = !term || (p.id || '').includes(term) || (p.supplier_name || '').includes(term) || (p.invoice_number || '').includes(term);
            return matchSearch;
        });
        if (this.currentFilter === 'paid') filtered = filtered.filter(p => p.status === 'paid' || p.remaining === 0);
        else if (this.currentFilter === 'unpaid') filtered = filtered.filter(p => p.status !== 'paid' && p.remaining > 0);

        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!filtered.length) {
            this.el.purchasesBody.innerHTML = '<tr><td colspan="8" class="empty-message">لا توجد فواتير شراء</td></tr>';
            return;
        }
        this.el.purchasesBody.innerHTML = filtered.map(p => {
            const statusBadge = p.status === 'paid' || p.remaining === 0
                ? '<span class="badge badge-success">مدفوعة</span>'
                : '<span class="badge badge-danger">غير مدفوعة</span>';
            return `<tr>
                <td>${p.invoice_number || (p.id || '').substring(0, 8)}</td>
                <td>${Utils.formatDate(p.date)}</td>
                <td>${Utils.escapeHTML(p.supplier_name || '')}</td>
                <td>${Utils.formatMoney(p.total)}</td>
                <td>${Utils.formatMoney(p.paid)}</td>
                <td>${Utils.formatMoney(p.remaining)}</td>
                <td>${statusBadge}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" onclick="Purchases.editPurchase('${p.id}')"></i>
                    <i class="fas fa-print" onclick="Purchases.printPurchase('${p.id}')"></i>
                    <i class="fas fa-eye" onclick="Purchases.viewDetails('${p.id}')"></i>
                </td>
            </tr>`;
        }).join('');
    },

    openModal(purchase = null) {
        this.editingId = purchase?.id || null;
        if (this.el.modalTitle) this.el.modalTitle.textContent = purchase ? 'تعديل فاتورة شراء' : 'فاتورة شراء جديدة';
        if (this.el.purchaseId) this.el.purchaseId.value = purchase?.id || '';
        if (this.el.supplierInput) this.el.supplierInput.value = purchase?.supplier_name || '';
        if (this.el.purchaseDate) this.el.purchaseDate.value = purchase?.date || Utils.getToday();
        if (this.el.invoiceNumber) this.el.invoiceNumber.value = purchase?.invoice_number || '';
        if (this.el.paidAmount) this.el.paidAmount.value = purchase?.paid || 0;
        if (this.el.paymentMethod) this.el.paymentMethod.value = 'cash';
        if (this.el.itemsContainer) this.el.itemsContainer.innerHTML = '';

        if (purchase?.items?.length) {
            purchase.items.forEach(item => this.addItemCard(item));
        } else {
            this.addItemCard();
        }
        this.updateTotalAndRemaining();
        this.el.purchaseModal?.classList.add('open');
    },

    closeModal() {
        this.el.purchaseModal?.classList.remove('open');
    },

    addItemCard(item = null) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <input type="text" class="item-product-name" placeholder="اسم المنتج" list="productDatalist" autocomplete="off" value="${item?.productName || ''}" onchange="Purchases.onProductSelected(this)">
            <select class="item-unit" onchange="Purchases.onUnitChange(this)" ${!item ? 'disabled' : ''}>
                ${item ? this.getUnitOptions(item.productName) : '<option>اختر المنتج أولاً</option>'}
            </select>
            <input type="number" class="item-qty" placeholder="الكمية" min="0.001" step="0.001" value="${item?.quantity || 1}" oninput="Purchases.updateTotalAndRemaining()">
            <input type="number" class="item-price" placeholder="سعر الشراء" step="0.01" value="${item?.price || 0}" oninput="Purchases.updateTotalAndRemaining()">
            <button type="button" class="remove-btn" onclick="this.closest('.item-card').remove(); Purchases.updateTotalAndRemaining();"><i class="fas fa-times"></i></button>
        `;
        this.el.itemsContainer.appendChild(card);

        if (item) {
            const unitSelect = card.querySelector('.item-unit');
            if (unitSelect && item.unitName) unitSelect.value = item.unitName;
        }
    },

    getUnitOptions(productName) {
        const product = this.products.find(p => p.name === productName);
        if (!product) return '<option>اختر المنتج أولاً</option>';
        return product.units.map(u => `<option value="${u.name}" data-cost="${u.cost || 0}" data-factor="${u.factor || 1}">${u.name}</option>`).join('');
    },

    onProductSelected(input) {
        const card = input.closest('.item-card');
        const productName = input.value.trim();
        const unitSelect = card.querySelector('.item-unit');
        const priceInput = card.querySelector('.item-price');
        const product = this.products.find(p => p.name === productName);
        if (product) {
            unitSelect.innerHTML = this.getUnitOptions(productName);
            unitSelect.disabled = false;
            if (product.units.length > 0) {
                unitSelect.value = product.units[0].name;
                priceInput.value = product.units[0].cost || 0;
            }
        } else {
            unitSelect.innerHTML = '<option>اختر المنتج أولاً</option>';
            unitSelect.disabled = true;
        }
        this.updateTotalAndRemaining();
    },

    onUnitChange(select) {
        const card = select.closest('.item-card');
        const selectedOption = select.options[select.selectedIndex];
        const cost = parseFloat(selectedOption?.dataset?.cost) || 0;
        card.querySelector('.item-price').value = cost;
        this.updateTotalAndRemaining();
    },

    updateTotalAndRemaining() {
        let total = 0;
        this.el.itemsContainer.querySelectorAll('.item-card').forEach(card => {
            const qty = parseFloat(card.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(card.querySelector('.item-price')?.value) || 0;
            total += qty * price;
        });
        if (this.el.totalAmount) this.el.totalAmount.textContent = Utils.formatMoney(total);
        this.updateRemaining();
    },

    updateRemaining() {
        const totalText = this.el.totalAmount?.textContent || '0';
        const total = parseFloat(totalText.replace(/[^0-9.-]+/g, '')) || 0;
        const paid = parseFloat(this.el.paidAmount?.value) || 0;
        if (this.el.remainingAmount) this.el.remainingAmount.textContent = Utils.formatMoney(Math.max(0, total - paid));
    },

    async savePurchase() {
        const supplierName = this.el.supplierInput?.value.trim();
        if (!supplierName) { alert('اسم المورد مطلوب'); return; }

        let supplierId = null;
        if (this.isDBReady) {
            const existing = this.suppliers.find(s => s.name === supplierName);
            if (!existing) {
                const newSupplier = await DB.saveParty({ name: supplierName, type: 'supplier', balance: 0 });
                this.suppliers.push(newSupplier);
                this.populateSupplierList();
                supplierId = newSupplier.id;
            } else {
                supplierId = existing.id;
            }
        }

        const date = this.el.purchaseDate?.value || Utils.getToday();
        const invoiceNumber = this.el.invoiceNumber?.value.trim() || null;
        const paid = parseFloat(this.el.paidAmount?.value) || 0;
        const paymentMethod = this.el.paymentMethod?.value || 'cash';

        const cards = this.el.itemsContainer?.querySelectorAll('.item-card') || [];
        const items = [];
        cards.forEach(card => {
            const productName = card.querySelector('.item-product-name')?.value.trim();
            const unitName = card.querySelector('.item-unit')?.value;
            const qty = parseFloat(card.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(card.querySelector('.item-price')?.value) || 0;
            if (productName && unitName && qty > 0) items.push({ productName, unitName, quantity: qty, price });
        });
        if (!items.length) { alert('أضف صنفًا واحدًا على الأقل'); return; }

        const total = items.reduce((s, i) => s + i.quantity * i.price, 0);
        const remaining = Math.max(0, total - paid);
        const status = remaining === 0 ? 'paid' : 'unpaid';

        const purchaseData = {
            id: this.editingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
            date, supplier: supplierName, supplier_id: supplierId, supplier_name: supplierName,
            invoice_number: invoiceNumber, items, total, paid, remaining, status, notes: null
        };

        try {
            if (this.isDBReady) {
                await DB.savePurchase(purchaseData);
                for (const item of items) {
                    const prod = this.products.find(p => p.name === item.productName);
                    if (prod) {
                        const unit = prod.units.find(u => u.name === item.unitName);
                        if (unit) {
                            const factor = unit.factor || 1;
                            prod.units[0].stock += item.quantity * factor;
                            const cleanProduct = { ...prod }; delete cleanProduct.updated_at;
                            await DB.saveProduct(cleanProduct);
                        }
                    }
                }
                if (paid > 0 && paymentMethod !== 'credit') {
                    await DB.saveTransaction({ id: crypto.randomUUID(), date, type: 'expense', amount: paid, description: `دفع فاتورة شراء ${purchaseData.id}`, payment_method: paymentMethod === 'cash' ? 'cash' : 'bank' });
                }
                if (supplierId) {
                    const supplier = this.suppliers.find(s => s.id === supplierId);
                    if (supplier) { supplier.balance = (supplier.balance || 0) + remaining; const cleanParty = { ...supplier }; delete cleanParty.updated_at; await DB.saveParty(cleanParty); }
                }
            } else if (Utils.hasLocalDB()) {
                await localDB.put('purchases', purchaseData);
            } else {
                const local = JSON.parse(localStorage.getItem('purchases') || '[]');
                const idx = local.findIndex(p => p.id === purchaseData.id);
                if (idx >= 0) local[idx] = purchaseData; else local.push(purchaseData);
                localStorage.setItem('purchases', JSON.stringify(local));
            }
            this.closeModal();
            await this.loadData();
            alert('تم حفظ فاتورة الشراء بنجاح');
        } catch (err) { console.error(err); alert('فشل حفظ الفاتورة: ' + err.message); }
    },

    viewDetails(id) {
        const purchase = this.purchases.find(p => p.id === id);
        if (!purchase) return;
        const itemsHtml = (purchase.items || []).map(i => `<tr><td>${Utils.escapeHTML(i.productName)}</td><td>${Utils.escapeHTML(i.unitName)}</td><td>${i.quantity}</td><td>${Utils.formatMoney(i.price)}</td><td>${Utils.formatMoney(i.quantity*i.price)}</td></tr>`).join('');
        this.el.detailsContent.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div><strong>رقم الفاتورة:</strong> ${purchase.invoice_number || (purchase.id||'').substring(0,8)}</div>
                <div><strong>التاريخ:</strong> ${Utils.formatDate(purchase.date)}</div>
                <div><strong>المورد:</strong> ${Utils.escapeHTML(purchase.supplier_name||'')}</div>
                <div><strong>الحالة:</strong> ${purchase.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</div>
                <div><strong>الإجمالي:</strong> ${Utils.formatMoney(purchase.total)}</div>
                <div><strong>المدفوع:</strong> ${Utils.formatMoney(purchase.paid)}</div>
                <div><strong>المتبقي:</strong> ${Utils.formatMoney(purchase.remaining)}</div>
            </div>
            <h4 style="margin-top:15px;">الأصناف</h4>
            <table style="width:100%; margin-top:10px;">
                <thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
            </table>
        `;
        this.el.detailsModal.classList.add('open');
    },

    printPurchase(id) {
        const purchase = this.purchases.find(p => p.id === id);
        if (purchase && window.printPurchaseOrder) printPurchaseOrder(purchase);
        else alert('دالة الطباعة غير متوفرة');
    },

    editPurchase(id) {
        const purchase = this.purchases.find(p => p.id === id);
        if (purchase) this.openModal(purchase);
    }
};

window.Purchases = Purchases;
document.addEventListener('DOMContentLoaded', () => Purchases.init());
