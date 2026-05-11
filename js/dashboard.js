/* =============================================
   dashboard.js - لوحة التحكم (إصدار نهائي كامل)
   ============================================= */
'use strict';

console.log('✅ لوحة التحكم – بدء التحميل');

const U = {
    formatMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
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
        recentPurchases: []
    },

    async init() {
        console.log('1️⃣ تهيئة Dashboard');
        this.cacheDOM();
        this.bindEvents();
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

        this.loadAllData();
    },

    cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay',
            'currentDate', 'statsGrid', 'recentInvoices', 'recentPurchases',
            'salesComparisonGrid', 'toast', 'logoutBtn',
            'sidebarAvatar', 'sidebarUserName', 'sidebarLoginTime'
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

    initSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) {
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = user.avatar || 'U';
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
            if (this.el.sidebarLoginTime) this.el.sidebarLoginTime.textContent = user.loginTime || 'اليوم';
        }
    },

    updateSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) {
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = user.avatar || 'U';
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
            if (this.el.sidebarLoginTime) this.el.sidebarLoginTime.textContent = user.loginTime || 'اليوم';
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
            if (U.dbReady()) {
                this.state.ready = true;
                return resolve();
            }
            let attempts = 0;
            const check = setInterval(() => {
                if (U.dbReady()) {
                    this.state.ready = true;
                    clearInterval(check);
                    resolve();
                }
                if (++attempts > 50) {
                    clearInterval(check);
                    console.warn('لم يتم تحميل DB، سيتم استخدام IndexedDB');
                    if (window.localDB) this.state.ready = 'local';
                    resolve();
                }
            }, 100);
        });
    },

    async loadAllData() {
        if (this.state.loading) return;
        console.log('3️⃣ بدء تحميل البيانات');
        this.state.loading = true;
        try {
            await Promise.all([
                this.loadStats(),
                this.loadRecentInvoices(),
                this.loadRecentPurchases()
            ]);
            console.log('✅ كل البيانات تم تحميلها');
        } catch (e) {
            console.error('خطأ عام:', e);
            this.toast('تعذر تحميل بعض البيانات');
        } finally {
            this.state.loading = false;
            this.updateStatsDisplay();
            this.updateTablesDisplay();
            console.log('4️⃣ تم تحديث العرض');
        }
    },

    async loadStats() {
        try {
            const today = U.today();
            let invoices = [], purchases = [], parties = [], products = [], transactions = [], settings = {};

            if (this.state.ready === true && window.App && window.App.DB) {
                const DB = window.App.DB;
                [invoices, purchases, parties, products, transactions, settings] = await Promise.all([
                    DB.getInvoices().catch(() => []),
                    DB.getPurchases().catch(() => []),
                    DB.getParties('customer').catch(() => []),
                    DB.getProducts().catch(() => []),
                    DB.getTransactions().catch(() => []),
                    DB.getSettings().catch(() => ({}))
                ]);
            } else if (window.localDB) {
                invoices = await localDB.getAll('invoices') || [];
                purchases = await localDB.getAll('purchases') || [];
                const allParties = await localDB.getAll('parties') || [];
                parties = allParties.filter(p => p.type === 'customer');
                products = await localDB.getAll('products') || [];
                transactions = await localDB.getAll('transactions') || [];
                const s = await localDB.getById('settings', 'main');
                settings = s?.data || {};
            }

            const todayInvoices = invoices.filter(inv => inv.date === today && inv.type === 'sale');
            this.state.stats.salesToday = U.round(todayInvoices.reduce((s, inv) => s + (inv.total || 0), 0));

            const todayPurchases = purchases.filter(p => p.date === today);
            this.state.stats.purchasesToday = U.round(todayPurchases.reduce((s, p) => s + (p.total || 0), 0));

            this.state.stats.customers = parties.length;
            this.state.stats.products = products.length;

            const income = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
            const expense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
            const openingBalance = settings?.financial?.opening_cash_balance || 0;
            this.state.stats.cash = U.round(openingBalance + income - expense);

            this.state.stats.weeklySales = this.calculateWeeklySales(invoices);
            this.state.stats.monthlySales = this.calculateMonthlySales(invoices);

        } catch (e) {
            console.error('فشل loadStats:', e);
        }
    },

    calculateWeeklySales(invoices) {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(today.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0];
        const todayStr = U.today();
        return U.round(
            invoices
                .filter(inv => inv.type === 'sale' && inv.date >= weekAgoStr && inv.date <= todayStr)
                .reduce((s, inv) => s + (inv.total || 0), 0)
        );
    },

    calculateMonthlySales(invoices) {
        const today = new Date();
        const monthAgo = new Date(today);
        monthAgo.setDate(today.getDate() - 30);
        const monthAgoStr = monthAgo.toISOString().split('T')[0];
        const todayStr = U.today();
        return U.round(
            invoices
                .filter(inv => inv.type === 'sale' && inv.date >= monthAgoStr && inv.date <= todayStr)
                .reduce((s, inv) => s + (inv.total || 0), 0)
        );
    },

    async loadRecentInvoices() {
        try {
            let invs = [];
            if (this.state.ready === true && window.App && window.App.DB) {
                invs = await window.App.DB.getInvoices().catch(() => []);
            } else if (window.localDB) {
                invs = await localDB.getAll('invoices') || [];
            }
            this.state.recentInvoices = invs
                .filter(i => i.type === 'sale')
                .sort((a, b) => {
                    const aNum = parseInt((a.invoice_number || '').split('-').pop()) || 0;
                    const bNum = parseInt((b.invoice_number || '').split('-').pop()) || 0;
                    return bNum - aNum;
                })
                .slice(0, 5);
        } catch (e) {}
    },

    async loadRecentPurchases() {
        try {
            let pur = [];
            if (this.state.ready === true && window.App && window.App.DB) {
                pur = await window.App.DB.getPurchases().catch(() => []);
            } else if (window.localDB) {
                pur = await localDB.getAll('purchases') || [];
            }
            this.state.recentPurchases = pur
                .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                .slice(0, 5);
        } catch (e) {}
    },

    updateStatsDisplay() {
        console.log('5️⃣ تحديث بطاقات الإحصائيات');
        const s = this.state.stats;

        if (this.el.statsGrid) {
            const statCards = this.el.statsGrid.querySelectorAll('.stat-card .stat-value');
            if (statCards.length >= 4) {
                statCards[0].textContent = U.formatMoney(s.salesToday);
                statCards[1].textContent = U.formatMoney(s.purchasesToday);
                statCards[2].textContent = s.customers;
                statCards[3].textContent = U.formatMoney(s.cash);
            }
        }

        if (this.el.salesComparisonGrid) {
            const weeklySales = s.weeklySales || 0;
            const monthlySales = s.monthlySales || 0;
            const diff = monthlySales - weeklySales;
            const comparisonValues = this.el.salesComparisonGrid.querySelectorAll('.comparison-value');
            if (comparisonValues.length >= 3) {
                comparisonValues[0].textContent = U.formatMoney(weeklySales);
                comparisonValues[1].textContent = U.formatMoney(monthlySales);
                comparisonValues[2].textContent = U.formatMoney(diff);
                comparisonValues[2].style.color = diff >= 0 ? 'var(--secondary)' : 'var(--danger)';
            }
        }
    },

    updateTablesDisplay() {
        console.log('6️⃣ تحديث جداول النشاط الأخير');

        if (this.el.recentInvoices) {
            const invs = this.state.recentInvoices;
            if (!invs.length) {
                this.el.recentInvoices.innerHTML = '<div class="empty">لا توجد فواتير حديثة</div>';
            } else {
                let rows = invs.map(inv => {
                    const invNumber = inv.invoice_number || inv.id?.substring(0, 8) || '—';
                    return `
                        <tr>
                            <td>${U.escapeHTML(invNumber)}</td>
                            <td>${U.escapeHTML(inv.customer_name || 'نقدي')}</td>
                            <td>${new Date(inv.date).toLocaleDateString('ar-EG')}</td>
                            <td>${U.formatMoney(inv.total)}</td>
                            <td><span class="badge ${inv.status === 'paid' ? 'badge-success' : (inv.status === 'held' ? 'badge-warning' : 'badge-danger')}">${inv.status === 'paid' ? 'مدفوعة' : (inv.status === 'held' ? 'معلقة' : 'غير مدفوعة')}</span></td>
                        </tr>
                    `;
                }).join('');
                this.el.recentInvoices.innerHTML = `<table><thead><tr><th>الرقم</th><th>العميل</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`;
            }
        }

        if (this.el.recentPurchases) {
            const pur = this.state.recentPurchases;
            if (!pur.length) {
                this.el.recentPurchases.innerHTML = '<div class="empty">لا توجد مشتريات حديثة</div>';
            } else {
                let rows = pur.map(p => `
                    <tr>
                        <td>${U.escapeHTML(p.supplier_name || 'غير معروف')}</td>
                        <td>${new Date(p.date).toLocaleDateString('ar-EG')}</td>
                        <td>${U.formatMoney(p.total)}</td>
                        <td><span class="badge ${p.status === 'paid' ? 'badge-success' : 'badge-danger'}">${p.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة'}</span></td>
                    </tr>
                `).join('');
                this.el.recentPurchases.innerHTML = `<table><thead><tr><th>المورد</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`;
            }
        }
    }
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
