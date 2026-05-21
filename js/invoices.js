/* =============================================
   invoices.js - صفحة الفواتير
   ============================================= */
'use strict';

const InvoicesPage = {
    state: {
        invoices: [],
        filteredInvoices: [],
        currentPage: 1,
        pageSize: 15,
        filters: { type: 'all', status: 'all', search: '' },
        selectedInvoice: null
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadData();
    },

    cacheDOM() {
        this.el = {
            tableBody: document.getElementById('invoicesTableBody'),
            filterType: document.getElementById('filterType'),
            filterStatus: document.getElementById('filterStatus'),
            searchInput: document.getElementById('searchInput'),
            resetBtn: document.getElementById('resetFiltersBtn'),
            newInvoiceBtn: document.getElementById('newInvoiceBtn'),
            detailsModal: document.getElementById('invoiceDetailsModal'),
            detailsContent: document.getElementById('invoiceDetailsContent'),
            closeDetailsBtn: document.getElementById('closeDetailsModalBtn'),
            voidBtn: document.getElementById('voidInvoiceBtn'),
            editBtn: document.getElementById('editInvoiceBtn'),
            printBtn: document.getElementById('printInvoiceBtn'),
            pagination: document.getElementById('pagination'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            menuToggle: document.getElementById('menuToggle'),
            moreMenuBtn: document.getElementById('moreMenuBtn'),
            moreDropdown: document.getElementById('moreDropdown'),
            logoutBtn: document.getElementById('logoutBtn'),
            printSalesReportBtn: document.getElementById('printSalesReportBtn'),
            statTotalInvoices: document.getElementById('statTotalInvoices'),
            statTotalSales: document.getElementById('statTotalSales'),
            statPaid: document.getElementById('statPaid'),
            statUnpaid: document.getElementById('statUnpaid')
        };
    },

    bindEvents() {
        // القائمة الجانبية
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar?.classList.toggle('open');
            this.el.sidebarOverlay?.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar?.classList.remove('open');
            this.el.sidebarOverlay?.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                this.el.sidebar?.classList.remove('open');
                this.el.sidebarOverlay?.classList.remove('show');
            });
        });
        this.el.moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) {
                this.el.moreDropdown?.classList.remove('show');
            }
        });
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        // زر طباعة تقرير المبيعات
        this.el.printSalesReportBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.printSalesReport();
            this.el.sidebar?.classList.remove('open');
            this.el.sidebarOverlay?.classList.remove('show');
        });

        // الفلاتر
        this.el.filterType?.addEventListener('change', () => this.applyFilters());
        this.el.filterStatus?.addEventListener('change', () => this.applyFilters());
        this.el.searchInput?.addEventListener('input', () => this.applyFilters());
        this.el.resetBtn?.addEventListener('click', () => this.resetFilters());

        // فاتورة جديدة
        this.el.newInvoiceBtn?.addEventListener('click', () => {
            window.location.href = './pos.html';
        });

        // مودال التفاصيل
        this.el.closeDetailsBtn?.addEventListener('click', () => this.closeDetailsModal());
        this.el.printBtn?.addEventListener('click', () => this.printCurrentInvoice());
        this.el.voidBtn?.addEventListener('click', () => this.voidCurrentInvoice());
        this.el.editBtn?.addEventListener('click', () => this.editCurrentInvoice());
        this.el.detailsModal?.addEventListener('click', (e) => {
            if (e.target === this.el.detailsModal) this.closeDetailsModal();
        });
    },

    async loadData() {
        await this.loadInvoices();
        this.loadStats();
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

    loadStats() {
        const invoices = this.state.invoices;
        const totalCount = invoices.length;
        const totalSales = invoices
            .filter(i => i.type === 'sale' && i.status !== 'voided')
            .reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
        const paidCount = invoices.filter(i => i.status === 'paid').length;
        const unpaidCount = invoices.filter(i => i.status === 'unpaid' || i.status === 'partial').length;

        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

        if (this.el.statTotalInvoices) this.el.statTotalInvoices.textContent = totalCount;
        if (this.el.statTotalSales) this.el.statTotalSales.textContent = formatMoney(totalSales);
        if (this.el.statPaid) this.el.statPaid.textContent = paidCount;
        if (this.el.statUnpaid) this.el.statUnpaid.textContent = unpaidCount;
    },

    applyFilters() {
        const type = this.el.filterType?.value || 'all';
        const status = this.el.filterStatus?.value || 'all';
        const search = (this.el.searchInput?.value || '').trim().toLowerCase();

        this.state.filters = { type, status, search };

        let filtered = [...this.state.invoices];

        if (type !== 'all') {
            filtered = filtered.filter(i => i.type === type);
        }
        if (status !== 'all') {
            filtered = filtered.filter(i => i.status === status);
        }
        if (search) {
            filtered = filtered.filter(i =>
                (i.invoice_number && i.invoice_number.toLowerCase().includes(search)) ||
                (i.customer_name && i.customer_name.toLowerCase().includes(search))
            );
        }

        // الترتيب حسب created_at (الأحدث أولاً) تم في getInvoicesLight
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

    renderTable() {
        const { filteredInvoices, currentPage, pageSize } = this.state;
        const totalPages = Math.ceil(filteredInvoices.length / pageSize);
        const start = (currentPage - 1) * pageSize;
        const pageData = filteredInvoices.slice(start, start + pageSize);

        if (!this.el.tableBody) return;

        if (pageData.length === 0) {
            this.showEmptyState();
            return;
        }

        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        const typeLabels = { sale: 'مبيعات', purchase: 'مشتريات', return: 'مرتجع' };
        const statusLabels = { paid: 'مدفوعة', partial: 'جزئية', unpaid: 'غير مدفوعة', held: 'معلقة', voided: 'ملغاة' };

        this.el.tableBody.innerHTML = pageData.map(inv => `
            <tr class="row-${inv.type || 'sale'}">
                <td><strong>${inv.invoice_number || inv.id?.substring(0, 8) || '-'}</strong></td>
                <td>${inv.date || '-'}</td>
                <td><span class="type-badge ${inv.type || 'sale'}">${typeLabels[inv.type] || inv.type}</span></td>
                <td>${inv.customer_name || '-'}</td>
                <td>${formatMoney(inv.total)}</td>
                <td>${formatMoney(inv.paid || 0)}</td>
                <td>${formatMoney(inv.remaining || 0)}</td>
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
        if (!this.el.pagination) return;
        if (totalPages <= 1) {
            this.el.pagination.innerHTML = '';
            return;
        }

        let html = '';
        html += `<button ${this.state.currentPage === 1 ? 'disabled' : ''} onclick="InvoicesPage.goToPage(${this.state.currentPage - 1})">«</button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="${i === this.state.currentPage ? 'active' : ''}" onclick="InvoicesPage.goToPage(${i})">${i}</button>`;
        }
        html += `<button ${this.state.currentPage === totalPages ? 'disabled' : ''} onclick="InvoicesPage.goToPage(${this.state.currentPage + 1})">»</button>`;
        this.el.pagination.innerHTML = html;
    },

    goToPage(page) {
        const totalPages = Math.ceil(this.state.filteredInvoices.length / this.state.pageSize);
        if (page < 1 || page > totalPages) return;
        this.state.currentPage = page;
        this.renderTable();
    },

    async viewInvoice(id) {
        try {
            const invoice = await window.DB.getInvoiceById(id);
            if (!invoice) {
                if (window.Toast) Toast.error('الفاتورة غير موجودة');
                return;
            }
            this.state.selectedInvoice = invoice;
            this.showDetailsModal(invoice);
        } catch (e) {
            console.error('فشل جلب تفاصيل الفاتورة:', e);
            if (window.Toast) Toast.error('فشل تحميل التفاصيل');
        }
    },

    showDetailsModal(invoice) {
        if (!this.el.detailsContent) return;

        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        const typeLabels = { sale: 'مبيعات', purchase: 'مشتريات', return: 'مرتجع' };
        const statusLabels = { paid: 'مدفوعة', partial: 'جزئية', unpaid: 'غير مدفوعة', held: 'معلقة', voided: 'ملغاة' };

        const items = Array.isArray(invoice.items) ? invoice.items : [];
        let itemsRows = items.map(item => `
            <tr>
                <td>${item.productName || '-'}</td>
                <td>${item.unitName || '-'}</td>
                <td>${item.quantity || 0}</td>
                <td>${formatMoney(item.price || 0)}</td>
                <td>${formatMoney((item.quantity || 0) * (item.price || 0))}</td>
            </tr>
        `).join('');

        this.el.detailsContent.innerHTML = `
            <div class="detail-section">
                <h4>معلومات الفاتورة</h4>
                <div class="detail-row"><span>رقم الفاتورة:</span> <span><strong>${invoice.invoice_number || '-'}</strong></span></div>
                <div class="detail-row"><span>التاريخ:</span> <span>${invoice.date || '-'}</span></div>
                <div class="detail-row"><span>النوع:</span> <span>${typeLabels[invoice.type] || invoice.type}</span></div>
                <div class="detail-row"><span>الحالة:</span> <span class="badge ${invoice.status}">${statusLabels[invoice.status] || invoice.status}</span></div>
                <div class="detail-row"><span>العميل / المورد:</span> <span>${invoice.customer_name || invoice.supplier_name || '-'}</span></div>
                <div class="detail-row"><span>ملاحظات:</span> <span>${invoice.notes || '-'}</span></div>
            </div>
            <div class="detail-section">
                <h4>العناصر</h4>
                <table class="detail-items-table">
                    <thead>
                        <tr><th>المنتج</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr>
                    </thead>
                    <tbody>${itemsRows || '<tr><td colspan="5" style="text-align:center;">لا توجد عناصر</td></tr>'}</tbody>
                </table>
            </div>
            <div class="detail-section">
                <h4>المبالغ</h4>
                <div class="detail-row"><span>الإجمالي:</span> <span>${formatMoney(invoice.total)}</span></div>
                <div class="detail-row"><span>الخصم:</span> <span>${formatMoney(invoice.discount || 0)}</span></div>
                <div class="detail-row"><span>المدفوع:</span> <span>${formatMoney(invoice.paid || 0)}</span></div>
                <div class="detail-row"><span>المتبقي:</span> <span>${formatMoney(invoice.remaining || 0)}</span></div>
            </div>
        `;

        // أزرار المودال
        if (this.el.voidBtn) {
            this.el.voidBtn.style.display = (invoice.status !== 'voided') ? 'flex' : 'none';
        }
        if (this.el.editBtn) {
            this.el.editBtn.style.display = (invoice.type === 'sale' && invoice.status !== 'voided') ? 'flex' : 'none';
        }

        this.el.detailsModal?.classList.add('open');
    },

    closeDetailsModal() {
        this.el.detailsModal?.classList.remove('open');
        this.state.selectedInvoice = null;
    },

    async voidCurrentInvoice() {
        const invoice = this.state.selectedInvoice;
        if (!invoice) return;

        const confirmed = confirm(`هل أنت متأكد من إلغاء الفاتورة ${invoice.invoice_number || invoice.id}؟`);
        if (!confirmed) return;

        try {
            if (window.InvoiceService && window.InvoiceService.voidInvoice) {
                await InvoiceService.voidInvoice(invoice.id);
            } else {
                const { error } = await supabase
                    .from('invoices')
                    .update({ status: 'voided' })
                    .eq('id', invoice.id);
                if (error) throw error;
            }
            if (window.Toast) Toast.success('تم إلغاء الفاتورة بنجاح');
            this.closeDetailsModal();
            this.loadData();
        } catch (e) {
            console.error('فشل إلغاء الفاتورة:', e);
            if (window.Toast) Toast.error('فشل إلغاء الفاتورة');
        }
    },

    confirmVoid(id) {
        this.viewInvoice(id).then(() => {
            setTimeout(() => {
                this.el.voidBtn?.click();
            }, 500);
        });
    },

    // فتح الفاتورة في نقطة البيع للتعديل
    editInvoice(id) {
        // تخزين معرف الفاتورة في localStorage لتستقبله نقطة البيع
        localStorage.setItem('edit_invoice_id', id);
        window.location.href = './pos.html';
    },

    editCurrentInvoice() {
        const invoice = this.state.selectedInvoice;
        if (!invoice) return;
        this.closeDetailsModal();
        this.editInvoice(invoice.id);
    },

    printCurrentInvoice() {
        const invoice = this.state.selectedInvoice;
        if (!invoice) return;
        window.print();
    },

    // طباعة تقرير المبيعات كامل
    printSalesReport() {
        const salesInvoices = this.state.invoices.filter(i => i.type === 'sale');
        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        const totalAll = salesInvoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);

        let rows = '';
        salesInvoices.forEach(inv => {
            rows += `
                <tr>
                    <td>${inv.invoice_number || inv.id?.substring(0, 8) || '-'}</td>
                    <td>${inv.date || '-'}</td>
                    <td>${inv.customer_name || '-'}</td>
                    <td>${formatMoney(inv.total)}</td>
                </tr>
            `;
        });

        const printWindow = window.open('', '_blank', 'width=800,height=600');
        if (!printWindow) {
            if (window.Toast) Toast.error('الرجاء السماح بالنوافذ المنبثقة للطباعة');
            return;
        }

        printWindow.document.write(`
            <html dir="rtl">
            <head><meta charset="UTF-8">
            <title>تقرير المبيعات</title>
            <style>
                body { font-family: 'Cairo', sans-serif; direction: rtl; padding: 20px; }
                h2 { text-align: center; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
                th { background: #f5f5f5; }
                .total { font-weight: bold; font-size: 1.2em; text-align: left; margin-top: 20px; }
            </style>
            </head>
            <body>
                <h2>تقرير المبيعات</h2>
                <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                <table>
                    <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="total">إجمالي المبيعات: ${formatMoney(totalAll)}</div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
};

window.InvoicesPage = InvoicesPage;
