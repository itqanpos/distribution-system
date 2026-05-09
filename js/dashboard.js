/* =============================================
   dashboard.js - لوحة التحكم (بدون رسم بياني)
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
        recentInvoices: [],
        recentPurchases: []
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
                     'currentDate', 'quickStatsRow', 'statsGrid', 'recentInvoices', 'recentPurchases',
                     'toast'];
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

    toggleLoading(show) {
        const indicator = document.getElementById('loadingIndicator');
        if (indicator) indicator.style.display = show ? 'block' : 'none';
        this.state.loading = show;
    },

    async loadAllData() {
        if (this.state.loading) return;
        console.log('3️⃣ بدء تحميل البيانات');
        this.toggleLoading(true);
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
            this.toggleLoading(false);
            this.renderStats();
            this.renderTables();
            console.log('4️⃣ تم عرض كل البيانات');
        }
    },

    // دوال loadStats, loadRecentInvoices, loadRecentPurchases كما هي من السابق (بدون تغيير)

    // دالة renderStats لعرض البطاقات والإحصائيات السريعة
    renderStats() {
        console.log('5️⃣ renderStats');
        const s = this.state.stats;

        // بطاقات سريعة (quick stats)
        if (this.el.quickStatsRow) {
            this.el.quickStatsRow.innerHTML = `
                <div class="quick-stat">
                    <div class="stat-icon" style="background:#dbeafe; color:#2563eb;"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="stat-info"><div class="stat-value">${U.formatMoney(s.salesToday)}</div><div class="stat-label">مبيعات اليوم</div></div>
                </div>
                <div class="quick-stat">
                    <div class="stat-icon" style="background:#fee2e2; color:#ef4444;"><i class="fas fa-shopping-cart"></i></div>
                    <div class="stat-info"><div class="stat-value">${U.formatMoney(s.purchasesToday)}</div><div class="stat-label">مشتريات اليوم</div></div>
                </div>
                <div class="quick-stat">
                    <div class="stat-icon" style="background:#fef3c7; color:#f59e0b;"><i class="fas fa-wallet"></i></div>
                    <div class="stat-info"><div class="stat-value">${U.formatMoney(s.cash)}</div><div class="stat-label">رصيد الصندوق</div></div>
                </div>
                <div class="quick-stat">
                    <div class="stat-icon" style="background:#d1fae5; color:#10b981;"><i class="fas fa-users"></i></div>
                    <div class="stat-info"><div class="stat-value">${s.customers}</div><div class="stat-label">العملاء</div></div>
                </div>
            `;
        }

        // بطاقات التفاصيل (stats grid)
        if (this.el.statsGrid) {
            const cards = [
                { title: 'مبيعات اليوم', value: U.formatMoney(s.salesToday), icon: 'fa-chart-line', color: '#16a34a' },
                { title: 'مشتريات اليوم', value: U.formatMoney(s.purchasesToday), icon: 'fa-shopping-cart', color: '#dc2626' },
                { title: 'العملاء', value: s.customers, icon: 'fa-users', color: '#3b82f6' },
                { title: 'المنتجات', value: s.products, icon: 'fa-boxes', color: '#f59e0b' },
                { title: 'رصيد الصندوق', value: U.formatMoney(s.cash), icon: 'fa-cash-register', color: '#8b5cf6' }
            ];
            this.el.statsGrid.innerHTML = cards.map(c => `
                <div class="stat-card" style="border-right-color: ${c.color};">
                    <div class="stat-icon" style="color:${c.color};"><i class="fas ${c.icon}"></i></div>
                    <div class="stat-content">
                        <div class="stat-title">${U.escapeHTML(c.title)}</div>
                        <div class="stat-value">${U.escapeHTML(String(c.value))}</div>
                    </div>
                </div>
            `).join('');
        }
    },

    renderTables() {
        // ... نفس الكود السابق لعرض جداول الفواتير والمشتريات دون تغيير ...
    }
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
