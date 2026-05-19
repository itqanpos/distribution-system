/* =============================================
   purchases.js - المشتريات (إصدار نهائي محدث)
   ============================================= */
'use strict';

// ========== Toast مستقل ==========
const Toast = {
  _el: null,
  _timer: null,
  _getEl() {
    if (!this._el) this._el = document.getElementById('toast');
    return this._el;
  },
  show(msg, type = 'info') {
    const el = this._getEl();
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast ' + type + ' show';
    clearTimeout(this._timer);
    this._timer = setTimeout(() => el.classList.remove('show'), 3000);
  },
  success(msg) { this.show(msg, 'success'); },
  error(msg) { this.show(msg, 'error'); },
  info(msg) { this.show(msg, 'info'); }
};

// ========== الأدوات المساعدة ==========
const U = {
    formatMoney: (v) => Number(v || 0).toLocaleString('en-US', {minimumFractionDigits: 2}) + ' ج.م',
    escapeHTML: (s) => {
        const d = document.createElement('div');
        d.appendChild(document.createTextNode(s));
        return d.innerHTML;
    },
    today: () => new Date().toISOString().split('T')[0],
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    generateUUID: () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); })
};

const Purchases = {
    el: {},
    state: {
        ready: false,
        purchases: [],
        suppliers: [],
        products: [],
        editingId: null,
        currentFilter: 'all'
    },

    // ==================== التهيئة ====================
    async init() {
        this.cacheDOM();
        this.bindEvents();
        if (window.App) {
            App.requireAuth();
            App.initUserInterface();
        }
        this.updateSidebarUser();
        await this.waitForDB();
        await this.loadAllData();
        this.renderTable();
        this.updateStats();
        window.addEventListener('online', () => this.loadAllData().then(() => { this.renderTable(); this.updateStats(); }));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.loadAllData().then(() => { this.renderTable(); this.updateStats(); });
        });
    },

    updateSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        const avatarEl = document.getElementById('sidebarAvatar');
        const nameEl = document.getElementById('sidebarUserName');
        if (avatarEl) avatarEl.textContent = user?.avatar || 'U';
        if (nameEl) nameEl.textContent = user?.fullName || user?.email || 'مدير النظام';
    },

    waitForDB() {
        return new Promise(resolve => {
            if (window.DB && window.supabase) { this.state.ready = true; resolve(); return; }
            let attempts = 0;
            const check = setInterval(() => {
                if (window.DB && window.supabase) { this.state.ready = true; clearInterval(check); resolve(); }
                if (++attempts > 50) { clearInterval(check); if (window.localDB) this.state.ready = 'local'; resolve(); }
            }, 100);
        });
    },

    cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay', 'moreMenuBtn', 'moreDropdown', 'logoutBtn',
            'searchInput', 'refreshBtn', 'purchasesBody', 'newPurchaseBtn',
            'totalPurchases', 'paidPurchases', 'unpaidPurchases', 'purchaseCount',
            'purchaseModal', 'modalTitle', 'closeModalBtn', 'cancelModalBtn',
            'purchaseForm', 'purchaseId', 'supplierInput', 'supplierList',
            'purchaseDate', 'invoiceNumber', 'itemsContainer', 'addItemBtn',
            'totalAmount', 'paidAmount', 'paymentMethod', 'remainingAmount',
            'detailsModal', 'detailsContent', 'closeDetailsBtn', 'toast',
            'filterBtns', 'printReportBtn', 'sidebarAvatar', 'sidebarUserName'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
        this.el.filterBtns = document.querySelectorAll('.filter-btn');
    },

    bindEvents() {
        // السايد بار
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

        // زر الثلاث نقاط
        this.el.moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show');
        });

        // تسجيل الخروج وطباعة التقرير
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout(); else location.href = './index.html';
        });
        this.el.printReportBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.printReport();
            this.el.moreDropdown?.classList.remove('show');
        });

        // البحث والتحديث
        this.el.searchInput?.addEventListener('input', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () =>
            this.loadAllData().then(() => { this.renderTable(); this.updateStats(); })
        );

        // أزرار الفلتر
        this.el.filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.el.filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.state.currentFilter = btn.dataset.filter;
                this.renderTable();
            });
        });

        // فتح وإغلاق المودال
        this.el.newPurchaseBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());

        // إرسال النموذج
        this.el.purchaseForm?.addEventListener('submit', (e) => { e.preventDefault(); this.savePurchase(); });

        // إضافة صنف
        this.el.addItemBtn?.addEventListener('click', () => this.addItemCard());

        // إغلاق التفاصيل
        this.el.closeDetailsBtn?.addEventListener('click', () => this.el.detailsModal.classList.remove('open'));
    },

    // ==================== تحميل البيانات ====================
    async loadAllData() {
        try {
            if (this.state.ready === true) {
                this.state.purchases = await DB.getPurchases() || [];
                this.state.suppliers = await DB.getParties('supplier') || [];
                this.state.products = await DB.getProducts() || [];
            } else if (window.localDB) {
                this.state.purchases = await localDB.getAll('purchases') || [];
                const parties = await localDB.getAll('parties') || [];
                this.state.suppliers = parties.filter(p => p.type === 'supplier');
                this.state.products = await localDB.getAll('products') || [];
            }
            this.populateSupplierList();
            this.createProductDatalist();
        } catch (e) { console.error(e); }
    },

    populateSupplierList() {
        const list = this.el.supplierList;
        if (!list) return;
        list.innerHTML = this.state.suppliers.map(s =>
            `<option value="${U.escapeHTML(s.name)}" data-id="${s.id}">${U.escapeHTML(s.name)}</option>`
        ).join('');
    },

    createProductDatalist() {
        const old = document.getElementById('productDatalist');
        if (old) old.remove();
        const dl = document.createElement('datalist');
        dl.id = 'productDatalist';
        dl.innerHTML = this.state.products.map(p =>
            `<option value="${U.escapeHTML(p.name)}">`
        ).join('');
        document.body.appendChild(dl);
    },

    // ==================== الإحصائيات والجدول ====================
    updateStats() {
        const total = this.state.purchases.reduce((s, p) => s + (p.total || 0), 0);
        const paid = this.state.purchases.reduce((s, p) => s + (p.paid || 0), 0);
        this.el.totalPurchases.textContent = U.formatMoney(total);
        this.el.paidPurchases.textContent = U.formatMoney(paid);
        this.el.unpaidPurchases.textContent = U.formatMoney(total - paid);
        this.el.purchaseCount.textContent = this.state.purchases.length;
    },

    renderTable() {
        const term = (this.el.searchInput?.value || '').trim().toLowerCase();
        let filtered = this.state.purchases.filter(p => {
            const match = !term || (p.invoice_number || '').includes(term) || (p.supplier_name || '').includes(term) || (p.id || '').includes(term);
            return match;
        });
        if (this.state.currentFilter === 'paid') filtered = filtered.filter(p => p.status === 'paid' || p.remaining === 0);
        else if (this.state.currentFilter === 'unpaid') filtered = filtered.filter(p => p.status !== 'paid' && p.remaining > 0);
        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        const tbody = this.el.purchasesBody;
        if (!filtered.length) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;">لا توجد فواتير شراء</td></tr>';
            return;
        }
        tbody.innerHTML = filtered.map(p => {
            const badge = p.status === 'paid' || p.remaining === 0
                ? '<span class="badge badge-success">مدفوعة</span>'
                : '<span class="badge badge-danger">غير مدفوعة</span>';
            return `<tr>
                <td>${U.escapeHTML(p.invoice_number || p.id?.substring(0,8) || '')}</td>
                <td>${p.date}</td>
                <td>${U.escapeHTML(p.supplier_name || '')}</td>
                <td>${U.formatMoney(p.total)}</td>
                <td>${U.formatMoney(p.paid)}</td>
                <td>${U.formatMoney(p.remaining)}</td>
                <td>${badge}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" onclick="Purchases.editPurchase('${p.id}')"></i>
                    <i class="fas fa-print" onclick="Purchases.printPurchase('${p.id}')"></i>
                    <i class="fas fa-eye" onclick="Purchases.viewDetails('${p.id}')"></i>
                </td>
            </tr>`;
        }).join('');
    },

    // ==================== المودال ====================
    openModal(purchase = null) {
        this.state.editingId = purchase?.id || null;
        this.el.modalTitle.textContent = purchase ? 'تعديل فاتورة شراء' : 'فاتورة شراء جديدة';
        this.el.purchaseId.value = purchase?.id || '';
        this.el.supplierInput.value = purchase?.supplier_name || '';
        this.el.purchaseDate.value = purchase?.date || U.today();
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
        this.el.purchaseModal.classList.add('open');
    },

    closeModal() { this.el.purchaseModal.classList.remove('open'); },

    addItemCard(item = null) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <input type="text" class="item-product-name" placeholder="اسم المنتج" list="productDatalist" autocomplete="off" value="${U.escapeHTML(item?.productName || '')}" onchange="Purchases.onProductSelected(this)">
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
        const product = this.state.products.find(p => p.name === productName);
        if (!product) return '<option>اختر المنتج أولاً</option>';
        return product.units.map(u =>
            `<option value="${U.escapeHTML(u.name)}" data-cost="${u.cost || 0}" data-factor="${u.factor || 1}">${U.escapeHTML(u.name)}</option>`
        ).join('');
    },

    onProductSelected(input) {
        const card = input.closest('.item-card');
        const productName = input.value.trim();
        const unitSelect = card.querySelector('.item-unit');
        const priceInput = card.querySelector('.item-price');
        const product = this.state.products.find(p => p.name === productName);
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

    // ==================== حساب الإجمالي والمتبقي (تلقائي) ====================
    updateTotalAndRemaining() {
        let total = 0;
        this.el.itemsContainer.querySelectorAll('.item-card').forEach(card => {
            const qty = parseFloat(card.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(card.querySelector('.item-price')?.value) || 0;
            total += qty * price;
        });
        this.el.totalAmount.textContent = U.formatMoney(total);
        this.updateRemaining();
    },

    updateRemaining() {
        const total = parseFloat(this.el.totalAmount.textContent.replace(/[^0-9.-]+/g, '')) || 0;
        const paid = parseFloat(this.el.paidAmount.value) || 0;
        this.el.remainingAmount.textContent = U.formatMoney(Math.max(0, total - paid));
    },

    // ==================== حفظ الفاتورة ====================
    async savePurchase() {
        const supplierName = this.el.supplierInput.value.trim();
        if (!supplierName) return alert('اسم المورد مطلوب');

        let supplierId = null;
        if (this.state.ready === true) {
            const existing = this.state.suppliers.find(s => s.name === supplierName);
            if (!existing) {
                try {
                    const newSupplier = await DB.saveParty({ name: supplierName, type: 'supplier', balance: 0 });
                    this.state.suppliers.push(newSupplier);
                    this.populateSupplierList();
                    supplierId = newSupplier.id;
                } catch (e) { return alert('فشل حفظ المورد الجديد'); }
            } else supplierId = existing.id;
        }

        const date = this.el.purchaseDate.value;
        const paid = parseFloat(this.el.paidAmount.value) || 0;
        const paymentMethod = this.el.paymentMethod.value;

        const cards = this.el.itemsContainer.querySelectorAll('.item-card');
        const items = [];
        cards.forEach(card => {
            const productName = card.querySelector('.item-product-name')?.value.trim();
            const unitName = card.querySelector('.item-unit')?.value;
            const qty = parseFloat(card.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(card.querySelector('.item-price')?.value) || 0;
            if (productName && unitName && qty > 0) items.push({ productName, unitName, quantity: qty, price });
        });
        if (!items.length) return alert('أضف صنفًا واحدًا على الأقل');

        const total = items.reduce((s, i) => s + i.quantity * i.price, 0);
        const remaining = Math.max(0, total - paid);
        const status = remaining === 0 ? 'paid' : 'unpaid';

        const purchaseData = {
            id: this.state.editingId || U.generateUUID(),
            date,
            supplier_id: supplierId,
            supplier_name: supplierName,
            items,
            total,
            paid,
            remaining,
            status,
            notes: null
        };

        try {
            if (this.state.ready === true) {
                await PurchaseService.createPurchaseInvoice({
                    ...purchaseData,
                    cash_paid: paymentMethod === 'cash' ? paid : 0,
                    transfer_paid: paymentMethod === 'transfer' ? paid : 0
                });
            } else if (window.localDB) {
                await localDB.put('purchases', purchaseData);
                for (const item of items) {
                    const prod = this.state.products.find(p => p.name === item.productName);
                    if (prod) {
                        const unit = prod.units.find(u => u.name === item.unitName);
                        if (unit) prod.units[0].stock = U.round((prod.units[0].stock || 0) + item.quantity * (unit.factor || 1), 3);
                        await localDB.put('products', prod);
                    }
                }
                if (paid > 0 && paymentMethod !== 'credit') {
                    await localDB.put('transactions', {
                        id: U.generateUUID(),
                        date,
                        type: 'expense',
                        amount: paid,
                        description: `دفع فاتورة شراء ${purchaseData.id}`,
                        payment_method: paymentMethod === 'cash' ? 'cash' : 'bank'
                    });
                }
                if (supplierId) {
                    const supplier = this.state.suppliers.find(s => s.id === supplierId);
                    if (supplier) {
                        supplier.balance = (supplier.balance || 0) + remaining;
                        await localDB.put('parties', supplier);
                    }
                }
            }

            this.closeModal();
            await this.loadAllData();
            this.renderTable();
            this.updateStats();
            Toast.success('تم حفظ فاتورة الشراء');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الفاتورة: ' + err.message);
        }
    },

    // ==================== التفاصيل والطباعة ====================
    viewDetails(id) {
        const purchase = this.state.purchases.find(p => p.id === id);
        if (!purchase) return;
        const itemsHtml = (purchase.items || []).map(i => `
            <tr>
                <td>${U.escapeHTML(i.productName)}</td>
                <td>${i.unitName}</td>
                <td>${i.quantity}</td>
                <td>${U.formatMoney(i.price)}</td>
                <td>${U.formatMoney(i.price * i.quantity)}</td>
            </tr>
        `).join('');
        this.el.detailsContent.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:15px;">
                <div><strong>رقم الفاتورة:</strong> ${U.escapeHTML(purchase.invoice_number || purchase.id.substring(0,8))}</div>
                <div><strong>التاريخ:</strong> ${purchase.date}</div>
                <div><strong>المورد:</strong> ${U.escapeHTML(purchase.supplier_name)}</div>
                <div><strong>الحالة:</strong> ${purchase.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</div>
                <div><strong>الإجمالي:</strong> ${U.formatMoney(purchase.total)}</div>
                <div><strong>المدفوع:</strong> ${U.formatMoney(purchase.paid)}</div>
                <div><strong>المتبقي:</strong> ${U.formatMoney(purchase.remaining)}</div>
            </div>
            <h4 style="margin-bottom:8px;">الأصناف</h4>
            <table style="width:100%;">
                <thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
            </table>
        `;
        this.el.detailsModal.classList.add('open');
    },

    printPurchase(id) {
        const purchase = this.state.purchases.find(p => p.id === id);
        if (purchase && window.printPurchaseOrder) printPurchaseOrder(purchase);
        else alert('دالة الطباعة غير متوفرة');
    },

    editPurchase(id) {
        const purchase = this.state.purchases.find(p => p.id === id);
        if (purchase) this.openModal(purchase);
    },

    printReport() {
        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) { Toast.error('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }
        const rows = this.state.purchases.map(p => `
            <tr>
                <td>${U.escapeHTML(p.invoice_number || p.id?.substring(0,8) || '')}</td>
                <td>${p.date}</td>
                <td>${U.escapeHTML(p.supplier_name || '')}</td>
                <td>${U.formatMoney(p.total)}</td>
                <td>${U.formatMoney(p.paid)}</td>
                <td>${U.formatMoney(p.remaining)}</td>
                <td>${p.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</td>
            </tr>
        `).join('');
        const totalAll = this.state.purchases.reduce((s, p) => s + (p.total || 0), 0);
        const paidAll = this.state.purchases.reduce((s, p) => s + (p.paid || 0), 0);
        const remainingAll = totalAll - paidAll;
        printWindow.document.write(`
            <html dir="rtl"><head><meta charset="UTF-8"><title>تقرير المشتريات · حسابي</title>
            <style>
                body { font-family: 'Cairo', sans-serif; padding: 20px; direction: rtl; color: #0f172a; }
                h1 { text-align: center; margin-bottom: 20px; }
                .summary { display: flex; justify-content: space-around; background: #f8fafc; padding: 15px; border-radius: 12px; margin-bottom: 20px; }
                .summary div { text-align: center; }
                .summary strong { display: block; font-size: 1.2em; color: #2563eb; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: center; }
                th { background: #f1f5f9; font-weight: 600; }
            </style>
            </head><body>
                <h1>تقرير المشتريات</h1>
                <div class="summary">
                    <div><span>إجمالي المشتريات</span><strong>${U.formatMoney(totalAll)}</strong></div>
                    <div><span>المدفوع</span><strong>${U.formatMoney(paidAll)}</strong></div>
                    <div><span>المتبقي</span><strong>${U.formatMoney(remainingAll)}</strong></div>
                    <div><span>عدد الفواتير</span><strong>${this.state.purchases.length}</strong></div>
                </div>
                <table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>
            </body></html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
};

window.Purchases = Purchases;
window.addEventListener('DOMContentLoaded', () => Purchases.init());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
