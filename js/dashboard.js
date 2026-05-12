/* =============================================
   dashboard.js - لوحة التحكم (Premium UI + بيانات فورية)
   ============================================= */
'use strict';

const U = {
    formatMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    today: () => new Date().toISOString().split('T')[0],
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    dbReady: () => window.App && window.App.DB,
    hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
};

const Dashboard = {
    state: {
        ready: false,
        stats: { salesToday: 0, purchasesToday: 0, customers: 0, cash: 0 },
        recentInvoices: [],
        recentPurchases: [],
        products: [],
        allInvoices: []
    },

    async init() {
        this.cacheDOM();
        this.bindEvents();
        this.initSidebarUser();

        // تعيين الشفافية الافتراضية للبطاقات حتى اكتمال التحميل
        document.querySelectorAll('.premium-card').forEach(card => card.style.opacity = '0');

        // بدء التحميل السريع
        await this.loadDataInBackground();
    },

    cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay',
            'moreMenuBtn', 'moreDropdown', 'refreshDataBtn', 'logoutBtn',
            'sidebarAvatar', 'sidebarUserName',
            'salesToday', 'purchasesToday', 'customersCount', 'cashBalance',
            'heroGreeting', 'heroSubtitle',
            'activityTimeline',
            'toast'
        ];
        this.el = {};
        ids.forEach(id => this.el[id] = document.getElementById(id));
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
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                this.el.sidebar.classList.remove('open');
                this.el.sidebarOverlay?.classList.remove('show');
            });
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
            this.loadDataInBackground();
            this.toast('تم تحديث البيانات');
            this.el.moreDropdown?.classList.remove('show');
        });

        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
                if (window.App) App.logout();
                else location.href = './index.html';
            }
        });

        const periodSelect = document.querySelector('.modern-select');
        if (periodSelect) {
            periodSelect.addEventListener('change', () => this.renderChart());
        }

        window.addEventListener('online', () => {
            this.toast('تم استعادة الاتصال – جاري التحديث...');
            this.loadDataInBackground();
        });
    },

    initSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) {
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = user.avatar || 'U';
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
            if (this.el.heroGreeting) this.el.heroGreeting.textContent = `مرحباً، ${user.fullName?.split(' ')[0] || 'المدير'} 👋`;
        }
    },

    toast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._t);
        this._t = setTimeout(() => t.classList.remove('show'), 3000);
    },

    // ✅ تحميل جميع البيانات دفعة واحدة وإظهارها فوراً
    async loadDataInBackground() {
        // فحص سريع للقاعدة
        this.state.ready = U.dbReady();
        if (!this.state.ready) {
            this.state.ready = await this.quickDBReady();
        }
        
        // تحميل كل البيانات بالتوازي
        await Promise.all([
            this.loadStats(),
            this.loadRecentInvoices(),
            this.loadRecentPurchases(),
            this.loadProducts()
        ]);
        
        // بعد تحميل كل شيء، نُحدّث الواجهة دفعة واحدة
        this.updateStatsUI();
        this.updateInsights();
        this.updateActivityTimeline();
        this.renderChart();
        
        // إظهار البطاقات
        document.querySelectorAll('.premium-card').forEach(card => {
            card.style.opacity = '1';
            card.style.transition = 'opacity 0.2s ease';
        });
    },

    // ✅ فحص سريع للقاعدة (أقصى 300ms)
    quickDBReady() {
        return new Promise(resolve => {
            let attempts = 0;
            const check = setInterval(() => {
                if (U.dbReady()) { clearInterval(check); return resolve(true); }
                if (++attempts > 3) { clearInterval(check); return resolve(U.hasLocalDB()); }
            }, 100);
        });
    },

    async loadStats() {
        try {
            const today = U.today();
            let invoices=[], purchases=[], parties=[], transactions=[], settings={};

            if (this.state.ready && window.App?.DB) {
                const DB = window.App.DB;
                [invoices, purchases, parties, transactions, settings] = await Promise.all([
                    DB.getInvoices().catch(()=>[]), DB.getPurchases().catch(()=>[]),
                    DB.getParties('customer').catch(()=>[]), DB.getTransactions().catch(()=>[]),
                    DB.getSettings().catch(()=>({}))
                ]);
            } else if (U.hasLocalDB()) {
                invoices = await localDB.getAll('invoices') || [];
                purchases = await localDB.getAll('purchases') || [];
                const allParties = await localDB.getAll('parties') || [];
                parties = allParties.filter(p => p.type === 'customer');
                transactions = await localDB.getAll('transactions') || [];
                const s = await localDB.getById('settings', 'main');
                settings = s?.data || {};
            }

            this.state.stats.salesToday = U.round(invoices.filter(inv => inv.date === today && inv.type === 'sale').reduce((s, inv) => s + (inv.total || 0), 0));
            this.state.stats.purchasesToday = U.round(purchases.filter(p => p.date === today).reduce((s, p) => s + (p.total || 0), 0));
            this.state.stats.customers = parties.length;
            const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
            const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
            this.state.stats.cash = U.round((settings?.financial?.opening_cash_balance || 0) + income - expense);

            this.state.allInvoices = invoices.filter(inv => inv.type === 'sale');
        } catch (e) { console.error(e); }
    },

    async loadRecentInvoices() {
        try {
            let invs = [];
            if (this.state.ready && window.App?.DB) invs = await window.App.DB.getInvoices().catch(()=>[]);
            else if (U.hasLocalDB()) invs = await localDB.getAll('invoices') || [];
            this.state.recentInvoices = invs.filter(i => i.type === 'sale')
                .sort((a, b) => (b.invoice_number || '').localeCompare(a.invoice_number || ''))
                .slice(0, 5);
        } catch (e) {}
    },

    async loadRecentPurchases() {
        try {
            let pur = [];
            if (this.state.ready && window.App?.DB) pur = await window.App.DB.getPurchases().catch(()=>[]);
            else if (U.hasLocalDB()) pur = await localDB.getAll('purchases') || [];
            this.state.recentPurchases = pur.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
        } catch (e) {}
    },

    async loadProducts() {
        try {
            if (this.state.ready && window.App?.DB) this.state.products = await DB.getProducts().catch(()=>[]) || [];
            else if (U.hasLocalDB()) this.state.products = await localDB.getAll('products') || [];
        } catch(e) {}
    },

    // ========== تحديث واجهة البطاقات (دفعة واحدة) ==========
    updateStatsUI() {
        const s = this.state.stats;
        if (this.el.salesToday) this.el.salesToday.textContent = U.formatMoney(s.salesToday);
        if (this.el.purchasesToday) this.el.purchasesToday.textContent = U.formatMoney(s.purchasesToday);
        if (this.el.customersCount) this.el.customersCount.textContent = s.customers;
        if (this.el.cashBalance) this.el.cashBalance.textContent = U.formatMoney(s.cash);
        
        if (this.el.salesTrend) this.el.salesTrend.textContent = '↑ حتى اللحظة';
        if (this.el.purchasesTrend) this.el.purchasesTrend.textContent = '↑ حتى اللحظة';
        if (this.el.customersTrend) this.el.customersTrend.textContent = '+ إجمالي';
        if (this.el.cashTrend) this.el.cashTrend.textContent = '↓ الرصيد الحالي';
    },

    // ========== التنبيهات الذكية ==========
    updateInsights() {
        try {
            const products = this.state.products || [];
            const lowStock = products.filter(p => {
                const stock = p.units?.[0]?.stock || 0;
                const min = p.min_stock || 5;
                return stock > 0 && stock <= min;
            }).length;
            const lowStockText = document.querySelector('.insight-item.warning p');
            if (lowStockText) lowStockText.textContent = `${lowStock > 0 ? lowStock : 'لا توجد'} منتجات قاربت النفاد`;

            const unpaidInvoices = (this.state.recentInvoices || []).filter(inv => inv.remaining > 0).length;
            const unpaidText = document.querySelector('.insight-item.danger p');
            if (unpaidText) unpaidText.textContent = `يوجد ${unpaidInvoices} فاتورة غير مدفوعة`;
        } catch(e) {}
    },

    // ========== النشاط الأخير ==========
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
        const now = new Date();
        const date = new Date(dateStr);
        const diffMins = Math.floor((now - date) / 60000);
        if (diffMins < 1) return 'الآن';
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `منذ ${diffHours} ساعة`;
        const diffDays = Math.floor(diffHours / 24);
        return `منذ ${diffDays} يوم`;
    },

    // ========== الرسم البياني ==========
    renderChart() {
        const canvas = document.getElementById('salesChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const period = document.querySelector('.modern-select')?.value || '7';
        const days = parseInt(period) || 7;
        const today = new Date();
        const labels = [], data = [];

        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const total = (this.state.allInvoices || [])
                .filter(inv => inv.date === dateStr)
                .reduce((s, inv) => s + (inv.total || 0), 0);
            labels.push(d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }));
            data.push(total);
        }

        if (window.salesChartInstance) window.salesChartInstance.destroy();
        window.salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels, datasets: [{
                    label: 'المبيعات', data,
                    borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)',
                    fill: true, tension: 0.3
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    }
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
