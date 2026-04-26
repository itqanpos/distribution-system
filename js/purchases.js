/* =============================================
   المشتريات - حسابي
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
        this.el = {
            // القائمة
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            // الصفحة الرئيسية
            searchInput: document.getElementById('searchInput'),
            refreshBtn: document.getElementById('refreshBtn'),
            purchasesBody: document.getElementById('purchasesBody'),
            newPurchaseBtn: document.getElementById('newPurchaseBtn'),
            totalPurchases: document.getElementById('totalPurchases'),
            paidPurchases: document.getElementById('paidPurchases'),
            unpaidPurchases: document.getElementById('unpaidPurchases'),
            purchaseCount: document.getElementById('purchaseCount'),
            filterBtns: document.querySelectorAll('.filter-btn'),
            // المودال الرئيسي
            purchaseModal: document.getElementById('purchaseModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelModalBtn: document.getElementById('cancelModalBtn'),
            purchaseForm: document.getElementById('purchaseForm'),
            purchaseId: document.getElementById('purchaseId'),
            supplierInput: document.getElementById('supplierInput'),
            supplierList: document.getElementById('supplierList'),
            purchaseDate: document.getElementById('purchaseDate'),
            invoiceNumber: document.getElementById('invoiceNumber'),
            itemsContainer: document.getElementById('itemsContainer'),
            addItemRowBtn: document.getElementById('addItemRowBtn'),
            totalAmount: document.getElementById('totalAmount'),
            paidAmount: document.getElementById('paidAmount'),
            paymentMethod: document.getElementById('paymentMethod'),
            remainingAmount: document.getElementById('remainingAmount'),
            notes: document.getElementById('notes'),
            // مودال التفاصيل
            detailsModal: document.getElementById('detailsModal'),
            detailsContent: document.getElementById('detailsContent'),
            closeDetailsBtn: document.getElementById('closeDetailsBtn'),
            // المنتجات datalist (سننشئها)
            productDatalist: null
        };
    },

    bindEvents() {
        // القائمة
        this.el.userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle.addEventListener('click', () => this.el.sidebar.classList.toggle('mobile-open'));
        this.el.logoutBtn.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        // التصفية
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

        // فتح المودال
        this.el.newPurchaseBtn.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.el.purchaseForm.addEventListener('submit', (e) => { e.preventDefault(); this.savePurchase(); });

        // إضافة صنف
        this.el.addItemRowBtn.addEventListener('click', () => this.addItemRow());

        // مودال التفاصيل
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
                // بيانات وهمية
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
        this.el.supplierList.innerHTML = this.suppliers.map(s => `<option value="${s.name}" data-id="${s.id}">${s.name}</option>`).join('');
    },

    createProductDatalist() {
        if (this.el.productDatalist) this.el.productDatalist.remove();
        const datalist = document.createElement('datalist');
        datalist.id = 'productDatalist';
        datalist.innerHTML = this.products.map(p => `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`).join('');
        document.body.appendChild(datalist);
        this.el.productDatalist = datalist;
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
        this.el.notes.value = purchase?.notes || '';
        this.el.itemsContainer.innerHTML = '';

        if (purchase?.items?.length) {
            purchase.items.forEach(item => this.addItemRow(item));
        } else {
            this.addItemRow(); // صف واحد فارغ
        }
        this.updateTotalAndRemaining();
        this.el.purchaseModal.style.display = 'flex';
    },

    closeModal() {
        this.el.purchaseModal.style.display = 'none';
    },

    addItemRow(item = null) {
        const row = document.createElement('div');
        row.className = 'item-row';
        row.innerHTML = `
            <div style="display:grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap:10px; align-items:center; margin-bottom:12px;">
                <input type="text" class="item-product-name" placeholder="اسم المنتج" list="productDatalist" autocomplete="off" value="${item?.productName || ''}" onchange="Purchases.onProductSelected(this)">
                <select class="item-unit" onchange="Purchases.onUnitChange(this)" ${!item ? 'disabled' : ''}>
                    ${item ? this.getUnitOptions(item.productName) : '<option>اختر المنتج أولاً</option>'}
                </select>
                <input type="number" class="item-qty" placeholder="الكمية" min="0.001" step="0.001" value="${item?.quantity || 1}" oninput="Purchases.updateTotalAndRemaining()">
                <input type="number" class="item-price" placeholder="سعر الشراء" step="0.01" value="${item?.price || 0}" oninput="Purchases.updateTotalAndRemaining()">
                <button type="button" class="btn remove-btn" onclick="this.closest('.item-row').remove(); Purchases.updateTotalAndRemaining();"><i class="fas fa-trash"></i></button>
            </div>
        `;
        this.el.itemsContainer.appendChild(row);

        if (item) {
            // تحديد الوحدة الصحيحة
            const unitSelect = row.querySelector('.item-unit');
            if (unitSelect && item.unitName) {
                unitSelect.value = item.unitName;
            }
        }
    },

    getUnitOptions(productName) {
        const product = this.products.find(p => p.name === productName);
        if (!product) return '<option>اختر المنتج أولاً</option>';
        return product.units.map(u => `<option value="${u.name}" data-cost="${u.cost || 0}" data-factor="${u.factor || 1}">${u.name}</option>`).join('');
    },

    onProductSelected(input) {
        const row = input.closest('.item-row');
        const productName = input.value.trim();
        const unitSelect = row.querySelector('.item-unit');
        const priceInput = row.querySelector('.item-price');
        
        const product = this.products.find(p => p.name === productName);
        if (product) {
            unitSelect.innerHTML = this.getUnitOptions(productName);
            unitSelect.disabled = false;
            // اقتراح أول وحدة وسعر تكلفتها
            if (product.units.length > 0) {
                unitSelect.value = product.units[0].name;
                const cost = product.units[0].cost || 0;
                priceInput.value = cost;
            }
        } else {
            unitSelect.innerHTML = '<option>اختر المنتج أولاً</option>';
            unitSelect.disabled = true;
        }
        this.updateTotalAndRemaining();
    },

    onUnitChange(select) {
        const row = select.closest('.item-row');
        const selectedOption = select.options[select.selectedIndex];
        const cost = parseFloat(selectedOption?.dataset?.cost) || 0;
        const priceInput = row.querySelector('.item-price');
        priceInput.value = cost;
        this.updateTotalAndRemaining();
    },

    updateTotalAndRemaining() {
        let total = 0;
        const rows = this.el.itemsContainer.querySelectorAll('.item-row');
        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(row.querySelector('.item-price')?.value) || 0;
            total += qty * price;
        });
        this.el.totalAmount.textContent = Utils.formatMoney(total);
        this.updateRemaining();
    },

    updateRemaining() {
        const total = parseFloat(this.el.totalAmount.textContent.replace(/[^0-9.-]+/g, '')) || 0;
        const paid = parseFloat(this.el.paidAmount.value) || 0;
        const remaining = Math.max(0, total - paid);
        this.el.remainingAmount.textContent = Utils.formatMoney(remaining);
    },

    // ========== حفظ الفاتورة ==========
    async savePurchase() {
        const supplierName = this.el.supplierInput.value.trim();
        if (!supplierName) { alert('اسم المورد مطلوب'); return; }

        // الحصول على أو إنشاء المورد
        let supplierId = null;
        const supplierOption = Array.from(this.el.supplierList.options).find(o => o.value === supplierName);
        if (supplierOption) {
            supplierId = supplierOption.dataset.id;
        } else if (this.isDBReady) {
            // إنشاء مورد جديد
            const newSupplier = await DB.saveParty({ name: supplierName, type: 'supplier', balance: 0 });
            supplierId = newSupplier.id;
            this.suppliers.push(newSupplier);
            this.populateSupplierList();
        }

        const date = this.el.purchaseDate.value;
        const invoiceNumber = this.el.invoiceNumber.value.trim() || null;
        const paid = parseFloat(this.el.paidAmount.value) || 0;
        const notes = this.el.notes.value.trim() || null;
        const paymentMethod = this.el.paymentMethod.value;

        // جمع الأصناف
        const rows = this.el.itemsContainer.querySelectorAll('.item-row');
        const items = [];
        rows.forEach(row => {
            const productName = row.querySelector('.item-product-name')?.value.trim();
            const unitName = row.querySelector('.item-unit')?.value;
            const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(row.querySelector('.item-price')?.value) || 0;
            if (productName && unitName && qty > 0) {
                items.push({ productName, unitName, quantity: qty, price });
            }
        });
        if (!items.length) { alert('أضف صنفًا واحدًا على الأقل'); return; }

        const total = items.reduce((s, i) => s + i.quantity * i.price, 0);
        const remaining = Math.max(0, total - paid);
        const status = remaining === 0 ? 'paid' : 'unpaid';

        const purchaseData = {
            id: this.editingId || crypto.randomUUID(),
            date,
            supplier_id: supplierId,
            supplier_name: supplierName,
            invoice_number: invoiceNumber,
            items,
            total,
            paid,
            remaining,
            status,
            notes
        };

        try {
            if (this.isDBReady) {
                await DB.savePurchase(purchaseData);

                // تحديث المخزون (زيادة الكميات)
                for (const item of items) {
                    const prod = this.products.find(p => p.name === item.productName);
                    if (prod) {
                        const unit = prod.units.find(u => u.name === item.unitName);
                        if (unit) {
                            // تحديث المخزون الأساسي: الكمية المشتراة تحول إلى الوحدة الأساسية
                            const factor = unit.factor || 1;
                            const quantityInBase = item.quantity * factor;
                            prod.units[0].stock += quantityInBase;
                            await DB.saveProduct(prod);
                        }
                    }
                }

                // تسجيل معاملة الدفع إن وجدت
                if (paid > 0 && paymentMethod !== 'credit') {
                    await DB.saveTransaction({
                        id: crypto.randomUUID(),
                        date,
                        type: 'expense',
                        amount: paid,
                        description: `دفع فاتورة شراء ${purchaseData.id}`,
                        payment_method: paymentMethod === 'cash' ? 'cash' : 'bank'
                    });
                }

                // تحديث رصيد المورد
                if (supplierId) {
                    const supplier = this.suppliers.find(s => s.id === supplierId);
                    if (supplier) {
                        supplier.balance = (supplier.balance || 0) + remaining;
                        await DB.saveParty(supplier);
                    }
                }
            } else {
                // وضع الاختبار: تخزين محلي
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
            ${purchase.notes ? `<p style="margin-top:10px;"><strong>ملاحظات:</strong> ${purchase.notes}</p>` : ''}
        `;
        this.el.detailsModal.style.display = 'flex';
    },

    printPurchase(id) {
        const purchase = this.purchases.find(p => p.id === id);
        if (purchase && window.printPurchaseOrder) {
            printPurchaseOrder(purchase);
        } else {
            alert('دالة الطباعة غير متوفرة');
        }
    },

    editPurchase(id) {
        const purchase = this.purchases.find(p => p.id === id);
        if (purchase) this.openModal(purchase);
    }
};

window.Purchases = Purchases;
document.addEventListener('DOMContentLoaded', () => Purchases.init());
