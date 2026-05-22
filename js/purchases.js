/* =============================================
   purchases.js - صفحة المشتريات
   ============================================= */
'use strict';

const PurchasesPage = {
    state: {
        purchases: [],
        filteredPurchases: [],
        currentPage: 1,
        pageSize: 15,
        filters: { status: 'all', search: '' },
        selectedPurchase: null
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadData();
    },

    cacheDOM() {
        this.el = {
            tableBody: document.getElementById('purchasesTableBody'),
            filterStatus: document.getElementById('filterStatus'),
            searchInput: document.getElementById('searchInput'),
            resetBtn: document.getElementById('resetFiltersBtn'),
            newPurchaseBtn: document.getElementById('newPurchaseBtn'),
            detailsModal: document.getElementById('purchaseDetailsModal'),
            detailsContent: document.getElementById('purchaseDetailsContent'),
            closeDetailsBtn: document.getElementById('closeDetailsModalBtn'),
            voidBtn: document.getElementById('voidPurchaseBtn'),
            printBtn: document.getElementById('printPurchaseBtn'),
            pagination: document.getElementById('pagination'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            menuToggle: document.getElementById('menuToggle'),
            moreMenuBtn: document.getElementById('moreMenuBtn'),
            moreDropdown: document.getElementById('moreDropdown'),
            logoutBtn: document.getElementById('logoutBtn'),
            printPurchasesReportBtn: document.getElementById('printPurchasesReportBtn'),
            statTotalPurchases: document.getElementById('statTotalPurchases'),
            statTotalAmount: document.getElementById('statTotalAmount'),
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

        // طباعة تقرير المشتريات
        this.el.printPurchasesReportBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.printPurchasesReport();
            this.el.moreDropdown?.classList.remove('show');
        });

        // الفلاتر
        this.el.filterStatus?.addEventListener('change', () => this.applyFilters());
        this.el.searchInput?.addEventListener('input', () => this.applyFilters());
        this.el.resetBtn?.addEventListener('click', () => this.resetFilters());

        // فاتورة شراء جديدة
        this.el.newPurchaseBtn?.addEventListener('click', () => {
            window.location.href = './purchase-invoice.html'; // صفحة إنشاء فاتورة شراء
        });

        // مودال التفاصيل
        this.el.closeDetailsBtn?.addEventListener('click', () => this.closeDetailsModal());
        this.el.printBtn?.addEventListener('click', () => this.printCurrentPurchase());
        this.el.voidBtn?.addEventListener('click', () => this.voidCurrentPurchase());
        this.el.detailsModal?.addEventListener('click', (e) => {
            if (e.target === this.el.detailsModal) this.closeDetailsModal();
        });
    },

    async loadData() {
        await this.loadPurchases();
        this.loadStats();
    },

    async loadPurchases() {
        try {
            const purchases = await window.DB.getPurchasesLight().catch(() => []);
            this.state.purchases = purchases;
            this.applyFilters();
        } catch (e) {
            console.error('فشل تحميل المشتريات:', e);
            if (window.Toast) Toast.error('فشل تحميل المشتريات');
            this.showEmptyState();
        }
    },

    loadStats() {
        const purchases = this.state.purchases;
        const totalCount = purchases.length;
        const totalAmount = purchases
            .filter(i => i.status !== 'voided')
            .reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
        const paidCount = purchases.filter(i => i.status === 'paid').length;
        const unpaidCount = purchases.filter(i => i.status === 'unpaid' || i.status === 'partial').length;

        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

        if (this.el.statTotalPurchases) this.el.statTotalPurchases.textContent = totalCount;
        if (this.el.statTotalAmount) this.el.statTotalAmount.textContent = formatMoney(totalAmount);
        if (this.el.statPaid) this.el.statPaid.textContent = paidCount;
        if (this.el.statUnpaid) this.el.statUnpaid.textContent = unpaidCount;
    },

    applyFilters() {
        const status = this.el.filterStatus?.value || 'all';
        const search = (this.el.searchInput?.value || '').trim().toLowerCase();

        this.state.filters = { status, search };

        let filtered = [...this.state.purchases];

        if (status !== 'all') {
            filtered = filtered.filter(i => i.status === status);
        }
        if (search) {
            filtered = filtered.filter(i =>
                (i.invoice_number && i.invoice_number.toLowerCase().includes(search)) ||
                (i.supplier_name && i.supplier_name.toLowerCase().includes(search))
            );
        }

        this.state.filteredPurchases = filtered;
        this.state.currentPage = 1;
        this.renderTable();
    },

    resetFilters() {
        if (this.el.filterStatus) this.el.filterStatus.value = 'all';
        if (this.el.searchInput) this.el.searchInput.value = '';
        this.applyFilters();
    },

    renderTable() {
        const { filteredPurchases, currentPage, pageSize } = this.state;
        const totalPages = Math.ceil(filteredPurchases.length / pageSize);
        const start = (currentPage - 1) * pageSize;
        const pageData = filteredPurchases.slice(start, start + pageSize);

        if (!this.el.tableBody) return;

        if (pageData.length === 0) {
            this.showEmptyState();
            return;
        }

        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        const statusLabels = { paid: 'مدفوعة', partial: 'جزئية', unpaid: 'غير مدفوعة', voided: 'ملغاة' };

        this.el.tableBody.innerHTML = pageData.map(pur => `
            <tr>
                <td><strong>${pur.invoice_number || pur.id?.substring(0, 8) || '-'}</strong></td>
                <td>${pur.date || '-'}</td>
                <td>${pur.supplier_name || '-'}</td>
                <td>${formatMoney(pur.total)}</td>
                <td>${formatMoney(pur.paid || 0)}</td>
                <td>${formatMoney(pur.remaining || 0)}</td>
                <td><span class="badge ${pur.status || 'unpaid'}">${statusLabels[pur.status] || pur.status}</span></td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="PurchasesPage.viewPurchase('${pur.id}')" title="عرض التفاصيل">
                            <i class="fas fa-eye"></i>
                        </button>
                        ${pur.status !== 'voided' ? `
                        <button class="action-btn danger" onclick="PurchasesPage.confirmVoid('${pur.id}')" title="إلغاء الفاتورة">
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
                <td colspan="8">
                    <div class="empty-state">
                        <i class="fas fa-shopping-cart"></i>
                        <p>لا توجد فواتير شراء</p>
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
        html += `<button ${this.state.currentPage === 1 ? 'disabled' : ''} onclick="PurchasesPage.goToPage(${this.state.currentPage - 1})">«</button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="${i === this.state.currentPage ? 'active' : ''}" onclick="PurchasesPage.goToPage(${i})">${i}</button>`;
        }
        html += `<button ${this.state.currentPage === totalPages ? 'disabled' : ''} onclick="PurchasesPage.goToPage(${this.state.currentPage + 1})">»</button>`;
        this.el.pagination.innerHTML = html;
    },

    goToPage(page) {
        const totalPages = Math.ceil(this.state.filteredPurchases.length / this.state.pageSize);
        if (page < 1 || page > totalPages) return;
        this.state.currentPage = page;
        this.renderTable();
    },

    async viewPurchase(id) {
        try {
            const purchase = await window.DB.getPurchaseById(id);
            if (!purchase) {
                if (window.Toast) Toast.error('الفاتورة غير موجودة');
                return;
            }
            this.state.selectedPurchase = purchase;
            this.showDetailsModal(purchase);
        } catch (e) {
            console.error('فشل جلب تفاصيل الفاتورة:', e);
            if (window.Toast) Toast.error('فشل تحميل التفاصيل');
        }
    },

    showDetailsModal(purchase) {
        if (!this.el.detailsContent) return;

        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        const statusLabels = { paid: 'مدفوعة', partial: 'جزئية', unpaid: 'غير مدفوعة', voided: 'ملغاة' };

        const items = Array.isArray(purchase.items) ? purchase.items : [];
        let itemsRows = items.map(item => `
            <tr>
                <td>${item.productName || '-'}</td>
                <td>${item.unitName || '-'}</td>
                <td>${item.quantity || 0}</td>
                <td>${formatMoney(item.cost || item.price || 0)}</td>
                <td>${formatMoney((item.quantity || 0) * (item.cost || item.price || 0))}</td>
            </tr>
        `).join('');

        this.el.detailsContent.innerHTML = `
            <div class="detail-section">
                <h4>معلومات الفاتورة</h4>
                <div class="detail-row"><span>رقم الفاتورة:</span> <span><strong>${purchase.invoice_number || '-'}</strong></span></div>
                <div class="detail-row"><span>التاريخ:</span> <span>${purchase.date || '-'}</span></div>
                <div class="detail-row"><span>الحالة:</span> <span class="badge ${purchase.status}">${statusLabels[purchase.status] || purchase.status}</span></div>
                <div class="detail-row"><span>المورد:</span> <span>${purchase.supplier_name || '-'}</span></div>
                <div class="detail-row"><span>ملاحظات:</span> <span>${purchase.notes || '-'}</span></div>
            </div>
            <div class="detail-section">
                <h4>العناصر</h4>
                <table class="detail-items-table">
                    <thead>
                        <tr><th>المنتج</th><th>الوحدة</th><th>الكمية</th><th>التكلفة</th><th>الإجمالي</th></tr>
                    </thead>
                    <tbody>${itemsRows || '<tr><td colspan="5" style="text-align:center;">لا توجد عناصر</td></tr>'}</tbody>
                </table>
            </div>
            <div class="detail-section">
                <h4>المبالغ</h4>
                <div class="detail-row"><span>الإجمالي:</span> <span>${formatMoney(purchase.total)}</span></div>
                <div class="detail-row"><span>المدفوع:</span> <span>${formatMoney(purchase.paid || 0)}</span></div>
                <div class="detail-row"><span>المتبقي:</span> <span>${formatMoney(purchase.remaining || 0)}</span></div>
            </div>
        `;

        if (this.el.voidBtn) {
            this.el.voidBtn.style.display = (purchase.status !== 'voided') ? 'flex' : 'none';
        }

        this.el.detailsModal?.classList.add('open');
    },

    closeDetailsModal() {
        this.el.detailsModal?.classList.remove('open');
        this.state.selectedPurchase = null;
    },

    async voidCurrentPurchase() {
        const purchase = this.state.selectedPurchase;
        if (!purchase) return;

        const confirmed = confirm(`هل أنت متأكد من إلغاء فاتورة الشراء ${purchase.invoice_number || purchase.id}؟`);
        if (!confirmed) return;

        try {
            if (window.PurchaseService && window.PurchaseService.voidPurchase) {
                await PurchaseService.voidPurchase(purchase.id);
            } else {
                const { error } = await supabase
                    .from('purchases')
                    .update({ status: 'voided' })
                    .eq('id', purchase.id);
                if (error) throw error;
            }
            if (window.Toast) Toast.success('تم إلغاء فاتورة الشراء بنجاح');
            this.closeDetailsModal();
            this.loadData();
        } catch (e) {
            console.error('فشل إلغاء الفاتورة:', e);
            if (window.Toast) Toast.error('فشل إلغاء الفاتورة');
        }
    },

    confirmVoid(id) {
        this.viewPurchase(id).then(() => {
            setTimeout(() => this.el.voidBtn?.click(), 500);
        });
    },

    printCurrentPurchase() {
        window.print();
    },

    printPurchasesReport() {
        const allPurchases = this.state.purchases;
        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        const totalAll = allPurchases
            .filter(i => i.status !== 'voided')
            .reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);

        let rows = '';
        allPurchases.forEach(pur => {
            rows += `
                <tr>
                    <td>${pur.invoice_number || pur.id?.substring(0, 8) || '-'}</td>
                    <td>${pur.date || '-'}</td>
                    <td>${pur.supplier_name || '-'}</td>
                    <td>${formatMoney(pur.total)}</td>
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
            <title>تقرير المشتريات</title>
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
                <h2>تقرير المشتريات</h2>
                <p>التاريخ: ${new Date().toLocaleDateString('ar-EG')}</p>
                <table>
                    <thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>المورد</th><th>الإجمالي</th></tr></thead>
                    <tbody>${rows}</tbody>
                </table>
                <div class="total">إجمالي المشتريات: ${formatMoney(totalAll)}</div>
            </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
    }
};

window.PurchasesPage = PurchasesPage;
