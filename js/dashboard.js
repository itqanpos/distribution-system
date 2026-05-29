/* =============================================
   dashboard.js - لوحة التحكم (متوافقة مع النواة)
   ============================================= */
'use strict';

console.log('✅ لوحة التحكم – بدء التحميل');

const U = {
    formatMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    escapeHTML: (s) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; },
    today: () => new Date().toISOString().split('T')[0],
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    dbReady: () => !!(window.DB && window.supabase),
    hasLocalDB: () => !!(window.localDB && typeof window.localDB.getAll === 'function')
};

const Dashboard = {
    el: {},
    state: {
        ready: false,
        loading: false,
        stats: {
            salesToday: 0,
            purchasesToday: 0,
            customers: 0,
            products: 0,
            cash: 0,
            weeklySales: 0,
            monthlySales: 0
        },
        recentInvoices: [],
        recentPurchases: [],
        allInvoices: []
    },

    async init() {
        console.log('1️⃣ تهيئة Dashboard');
        this.cacheDOM();
        this.bindEvents();
        this.applyTheme();
        this.setDate();
        this.startDateUpdater();
        this.initSidebarUser();

        await this.waitForDB();
        console.log('هل DB جاهز؟', this.state.ready);

        if (window.App) {
            App.requireAuth();
            App.initUserInterface();
            this.updateSidebarUser();
        }

        document.querySelectorAll('.premium-card').forEach(c => c.style.opacity = '0');

        this.loadAllData();

        // ✅ تحديث دوري للبيانات كل 30 ثانية
        setInterval(() => {
            if (!this.state.loading) {
                this.loadAllData();
            }
        }, 30000);
    },

    cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay',
            'currentDate', 'statsGrid', 'recentInvoices', 'recentPurchases',
            'salesComparisonGrid', 'toast', 'logoutBtn',
            'sidebarAvatar', 'sidebarUserName',
            'moreMenuBtn', 'moreDropdown', 'refreshDataBtn',
            'heroGreeting', 'heroSubtitle',
            'activityTimeline',
            'salesToday', 'purchasesToday', 'customersCount', 'cashBalance',
            'chartPeriod', 'salesChart',
            'lowStockAlert', 'unpaidAlert', 'salesGrowthAlert'
        ];
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
        this.el.moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show');
        });
        this.el.refreshDataBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadAllData();
            window.Toast?.success('تم تحديث البيانات');
            this.el.moreDropdown?.classList.remove('show');
        });
        this.el.logoutBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            // استخدام confirm بسيط لتأكيد تسجيل الخروج
            if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
                if (window.App) App.logout();
                else location.href = './index.html';
            }
            this.el.moreDropdown?.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                this.el.sidebar.classList.remove('open');
                this.el.sidebarOverlay?.classList.remove('show');
            });
        });
        window.addEventListener('online', () => {
            window.Toast?.info('تم استعادة الاتصال – جاري التحديث...');
            this.loadAllData();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !this.state.loading) {
                this.loadAllData();
            }
        });
        // تغيير فترة الرسم البياني
        this.el.chartPeriod?.addEventListener('change', () => this.renderChart());
    },

    applyTheme() {
        const saved = localStorage.getItem('app_theme') || 'light';
        document.documentElement.setAttribute('data-theme', saved);
    },

    initSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) {
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
            const firstName = (user.fullName || user.email || 'مدير النظام').split(' ')[0];
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = firstName;
            if (this.el.heroGreeting) this.el.heroGreeting.textContent = `مرحباً، ${firstName} 👋`;
        }
    },

    updateSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) {
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
            const firstName = (user.fullName || user.email || 'مدير النظام').split(' ')[0];
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = firstName;
            if (this.el.heroGreeting) this.el.heroGreeting.textContent = `مرحباً، ${firstName} 👋`;
        }
    },

    setDate() {
        if (this.el.currentDate) {
            this.el.currentDate.textContent = new Date().toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
        }
    },

    startDateUpdater() {
        setInterval(() => {
            const newDate = new Date().toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            if (this.el.currentDate && this.el.currentDate.textContent !== newDate) {
                this.el.currentDate.textContent = newDate;
                this.loadAllData();
            }
        }, 60000);
    },

    waitForDB() {
        return new Promise(resolve => {
            if (U.dbReady()) { this.state.ready = true; return resolve(); }
            let attempts = 0;
            const check = setInterval(() => {
                if (U.dbReady()) { this.state.ready = true; clearInterval(check); resolve(); }
                if (++attempts > 50) { clearInterval(check); if (window.localDB) this.state.ready = 'local'; resolve(); }
            }, 100);
        });
    },

    async loadAllData() {
        if (this.state.loading) return;
        console.log('3️⃣ بدء تحميل البيانات');
        this.state.loading = true;
        try {
            await this.loadStats();
            console.log('✅ كل البيانات تم تحميلها');
        } catch (e) {
            console.error('خطأ عام:', e);
            window.Toast?.error('تعذر تحميل بعض البيانات');
        } finally {
            this.state.loading = false;
            this.updateStatsUI();
            this.renderChart();
            this.updateInsights();
            this.updateActivityTimeline();

            document.querySelectorAll('.premium-card').forEach(c => {
                c.style.opacity = '1';
                c.style.transition = 'opacity 0.3s ease';
            });

            console.log('4️⃣ تم تحديث العرض');
        }
    },

    async loadStats() {
        try {
            const today = U.today();
            let invoices=[], purchases=[], parties=[], products=[], transactions=[], settings={};

            if (this.state.ready === true && window.DB) {
                const DB = window.DB;
                [invoices, purchases, parties, products, transactions, settings] = await Promise.all([
                    DB.getInvoicesLight().catch(()=>[]),
                    DB.getPurchasesLight().catch(()=>[]),
                    DB.getParties('customer').catch(()=>[]),
                    DB.getProducts().catch(()=>[]),
                    DB.getTransactions().catch(()=>[]),
                    DB.getSettings().catch(()=>({}))
                ]);
            } else if (window.localDB) {
                invoices = await localDB.getAll('invoices') || [];
                purchases = await localDB.getAll('purchases') || [];
                const allParties = await localDB.getAll('parties') || [];
                parties = allParties.filter(p => p.type === 'customer');
                products = await localDB.getAll('products') || [];
                transactions = await localDB.getAll('transactions') || [];
                const s = await localDB.get('settings', 'main');
                settings = s?.data || {};
            }

            // تخزين محدود للفواتير لأداء أفضل (آخر 500 فاتورة مبيعات)
            const salesInvoices = invoices.filter(inv => inv.type === 'sale').slice(-500);
            this.state.allInvoices = salesInvoices;

            // حساب مبيعات ومشتريات اليوم
            let salesToday = 0, purchasesToday = 0;
            for (const inv of invoices) {
                if (inv.date === today && inv.type === 'sale') salesToday += inv.total || 0;
            }
            for (const p of purchases) {
                if (p.date === today) purchasesToday += p.total || 0;
            }
            this.state.stats.salesToday = U.round(salesToday);
            this.state.stats.purchasesToday = U.round(purchasesToday);
            this.state.stats.customers = parties.length;
            this.state.stats.products = products.length;

            // حساب رصيد الصندوق
            let income = 0, expense = 0;
            for (const t of transactions) {
                if (t.type === 'income') income += t.amount || 0;
                else expense += t.amount || 0;
            }
            const openingBalance = settings?.financial?.opening_cash_balance || 0;
            this.state.stats.cash = U.round(openingBalance + income - expense);

            // المبيعات الأسبوعية والشهرية
            this.state.stats.weeklySales = this.calculateSalesInPeriod(invoices, 7);
            this.state.stats.monthlySales = this.calculateSalesInPeriod(invoices, 30);

            // آخر الفواتير والمشتريات للجدول والنشاط
            this.state.recentInvoices = invoices
                .filter(i => i.type === 'sale')
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                .slice(0, 5);
            this.state.recentPurchases = purchases
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                .slice(0, 5);

        } catch (e) { console.error('فشل loadStats:', e); }
    },

    calculateSalesInPeriod(invoices, days) {
        const today = new Date();
        const start = new Date(today);
        start.setDate(today.getDate() - days);
        const startStr = start.toISOString().split('T')[0];
        const todayStr = U.today();
        let total = 0;
        for (const inv of invoices) {
            if (inv.type === 'sale' && inv.date >= startStr && inv.date <= todayStr)
                total += inv.total || 0;
        }
        return U.round(total);
    },

    updateStatsUI() {
        const s = this.state.stats;
        if (this.el.salesToday) this.el.salesToday.textContent = U.formatMoney(s.salesToday);
        if (this.el.purchasesToday) this.el.purchasesToday.textContent = U.formatMoney(s.purchasesToday);
        if (this.el.customersCount) this.el.customersCount.textContent = s.customers;
        if (this.el.cashBalance) this.el.cashBalance.textContent = U.formatMoney(s.cash);

        // تحديث الاتجاهات (يمكن تخصيصها لاحقاً بحسابات حقيقية)
        const trendEls = document.querySelectorAll('.premium-card .card-bottom span');
        if (trendEls.length >= 4) {
            trendEls[0].textContent = '↑ حتى اللحظة';
            trendEls[1].textContent = '↑ حتى اللحظة';
            trendEls[2].textContent = `+ إجمالي`;
            trendEls[3].textContent = '↓ الرصيد الحالي';
        }
    },

    renderChart() {
        const canvas = this.el.salesChart;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const period = this.el.chartPeriod?.value || '7';
        const days = parseInt(period) || 7;
        const today = new Date();
        const labels = [], data = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            let total = 0;
            for (const inv of this.state.allInvoices) {
                if (inv.date === dateStr) total += inv.total || 0;
            }
            labels.push(d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }));
            data.push(total);
        }
        if (window.salesChartInstance) window.salesChartInstance.destroy();
        window.salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'المبيعات',
                    data,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37,99,235,0.1)',
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    },

    updateInsights() {
        // تنبيهات حقيقية
        const lowStockCount = this.state.stats.products; // يمكن تحسينها بفحص مخزون حقيقي
        if (this.el.lowStockAlert) {
            this.el.lowStockAlert.textContent = lowStockCount > 0 ? `${lowStockCount} منتجات` : 'لا توجد منتجات';
        }
        const unpaidCount = this.state.allInvoices.filter(inv => inv.remaining > 0).length;
        if (this.el.unpaidAlert) {
            this.el.unpaidAlert.textContent = `${unpaidCount} فاتورة غير مدفوعة`;
        }
        if (this.el.salesGrowthAlert) {
            const weekly = this.state.stats.weeklySales || 0;
            const monthly = this.state.stats.monthlySales || 0;
            const growth = monthly - weekly;
            this.el.salesGrowthAlert.textContent = growth >= 0 ? 'نمو ملحوظ' : 'انخفاض طفيف';
        }
    },

    updateActivityTimeline() {
        const container = this.el.activityTimeline;
        if (!container) return;

        const activities = [];
        if (this.state.recentInvoices.length) {
            const inv = this.state.recentInvoices[0];
            activities.push({
                text: `فاتورة جديدة للعميل ${inv.customer_name || 'نقدي'}`,
                time: this.timeAgo(inv.date),
                amount: U.formatMoney(inv.total)
            });
        }
        if (this.state.recentPurchases.length) {
            const pur = this.state.recentPurchases[0];
            activities.push({
                text: `فاتورة شراء من ${pur.supplier_name || 'مورد'}`,
                time: this.timeAgo(pur.date),
                amount: U.formatMoney(pur.total)
            });
        }

        container.innerHTML = activities.length ? activities.map(a => `
            <div class="timeline-item">
                <div class="timeline-dot"></div>
                <div class="timeline-content">
                    <strong>${a.text}</strong>
                    <p>${a.time} - ${a.amount || ''}</p>
                </div>
            </div>
        `).join('') : '<p class="empty">لا توجد نشاطات حديثة</p>';
    },

    timeAgo(dateStr) {
        if (!dateStr) return '—';
        const now = new Date();
        const date = new Date(dateStr);
        // إذا كان التاريخ بدون وقت نعتبره منتصف الليل
        if (dateStr.length === 10) date.setHours(0, 0, 0, 0);
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return 'الآن';
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `منذ ${diffHours} ساعة`;
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays < 30) return `منذ ${diffDays} يوم`;
        const diffMonths = Math.floor(diffDays / 30);
        return `منذ ${diffMonths} شهر`;
    }
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
