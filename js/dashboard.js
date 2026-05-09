/* =============================================
   dashboard.js - لوحة التحكم (مُحسَّنة)
   ============================================= */
'use strict';

console.log('✅ لوحة التحكم – بدء التحميل');

const U = {
    formatMoney: (v) => Number(v || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    escapeHTML: (s) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; },
    today: () => new Date().toISOString().split('T')[0],
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    dbReady: () => window.App && window.App.DB,
    hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
};

const Dashboard = {
    el: {},
    state: {
        ready: false,
        loading: false,
        stats: { salesToday: 0, purchasesToday: 0, customers: 0, products: 0, cash: 0 },
        chartData: [],
        recentInvoices: [],
        recentPurchases: [],
        topProducts: [],
        chartPeriod: 30
    },

    async init() {
        console.log('1️⃣ تهيئة Dashboard');
        this.cacheDOM();
        this.bindEvents();
        this.setDate();
        this.startDateUpdater();

        await this.waitForDB();
        console.log('هل DB جاهز؟', this.state.ready);

        if (window.App) {
            App.requireAuth();
            App.initUserInterface();
        }

        this.renderStats();
        this.renderTables();
        this.loadAllData();
    },

    cacheDOM() {
        const ids = ['menuToggle', 'sidebar', 'sidebarOverlay', 'userDropdown', 'userProfileBtn', 'logoutBtn',
                     'currentDate', 'quickStatsRow', 'statsGrid', 'salesChart', 'recentInvoices', 'recentPurchases',
                     'topProductsList', 'chartError', 'toast'];
        ids.forEach(id => this.el[id] = document.getElementById(id));
        console.log('2️⃣ DOM تم تخزينه');
    },

    bindEvents() {
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay?.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });
        this.el.userProfileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.userDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
                if (window.App) App.logout();
                else location.href = './index.html';
            }
        });

        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                this.el.sidebar.classList.remove('open');
                this.el.sidebarOverlay?.classList.remove('show');
            });
        });

        // أزرار الفترة الزمنية للمخطط
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('period-btn')) {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                this.state.chartPeriod = parseInt(e.target.dataset.period);
                this.renderChart();
            }
        });

        window.addEventListener('online', () => {
            this.toast('تم استعادة الاتصال – جاري التحديث...');
            this.loadAllData();
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !this.state.loading) {
                this.loadAllData();
            }
        });
    },

    // ... (دوال waitForDB, setDate, startDateUpdater, loadAllData, loadStats, loadRecentInvoices/Purchases, renderStats, renderTables تبقى كما هي) ...

    renderChart() {
        console.log('7️⃣ renderChart');
        if (!this.el.salesChart) return;
        if (!this.state.chartData.length) {
            if (this.el.chartError) {
                this.el.chartError.style.display = 'block';
                this.el.chartError.textContent = 'لا توجد بيانات كافية للرسم البياني';
            }
            return;
        }
        if (this.el.chartError) this.el.chartError.style.display = 'none';
        if (this._chart) this._chart.destroy();
        const ctx = this.el.salesChart.getContext('2d');
        
        // تصفية البيانات حسب الفترة المحددة
        let chartData = [...this.state.chartData];
        if (this.state.chartPeriod === 7) {
            chartData = chartData.slice(-7);
        }
        
        this._chart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: chartData.map(d => d.label),
                datasets: [{
                    label: 'المبيعات',
                    data: chartData.map(d => d.total),
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#3b82f6'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => U.formatMoney(v) } }
                }
            }
        });
        console.log('✔️ الرسم البياني تم');
    },

    // تحميل أفضل المنتجات مبيعاً
    async loadTopProducts() {
        try {
            const invoices = this.state.ready === true ? await (window.App?.DB.getInvoices() || []) : [];
            const salesInvoices = invoices.filter(i => i.type === 'sale');
            const productSales = {};
            salesInvoices.forEach(inv => {
                (inv.items || []).forEach(item => {
                    const name = item.productName;
                    if (!productSales[name]) productSales[name] = { name, quantity: 0, total: 0 };
                    productSales[name].quantity += item.quantity || 0;
                    productSales[name].total += (item.price || 0) * (item.quantity || 0);
                });
            });
            this.state.topProducts = Object.values(productSales).sort((a, b) => b.total - a.total).slice(0, 5);
            this.renderTopProducts();
        } catch (e) {
            console.warn('فشل تحميل أفضل المنتجات:', e);
        }
    },

    renderTopProducts() {
        if (!this.el.topProductsList) return;
        if (!this.state.topProducts.length) {
            this.el.topProductsList.innerHTML = '<div class="empty">لا توجد بيانات كافية</div>';
            return;
        }
        this.el.topProductsList.innerHTML = this.state.topProducts.map((p, idx) => `
            <div class="top-product-item">
                <div class="top-product-rank">${idx + 1}</div>
                <div class="top-product-info">
                    <div class="top-product-name">${U.escapeHTML(p.name)}</div>
                    <div class="top-product-sales">${p.quantity} وحدة مباعة</div>
                </div>
                <div class="top-product-total">${U.formatMoney(p.total)}</div>
            </div>
        `).join('');
    },

    // تجاوز loadAllData لإضافة أفضل المنتجات
    async loadAllData() {
        if (this.state.loading) return;
        console.log('3️⃣ بدء تحميل البيانات');
        this.toggleLoading(true);
        try {
            await Promise.all([
                this.loadStats(),
                this.loadRecentInvoices(),
                this.loadRecentPurchases(),
                this.loadTopProducts()
            ]);
            console.log('✅ كل البيانات تم تحميلها');
        } catch (e) {
            console.error('خطأ عام:', e);
            this.toast('تعذر تحميل بعض البيانات');
        } finally {
            this.toggleLoading(false);
            this.renderStats();
            this.renderTables();
            this.renderChart();
            this.renderTopProducts();
            console.log('4️⃣ تم عرض كل البيانات');
        }
    },

    // ... باقي الدوال كما هي (renderStats, renderTables, إلخ) مع الحفاظ على وظائفها ...
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
