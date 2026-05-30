/* =============================================
   dashboard.js - لوحة التحكم (إصدار محسّن)
   ============================================= */
'use strict';

const Dashboard = {
    state: {
        stats: { totalSales: 0, totalOrders: 0, totalCustomers: 0, totalProducts: 0, lowStockCount: 0 },
        salesChart: null,
        recentInvoices: [],
        loading: false
    },
    el: {},
    refreshTimer: null,
    dateInterval: null,

    /* ---------- الأدوات المساعدة ---------- */
    _utils: {
        formatMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
        escapeHTML: (str) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(str)); return d.innerHTML; },
        formatDate: (dateStr) => { if (!dateStr) return ''; try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return dateStr; } }
    },

    /* ---------- التهيئة ---------- */
    async init() {
        this.cacheDOM();
        this.bindEvents();
        await this.initAuth();
        this.startPeriodicRefresh();
        this.setupServiceWorker();
    },

    cacheDOM() {
        const ids = [
            'statsGrid', 'dailySalesCards', 'topProductsList', 'recentInvoicesTable',
            'sidebarAvatar', 'sidebarUserName', 'heroGreeting',
            'menuToggle', 'sidebar', 'sidebarOverlay', 'moreMenuBtn', 'moreDropdown', 'logoutBtn',
            'statTotalInvoices', 'statTotalSales', 'statPaid', 'statUnpaid', 'statLowStock'
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
        window.addEventListener('beforeunload', () => this.stopPeriodicRefresh());
    },

    async initAuth() {
        const authenticated = await window.App?.requireAuth?.();
        if (!authenticated) return;
        window.App?.initUserInterface?.();
        await this.updateSidebarUser();
        await this.loadAllData();
    },

    async updateSidebarUser() {
        const user = await window.App?.getCurrentUser?.();
        if (!user) return;
        if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
        const firstName = (user.fullName || user.email || 'مدير النظام').split(' ')[0];
        if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = firstName;
        if (this.el.heroGreeting) this.el.heroGreeting.textContent = `مرحباً، ${firstName} 👋`;
    },

    /* ---------- المؤقتات ---------- */
    startPeriodicRefresh() {
        this.dateInterval = setInterval(() => { if (!this.state.loading) this.loadAllData(); }, 30000);
    },
    stopPeriodicRefresh() {
        if (this.dateInterval) clearInterval(this.dateInterval);
        if (this.refreshTimer) clearTimeout(this.refreshTimer);
    },
    scheduleRefresh() {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = setTimeout(() => this.loadAllData(), 500);
    },

    /* ---------- Service Worker ---------- */
    setupServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./service-worker.js').catch(err => console.warn('SW failed', err));
            });
        }
    },

    /* ---------- تحميل البيانات ---------- */
    async loadAllData() {
        if (this.state.loading) return;
        this.state.loading = true;
        try {
            await Promise.all([
                this.loadStats(),
                this.loadDailySalesCards(),
                this.loadTopProducts(),
                this.loadRecentInvoices()
            ]);
        } catch (e) {
            console.error('فشل تحميل البيانات:', e);
            if (window.Toast) Toast.error('فشل تحميل بعض البيانات');
        } finally {
            this.state.loading = false;
        }
    },

    async loadStats() {
        try {
            const [invoices, parties, products] = await Promise.all([
                window.DB?.getInvoicesLight().catch(() => []),
                window.DB?.getParties().catch(() => []),
                window.DB?.getProducts().catch(() => [])
            ]);
            const salesInvoices = (invoices || []).filter(i => i.type === 'sale' && i.status !== 'voided');
            const totalSales = salesInvoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
            const totalOrders = salesInvoices.length;
            const totalCustomers = (parties || []).filter(p => p.type === 'customer').length;
            const totalProducts = (products || []).length;
            const lowStockCount = (products || []).filter(p => (p.stock || 0) <= (p.min_stock || 5)).length;

            this.state.stats = { totalSales, totalOrders, totalCustomers, totalProducts, lowStockCount };
            this.renderStats();
        } catch (e) { console.error('فشل تحميل الإحصائيات:', e); }
    },

    renderStats() {
        const fm = this._utils.formatMoney;
        const setText = (id, val) => { if (this.el[id]) this.el[id].textContent = val; };
        setText('statTotalInvoices', this.state.stats.totalOrders);
        setText('statTotalSales', fm(this.state.stats.totalSales));
        setText('statPaid', this.state.stats.totalOrders);
        setText('statUnpaid', 0);
        setText('statLowStock', this.state.stats.lowStockCount);
    },

    async loadDailySalesCards() {
        const container = this.el.dailySalesCards; if (!container) return;
        try {
            const invoices = await window.DB?.getInvoicesLight().catch(() => []);
            const sales = (invoices || []).filter(i => i.type === 'sale' && i.status !== 'voided');
            const days = [];
            for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); days.push(d.toISOString().split('T')[0]); }
            const daily = days.map(day => {
                const total = sales.filter(inv => inv.date === day).reduce((s, inv) => s + (parseFloat(inv.total) || 0), 0);
                return { day, total };
            });
            const fm = this._utils.formatMoney;
            container.innerHTML = daily.map(d => `<div class="daily-card"><div class="daily-date">${d.day.slice(5)}</div><div class="daily-amount">${fm(d.total)}</div></div>`).join('');
        } catch (e) { console.error(e); }
    },

    async loadTopProducts() {
        const listEl = this.el.topProductsList; if (!listEl) return;
        try {
            const invoices = await window.DB?.getInvoices().catch(() => []);
            const sales = (invoices || []).filter(i => i.type === 'sale' && i.status !== 'voided');
            const counts = {};
            for (const inv of sales) {
                const items = Array.isArray(inv.items) ? inv.items : [];
                for (const it of items) counts[it.productName] = (counts[it.productName] || 0) + (parseFloat(it.quantity) || 0);
            }
            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
            listEl.innerHTML = sorted.length ? sorted.map(([n, q]) => `<div class="product-simple-item"><span>${this._utils.escapeHTML(n)}</span><span>${q} قطعة</span></div>`).join('') : '<p style="color:var(--text-muted);">لا توجد بيانات</p>';
        } catch (e) { console.error(e); }
    },

    async loadRecentInvoices() {
        const container = this.el.recentInvoicesTable; if (!container) return;
        try {
            const invoices = await window.DB?.getInvoicesLight().catch(() => []);
            const recent = (invoices || []).sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date)).slice(0, 10);
            if (!recent.length) { container.innerHTML = '<p style="color:var(--text-muted);">لا توجد فواتير</p>'; return; }
            const fm = this._utils.formatMoney, esc = this._utils.escapeHTML;
            const statusLabels = { paid: 'مدفوعة', partial: 'جزئية', unpaid: 'غير مدفوعة', held: 'معلقة', voided: 'ملغاة' };
            let html = '<div class="table-responsive"><table><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th></tr></thead><tbody>';
            recent.forEach(inv => {
                html += `<tr><td>${inv.invoice_number || inv.id?.substring(0,8)}</td><td>${inv.date || '-'}</td><td>${esc(inv.customer_name || 'نقدي')}</td><td>${fm(inv.total)}</td><td><span class="badge ${inv.status || 'unpaid'}">${statusLabels[inv.status] || inv.status}</span></td></tr>`;
            });
            html += '</tbody></table></div>';
            container.innerHTML = html;
        } catch (e) { console.error(e); }
    }
};

window.Dashboard = Dashboard;
