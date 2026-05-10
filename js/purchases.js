/* =============================================
   purchases.js - المشتريات (إصدار نهائي كامل)
   ============================================= */
'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return dateStr; }
        },
        escapeHTML: (str) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase),
        hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
    };
}

const Purchases = {
    purchases: [],
    suppliers: [],
    products: [],
    editingId: null,
    currentFilter: 'all',
    dataSource: 'none',

    init() {
        console.log('🟢 تهيئة صفحة المشتريات');
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
            'receiptModal', 'receiptPrintArea', 'printReceiptBtn',
            'closeReceiptModalBtn', 'cancelReceiptModalBtn',
            'payNowBtn', 'toast'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
        this.el.filterBtns = document.querySelectorAll('.filter-btn');
    },

    bindEvents() {
        this.el.userProfileBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));

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

        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

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
        this.el.payNowBtn?.addEventListener('click', () => this.payNow());

        // الإيصال
        this.el.closeReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.cancelReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.printReceiptBtn?.addEventListener('click', () => this.printReceiptFromModal());
    },

    async loadData() {
        console.log('🔍 جاري تحميل بيانات المشتريات...');
        this.dataSource = 'none';
        try {
            if (Utils.isDBReady()) {
                this.purchases = await DB.getPurchases() || [];
                this.suppliers = await DB.getParties('supplier') || [];
                this.products = await DB.getProducts() || [];
                this.dataSource = 'db';
            } else if (Utils.hasLocalDB()) {
                this.purchases = await localDB.getAll('purchases') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.suppliers = allParties.filter(p => p.type === 'supplier');
                this.products = await localDB.getAll('products') || [];
                this.dataSource = 'localdb';
            }

            // معالجة وحدات المنتجات (إذا كانت نصية)
            this.products = this.products.map(p => {
                if (typeof p.units === 'string') {
                    try { p.units = JSON.parse(p.units); } catch (e) { p.units = []; }
                }
                return p;
            });

            // بيانات افتراضية للاختبار
            if (!this.products.length && !Utils.isDBReady() && !Utils.hasLocalDB()) {
                this.products = [
                    { id: 'p1', name: 'أرز', units: [{ name: 'كيلو', price: 30, cost: 25, factor: 1 }] },
                    { id: 'p2', name: 'زيت', units: [{ name: 'لتر', price: 85, cost: 70, factor: 1 }] }
                ];
                this.suppliers = [{ id: 's1', name: 'شركة الأمل', balance: 0 }];
                this.purchases = [];
            }

            this.populateSupplierList();
            this.updateStats();
            this.renderTable();
            console.log(`📊 تم تحميل ${this.purchases.length} فاتورة شراء من ${this.dataSource}`);
        } catch (err) {
            console.error('❌ خطأ في تحميل بيانات المشتريات:', err);
            this.el.purchasesBody.innerHTML = '<tr><td colspan="8" class="empty-message">فشل تحميل البيانات</td></tr>';
        }
    },

    populateSupplierList() {
        if (!this.el.supplierList) return;
        this.el.supplierList.innerHTML = this.suppliers.map(
            s => `<option value="${Utils.escapeHTML(s.name)}" data-id="${s.id}">${Utils.escapeHTML(s.name)}</option>`
        ).join('');
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
            const statusBadge = (p.status === 'paid' || p.remaining === 0)
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
                    <i class="fas fa-eye" title="عرض الإيصال" onclick="Purchases.viewReceipt('${p.id}')"></i>
                    <i class="fas fa-edit" title="تعديل" onclick="Purchases.editPurchase('${p.id}')"></i>
                </td>
            </tr>`;
        }).join('');
    },

    // ========== فتح/إغلاق المودال ==========
    openModal(purchase = null) {
        this.editingId = purchase?.id || null;
        if (this.el.modalTitle) this.el.modalTitle.textContent = purchase ? 'تعديل فاتورة شراء' : 'فاتورة شراء جديدة';
        if (this.el.purchaseId) this.el.purchaseId.value = purchase?.id || '';
        if (this.el.supplierInput) this.el.supplierInput.value = purchase?.supplier_name || '';
        if (this.el.purchaseDate) this.el.purchaseDate.value = purchase?.date || Utils.getToday();
        if (this.el.invoiceNumber) this.el.invoiceNumber.value = purchase?.invoice_number || '';
        if (this.el.paidAmount) this.el.paidAmount.value = purchase?.paid || 0;
        if (this.el.paymentMethod) this.el.paymentMethod.value = purchase?.payment_method || 'cash';
        if (this.el.itemsContainer) this.el.itemsContainer.innerHTML = '';

        if (purchase?.items?.length) {
            purchase.items.forEach(item => this.addItemCard(item));
        } else {
            this.addItemCard();
        }
        this.updateTotalAndRemaining();
        this.el.purchaseModal?.classList.add('open');
    },

    closeModal(modalId = 'purchaseModal') {
        if (modalId === 'purchaseModal') this.el.purchaseModal?.classList.remove('open');
        else if (modalId === 'receiptModal') this.el.receiptModal?.classList.remove('open');
    },

    // ========== إدارة الأصناف ==========
    addItemCard(item = null) {
        const card = document.createElement('div');
        card.className = 'item-card';
        card.innerHTML = `
            <input type="text" class="item-product-name" placeholder="اسم المنتج" list="productDatalist" autocomplete="off" value="${item?.productName || ''}" onchange="Purchases.onProductSelected(this)">
            <select class="item-unit" onchange="Purchases.onUnitChange(this)">
                ${item ? this.getUnitOptions(item.productName, item.unitName) : '<option>اختر المنتج أولاً</option>'}
            </select>
            <input type="number" class="item-qty" placeholder="الكمية" min="0.001" step="0.001" value="${item?.quantity || 1}" oninput="Purchases.updateTotalAndRemaining()">
            <input type="number" class="item-price" placeholder="سعر الشراء" step="0.01" value="${item?.price || 0}" oninput="Purchases.updateTotalAndRemaining()">
            <button type="button" class="remove-btn" onclick="this.closest('.item-card').remove(); Purchases.updateTotalAndRemaining();"><i class="fas fa-times"></i></button>
        `;
        this.el.itemsContainer.appendChild(card);

        // إنشاء قائمة المنتجات للـ datalist إذا لم تكن موجودة
        if (!document.getElementById('productDatalist')) {
            const datalist = document.createElement('datalist');
            datalist.id = 'productDatalist';
            datalist.innerHTML = this.products.map(p => `<option value="${p.name}">${p.name}</option>`).join('');
            document.body.appendChild(datalist);
        }
    },

    getUnitOptions(productName, selectedUnit) {
        const product = this.products.find(p => p.name === productName);
        if (!product) return `<option value="${selectedUnit || ''}">${selectedUnit || 'اختر المنتج'}</option>`;
        return product.units.map(u => `<option value="${u.name}" data-cost="${u.cost || 0}" data-factor="${u.factor || 1}" ${u.name === selectedUnit ? 'selected' : ''}>${u.name}</option>`).join('');
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
                priceInput.value = product.units[0].cost || 0; // تكلفة الوحدة الأساسية تلقائياً
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

    payNow() {
        const totalText = this.el.totalAmount?.textContent || '0';
        const total = parseFloat(totalText.replace(/[^0-9.-]+/g, '')) || 0;
        const paid = parseFloat(this.el.paidAmount?.value) || 0;
        const remaining = Math.max(0, total - paid);

        if (total <= 0) { alert('أضف أصنافاً أولاً'); return; }
        if (paid <= 0 && remaining > 0) { alert('يرجى إدخال مبلغ الدفع أو اختيار "آجل"'); return; }
        if (confirm(`سيتم تسجيل دفعة بقيمة ${Utils.formatMoney(paid)}. المتبقي: ${Utils.formatMoney(remaining)}. متابعة؟`)) {
            this.savePurchase(true);
        }
    },

    // ========== حفظ الفاتورة ==========
    async savePurchase(isDirectPayment = false) {
        const supplierName = this.el.supplierInput?.value.trim();
        if (!supplierName) { alert('اسم المورد مطلوب'); return; }

        let supplierId = null;
        if (Utils.isDBReady() || Utils.hasLocalDB()) {
            const existing = this.suppliers.find(s => s.name === supplierName);
            if (!existing) {
                const newSupplier = { name: supplierName, type: 'supplier', balance: 0 };
                if (Utils.isDBReady()) {
                    const saved = await DB.saveParty(newSupplier);
                    this.suppliers.push(saved);
                    this.populateSupplierList();
                    supplierId = saved.id;
                } else if (Utils.hasLocalDB()) {
                    const saved = await localDB.put('parties', newSupplier);
                    this.suppliers.push(saved);
                    this.populateSupplierList();
                    supplierId = saved.id;
                }
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
            date,
            supplier: supplierName,
            supplier_id: supplierId,
            supplier_name: supplierName,
            invoice_number: invoiceNumber,
            items,
            total,
            paid,
            remaining,
            status,
            notes: null
        };

        try {
            if (Utils.isDBReady()) {
                await DB.savePurchase(purchaseData);
                // تحديث المخزون والحركات المالية
                for (const item of items) {
                    const prod = this.products.find(p => p.name === item.productName);
                    if (prod) {
                        const unit = prod.units.find(u => u.name === item.unitName);
                        if (unit) {
                            const factor = unit.factor || 1;
                            prod.units[0].stock += item.quantity * factor;
                            await DB.saveProduct(prod);
                        }
                    }
                }
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
            } else if (Utils.hasLocalDB()) {
                await localDB.put('purchases', purchaseData);
            } else {
                const local = JSON.parse(localStorage.getItem('purchases') || '[]');
                const idx = local.findIndex(p => p.id === purchaseData.id);
                if (idx >= 0) local[idx] = purchaseData;
                else local.push(purchaseData);
                localStorage.setItem('purchases', JSON.stringify(local));
            }

            this.closeModal('purchaseModal');
            await this.loadData();
            
            // عرض الإيصال مباشرة
            const supplier = this.suppliers.find(s => s.name === supplierName) || { name: supplierName, balance: 0 };
            this.showReceiptModal(purchaseData, supplier);
            
            alert(isDirectPayment ? 'تم الدفع وحفظ الفاتورة بنجاح' : 'تم حفظ فاتورة الشراء بنجاح');
        } catch (err) {
            console.error('فشل حفظ الفاتورة:', err);
            alert('فشل حفظ الفاتورة: ' + err.message);
        }
    },

    editPurchase(id) {
        const purchase = this.purchases.find(p => p.id === id);
        if (purchase) this.openModal(purchase);
    },

    // ========== عرض الإيصال (مطابق لنقطة البيع مع معلومات الدفع في الأسفل) ==========
    viewReceipt(id) {
        const purchase = this.purchases.find(p => p.id === id);
        if (!purchase) return;
        const supplier = this.suppliers.find(s => s.name === purchase.supplier_name) || { name: purchase.supplier_name || 'غير معروف', balance: 0 };
        this.showReceiptModal(purchase, supplier);
    },

    showReceiptModal(purchase, supplier) {
        const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
        const companyName = settings?.company?.name || 'حسابي';
        const companyPhone = settings?.company?.phone || '';
        const footerMsg = settings?.print?.footer_message || 'شكراً لتعاملكم معنا';

        const itemsRows = (purchase.items || []).map(item => {
            const lineTotal = (item.price || 0) * (item.quantity || 0);
            return `
                <tr>
                    <td>${Utils.escapeHTML(item.productName)} - ${Utils.escapeHTML(item.unitName)}</td>
                    <td>${item.quantity}</td>
                    <td>${Utils.formatMoney(item.price)}</td>
                    <td>${Utils.formatMoney(lineTotal)}</td>
                </tr>
            `;
        }).join('');

        const paymentInfoHTML = `
            <div class="payment-info-box">
                <div class="payment-row"><span>رصيد المورد:</span> <span>${Utils.formatMoney(supplier.balance || 0)}</span></div>
                <div class="payment-row"><span>المدفوع:</span> <span>${Utils.formatMoney(purchase.paid)}</span></div>
                <div class="payment-row"><span>المتبقي:</span> <span>${Utils.formatMoney(purchase.remaining)}</span></div>
            </div>
        `;

        this.el.receiptPrintArea.innerHTML = `
            <div class="company-name">${Utils.escapeHTML(companyName)}</div>
            <div class="company-info">${companyPhone ? 'هاتف: ' + Utils.escapeHTML(companyPhone) : ''}</div>
            <div class="divider"></div>
            <p style="font-size:13px;"><strong>المورد:</strong> ${Utils.escapeHTML(supplier.name)}</p>
            <p style="font-size:13px;"><strong>رقم الفاتورة:</strong> ${purchase.invoice_number || purchase.id?.substring(0,8)}</p>
            <p style="font-size:13px;"><strong>التاريخ:</strong> ${Utils.formatDate(purchase.date)}</p>
            <div class="divider"></div>
            <table>
                <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>${itemsRows}</tbody>
            </table>
            <div class="totals">
                <p><strong>الإجمالي:</strong> ${Utils.formatMoney(purchase.total)}</p>
                <p><strong>الصافي:</strong> ${Utils.formatMoney(purchase.total)}</p>
            </div>
            ${paymentInfoHTML}
            <div class="divider"></div>
            <div class="footer">${Utils.escapeHTML(footerMsg)}</div>
        `;
        this.el.receiptModal?.classList.add('open');
    },

    printReceiptFromModal() {
        const content = this.el.receiptPrintArea.innerHTML;
        const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
        const companyName = settings?.company?.name || 'حسابي';

        const pw = window.open('', '_blank', 'width=400,height=600');
        if (!pw) { alert('الرجاء السماح بالنوافذ المنبثقة'); return; }
        pw.document.write(`<html><head><meta charset="UTF-8"><style>body{font-family:'Segoe UI',Tahoma,sans-serif;direction:rtl;text-align:right;padding:20px;color:#000;background:white;width:80mm;margin:0 auto;}.company-name{text-align:center;font-size:18px;font-weight:bold;}.divider{border-top:1px dashed #000;margin:10px 0;}table{width:100%;border-collapse:collapse;font-size:13px;}th,td{padding:3px 4px;border-bottom:1px dotted #ddd;text-align:right;}th{background:#f5f5f5;font-size:11px;}.totals{font-size:14px;margin-top:8px;}.footer{text-align:center;margin-top:12px;font-size:13px;font-weight:bold;}</style></head><body><div class="company-name">${Utils.escapeHTML(companyName)}</div><div class="divider"></div>${content}</body></html>`);
        pw.document.close();
        pw.focus();
        setTimeout(() => { pw.print(); pw.close(); }, 500);
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._t);
        this._t = setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.Purchases = Purchases;
document.addEventListener('DOMContentLoaded', () => Purchases.init());
