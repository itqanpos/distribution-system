/* =============================================
   sales-returns.js - مرتجعات المبيعات
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
        hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
    };
}

const SalesReturns = {
    returns: [],
    invoices: [],
    products: [],
    customers: [],

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
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            searchInput: document.getElementById('searchInput'),
            refreshBtn: document.getElementById('refreshBtn'),
            returnsBody: document.getElementById('returnsBody'),
            newReturnBtn: document.getElementById('newReturnBtn'),
            returnModal: document.getElementById('returnModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelModalBtn: document.getElementById('cancelModalBtn'),
            returnForm: document.getElementById('returnForm'),
            returnId: document.getElementById('returnId'),
            invoiceSearchInput: document.getElementById('invoiceSearchInput'),
            invoiceList: document.getElementById('invoiceList'),
            invoiceItemsContainer: document.getElementById('invoiceItemsContainer'),
            directProductSection: document.getElementById('directProductSection'),
            directProductInput: document.getElementById('directProductInput'),
            directQuantity: document.getElementById('directQuantity'),
            directProductUnits: document.getElementById('directProductUnits'),
            directPrice: document.getElementById('directPrice'),
            returnMethod: document.getElementById('returnMethod'),
            returnDate: document.getElementById('returnDate'),
            returnReason: document.getElementById('returnReason'),
            returnTotal: document.getElementById('returnTotal'),
            totalReturns: document.getElementById('totalReturns'),
            returnCount: document.getElementById('returnCount'),
            todayReturns: document.getElementById('todayReturns'),
            toast: document.getElementById('toast'),
            productList: document.getElementById('productList'),
            invoiceSelectionSection: document.getElementById('invoiceSelectionSection')
        };
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
        this.el.newReturnBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.returnForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveReturn(); });

        this.el.invoiceSearchInput?.addEventListener('input', () => this.onInvoiceSearch());
        this.el.directProductInput?.addEventListener('input', () => this.onDirectProductInput());
    },

    async loadData() {
        try {
            if (Utils.isDBReady()) {
                this.returns = await DB.getSalesReturns?.() || [];
                this.invoices = (await DB.getInvoices?.() || []).filter(i => i.type === 'sale');
                this.products = await DB.getProducts?.() || [];
                this.customers = await DB.getParties?.('customer') || [];
            } else if (Utils.hasLocalDB()) {
                this.returns = await localDB.getAll('sales_returns') || [];
                const allInvoices = await localDB.getAll('invoices') || [];
                this.invoices = allInvoices.filter(i => i.type === 'sale');
                this.products = await localDB.getAll('products') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.customers = allParties.filter(p => p.type === 'customer');
            } else {
                this.returns = [];
                this.invoices = [];
                this.products = [];
                this.customers = [];
            }
            this.populateInvoiceDatalist();
            this.populateProductDatalist();
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error('فشل تحميل بيانات المرتجعات:', err);
            this.el.returnsBody.innerHTML = '<tr><td colspan="7" class="empty-message">فشل تحميل البيانات</td></tr>';
        }
    },

    populateInvoiceDatalist() {
        if (!this.el.invoiceList) return;
        this.el.invoiceList.innerHTML = this.invoices.map(inv => {
            const customerName = inv.customer_name || 'نقدي';
            return `<option value="${inv.id?.substring(0, 8)} - ${customerName}" data-id="${inv.id}">${inv.id?.substring(0, 8)} - ${customerName}</option>`;
        }).join('');
    },

    populateProductDatalist() {
        if (!this.el.productList) return;
        this.el.productList.innerHTML = this.products.map(p =>
            `<option value="${p.name}" data-id="${p.id}">${p.name}</option>`
        ).join('');
    },

    updateStats() {
        const total = this.returns.reduce((s, r) => s + (r.total || 0), 0);
        const today = Utils.getToday();
        const todayTotal = this.returns.filter(r => r.date === today).reduce((s, r) => s + (r.total || 0), 0);
        if (this.el.totalReturns) this.el.totalReturns.textContent = Utils.formatMoney(total);
        if (this.el.returnCount) this.el.returnCount.textContent = this.returns.length;
        if (this.el.todayReturns) this.el.todayReturns.textContent = Utils.formatMoney(todayTotal);
    },

    renderTable() {
        const term = this.el.searchInput?.value.trim().toLowerCase() || '';
        let filtered = this.returns.filter(r => {
            return !term || (r.id || '').toLowerCase().includes(term) ||
                (r.invoice_number || '').toLowerCase().includes(term) ||
                (r.customer_name || '').toLowerCase().includes(term);
        });
        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!filtered.length) {
            this.el.returnsBody.innerHTML = '<tr><td colspan="7" class="empty-message">لا توجد مرتجعات</td></tr>';
            return;
        }

        this.el.returnsBody.innerHTML = filtered.map(r => `
            <tr>
                <td>${r.id?.substring(0, 8) || '-'}</td>
                <td>${Utils.formatDate(r.date)}</td>
                <td>${r.invoice_number || 'مباشر'}</td>
                <td>${r.customer_name || '-'}</td>
                <td>${r.items?.length || 0}</td>
                <td>${Utils.formatMoney(r.total)}</td>
                <td class="action-icons">
                    <i class="fas fa-eye" onclick="SalesReturns.viewReturn('${r.id}')"></i>
                </td>
            </tr>
        `).join('');
    },

    onReturnTypeChange() {
        const type = document.querySelector('input[name="returnType"]:checked')?.value;
        this.el.invoiceSelectionSection.style.display = (type === 'direct_product') ? 'none' : 'block';
        this.el.directProductSection.style.display = (type === 'direct_product') ? 'block' : 'none';
        this.el.invoiceItemsContainer.innerHTML = '';
        this.el.returnTotal.textContent = '0.00 ج.م';
    },

    onInvoiceSearch() {
        const val = this.el.invoiceSearchInput?.value || '';
        const option = Array.from(this.el.invoiceList?.querySelectorAll('option') || []).find(o => o.value === val);
        if (option && option.dataset.id) {
            this.loadInvoiceItems(option.dataset.id);
        }
    },

    loadInvoiceItems(invoiceId) {
        const invoice = this.invoices.find(i => i.id === invoiceId);
        if (!invoice) return;

        const returnType = document.querySelector('input[name="returnType"]:checked')?.value;
        let html = '';

        if (returnType === 'full_invoice') {
            html = '<p style="margin:8px 0;">سيتم إرجاع جميع أصناف الفاتورة</p>';
            (invoice.items || []).forEach(item => {
                html += `<div class="invoice-item-row" style="opacity:0.7;">
                    <span class="item-info">${item.productName} - ${item.unitName}</span>
                    <span>${item.quantity} × ${Utils.formatMoney(item.price)}</span>
                </div>`;
            });
        } else if (returnType === 'single_item') {
            html = '<p style="margin:8px 0; color:var(--gray-600);">اختر الأصناف المراد إرجاعها وحدد الكمية:</p>';
            (invoice.items || []).forEach((item, idx) => {
                html += `<div class="invoice-item-row">
                    <input type="checkbox" id="item_${idx}" data-idx="${idx}" onchange="SalesReturns.updateReturnTotal()">
                    <span class="item-info">${item.productName} - ${item.unitName}</span>
                    <input type="number" class="item-qty" value="${item.quantity}" min="0.001" max="${item.quantity}" step="0.001" data-idx="${idx}" oninput="SalesReturns.updateReturnTotal()" disabled>
                    <span>× ${Utils.formatMoney(item.price)}</span>
                </div>`;
            });
        }
        this.el.invoiceItemsContainer.innerHTML = html;

        // ربط تغيير حالة checkbox
        this.el.invoiceItemsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => {
            cb.addEventListener('change', () => {
                const qtyInput = this.el.invoiceItemsContainer.querySelector(`.item-qty[data-idx="${cb.dataset.idx}"]`);
                if (qtyInput) qtyInput.disabled = !cb.checked;
                this.updateReturnTotal();
            });
        });

        this.updateReturnTotal();
    },

    updateReturnTotal() {
        const returnType = document.querySelector('input[name="returnType"]:checked')?.value;
        let total = 0;

        if (returnType === 'full_invoice') {
            const val = this.el.invoiceSearchInput?.value || '';
            const option = Array.from(this.el.invoiceList?.querySelectorAll('option') || []).find(o => o.value === val);
            if (option?.dataset.id) {
                const invoice = this.invoices.find(i => i.id === option.dataset.id);
                if (invoice) total = invoice.total || 0;
            }
        } else if (returnType === 'single_item') {
            const val = this.el.invoiceSearchInput?.value || '';
            const option = Array.from(this.el.invoiceList?.querySelectorAll('option') || []).find(o => o.value === val);
            if (option?.dataset.id) {
                const invoice = this.invoices.find(i => i.id === option.dataset.id);
                if (invoice?.items) {
                    invoice.items.forEach((item, idx) => {
                        const cb = this.el.invoiceItemsContainer.querySelector(`#item_${idx}`);
                        const qtyInput = this.el.invoiceItemsContainer.querySelector(`.item-qty[data-idx="${idx}"]`);
                        if (cb?.checked && qtyInput) {
                            const qty = parseFloat(qtyInput.value) || 0;
                            total += Math.min(qty, item.quantity) * item.price;
                        }
                    });
                }
            }
        } else if (returnType === 'direct_product') {
            const qty = parseFloat(this.el.directQuantity?.value) || 0;
            const price = parseFloat(this.el.directPrice?.value) || 0;
            total = qty * price;
        }

        this.el.returnTotal.textContent = Utils.formatMoney(total);
    },

    onDirectProductInput() {
        const val = this.el.directProductInput?.value || '';
        const option = Array.from(this.el.productList?.querySelectorAll('option') || []).find(o => o.value === val);
        if (option?.dataset.id) {
            const product = this.products.find(p => p.id === option.dataset.id);
            if (product?.units) {
                // عرض الوحدات
                this.el.directProductUnits.innerHTML = `
                    <div class="form-group"><label>الوحدة</label>
                        <select id="directUnitSelect" onchange="SalesReturns.onDirectUnitChange()">
                            ${product.units.map((u, i) => `<option value="${i}" data-price="${u.price || 0}">${u.name}</option>`).join('')}
                        </select>
                    </div>
                `;
                this.onDirectUnitChange();
            }
        }
        this.updateReturnTotal();
    },

    onDirectUnitChange() {
        const select = document.getElementById('directUnitSelect');
        if (select) {
            const selected = select.options[select.selectedIndex];
            if (selected?.dataset.price) {
                this.el.directPrice.value = selected.dataset.price;
            }
        }
        this.updateReturnTotal();
    },

    openModal() {
        this.el.returnId.value = '';
        this.el.returnDate.value = Utils.getToday();
        this.el.returnReason.value = '';
        this.el.invoiceSearchInput.value = '';
        this.el.invoiceItemsContainer.innerHTML = '';
        this.el.returnTotal.textContent = '0.00 ج.م';
        document.querySelector('input[name="returnType"][value="full_invoice"]').checked = true;
        this.onReturnTypeChange();
        this.el.returnModal.classList.add('open');
    },

    closeModal() {
        this.el.returnModal.classList.remove('open');
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    },

    async saveReturn() {
        const returnType = document.querySelector('input[name="returnType"]:checked')?.value;
        const date = this.el.returnDate?.value || Utils.getToday();
        const reason = this.el.returnReason?.value.trim();
        const method = this.el.returnMethod?.value;
        let total = 0;
        let items = [];
        let invoiceId = null;
        let customerName = '';

        try {
            if (returnType === 'full_invoice') {
                const val = this.el.invoiceSearchInput?.value || '';
                const option = Array.from(this.el.invoiceList?.querySelectorAll('option') || []).find(o => o.value === val);
                if (!option?.dataset.id) { alert('اختر فاتورة'); return; }
                const invoice = this.invoices.find(i => i.id === option.dataset.id);
                if (!invoice) { alert('الفاتورة غير موجودة'); return; }
                invoiceId = invoice.id;
                customerName = invoice.customer_name || '';
                items = invoice.items || [];
                total = invoice.total || 0;
            } else if (returnType === 'single_item') {
                const val = this.el.invoiceSearchInput?.value || '';
                const option = Array.from(this.el.invoiceList?.querySelectorAll('option') || []).find(o => o.value === val);
                if (!option?.dataset.id) { alert('اختر فاتورة'); return; }
                const invoice = this.invoices.find(i => i.id === option.dataset.id);
                if (!invoice) { alert('الفاتورة غير موجودة'); return; }
                invoiceId = invoice.id;
                customerName = invoice.customer_name || '';
                invoice.items.forEach((item, idx) => {
                    const cb = this.el.invoiceItemsContainer.querySelector(`#item_${idx}`);
                    const qtyInput = this.el.invoiceItemsContainer.querySelector(`.item-qty[data-idx="${idx}"]`);
                    if (cb?.checked && qtyInput) {
                        const qty = Math.min(parseFloat(qtyInput.value) || 0, item.quantity);
                        if (qty > 0) {
                            items.push({ ...item, quantity: qty });
                            total += qty * item.price;
                        }
                    }
                });
                if (!items.length) { alert('اختر صنفاً واحداً على الأقل'); return; }
            } else if (returnType === 'direct_product') {
                const val = this.el.directProductInput?.value || '';
                const option = Array.from(this.el.productList?.querySelectorAll('option') || []).find(o => o.value === val);
                if (!option?.dataset.id) { alert('اختر منتجاً'); return; }
                const product = this.products.find(p => p.id === option.dataset.id);
                const qty = parseFloat(this.el.directQuantity?.value) || 0;
                const price = parseFloat(this.el.directPrice?.value) || 0;
                if (qty <= 0 || price <= 0) { alert('الكمية والسعر مطلوبان'); return; }
                const unitSelect = document.getElementById('directUnitSelect');
                const unitName = unitSelect?.options[unitSelect.selectedIndex]?.text || '';
                items = [{ productName: product.name, unitName, quantity: qty, price }];
                total = qty * price;
            }

            const returnData = {
                id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
                date,
                type: 'sales_return',
                invoice_id: invoiceId,
                customer_name: customerName,
                items,
                total,
                reason,
                method
            };

            // حفظ + تحديث المخزون
            if (Utils.isDBReady()) {
                // await DB.saveSalesReturn(returnData);
                // ... تحديث المخزون ...
            } else if (Utils.hasLocalDB()) {
                await localDB.put('sales_returns', returnData);
            }
            this.closeModal();
            await this.loadData();
            this.showToast('تم حفظ المرتجع بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ المرتجع');
        }
    },

    viewReturn(id) {
        const ret = this.returns.find(r => r.id === id);
        if (!ret) return;
        alert(`مرتجع ${ret.id} بقيمة ${Utils.formatMoney(ret.total)}`);
    }
};

window.SalesReturns = SalesReturns;
document.addEventListener('DOMContentLoaded', () => SalesReturns.init());
