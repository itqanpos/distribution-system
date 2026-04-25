/* =============================================
   الفواتير - حسابي
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

const Invoices = {
    invoices: [],
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
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            logoutBtn: document.getElementById('logoutBtn'),
            searchInput: document.getElementById('searchInput'),
            typeFilter: document.getElementById('typeFilter'),
            statusFilter: document.getElementById('statusFilter'),
            refreshBtn: document.getElementById('refreshBtn'),
            invoicesBody: document.getElementById('invoicesBody'),
            totalSales: document.getElementById('totalSales'),
            totalReturns: document.getElementById('totalReturns'),
            invoiceCount: document.getElementById('invoiceCount'),
            totalUnpaid: document.getElementById('totalUnpaid'),
            detailsModal: document.getElementById('detailsModal'),
            detailsContent: document.getElementById('detailsContent'),
            closeDetailsBtn: document.getElementById('closeDetailsBtn')
        };
    },

    bindEvents() {
        // القائمة والمستخدم
        this.el.userProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.userDropdown.classList.toggle('show');
        });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle.addEventListener('click', () => this.el.sidebar.classList.toggle('mobile-open'));
        this.el.logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        // البحث والتصفية
        this.el.searchInput.addEventListener('input', () => this.renderTable());
        this.el.typeFilter.addEventListener('change', () => this.renderTable());
        this.el.statusFilter.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn.addEventListener('click', () => this.loadData());

        // مودال التفاصيل
        this.el.closeDetailsBtn.addEventListener('click', () => this.closeModal());
        window.addEventListener('click', (e) => {
            if (e.target === this.el.detailsModal) this.closeModal();
        });
    },

    async loadData() {
        try {
            if (window.DB) {
                this.invoices = await DB.getInvoices(); // جميع الفواتير من جدول invoices
                this.customers = await DB.getParties('customer');
            } else {
                this.invoices = [];
                this.customers = [];
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
        const unpaidTotal = this.invoices
            .filter(inv => inv.status === 'unpaid' || inv.status === 'partial')
            .reduce((sum, inv) => sum + (inv.remaining || 0), 0);

        this.el.totalSales.textContent = Utils.formatMoney(salesTotal);
        this.el.totalReturns.textContent = Utils.formatMoney(returnsTotal);
        this.el.invoiceCount.textContent = count;
        this.el.totalUnpaid.textContent = Utils.formatMoney(unpaidTotal);
    },

    renderTable() {
        const term = this.el.searchInput.value.trim().toLowerCase();
        const typeFilter = this.el.typeFilter.value;
        const statusFilter = this.el.statusFilter.value;

        let filtered = this.invoices.filter(inv => {
            const matchSearch = !term ||
                (inv.id || '').toLowerCase().includes(term) ||
                (inv.customer_name || '').toLowerCase().includes(term);
            const matchType = typeFilter === 'all' || inv.type === typeFilter;
            const matchStatus = statusFilter === 'all' || inv.status === statusFilter;
            return matchSearch && matchType && matchStatus;
        });

        // ترتيب تنازلي حسب التاريخ
        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

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
            return `
                <tr>
                    <td>${inv.id.substring(0, 8)}</td>
                    <td>${inv.date}</td>
                    <td>${typeBadge}</td>
                    <td>${customerName}</td>
                    <td>${Utils.formatMoney(inv.total)}</td>
                    <td>${Utils.formatMoney(inv.paid)}</td>
                    <td>${Utils.formatMoney(inv.remaining)}</td>
                    <td>${statusBadge}</td>
                    <td class="action-icons">
                        <i class="fas fa-eye" title="تفاصيل" onclick="Invoices.viewDetails('${inv.id}')"></i>
                        <i class="fas fa-print" title="طباعة" onclick="Invoices.printInvoice('${inv.id}')"></i>
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

    viewDetails(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;

        const customerName = inv.customer_name || this.customers.find(c => c.id === inv.customer_id)?.name || 'نقدي';
        const itemsRows = (inv.items || []).map(item => `
            <tr>
                <td>${item.productName}</td>
                <td>${item.unitName}</td>
                <td>${item.quantity}</td>
                <td>${Utils.formatMoney(item.price)}</td>
                <td>${Utils.formatMoney(item.price * item.quantity)}</td>
            </tr>
        `).join('');

        const typeText = inv.type === 'sale' ? 'بيع' : inv.type === 'return' ? 'مرتجع' : inv.type;

        this.el.detailsContent.innerHTML = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:20px;">
                <div><strong>رقم الفاتورة:</strong> ${inv.id}</div>
                <div><strong>التاريخ:</strong> ${inv.date}</div>
                <div><strong>النوع:</strong> ${typeText}</div>
                <div><strong>العميل:</strong> ${customerName}</div>
                <div><strong>الحالة:</strong> ${this.getStatusBadge(inv.status)}</div>
                <div><strong>الإجمالي:</strong> ${Utils.formatMoney(inv.total)}</div>
                <div><strong>المدفوع:</strong> ${Utils.formatMoney(inv.paid)}</div>
                <div><strong>المتبقي:</strong> ${Utils.formatMoney(inv.remaining)}</div>
                <div><strong>الخصم:</strong> ${Utils.formatMoney(inv.discount || 0)}</div>
                <div></div>
            </div>
            <h4>الأصناف</h4>
            <table style="width:100%; margin-top:10px;">
                <thead><tr><th>الصنف</th><th>الوحدة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
                <tbody>${itemsRows}</tbody>
            </table>
            ${inv.notes ? `<p style="margin-top:15px;"><strong>ملاحظات:</strong> ${inv.notes}</p>` : ''}
        `;
        this.el.detailsModal.style.display = 'flex';
    },

    printInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        const customer = this.customers.find(c => c.id === inv.customer_id) || { name: inv.customer_name || 'نقدي', balance: 0 };
        const totals = {
            subtotal: inv.subtotal || inv.total,
            discount: inv.discount || 0,
            net: inv.total
        };
        if (window.printSaleReceipt) {
            printSaleReceipt(inv, customer, inv.items || [], totals);
        } else {
            alert('دالة الطباعة غير متوفرة');
        }
    },

    closeModal() {
        this.el.detailsModal.style.display = 'none';
    }
};

window.Invoices = Invoices;
document.addEventListener('DOMContentLoaded', () => Invoices.init());
