/* =============================================
   invoices.js - الفواتير (إصدار نهائي مع إيصال وتعديل)
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
            // بطاقات الإحصائيات
            statsGrid: document.getElementById('statsGrid'),
            // مودالات
            receiptModal: document.getElementById('receiptModal'),
            receiptPrintArea: document.getElementById('receiptPrintArea'),
            printReceiptBtn: document.getElementById('printReceiptBtn'),
            cancelReceiptModalBtn: document.getElementById('cancelReceiptModalBtn'),
            closeReceiptModalBtn: document.getElementById('closeReceiptModalBtn'),
            editInvoiceModal: document.getElementById('editInvoiceModal'),
            closeEditModalBtn: document.getElementById('closeEditModalBtn'),
            cancelEditModalBtn: document.getElementById('cancelEditModalBtn'),
            editInvoiceForm: document.getElementById('editInvoiceForm'),
            editInvoiceId: document.getElementById('editInvoiceId'),
            editInvoiceDate: document.getElementById('editInvoiceDate'),
            editInvoiceStatus: document.getElementById('editInvoiceStatus'),
            editInvoiceNotes: document.getElementById('editInvoiceNotes'),
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
    },

    async loadData() {
        try {
            if (Utils.isDBReady()) {
                this.invoices = await DB.getInvoices();
                this.customers = await DB.getParties('customer');
            } else if (Utils.hasLocalDB()) {
                this.invoices = await localDB.getAll('invoices') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.customers = allParties.filter(p => p.type === 'customer');
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
        const unpaidTotal = this.invoices.filter(inv => inv.status === 'unpaid' || inv.status === 'partial').reduce((sum, inv) => sum + (inv.remaining || 0), 0);

        // تحديث البطاقات مباشرة
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

    // ========== عرض الإيصال (مطابق لنقطة البيع) ==========
    viewReceipt(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;

        const customer = this.customers.find(c => c.id === inv.customer_id) || { name: inv.customer_name || 'نقدي' };
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
            <div class="divider"></div>
            <div class="footer">${Utils.escapeHTML(footerMsg)}</div>
        `;
        this.showModal('receiptModal');
    },

    printReceipt() {
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

    // ========== تعديل الفاتورة ==========
    editInvoice(id) {
        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return;
        this.el.editInvoiceId.value = inv.id;
        this.el.editInvoiceDate.value = inv.date || Utils.getToday();
        this.el.editInvoiceStatus.value = inv.status || 'paid';
        this.el.editInvoiceNotes.value = inv.notes || '';
        this.showModal('editInvoiceModal');
    },

    async saveEdit() {
        const id = this.el.editInvoiceId.value;
        const date = this.el.editInvoiceDate.value;
        const status = this.el.editInvoiceStatus.value;
        const notes = this.el.editInvoiceNotes.value.trim();

        const inv = this.invoices.find(i => i.id === id);
        if (!inv) return alert('الفاتورة غير موجودة');

        inv.date = date;
        inv.status = status;
        inv.notes = notes;

        try {
            if (Utils.isDBReady()) await DB.saveInvoice(inv);
            else if (Utils.hasLocalDB()) await localDB.put('invoices', inv);
            this.closeModal('editInvoiceModal');
            this.updateStats();
            this.renderTable();
            this.showToast('تم تعديل الفاتورة');
        } catch (err) {
            console.error(err);
            alert('فشل تعديل الفاتورة');
        }
    },

    // ========== دوال مساعدة ==========
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
