/* =============================================
   invoices.js - الفواتير (إصدار نهائي كامل)
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

const Invoices = {
    invoices: [],
    customers: [],
    products: [],

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
            typeFilter: document.getElementById('typeFilter'),
            statusFilter: document.getElementById('statusFilter'),
            refreshBtn: document.getElementById('refreshBtn'),
            invoicesBody: document.getElementById('invoicesBody'),
            statsGrid: document.getElementById('statsGrid'),
            // مودال الإيصال
            receiptModal: document.getElementById('receiptModal'),
            receiptPrintArea: document.getElementById('receiptPrintArea'),
            printReceiptBtn: document.getElementById('printReceiptBtn'),
            cancelReceiptModalBtn: document.getElementById('cancelReceiptModalBtn'),
            closeReceiptModalBtn: document.getElementById('closeReceiptModalBtn'),
            // مودال التعديل
            editInvoiceModal: document.getElementById('editInvoiceModal'),
            closeEditModalBtn: document.getElementById('closeEditModalBtn'),
            cancelEditModalBtn: document.getElementById('cancelEditModalBtn'),
            editInvoiceForm: document.getElementById('editInvoiceForm'),
            editInvoiceId: document.getElementById('editInvoiceId'),
            editInvoiceDate: document.getElementById('editInvoiceDate'),
            editInvoiceStatus: document.getElementById('editInvoiceStatus'),
            editInvoiceNotes: document.getElementById('editInvoiceNotes'),
            editItemsContainer: document.getElementById('editItemsContainer'),
            addEditItemBtn: document.getElementById('addEditItemBtn'),
            editTotalAmount: document.getElementById('editTotalAmount'),
            editPaidAmount: document.getElementById('editPaidAmount'),
            editPaymentMethod: document.getElementById('editPaymentMethod'),
            editRemainingAmount: document.getElementById('editRemainingAmount'),
            toast: document.getElementById('toast')
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

        this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.searchInput?.addEventListener('input', () => this.renderTable());
        this.el.typeFilter?.addEventListener('change', () => this.renderTable());
        this.el.statusFilter?.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () => this.loadData());

        // مودال الإيصال
        this.el.closeReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.cancelReceiptModalBtn?.addEventListener('click', () => this.closeModal('receiptModal'));
        this.el.printReceiptBtn?.addEventListener('click', () => this.printReceipt());

        // مودال التعديل
        this.el.closeEditModalBtn?.addEventListener('click', () => this.closeModal('editInvoiceModal'));
        this.el.cancelEditModalBtn?.addEventListener('click', () => this.closeModal('editInvoiceModal'));
        this.el.editInvoiceForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveEdit(); });
        this.el.addEditItemBtn?.addEventListener('click', () => this.addEditItem());
        this.el.editPaidAmount?.addEventListener('input', () => this.updateEditRemaining());
    },

    async loadData() {
        try {
            if (Utils.isDBReady()) {
                this.invoices = await DB.getInvoices() || [];
                this.customers = await DB.getParties('customer') || [];
                this.products = await DB.getProducts() || [];
            } else if (Utils.hasLocalDB()) {
                this.invoices = await localDB.getAll('invoices') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.customers = allParties.filter(p => p.type === 'customer');
                this.products = await localDB.getAll('products') || [];
            } else {
                this.invoices = [];
                this.customers = [];
                this.products = [];
            }
            this.updateStats();
            this.renderTable();
        } catch (error) {
            console.error('فشل تحميل الفواتير:', error);
            this.el.invoicesBody.innerHTML = '<tr><td colspan="9" class="empty-message">فشل تحميل البيانات</td></tr>';
        }
    },

    updateStats() {
        const salesTotal = this.invoices.filter(inv => inv.type === 'sale').reduce((sum, inv) => sum + (inv.total || 0), 0);
        const returnsTotal = this.invoices.filter(inv => inv.type === 'return').reduce((sum, inv) => sum + (inv.total || 0), 0);
        const count = this.invoices.length;
        const unpaidTotal = this.invoices.filter(inv => inv.status === 'unpaid' || inv.status === 'partial').reduce((sum, inv) => sum + (inv.remaining || 0), 0);

        const statValues = this.el.statsGrid.querySelectorAll('.stat-value');
        if (statValues.length >= 4) {
            statValues[0].textContent = Utils.formatMoney(salesTotal);
            statValues[1].textContent = Utils.formatMoney(returnsTotal);
            statValues[2].textContent = count;
            statValues[3].textContent = Utils.formatMoney(unpaidTotal);
        }
    },

    renderTable() {
        const term = this.el.searchInput.value.trim().toLowerCase();
        const typeFilter = this.el.typeFilter.value;
        const statusFilter = this.el.statusFilter.value;

        let filtered = this.invoices.filter(inv => {
            const idMatch = (inv.invoice_number || inv.id || '').toLowerCase().includes(term);
            const nameMatch = (inv.customer_name || '').toLowerCase().includes(term);
            const matchSearch = !term || idMatch || nameMatch;
            const matchType = typeFilter === 'all' || inv.type === typeFilter;
            const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
            return matchSearch && matchType && matchStatus;
        });

        // ترتيب مزدوج: حسب التاريخ تنازلياً ثم حسب رقم الفاتورة تنازلياً
        filtered.sort((a, b) => {
            const dateComp = (b.date || '').localeCompare(a.date || '');
            if (dateComp !== 0) return dateComp;
            const aNum = parseInt((a.invoice_number || '').split('-').pop()) || 0;
            const bNum = parseInt((b.invoice_number || '').split('-').pop()) || 0;
            return bNum - aNum;
        });

        if (!filtered.length) {
            this.el.invoicesBody.innerHTML = '<tr><td colspan="9" class="empty-message">لا توجد فواتير مطابقة</td></tr>';
            return;
        }

        this.el.invoicesBody.innerHTML = filtered.map(inv => {
            const statusBadge = this.getStatusBadge(inv.status);
            const typeBadge = inv.type === 'sale' ? '<span class="type-badge type-sale">بيع</span>' :
                              inv.type === 'return' ? '<span class="type-badge type-return">مرتجع</span>' :
                              `<span class="type-badge">${inv.type}</span>`;
            const customerName = inv.customer_name || this.customers.find(c => c.id === inv.customer_id)?.name || 'نقدي';
            const invNumber = inv.invoice_number || inv.id?.substring(0, 8);
            return `
                <tr>
                    <td>${Utils.escapeHTML(invNumber)}</td>
                    <td>${Utils.formatDate(inv.date)}</td>
                    <td>${typeBadge}</td>
                    <td>${Utils.escapeHTML(customerName)}</td>
                    <td>${Utils.formatMoney(inv.total)}</td>
                    <td>${Utils.formatMoney(inv.paid)}</td>
                    <td>${Utils.formatMoney(inv.remaining)}</td>
                    <td>${statusBadge}</td>
                    <td class="action-icons">
                        <i class="fas fa-eye" title="عرض الإيصال" onclick="Invoices.viewReceipt('${inv.id}')"></i>
                        <i class="fas fa-edit" title="تعديل" onclick="Invoices.editInvoice('${inv.id}')"></i>
                    </td>
                </tr>
            `;
        }).join('');
    },

    getStatusBadge(status) {
        const map = {
            'paid': '<span class="badge badge-success">مدفوعة</span>',
            'partial': '<span class="badge badge-warning">جزئية</span>',
            'unpaid': '<span class="badge badge-danger">غير مدفوعة</span>',
            'held': '<span class="badge badge-info">معلقة</span>'
        };
        return map[status] || `<span class="badge">${status}</span>`;
    },

    // ==================== عرض الإيصال (مطابق لنقطة البيع) ====================
    viewReceipt(id) {
    const inv = this.invoices.find(i => i.id === id);
    if (!inv) return;

    const customer = this.customers.find(c => c.id === inv.customer_id) || { name: inv.customer_name || 'نقدي', balance: 0 };
    const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
    const companyName = settings?.company?.name || 'حسابي';
    const companyPhone = settings?.company?.phone || '';
    const footerMsg = settings?.print?.footer_message || 'شكراً لتعاملكم معنا';

    const itemsRows = (inv.items || []).map(item => {
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

    const paymentInfoHTML = customer && customer.name !== 'نقدي' ? `
        <div class="payment-info-box">
            <div class="payment-row"><span>الرصيد الحالي للعميل:</span> <span>${Utils.formatMoney(customer.balance)}</span></div>
            <div class="payment-row"><span>المدفوع:</span> <span>${Utils.formatMoney(inv.paid)}</span></div>
            <div class="payment-row"><span>المتبقي:</span> <span>${Utils.formatMoney(inv.remaining)}</span></div>
        </div>
    ` : '';

    this.el.receiptPrintArea.innerHTML = `
        <div class="company-name">${Utils.escapeHTML(companyName)}</div>
        <div class="company-info">${companyPhone ? 'هاتف: ' + Utils.escapeHTML(companyPhone) : ''}</div>
        <div class="divider"></div>
        <p style="font-size:13px;"><strong>العميل:</strong> ${Utils.escapeHTML(customer.name)}</p>
        <p style="font-size:13px;"><strong>رقم الفاتورة:</strong> ${inv.invoice_number || inv.id?.substring(0,8)}</p>
        <p style="font-size:13px;"><strong>التاريخ:</strong> ${Utils.formatDate(inv.date)}</p>
        <div class="divider"></div>
        <table>
            <thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
            <tbody>${itemsRows}</tbody>
        </table>
        <div class="totals">
            <p><strong>الإجمالي:</strong> ${Utils.formatMoney(inv.subtotal || inv.total)}</p>
            ${inv.discount > 0 ? `<p><strong>الخصم:</strong> ${Utils.formatMoney(inv.discount)}</p>` : ''}
            <p><strong>الصافي:</strong> ${Utils.formatMoney(inv.total)}</p>
        </div>
        ${paymentInfoHTML}
        <div class="divider"></div>
        <div class="footer">${Utils.escapeHTML(footerMsg)}</div>
    `;
    this.showModal('receiptModal');
}
    

    // ==================== تعديل الفاتورة ====================
    editInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        this.editOriginalInvoice = inv;
        this.el.editInvoiceId.value = inv.id;
        this.el.editInvoiceDate.value = inv.date || Utils.getToday();
        this.el.editInvoiceStatus.value = inv.status || 'paid';
        this.el.editInvoiceNotes.value = inv.notes || '';
        this.el.editPaidAmount.value = inv.paid || 0;
        this.el.editPaymentMethod.value = inv.payment_method || 'cash';
        this.editCustomerId = inv.customer_id;
        this.editItems = JSON.parse(JSON.stringify(inv.items || []));
        this.renderEditItems();
        this.updateEditTotal();
        this.showModal('editInvoiceModal');
    },

    renderEditItems() {
        const container = this.el.editItemsContainer;
        container.innerHTML = '';
        this.editItems.forEach((item, idx) => {
            const div = document.createElement('div');
            div.className = 'edit-item-row';
            div.innerHTML = `
                <input type="text" class="item-product" value="${Utils.escapeHTML(item.productName)}" list="productDatalist" onchange="Invoices.onEditItemProduct(this, ${idx})">
                <select class="item-unit" onchange="Invoices.onEditItemUnit(this, ${idx})">
                    ${this.getUnitsOptions(item.productName, item.unitName)}
                </select>
                <input type="number" class="item-qty" value="${item.quantity}" min="0.001" step="0.001" oninput="Invoices.updateEditTotal()">
                <input type="number" class="item-price" value="${item.price}" step="0.01" oninput="Invoices.updateEditTotal()">
                <button type="button" class="remove-btn" onclick="Invoices.removeEditItem(${idx})"><i class="fas fa-times"></i></button>
            `;
            container.appendChild(div);
        });
    },

    getUnitsOptions(productName, selectedUnit) {
        const product = this.products.find(p => p.name === productName);
        if (!product) return `<option value="${selectedUnit}">${selectedUnit}</option>`;
        return product.units.map(u => `<option value="${u.name}" ${u.name === selectedUnit ? 'selected' : ''}>${u.name}</option>`).join('');
    },

    onEditItemProduct(input, idx) {
        const productName = input.value.trim();
        const product = this.products.find(p => p.name === productName);
        if (product) {
            this.editItems[idx].productName = productName;
            const unitSelect = input.parentElement.querySelector('.item-unit');
            unitSelect.innerHTML = product.units.map(u => `<option value="${u.name}">${u.name}</option>`).join('');
            if (product.units.length > 0) {
                unitSelect.value = product.units[0].name;
                this.editItems[idx].unitName = product.units[0].name;
                const priceInput = input.parentElement.querySelector('.item-price');
                priceInput.value = product.units[0].price || 0;
                this.editItems[idx].price = product.units[0].price || 0;
            }
        }
        this.updateEditTotal();
    },

    onEditItemUnit(select, idx) {
        const unitName = select.value;
        const product = this.products.find(p => p.name === this.editItems[idx].productName);
        if (product) {
            const unit = product.units.find(u => u.name === unitName);
            if (unit) {
                const priceInput = select.parentElement.querySelector('.item-price');
                priceInput.value = unit.price || 0;
                this.editItems[idx].price = unit.price || 0;
            }
        }
        this.editItems[idx].unitName = unitName;
        this.updateEditTotal();
    },

    removeEditItem(idx) {
        this.editItems.splice(idx, 1);
        this.renderEditItems();
        this.updateEditTotal();
    },

    addEditItem() {
        this.editItems.push({ productName: '', unitName: '', quantity: 1, price: 0 });
        this.renderEditItems();
        this.updateEditTotal();
    },

    updateEditTotal() {
        let total = 0;
        const rows = this.el.editItemsContainer.querySelectorAll('.edit-item-row');
        rows.forEach(row => {
            const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(row.querySelector('.item-price')?.value) || 0;
            total += qty * price;
        });
        this.el.editTotalAmount.textContent = Utils.formatMoney(total);
        this.updateEditRemaining();
    },

    updateEditRemaining() {
        const totalText = this.el.editTotalAmount.textContent;
        const total = parseFloat(totalText.replace(/[^0-9.-]+/g, '')) || 0;
        const paid = parseFloat(this.el.editPaidAmount.value) || 0;
        this.el.editRemainingAmount.textContent = Utils.formatMoney(Math.max(0, total - paid));
    },

    // ==================== حفظ التعديلات ====================
    async saveEdit() {
        const id = this.el.editInvoiceId.value;
        const date = this.el.editInvoiceDate.value;
        const status = this.el.editInvoiceStatus.value;
        const notes = this.el.editInvoiceNotes.value.trim();
        const paid = parseFloat(this.el.editPaidAmount.value) || 0;
        const paymentMethod = this.el.editPaymentMethod.value;

        const items = [];
        const rows = this.el.editItemsContainer.querySelectorAll('.edit-item-row');
        rows.forEach(row => {
            const productName = row.querySelector('.item-product')?.value.trim();
            const unitName = row.querySelector('.item-unit')?.value;
            const quantity = parseFloat(row.querySelector('.item-qty')?.value) || 0;
            const price = parseFloat(row.querySelector('.item-price')?.value) || 0;
            if (productName && unitName && quantity > 0) {
                items.push({ productName, unitName, quantity, price });
            }
        });

        if (items.length === 0) { alert('يجب إضافة صنف واحد على الأقل'); return; }

        const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0);
        const discount = this.editOriginalInvoice.discount || 0;
        const total = subtotal - discount;
        const remaining = Math.max(0, total - paid);

        const updatedInvoice = {
            ...this.editOriginalInvoice,
            date, status, notes, paid, payment_method: paymentMethod,
            items, subtotal, total, remaining
        };

        try {
            await this.reverseOldInvoice(this.editOriginalInvoice);
            await this.applyNewInvoice(updatedInvoice);

            if (Utils.isDBReady()) await DB.saveInvoice(updatedInvoice);
            else if (Utils.hasLocalDB()) await localDB.put('invoices', updatedInvoice);

            this.closeModal('editInvoiceModal');
            await this.loadData();
            this.showToast('تم تعديل الفاتورة بنجاح');
        } catch (err) {
            console.error('فشل تعديل الفاتورة:', err);
            alert('حدث خطأ أثناء تعديل الفاتورة');
        }
    },

    async reverseOldInvoice(invoice) {
        for (const item of (invoice.items || [])) {
            const product = this.products.find(p => p.name === item.productName);
            if (product) {
                const unit = product.units.find(u => u.name === item.unitName);
                if (unit) {
                    const factor = unit.factor || 1;
                    product.units[0].stock += (item.quantity * factor);
                    if (Utils.isDBReady()) await DB.saveProduct(product);
                    else if (Utils.hasLocalDB()) await localDB.put('products', product);
                }
            }
        }
        if (invoice.customer_id) {
            const customer = this.customers.find(c => c.id === invoice.customer_id);
            if (customer) {
                customer.balance += (invoice.total - invoice.paid);
                if (Utils.isDBReady()) await DB.saveParty(customer);
                else if (Utils.hasLocalDB()) await localDB.put('parties', customer);
            }
        }
    },

    async applyNewInvoice(invoice) {
        for (const item of (invoice.items || [])) {
            const product = this.products.find(p => p.name === item.productName);
            if (product) {
                const unit = product.units.find(u => u.name === item.unitName);
                if (unit) {
                    const factor = unit.factor || 1;
                    product.units[0].stock = Math.max(0, product.units[0].stock - (item.quantity * factor));
                    if (Utils.isDBReady()) await DB.saveProduct(product);
                    else if (Utils.hasLocalDB()) await localDB.put('products', product);
                }
            }
        }
        if (invoice.customer_id) {
            const customer = this.customers.find(c => c.id === invoice.customer_id);
            if (customer) {
                customer.balance -= (invoice.total - invoice.paid);
                if (Utils.isDBReady()) await DB.saveParty(customer);
                else if (Utils.hasLocalDB()) await localDB.put('parties', customer);
            }
        }
    },

    // ==================== دوال مساعدة ====================
    showModal(id) { const m = this.el[id]; if (m) m.classList.add('open'); },
    closeModal(id) { const m = this.el[id]; if (m) m.classList.remove('open'); },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.Invoices = Invoices;
document.addEventListener('DOMContentLoaded', () => Invoices.init());
