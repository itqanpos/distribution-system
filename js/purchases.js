/* =============================================
   المشتريات - حسابي (إصدار متوافق مع هيكل DB)
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
            'purchaseDate', 'invoiceNumber', 'itemsContainer', 'addItemBtn',
            'totalAmount', 'paidAmount', 'paymentMethod', 'remainingAmount',
            'detailsModal', 'detailsContent', 'closeDetailsBtn'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
        this.el.filterBtns = document.querySelectorAll('.filter-btn');
    },

    bindEvents() {
        this.el.userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle.addEventListener('click', () => this.el.sidebar.classList.toggle('mobile-open'));
        this.el.logoutBtn.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.searchInput.addEventListener('input', () => this.renderTable());
        this.el.refreshBtn.addEventListener('click', () => this.loadData());
        this.el.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.el.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.renderTable();
            });
        });

        this.el.newPurchaseBtn.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.el.purchaseForm.addEventListener('submit', (e) => { e.preventDefault(); this.savePurchase(); });
        this.el.addItemBtn.addEventListener('click', () => this.addItemCard());

        this.el.closeDetailsBtn.addEventListener('click', () => { this.el.detailsModal.style.display = 'none'; });
    },

    async loadData() {
        this.isDBReady = !!(window.DB && window.supabase);
        try {
            if (this.isDBReady) {
                this.purchases = await DB.getPurchases();
                this.suppliers = await DB.getParties('supplier');
                this.products = await DB.getProducts();
            } else {
                this.purchases = [];
                this.suppliers = [{ id: 's1', name: 'مورد تجريبي' }];
                this.products = [
                    { id: '1', name: 'بيبسي', units: [{ name: 'كرتونة', price: 240, cost: 200, factor: 1 }, { name: 'علبة', price: 10, cost: 8.33, factor: 24 }] }
                ];
            }
            this.populateSupplierList();
            this.createProductDatalist();
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error(err);
            this.el.purchasesBody.innerHTML = '<tr><td colspan="8" class="empty-message">فشل تحميل البيانات</td></tr>';
        }
    },

    populateSupplierList() {
        this.el.supplierList.innerHTML = this.suppliers.map(s => `<option value="${s.name}">${s.name}</option>`).join('');
    },

    createProductDatalist() {
        const old = document.getElementById('productDatalist');
        if (old) old.remove();
        const datalist = document.createElement('datalist');
        datalist.id = 'productDatalist';
        datalist.innerHTML = this.products.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
        document.body.appendChild(datalist);
    },

    updateStats() {
        const total = this.purchases.reduce((s, p) => s + (p.total || 0), 0);
        const paid = this.purchases.reduce((s, p) => s + (p.paid || 0), 0);
        this.el.totalPurchases.textContent = Utils.formatMoney(total);
        this.el.paidPurchases.textContent = Utils.formatMoney(paid);
        this.el.unpaidPurchases.textContent = Utils.formatMoney(total - paid);
        this.el.purchaseCount.textContent = this.purchases.length;
    },

    renderTable() {
        const term = this.el.searchInput.value.trim().toLowerCase();
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
            const statusBadge = p.status === 'paid' || p.remaining === 0 ? '<span class="badge badge-success">مدفوعة</span>' : '<span class="badge badge-danger">غير مدفوعة</span>';
            return `<tr>
                <td>${p.invoice_number || p.id.substring(0,8)}</td>
                <td>${p.date}</td>
                <td>${p.supplier_name}</td>
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

    // ========== إدارة المودال ==========
    openModal(purchase = null) {
        this.editingId = purchase?.id || null;
        this.el.modalTitle.textContent = purchase ? 'تعديل فاتورة شراء' : 'فاتورة شراء جديدة';
        this.el.purchaseId.value = purchase?.id || '';
        this.el.supplierInput.value = purchase?.supplier_name || '';
        this.el.purchaseDate.value = purchase?.date || Utils.getToday();
        this.el.invoiceNumber.value = purchase?.invoice_number || '';
        this.el.paidAmount.value = purchase?.paid || 0;
        this.el.paymentMethod.value = 'cash';
        this.el.itemsContainer.innerHTML = '';

        if (purchase?.items?.length) {
            purchase.items.forEach(item => this.addItemCard(item));
        } else {
            this.addItemCard();
        }
        this.updateTotalAndRemaining();
        this.el.purchaseModal.style.display = 'flex';
    },

    closeModal() {
        this.el.purchaseModal.style.display = 'none';
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
        this.el.totalAmount.textContent = Utils.formatMoney(total);
        this.updateRemaining();
    },

    updateRemaining() {
        const total = parseFloat(this.el.totalAmount.textContent.replace(/[^0-9.-]+/g, '')) || 0;
        const paid = parseFloat(this.el.paidAmount.value) || 0;
        this.el.remainingAmount.textContent = Utils.formatMoney(Math.max(0, total - paid));
    },

    // ========== حفظ الفاتورة (متوافق مع جدول purchases) ==========
    async savePurchase() {
        const supplierName = this.el.supplierInput.value.trim();
        if (!supplierName) { alert('اسم المورد مطلوب'); return; }

        // التحقق من وجود المورد أو إنشائه
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

        const date = this.el.purchaseDate.value;
        const invoiceNumber = this.el.invoiceNumber.value.trim() || null;
        const paid = parseFloat(this.el.paidAmount.value) || 0;
        const paymentMethod = this.el.paymentMethod.value;

        // جمع الأصناف
        const cards = this.el.itemsContainer.querySelectorAll('.item-card');
        const items = [];
        cards.forEach(card => {
            const productName = card.querySelector('.item-product-name')?.value.trim();
            const unitName = card.querySelector('.item-unit')?.value;
            const qty = parseFloat(card.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(card.querySelector('.item-price')?.value) || 0;
            if (productName && unitName && qty > 0) {
                items.push({ productName, unitName, quantity: qty, price });
            }
        });
        if (!items.length) { alert('أضف صنفًا واحدًا على الأقل'); return; }

        const total = items.reduce((s, i) => s + i.quantity * i.price, 0);
        const remaining = Math.max(0, total - paid);
        const status = remaining === 0 ? 'paid' : 'unpaid';

        // بناء كائن الفاتورة بالحقول المتوافقة فقط
        const purchaseData = {
            id: this.editingId || crypto.randomUUID(),
            date,
            supplier_name: supplierName,
            invoice_number: invoiceNumber,
            items,
            total,
            paid,
            remaining,
            status
            // بدون supplier_id, بدون notes
        };

        try {
            if (this.isDBReady) {
                await DB.savePurchase(purchaseData);

                // تحديث المخزون
                for (const item of items) {
                    const prod = this.products.find(p => p.name === item.productName);
                    if (prod) {
                        const unit = prod.units.find(u => u.name === item.unitName);
                        if (unit) {
                            const factor = unit.factor || 1;
                            prod.units[0].stock += item.quantity * factor;
                            // حفظ المنتج بدون updated_at
                            const cleanProduct = { ...prod };
                            delete cleanProduct.updated_at;
                            await DB.saveProduct(cleanProduct);
                        }
                    }
                }

                // تسجيل معاملة مالية إن وجدت
                if (paid > 0 && paymentMethod !== 'credit') {
                    const transaction = {
                        id: crypto.randomUUID(),
                        date,
                        type: 'expense',
                        amount: paid,
                        description: `دفع فاتورة شراء ${purchaseData.id}`,
                        payment_method: paymentMethod === 'cash' ? 'cash' : 'bank'
                    };
                    await DB.saveTransaction(transaction);
                }

                // تحديث رصيد المورد
                if (supplierId) {
                    const supplier = this.suppliers.find(s => s.id === supplierId);
                    if (supplier) {
                        supplier.balance = (supplier.balance || 0) + remaining;
                        const cleanParty = { ...supplier };
                        delete cleanParty.updated_at;
                        await DB.saveParty(cleanParty);
                    }
                }
            } else {
                const local = JSON.parse(localStorage.getItem('purchases') || '[]');
                const idx = local.findIndex(p => p.id === purchaseData.id);
                if (idx >= 0) local[idx] = purchaseData;
                else local.push(purchaseData);
                localStorage.setItem('purchases', JSON.stringify(local));
            }

            this.closeModal();
            await this.loadData();
            alert('تم حفظ فاتورة الشراء بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الفاتورة: ' + err.message);
        }
    },

    // ========== تفاصيل وطباعة ==========
    viewDetails(id) {
        const purchase = this.purchases.find(p => p.id === id);
        if (!purchase) return;
        const itemsHtml = (purchase.items || []).map(i => `
            <tr><td>${i.productName}</td><td>${i.unitName}</td><td>${i.quantity}</td><td>${Utils.formatMoney(i.price)}</td><td>${Utils.formatMoney(i.quantity*i.price)}</td></tr>
        `).join('');
        this.el.detailsContent.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
                <div><strong>رقم الفاتورة:</strong> ${purchase.invoice_number || purchase.id.substring(0,8)}</div>
                <div><strong>التاريخ:</strong> ${purchase.date}</div>
                <div><strong>المورد:</strong> ${purchase.supplier_name}</div>
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
        this.el.detailsModal.style.display = 'flex';
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
