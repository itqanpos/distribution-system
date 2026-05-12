/* =============================================
   dashboard.js - لوحة التحكم (Premium UI)
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
        loading: false,
        stats: { salesToday: 0, purchasesToday: 0, customers: 0, cash: 0 },
        recentInvoices: [],
        recentPurchases: []
    },

    async init() {
        this.cacheDOM();
        this.bindEvents();
        this.initSidebarUser();
        await this.waitForDB();

        if (window.App) {
            App.requireAuth();
            App.initUserInterface();
            this.updateSidebarUser();
        }
        this.loadAllData();
    },

    cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay',
            'moreMenuBtn', 'moreDropdown', 'refreshDataBtn', 'logoutBtn',
            'sidebarAvatar', 'sidebarUserName',
            'salesToday', 'purchasesToday', 'customersCount', 'cashBalance',
            'heroGreeting', 'heroSubtitle',
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
            this.loadAllData();
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

        window.addEventListener('online', () => {
            this.toast('تم استعادة الاتصال – جاري التحديث...');
            this.loadAllData();
        });
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !this.state.loading) this.loadAllData();
        });
    },

    initSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) {
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = user.avatar || 'U';
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
        }
    },

    updateSidebarUser() {
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
        this.state.loading = true;
        try {
            await Promise.all([this.loadStats(), this.loadRecentInvoices(), this.loadRecentPurchases()]);
        } catch (e) {
            console.error(e);
            this.toast('تعذر تحميل بعض البيانات');
        } finally {
            this.state.loading = false;
            this.updateUI();
        }
    },

    async loadStats() {
        try {
            const today = U.today();
            let invoices=[], purchases=[], parties=[], transactions=[], settings={};

            if (this.state.ready === true && window.App && window.App.DB) {
                const DB = window.App.DB;
                [invoices, purchases, parties, transactions, settings] = await Promise.all([
                    DB.getInvoices().catch(()=>[]), DB.getPurchases().catch(()=>[]),
                    DB.getParties('customer').catch(()=>[]), DB.getTransactions().catch(()=>[]),
                    DB.getSettings().catch(()=>({}))
                ]);
            } else if (window.localDB) {
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

        } catch (e) { console.error(e); }
    },

    async loadRecentInvoices() {
        try {
            let invs = [];
            if (this.state.ready === true && window.App && window.App.DB) invs = await window.App.DB.getInvoices().catch(()=>[]);
            else if (window.localDB) invs = await localDB.getAll('invoices') || [];
            this.state.recentInvoices = invs.filter(i => i.type === 'sale').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
        } catch (e) {}
    },

    async loadRecentPurchases() {
        try {
            let pur = [];
            if (this.state.ready === true && window.App && window.App.DB) pur = await window.App.DB.getPurchases().catch(()=>[]);
            else if (window.localDB) pur = await localDB.getAll('purchases') || [];
            this.state.recentPurchases = pur.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
        } catch (e) {}
    },

    updateUI() {
        const s = this.state.stats;
        if (this.el.salesToday) this.el.salesToday.textContent = U.formatMoney(s.salesToday);
        if (this.el.purchasesToday) this.el.purchasesToday.textContent = U.formatMoney(s.purchasesToday);
        if (this.el.customersCount) this.el.customersCount.textContent = s.customers;
        if (this.el.cashBalance) this.el.cashBalance.textContent = U.formatMoney(s.cash);

        // التحديثات النصية للاتجاهات (يمكن تطويرها لاحقاً)
        if (this.el.salesTrend) this.el.salesTrend.textContent = '↑ حتى اللحظة';
        if (this.el.purchasesTrend) this.el.purchasesTrend.textContent = '↑ حتى اللحظة';
        if (this.el.customersTrend) this.el.customersTrend.textContent = '+ إجمالي';
        if (this.el.cashTrend) this.el.cashTrend.textContent = '↓ الرصيد الحالي';
    }
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
