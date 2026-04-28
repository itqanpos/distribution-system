'use strict';

// الأدوات المساعدة (موجودة ضمن Utils العامة، لكن نتأكد)
const U = window.Utils || {
    formatMoney: (v) => Number(v).toLocaleString('en-US', {minimumFractionDigits: 2}) + ' ج.م',
    escapeHTML: (s) => (String(s)).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[m]),
    today: () => new Date().toISOString().split('T')[0],
    round: (v, d=2) => Number(Math.round(v+'e'+d)+'e-'+d)
};

const Dashboard = {
    el: {},
    state: {
        ready: false,
        loading: false,
        stats: { salesToday:0, purchasesToday:0, customers:0, products:0, cash:0 },
        chartData: [],
        recentInvoices: [],
        recentPurchases: []
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.setDate();
        this.state.ready = !!(window.DB && window.supabase);
        
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadAllData();
    },

    cacheDOM() {
        const ids = ['menuToggle','sidebar','userDropdown','userProfileBtn','logoutBtn',
                     'currentDate','statsGrid','salesChart','recentInvoices','recentPurchases',
                     'loadingIndicator','chartError','toast'];
        ids.forEach(id => this.el[id] = document.getElementById(id));
    },

    bindEvents() {
        this.el.menuToggle?.addEventListener('click', () => this.el.sidebar.classList.toggle('open'));
        this.el.userProfileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.userDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            window.App ? App.logout() : location.href = './index.html';
        });
    },

    setDate() {
        if (this.el.currentDate) {
            this.el.currentDate.textContent = new Date().toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }
    },

    toggleLoading(show) {
        if (this.el.loadingIndicator) this.el.loadingIndicator.style.display = show ? 'block' : 'none';
        this.state.loading = show;
    },

    toast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._t);
        this._t = setTimeout(() => t.classList.remove('show'), 3000);
    },

    // -------- تحميل البيانات الرئيسية --------
    async loadAllData() {
        this.toggleLoading(true);
        try {
            await Promise.all([
                this.loadStats(),
                this.loadRecentInvoices(),
                this.loadRecentPurchases()
            ]);
            this.renderStats();
            this.renderTables();
            this.renderChart();
        } catch (e) {
            console.error(e);
            this.toast('تعذر تحميل بعض البيانات');
        } finally {
            this.toggleLoading(false);
        }
    },

    async loadStats() {
        // لو DB مش موجود، استخدم بيانات وهمية
        if (!this.state.ready) {
            this.state.stats = {
                salesToday: 12500, purchasesToday: 4530,
                customers: 45, products: 120, cash: 28000
            };
            this.state.chartData = this._dummyChart();
            return;
        }

        try {
            const today = U.today();
            const [invoices, purchases, parties, products, transactions, settings] = await Promise.all([
                DB.getInvoices().catch(() => []),
                DB.getPurchases().catch(() => []),
                DB.getParties('customer').catch(() => []),
                DB.getProducts().catch(() => []),
                DB.getTransactions().catch(() => []),
                DB.getSettings().catch(() => ({}))
            ]);

            const todayInvoices = invoices.filter(inv => inv.date === today && inv.type === 'sale');
            this.state.stats.salesToday = U.round(todayInvoices.reduce((s, inv) => s + (inv.total||0), 0));
            
            const todayPurchases = purchases.filter(p => p.date === today);
            this.state.stats.purchasesToday = U.round(todayPurchases.reduce((s, p) => s + (p.total||0), 0));
            
            this.state.stats.customers = parties.length;
            this.state.stats.products = products.length;
            
            const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount||0), 0);
            const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount||0), 0);
            this.state.stats.cash = U.round((settings.openingBalance||0) + income - expense);
            
            this.state.chartData = this._prepareChart(invoices);
        } catch (e) {
            console.warn('فشل تحميل الإحصائيات', e);
            // استخدم بيانات افتراضية عند الخطأ
            this.state.stats = { salesToday:0, purchasesToday:0, customers:0, products:0, cash:0 };
            this.state.chartData = [];
        }
    },

    async loadRecentInvoices() {
        if (!this.state.ready) {
            this.state.recentInvoices = [
                { invoice_number: '28-0005', customer_name: 'أحمد محمد', date: U.today(), total: 1500, status: 'paid' }
            ];
            return;
        }
        try {
            const invs = await DB.getInvoices().catch(() => []);
            this.state.recentInvoices = invs.filter(i => i.type === 'sale')
                .sort((a,b) => (b.date||'').localeCompare(a.date||''))
                .slice(0, 5);
        } catch (e) {
            this.state.recentInvoices = [];
        }
    },

    async loadRecentPurchases() {
        if (!this.state.ready) {
            this.state.recentPurchases = [
                { supplier_name: 'شركة الأمل', date: U.today(), total: 4500, status: 'paid' }
            ];
            return;
        }
        try {
            const pur = await DB.getPurchases().catch(() => []);
            this.state.recentPurchases = pur.sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,5);
        } catch (e) {
            this.state.recentPurchases = [];
        }
    },

    // -------- عرض البيانات --------
    renderStats() {
        if (!this.el.statsGrid) return;
        const s = this.state.stats;
        const cards = [
            { title: 'مبيعات اليوم', value: U.formatMoney(s.salesToday), icon: 'fa-chart-line', color: '#16a34a' },
            { title: 'مشتريات اليوم', value: U.formatMoney(s.purchasesToday), icon: 'fa-shopping-cart', color: '#dc2626' },
            { title: 'العملاء', value: s.customers, icon: 'fa-users', color: '#3b82f6' },
            { title: 'المنتجات', value: s.products, icon: 'fa-boxes', color: '#f59e0b' },
            { title: 'رصيد الصندوق', value: U.formatMoney(s.cash), icon: 'fa-cash-register', color: '#8b5cf6' }
        ];
        this.el.statsGrid.innerHTML = cards.map(c => `
            <div class="stat-card" style="border-right: 4px solid ${c.color};">
                <div class="stat-icon" style="color:${c.color};"><i class="fas ${c.icon}"></i></div>
                <div class="stat-content">
                    <div class="stat-title">${U.escapeHTML(c.title)}</div>
                    <div class="stat-value">${U.escapeHTML(String(c.value))}</div>
                </div>
            </div>
        `).join('');
    },

    renderTables() {
        // آخر الفواتير
        const invEl = this.el.recentInvoices;
        if (invEl) {
            if (!this.state.recentInvoices.length) {
                invEl.innerHTML = '<div class="empty">لا توجد فواتير</div>';
            } else {
                let rows = this.state.recentInvoices.map(inv => `
                    <tr>
                        <td>${U.escapeHTML(inv.invoice_number || '')}</td>
                        <td>${U.escapeHTML(inv.customer_name || 'نقدي')}</td>
                        <td>${new Date(inv.date).toLocaleDateString('ar-EG')}</td>
                        <td>${U.formatMoney(inv.total)}</td>
                        <td><span class="badge ${inv.status==='paid'?'badge-success':(inv.status==='held'?'badge-warning':'badge-danger')}">${inv.status==='paid'?'مدفوعة':(inv.status==='held'?'معلقة':'غير مدفوعة')}</span></td>
                    </tr>
                `).join('');
                invEl.innerHTML = `<table><thead><tr><th>الرقم</th><th>العميل</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`;
            }
        }

        // آخر المشتريات
        const purEl = this.el.recentPurchases;
        if (purEl) {
            if (!this.state.recentPurchases.length) {
                purEl.innerHTML = '<div class="empty">لا توجد مشتريات</div>';
            } else {
                let rows = this.state.recentPurchases.map(p => `
                    <tr>
                        <td>${U.escapeHTML(p.supplier_name || 'غير معروف')}</td>
                        <td>${new Date(p.date).toLocaleDateString('ar-EG')}</td>
                        <td>${U.formatMoney(p.total)}</td>
                        <td><span class="badge ${p.status==='paid'?'badge-success':'badge-danger'}">${p.status==='paid'?'مدفوعة':'غير مدفوعة'}</span></td>
                    </tr>
                `).join('');
                purEl.innerHTML = `<table><thead><tr><th>المورد</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`;
            }
        }
    },

    renderChart() {
        if (!this.el.salesChart || !this.state.chartData.length) {
            if (this.el.chartError) this.el.chartError.style.display = 'block';
            return;
        }
        if (this._chart) this._chart.destroy();
        const ctx = this.el.salesChart.getContext('2d');
        this._chart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: this.state.chartData.map(d => d.label),
                datasets: [{
                    label: 'المبيعات',
                    data: this.state.chartData.map(d => d.total),
                    backgroundColor: 'rgba(59,130,246,0.6)',
                    borderColor: '#3b82f6',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { callback: v => U.formatMoney(v) } } }
            }
        });
    },

    _prepareChart(invoices) {
        const days = [];
        const now = new Date();
        for (let i=29; i>=0; i--) {
            const d = new Date(now); d.setDate(d.getDate()-i);
            const ds = d.toISOString().split('T')[0];
            const total = invoices.filter(inv => inv.date===ds && inv.type==='sale')
                .reduce((s, inv) => s + (inv.total||0), 0);
            days.push({
                date: ds,
                label: d.toLocaleDateString('ar-EG', { day:'numeric', month:'short' }),
                total: U.round(total)
            });
        }
        return days;
    },

    _dummyChart() {
        const days = [], now = new Date();
        for (let i=29; i>=0; i--) {
            const d = new Date(now); d.setDate(d.getDate()-i);
            days.push({
                date: d.toISOString().split('T')[0],
                label: d.toLocaleDateString('ar-EG', { day:'numeric', month:'short' }),
                total: Math.floor(Math.random()*5000)+500
            });
        }
        return days;
    }
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
