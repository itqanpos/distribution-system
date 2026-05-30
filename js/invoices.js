/* =============================================
   invoices.js - صفحة الفواتير (إصدار محسّن)
   ============================================= */
'use strict';

const InvoicesPage = {
    state: {
        invoices: [],
        purchases: [],
        filteredInvoices: [],
        currentPage: 1,
        pageSize: 15,
        filters: { type: 'all', status: 'all', search: '' },
        selectedInvoice: null
    },
    el: {},
    refreshTimer: null,

    /* ---------- أدوات مساعدة ---------- */
    _utils: {
        formatMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
        escapeHTML: (str) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(str || '')); return d.innerHTML; },
        today: () => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        },
        formatDate: (dateStr) => { if (!dateStr) return ''; try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return dateStr; } }
    },

    /* ---------- التهيئة ---------- */
    async init() {
        this.cacheDOM();
        this.bindEvents();
        await this.initAuth();
        this.loadData();
    },

    cacheDOM() {
        const ids = [
            'tableBody', 'filterType', 'filterStatus', 'searchInput', 'resetBtn', 'newInvoiceBtn',
            'detailsModal', 'detailsContent', 'closeDetailsBtn', 'voidBtn', 'editBtn', 'printBtn',
            'pagination', 'sidebar', 'sidebarOverlay', 'menuToggle', 'moreMenuBtn', 'moreDropdown',
            'logoutBtn', 'printSalesReportBtn',
            'statTotalInvoices', 'statTotalSales', 'statPaid', 'statUnpaid'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    bindEvents() {
        this.el.menuToggle?.addEventListener('click', () => { this.el.sidebar?.classList.toggle('open'); this.el.sidebarOverlay?.classList.toggle('show'); });
        this.el.sidebarOverlay?.addEventListener('click', () => { this.el.sidebar?.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); });
        document.querySelectorAll('.menu-item').forEach(l => l.addEventListener('click', () => { this.el.sidebar?.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); }));

        this.el.moreMenuBtn?.addEventListener('click', e => { e.stopPropagation(); this.el.moreDropdown?.classList.toggle('show'); });
        document.addEventListener('click', e => { if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show'); });
        this.el.logoutBtn?.addEventListener('click', e => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.printSalesReportBtn?.addEventListener('click', e => { e.preventDefault(); this.printSalesReport(); this.el.moreDropdown?.classList.remove('show'); });

        this.el.filterType?.addEventListener('change', () => this.applyFilters());
        this.el.filterStatus?.addEventListener('change', () => this.applyFilters());
        this.el.searchInput?.addEventListener('input', () => this.applyFilters());
        this.el.resetBtn?.addEventListener('click', () => this.resetFilters());

        this.el.newInvoiceBtn?.addEventListener('click', () => { window.location.href = './pos.html'; });

        this.el.closeDetailsBtn?.addEventListener('click', () => this.closeDetailsModal());
        this.el.printBtn?.addEventListener('click', () => this.printCurrentInvoice());
        this.el.voidBtn?.addEventListener('click', () => this.voidCurrentInvoice());
        this.el.editBtn?.addEventListener('click', () => this.editCurrentInvoice());
        this.el.detailsModal?.addEventListener('click', e => { if (e.target === this.el.detailsModal) this.closeDetailsModal(); });

        window.addEventListener('beforeunload', () => this.cleanup());
    },

    async initAuth() {
        if (!window.App) return;
        const authenticated = await window.App.requireAuth();
        if (!authenticated) return;
        await window.App.requireRole(['admin', 'rep']);
        const user = await window.App.getCurrentUser();
        if (user) {
            const avatar = document.getElementById('sidebarAvatar');
            const name = document.getElementById('sidebarUserName');
            if (avatar) avatar.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
            if (name) name.textContent = (user.fullName || user.email || 'مدير النظام').split(' ')[0];
        }
        window.App.initUserInterface();
    },

    /* ---------- تحميل البيانات ---------- */
    async loadData() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        await this.loadInvoices();
        await this.loadPurchases();
        this.loadStats();
        this.refreshTimer = setInterval(() => this.loadInvoices(), 30000);
    },

    async loadInvoices() {
        try {
            const invoices = await window.DB.getInvoicesLight().catch(() => []);
            this.state.invoices = invoices;
            this.applyFilters();
        } catch (e) {
            console.error('فشل تحميل الفواتير:', e);
            if (window.Toast) Toast.error('فشل تحميل الفواتير');
            this.showEmptyState();
        }
    },

    async loadPurchases() {
        try {
            this.state.purchases = await window.DB.getPurchases().catch(() => []);
        } catch (e) {
            console.error('فشل تحميل المشتريات:', e);
            this.state.purchases = [];
        }
    },

    loadStats() {
        const inv = this.state.invoices;
        const totalInvoices = inv.length;
        const salesTotal = inv.filter(i => i.type === 'sale' && i.status !== 'voided').reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
        const paidCount = inv.filter(i => i.status === 'paid').length;
        const unpaidCount = inv.filter(i => i.status === 'unpaid' || i.status === 'partial').length;

        const fm = this._utils.formatMoney;
        if (this.el.statTotalInvoices) this.el.statTotalInvoices.textContent = totalInvoices;
        if (this.el.statTotalSales) this.el.statTotalSales.textContent = fm(salesTotal);
        if (this.el.statPaid) this.el.statPaid.textContent = paidCount;
        if (this.el.statUnpaid) this.el.statUnpaid.textContent = unpaidCount;
    },

    /* ---------- الفلاتر ---------- */
    applyFilters() {
        const type = this.el.filterType?.value || 'all';
        const status = this.el.filterStatus?.value || 'all';
        const search = (this.el.searchInput?.value || '').trim().toLowerCase();

        let filtered = [...this.state.invoices];
        if (type !== 'all') filtered = filtered.filter(i => i.type === type);
        if (status !== 'all') filtered = filtered.filter(i => i.status === status);
        if (search) {
            filtered = filtered.filter(i =>
                (i.invoice_number && i.invoice_number.toLowerCase().includes(search)) ||
                (i.customer_name && i.customer_name.toLowerCase().includes(search))
            );
        }

        // ترتيب حسب التاريخ تنازلياً
        filtered.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

        this.state.filteredInvoices = filtered;
        this.state.currentPage = 1;
        this.renderTable();
    },

    resetFilters() {
        if (this.el.filterType) this.el.filterType.value = 'all';
        if (this.el.filterStatus) this.el.filterStatus.value = 'all';
        if (this.el.searchInput) this.el.searchInput.value = '';
        this.applyFilters();
    },

    /* ---------- عرض الجدول ---------- */
    renderTable() {
        const { filteredInvoices, currentPage, pageSize } = this.state;
        const totalPages = Math.ceil(filteredInvoices.length / pageSize);
        const start = (currentPage - 1) * pageSize;
        const pageData = filteredInvoices.slice(start, start + pageSize);

        if (!this.el.tableBody) return;
        if (!pageData.length) {
            this.showEmptyState();
            return;
        }

        const fm = this._utils.formatMoney;
        const esc = this._utils.escapeHTML;
        const typeLabels = { sale: 'مبيعات', purchase: 'مشتريات', return: 'مرتجع' };
        const statusLabels = { paid: 'مدفوعة', partial: 'جزئية', unpaid: 'غير مدفوعة', held: 'معلقة', voided: 'ملغاة' };

        this.el.tableBody.innerHTML = pageData.map(inv => `
            <tr class="row-${inv.type || 'sale'}">
                <td><strong>${inv.invoice_number || inv.id?.substring(0,8) || '-'}</strong></td>
                <td>${inv.date || '-'}</td>
                <td><span class="type-badge ${inv.type || 'sale'}">${typeLabels[inv.type] || inv.type}</span></td>
                <td>${esc(inv.customer_name || '-')}</td>
                <td>${fm(inv.total)}</td>
                <td>${fm(inv.paid || 0)}</td>
                <td>${fm(inv.remaining || 0)}</td>
                <td><span class="badge ${inv.status || 'unpaid'}">${statusLabels[inv.status] || inv.status}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="InvoicesPage.viewInvoice('${inv.id}')" title="عرض التفاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${inv.type === 'sale' && inv.status !== 'voided' ? `
                        <button class="action-btn edit-btn" onclick="InvoicesPage.editInvoice('${inv.id}')" title="تعديل الفاتورة">
                            <i class="fas fa-edit"></i>
                        </button>
                        ` : ''}
                        ${inv.status !== 'voided' ? `
                        <button class="action-btn danger" onclick="InvoicesPage.confirmVoid('${inv.id}')" title="إلغاء الفاتورة">
                            <i class="fas fa-ban"></i>
                        </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `).join('');

        this.renderPagination(totalPages);
    },

    showEmptyState() {
        if (!this.el.tableBody) return;
        this.el.tableBody.innerHTML = `
            <tr>
                <td colspan="9">
                    <div class="empty-state">
                        <i class="fas fa-file-invoice"></i>
                        <p>لا توجد فواتير</p>
                    </div>
                </td>
            </tr>
        `;
        if (this.el.pagination) this.el.pagination.innerHTML = '';
    },

    renderPagination(totalPages) {
        if (!this.el.pagination || totalPages <= 1) {
            if (this.el.pagination) this.el.pagination.innerHTML = '';
            return;
        }

        let html = '';
        const cp = this.state.currentPage;
        html += `<button ${cp === 1 ? 'disabled' : ''} onclick="InvoicesPage.goToPage(${cp - 1})">«</button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="${i === cp ? 'active' : ''}" onclick="InvoicesPage.goToPage(${i})">${i}</button>`;
        }
        html += `<button ${cp === totalPages ? 'disabled' : ''} onclick="InvoicesPage.goToPage(${cp + 1})">»</button>`;
        this.el.pagination.innerHTML = html;
    },

    goToPage(page) {
        const totalPages = Math.ceil(this.state.filteredInvoices.length / this.state.pageSize);
        if (page < 1 || page > totalPages) return;
        this.state.currentPage = page;
        this.renderTable();
    },

    /* ---------- تفاصيل الفاتورة ---------- */
    async viewInvoice(id) {
        try {
            const invoice = await window.DB.getInvoiceById(id);
            if (!invoice) { if (window.Toast) Toast.error('الفاتورة غير موجودة'); return; }
            this.state.selectedInvoice = invoice;
            this.showDetailsModal(invoice);
        } catch (e) {
            console.error(e);
            if (window.Toast) Toast.error('فشل تحميل التفاصيل');
        }
    },

    showDetailsModal(invoice) {
        if (!this.el.detailsContent) return;
        const fm = this._utils.formatMoney;
        const esc = this._utils.escapeHTML;
        const typeLabels = { sale: 'مبيعات', purchase: 'مشتريات', return: 'مرتجع' };
        const statusLabels = { paid: 'مدفوعة', partial: 'جزئية', unpaid: 'غير مدفوعة', held: 'معلقة', voided: 'ملغاة' };

        const items = Array.isArray(invoice.items) ? invoice.items : [];
        let itemsRows = items.map(item => `
            <tr>
                <td>${esc(item.productName || '-')}</td>
                <td>${esc(item.unitName || '-')}</td>
                <td>${item.quantity || 0}</td>
                <td>${fm(item.price || 0)}</td>
                <td>${fm((item.quantity || 0) * (item.price || 0))}</td>
            </tr>
        `).join('');

        this.el.detailsContent.innerHTML = `
            <div class="detail-section">
                <h4>معلومات الفاتورة</h4>
                <div class="detail-row"><span>رقم الفاتورة:</span> <span><strong>${esc(invoice.invoice_number || '-')}</strong></span></div>
                <div class="detail-row"><span>التاريخ:</span> <span>${invoice.date || '-'}</span></div>
                <div class="detail-row"><span>النوع:</span> <span>${typeLabels[invoice.type] || invoice.type}</span></div>
                <div class="detail-row"><span>الحالة:</span> <span class="badge ${invoice.status}">${statusLabels[invoice.status] || invoice.status}</span></div>
                <div class="detail-row"><span>العميل / المورد:</span> <span>${esc(invoice.customer_name || invoice.supplier_name || '-')}</span></div>
                <div class="detail-row"><span>ملاحظات:</span> <span>${esc(invoice.notes || '-')}</span></div>
            </div>
            <div class="detail-section">
                <h4>العناصر</h4>
                <table class="detail-items-table">
                    <thead><tr><th>المنتج</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                    <tbody>${itemsRows || '<tr><td colspan="5">لا توجد عناصر</td></tr>'}</tbody>
                </table>
            </div>
            <div class="detail-section">
                <h4>المبالغ</h4>
                <div class="detail-row"><span>الإجمالي:</span> <span>${fm(invoice.total)}</span></div>
                <div class="detail-row"><span>الخصم:</span> <span>${fm(invoice.discount || 0)}</span></div>
                <div class="detail-row"><span>المدفوع:</span> <span>${fm(invoice.paid || 0)}</span></div>
                <div class="detail-row"><span>المتبقي:</span> <span>${fm(invoice.remaining || 0)}</span></div>
            </div>
        `;

        if (this.el.voidBtn) this.el.voidBtn.style.display = (invoice.status !== 'voided') ? 'flex' : 'none';
        if (this.el.editBtn) this.el.editBtn.style.display = (invoice.type === 'sale' && invoice.status !== 'voided') ? 'flex' : 'none';
        this.el.detailsModal?.classList.add('open');
    },

    closeDetailsModal() {
        this.el.detailsModal?.classList.remove('open');
        this.state.selectedInvoice = null;
    },

    async voidCurrentInvoice() {
        const inv = this.state.selectedInvoice;
        if (!inv || !confirm(`هل تريد إلغاء الفاتورة ${inv.invoice_number}؟`)) return;
        try {
            if (window.InvoiceService?.voidInvoice) await window.InvoiceService.voidInvoice(inv.id);
            else await window.supabase.from('invoices').update({ status: 'voided' }).eq('id', inv.id);
            if (window.Toast) Toast.success('تم إلغاء الفاتورة');
            this.closeDetailsModal();
            this.loadData();
        } catch (e) {
            console.error(e);
            if (window.Toast) Toast.error('فشل الإلغاء');
        }
    },

    confirmVoid(id) {
        this.viewInvoice(id).then(() => setTimeout(() => this.el.voidBtn?.click(), 500));
    },

    editInvoice(id) {
        localStorage.setItem('edit_invoice_id', id);
        window.location.href = './pos.html';
    },

    editCurrentInvoice() {
        const inv = this.state.selectedInvoice;
        if (!inv) return;
        this.closeDetailsModal();
        this.editInvoice(inv.id);
    },

    printCurrentInvoice() { window.print(); },

    printSalesReport() {
        const sales = this.state.invoices.filter(i => i.type === 'sale');
        const fm = this._utils.formatMoney;
        const totalAll = sales.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
        let rows = sales.map(inv => `
            <tr>
                <td>${inv.invoice_number || inv.id?.substring(0,8)}</td>
                <td>${inv.date || '-'}</td>
                <td>${inv.customer_name || '-'}</td>
                <td>${fm(inv.total)}</td>
            </tr>
        `).join('');

        const w = window.open('', '_blank', 'width=800,height=600');
        if (!w) { if (window.Toast) Toast.error('الرجاء السماح بالنوافذ المنبثقة للطباعة'); return; }
        w.document.write(`
            <html dir="rtl">
            <head><meta charset="UTF-8"><title>تقرير المبيعات</title>
            <style>
                body{font-family:'Cairo',sans-serif;direction:rtl;padding:20px}
                table{width:100%;border-collapse:collapse;margin:20px 0}
                th,td{border:1px solid #ddd;padding:8px;text-align:right}
                th{background:#f5f5f5}
                .total{font-weight:bold;font-size:1.2em;text-align:left;margin-top:20px}
            </style>
            </head>
            <body>
                <h2>تقرير المبيعات</h2>
                <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                <table>
                    <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="total">إجمالي المبيعات: ${fm(totalAll)}</div>
            </body>
            </html>
        `);
        w.document.close();
        w.focus();
        setTimeout(() => w.print(), 300);
    },

    cleanup() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
    }
};

window.InvoicesPage = InvoicesPage;
