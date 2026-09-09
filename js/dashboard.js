/* =============================================
   dashboard.js - لوحة التحكم
   ============================================= */
'use strict';

const Dashboard = {
    state: {
        currentUser: null,
        db: false,
        chart: null,
        todaySales: 0,
        todayInvoices: 0,
        totalProducts: 0,
        totalCustomers: 0,
        recentInvoices: [],
        salesLast7Days: []
    },
    el: {},

    async init() {
        this._cacheDOM();
        this._bind();
        this._connStatus();
        this._setDate();
        await this._loadUser();
        await this._loadStats();
        await this._loadRecentInvoices();
        await this._loadSalesChart();
        this._renderStats();
        this._renderRecentInvoices();
        this._renderChart();
    },

    _cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay', 'moreMenuBtn', 'moreDropdown',
            'logoutBtn', 'sidebarAvatar', 'sidebarUserName',
            'dashboardDate', 'todaySales', 'todayInvoices', 'totalProducts', 'totalCustomers',
            'recentInvoicesList', 'salesChart'
        ];
        ids.forEach(id => { const el = document.getElementById(id); if (el) this.el[id] = el; });
    },

    _bind() {
        const on = (id, ev, fn) => { if (this.el[id]) this.el[id].addEventListener(ev, fn); };

        on('menuToggle', 'click', () => {
            this.el.sidebar?.classList.toggle('open');
            this.el.sidebarOverlay?.classList.toggle('show');
        });
        on('sidebarOverlay', 'click', () => {
            this.el.sidebar?.classList.remove('open');
            this.el.sidebarOverlay?.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(l => l.addEventListener('click', () => {
            this.el.sidebar?.classList.remove('open');
            this.el.sidebarOverlay?.classList.remove('show');
        }));

        on('moreMenuBtn', 'click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show');
        });
        on('logoutBtn', 'click', (e) => {
            e.preventDefault();
            if (confirm('هل أنت متأكد؟')) App.logout();
        });

        window.addEventListener('online', () => this._connStatus());
        window.addEventListener('offline', () => this._connStatus());
    },

    _connStatus() {
        const n = document.getElementById('mainNavbar');
        if (n) n.classList.toggle('offline', !navigator.onLine);
        document.body.classList.toggle('offline', !navigator.onLine);
    },

    _setDate() {
        if (this.el.dashboardDate) {
            const today = new Date();
            const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            this.el.dashboardDate.textContent = today.toLocaleDateString('ar-EG', options);
        }
    },

    async _loadUser() {
        if (window.App?.getCurrentUser) {
            try {
                const u = await window.App.getCurrentUser();
                this.state.currentUser = u;
                if (u) {
                    if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (u.fullName || 'U')[0].toUpperCase();
                    if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = u.fullName || u.email || 'مدير';
                }
            } catch (e) { /* silent */ }
        }
    },

    async _loadStats() {
        this.state.db = !!(window.DB && window.supabaseClient);
        try {
            if (this.state.db) {
                // جلب الإحصائيات من Supabase
                const today = new Date().toISOString().split('T')[0];
                // 1. مبيعات اليوم
                const { data: todayInvoices, error: invError } = await window.supabaseClient
                    .from('invoices')
                    .select('id, total, status, date')
                    .eq('type', 'sale')
                    .eq('date', today)
                    .neq('status', 'voided');

                if (!invError && todayInvoices) {
                    this.state.todayInvoices = todayInvoices.length;
                    this.state.todaySales = todayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
                }

                // 2. عدد المنتجات
                const { count: productCount, error: prodError } = await window.supabaseClient
                    .from('products')
                    .select('*', { count: 'exact', head: true });

                if (!prodError) this.state.totalProducts = productCount || 0;

                // 3. عدد العملاء
                const { count: customerCount, error: custError } = await window.supabaseClient
                    .from('parties')
                    .select('*', { count: 'exact', head: true })
                    .eq('type', 'customer');

                if (!custError) this.state.totalCustomers = customerCount || 0;

                // 4. مبيعات آخر 7 أيام
                const sevenDaysAgo = new Date();
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
                const startDate = sevenDaysAgo.toISOString().split('T')[0];

                const { data: weekInvoices, error: weekError } = await window.supabaseClient
                    .from('invoices')
                    .select('date, total')
                    .eq('type', 'sale')
                    .neq('status', 'voided')
                    .gte('date', startDate)
                    .lte('date', today);

                if (!weekError && weekInvoices) {
                    this.state.salesLast7Days = this._prepareChartData(weekInvoices, startDate, today);
                }

                // 5. أحدث الفواتير
                const { data: recentInvoices, error: recentError } = await window.supabaseClient
                    .from('invoices')
                    .select('id, invoice_number, customer_name, total, status, date')
                    .eq('type', 'sale')
                    .neq('status', 'voided')
                    .order('date', { ascending: false })
                    .limit(5);

                if (!recentError && recentInvoices) {
                    this.state.recentInvoices = recentInvoices;
                }

            } else if (window.localDB?.ready) {
                // LocalDB fallback
                const invoices = await localDB.getAll('invoices') || [];
                const products = await localDB.getAll('products') || [];
                const parties = await localDB.getAll('parties') || [];

                const today = new Date().toISOString().split('T')[0];
                const todayInvs = invoices.filter(i => i.type === 'sale' && i.date === today && i.status !== 'voided');
                this.state.todayInvoices = todayInvs.length;
                this.state.todaySales = todayInvs.reduce((sum, i) => sum + (i.total || 0), 0);

                this.state.totalProducts = products.length;
                this.state.totalCustomers = parties.filter(p => p.type === 'customer').length;

                this.state.recentInvoices = invoices
                    .filter(i => i.type === 'sale' && i.status !== 'voided')
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .slice(0, 5);

                // مبيعات آخر 7 أيام
                const days = [];
                for (let i = 6; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const dateStr = d.toISOString().split('T')[0];
                    const dayTotal = invoices
                        .filter(inv => inv.type === 'sale' && inv.date === dateStr && inv.status !== 'voided')
                        .reduce((sum, inv) => sum + (inv.total || 0), 0);
                    days.push({ date: dateStr, total: dayTotal });
                }
                this.state.salesLast7Days = days;
            }
        } catch (e) {
            console.error('فشل تحميل الإحصائيات:', e);
            // استخدام بيانات افتراضية عند الخطأ
            this._useDemoData();
        }
    },

    _prepareChartData(invoices, startDate, endDate) {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            const dayTotal = invoices
                .filter(inv => inv.date === dateStr)
                .reduce((sum, inv) => sum + (inv.total || 0), 0);
            days.push({ date: dateStr, total: dayTotal });
        }
        return days;
    },

    _useDemoData() {
        this.state.todaySales = 15250.75;
        this.state.todayInvoices = 12;
        this.state.totalProducts = 142;
        this.state.totalCustomers = 68;
        this.state.salesLast7Days = [
            { date: '2026-09-02', total: 1200 },
            { date: '2026-09-03', total: 1800 },
            { date: '2026-09-04', total: 950 },
            { date: '2026-09-05', total: 2200 },
            { date: '2026-09-06', total: 1750 },
            { date: '2026-09-07', total: 3000 },
            { date: '2026-09-08', total: 15250.75 }
        ];
        this.state.recentInvoices = [
            { invoice_number: 'INV-001', customer_name: 'أحمد محمد', total: 1250.00, status: 'paid' },
            { invoice_number: 'INV-002', customer_name: 'نقدي', total: 540.50, status: 'paid' },
            { invoice_number: 'INV-003', customer_name: 'سارة علي', total: 3200.00, status: 'credit' },
            { invoice_number: 'INV-004', customer_name: 'نقدي', total: 180.00, status: 'paid' },
            { invoice_number: 'INV-005', customer_name: 'محمد خالد', total: 950.75, status: 'partial' }
        ];
    },

    _renderStats() {
        if (this.el.todaySales) this.el.todaySales.textContent = this._formatMoney(this.state.todaySales);
        if (this.el.todayInvoices) this.el.todayInvoices.textContent = this.state.todayInvoices;
        if (this.el.totalProducts) this.el.totalProducts.textContent = this.state.totalProducts;
        if (this.el.totalCustomers) this.el.totalCustomers.textContent = this.state.totalCustomers;
    },

    _renderRecentInvoices() {
        const container = this.el.recentInvoicesList;
        if (!container) return;

        if (!this.state.recentInvoices.length) {
            container.innerHTML = '<div class="empty-message">لا توجد فواتير حديثة</div>';
            return;
        }

        container.innerHTML = '';
        this.state.recentInvoices.forEach(inv => {
            const item = document.createElement('div');
            item.className = 'invoice-item';
            const statusClass = inv.status === 'paid' ? 'status-paid' : inv.status === 'credit' ? 'status-credit' : 'status-partial';
            const statusText = inv.status === 'paid' ? 'مدفوعة' : inv.status === 'credit' ? 'آجلة' : 'جزئية';
            item.innerHTML = `
                <div class="info">
                    <strong>${this._escape(inv.invoice_number || inv.id?.substring(0, 8))}</strong>
                    <span>${this._escape(inv.customer_name || 'نقدي')}</span>
                </div>
                <div class="amount">${this._formatMoney(inv.total)}</div>
                <div class="status ${statusClass}">${statusText}</div>
            `;
            container.appendChild(item);
        });
    },

    _renderChart() {
        const canvas = this.el.salesChart;
        if (!canvas || typeof Chart === 'undefined') return;

        // إلغاء الرسم السابق إذا وجد
        if (this.state.chart) {
            this.state.chart.destroy();
        }

        const labels = this.state.salesLast7Days.map(d => {
            const date = new Date(d.date);
            return date.toLocaleDateString('ar-EG', { weekday: 'short' });
        });
        const data = this.state.salesLast7Days.map(d => d.total);

        const ctx = canvas.getContext('2d');
        this.state.chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'المبيعات (ج.م)',
                    data: data,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.4,
                    fill: true,
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 5,
                    pointHoverRadius: 7
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        rtl: true,
                        labels: {
                            font: {
                                family: 'Cairo',
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        rtl: true,
                        callbacks: {
                            label: function(context) {
                                return 'المبيعات: ' + context.parsed.y.toFixed(2) + ' ج.م';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            font: {
                                family: 'Cairo'
                            }
                        }
                    },
                    x: {
                        ticks: {
                            font: {
                                family: 'Cairo'
                            }
                        }
                    }
                }
            }
        });
    },

    _formatMoney(value) {
        return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    },

    _escape(s) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(s));
        return div.innerHTML;
    }
};

// التهيئة التلقائية
(async function autoInit() {
    const waitForCore = () => new Promise((resolve, reject) => {
        const start = Date.now();
        const check = () => {
            if (window.App && window.DB) resolve();
            else if (Date.now() - start > 10000) reject(new Error('Core not loaded'));
            else setTimeout(check, 200);
        };
        check();
    });
    try {
        await waitForCore();
        await Dashboard.init();
        const loadingBar = document.getElementById('loading-bar');
        if (loadingBar) {
            loadingBar.style.width = '100%';
            setTimeout(() => { loadingBar.style.width = '0%'; }, 300);
        }
    } catch (e) {
        console.error('Dashboard init failed:', e);
        const loadingBar = document.getElementById('loading-bar');
        if (loadingBar) loadingBar.style.background = 'var(--danger)';
    }
})();
