/* =============================================
   dashboard.js - لوحة التحكم (Premium UI متوافق)
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
        recentPurchases: [],
        allInvoices: []
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

        // إخفاء البطاقات مؤقتاً (لعدم ظهور أصفار)
        document.querySelectorAll('.premium-card').forEach(c => c.style.opacity = '0');

        this.loadAllData();
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
            'salesToday', 'purchasesToday', 'customersCount', 'cashBalance'
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
            if (this.el.heroGreeting) this.el.heroGreeting.textContent = `مرحباً، ${user.fullName?.split(' ')[0] || 'المدير'} 👋`;
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
            this.updateStatsUI();
            this.updateTablesDisplay();
            this.renderChart();
            
            // إظهار البطاقات بعد التحديث
            document.querySelectorAll('.premium-card').forEach(c => {
                c.style.opacity = '1';
                c.style.transition = 'opacity 0.3s ease';
            });

            const idle = window.requestIdleCallback || ((cb) => setTimeout(cb, 50));
            idle(() => {
                this.updateInsights();
                this.updateActivityTimeline();
            });

            console.log('4️⃣ تم تحديث العرض');
        }
    },

    async loadStats() {
        try {
            const today = U.today();
            let invoices=[], purchases=[], parties=[], products=[], transactions=[], settings={};

            if (this.state.ready === true && window.App && window.App.DB) {
                const DB = window.App.DB;
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
                const s = await localDB.getById('settings', 'main');
                settings = s?.data || {};
            }

            // استخدام for...of للسرعة
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

            let income = 0, expense = 0;
            for (const t of transactions) {
                if (t.type === 'income') income += t.amount || 0;
                else expense += t.amount || 0;
            }
            const openingBalance = settings?.financial?.opening_cash_balance || 0;
            this.state.stats.cash = U.round(openingBalance + income - expense);

            this.state.stats.weeklySales = this.calculateWeeklySales(invoices);
            this.state.stats.monthlySales = this.calculateMonthlySales(invoices);
            this.state.allInvoices = invoices.filter(inv => inv.type === 'sale');

        } catch (e) { console.error('فشل loadStats:', e); }
    },

    calculateWeeklySales(invoices) {
        const today = new Date(); const weekAgo = new Date(today); weekAgo.setDate(today.getDate() - 7);
        const weekAgoStr = weekAgo.toISOString().split('T')[0]; const todayStr = U.today();
        let total = 0;
        for (const inv of invoices) { if (inv.type === 'sale' && inv.date >= weekAgoStr && inv.date <= todayStr) total += inv.total || 0; }
        return U.round(total);
    },

    calculateMonthlySales(invoices) {
        const today = new Date(); const monthAgo = new Date(today); monthAgo.setDate(today.getDate() - 30);
        const monthAgoStr = monthAgo.toISOString().split('T')[0]; const todayStr = U.today();
        let total = 0;
        for (const inv of invoices) { if (inv.type === 'sale' && inv.date >= monthAgoStr && inv.date <= todayStr) total += inv.total || 0; }
        return U.round(total);
    },

    async loadRecentInvoices() {
        try {
            let invs = [];
            if (this.state.ready === true && window.App && window.App.DB) invs = await window.App.DB.getInvoicesLight().catch(()=>[]);
            else if (window.localDB) invs = await localDB.getAll('invoices') || [];
            this.state.recentInvoices = invs.filter(i => i.type === 'sale').sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
        } catch (e) {}
    },

    async loadRecentPurchases() {
        try {
            let pur = [];
            if (this.state.ready === true && window.App && window.App.DB) pur = await window.App.DB.getPurchasesLight().catch(()=>[]);
            else if (window.localDB) pur = await localDB.getAll('purchases') || [];
            this.state.recentPurchases = pur.sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5);
        } catch (e) {}
    },

    // ✅ تحديث البطاقات المتوافقة مع Premium UI
    updateStatsUI() {
        const s = this.state.stats;
        // التحديث المباشر للبطاقات باستخدام المعرفات الفريدة
        if (this.el.salesToday) this.el.salesToday.textContent = U.formatMoney(s.salesToday);
        if (this.el.purchasesToday) this.el.purchasesToday.textContent = U.formatMoney(s.purchasesToday);
        if (this.el.customersCount) this.el.customersCount.textContent = s.customers;
        if (this.el.cashBalance) this.el.cashBalance.textContent = U.formatMoney(s.cash);

        // تحديث الاتجاهات
        const trendEls = document.querySelectorAll('.premium-card .card-bottom span');
        if (trendEls.length >= 4) {
            trendEls[0].textContent = '↑ حتى اللحظة';
            trendEls[1].textContent = '↑ حتى اللحظة';
            trendEls[2].textContent = `+ إجمالي`;
            trendEls[3].textContent = '↓ الرصيد الحالي';
        }

        // تحديث بطاقات المقارنة
        const comparisonValues = document.querySelectorAll('.comparison-value');
        if (comparisonValues.length >= 3) {
            const weekly = s.weeklySales || 0;
            const monthly = s.monthlySales || 0;
            const diff = monthly - weekly;
            comparisonValues[0].textContent = U.formatMoney(weekly);
            comparisonValues[1].textContent = U.formatMoney(monthly);
            comparisonValues[2].textContent = U.formatMoney(diff);
            comparisonValues[2].style.color = diff >= 0 ? 'var(--success)' : 'var(--danger)';
        }
    },

    updateTablesDisplay() {
        if (this.el.recentInvoices) {
            const invs = this.state.recentInvoices;
            if (!invs.length) {
                this.el.recentInvoices.innerHTML = '<div class="empty">لا توجد فواتير حديثة</div>';
            } else {
                let rows = invs.map(inv => `
                    <tr>
                        <td>${U.escapeHTML(inv.invoice_number || inv.id?.substring(0,8) || '—')}</td>
                        <td>${U.escapeHTML(inv.customer_name || 'نقدي')}</td>
                        <td>${new Date(inv.date).toLocaleDateString('ar-EG')}</td>
                        <td>${U.formatMoney(inv.total)}</td>
                        <td><span class="badge ${inv.status==='paid'?'badge-success':(inv.status==='held'?'badge-warning':'badge-danger')}">${inv.status==='paid'?'مدفوعة':(inv.status==='held'?'معلقة':'غير مدفوعة')}</span></td>
                    </tr>`).join('');
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
                        <td><span class="badge ${p.status==='paid'?'badge-success':'badge-danger'}">${p.status==='paid'?'مدفوعة':'غير مدفوعة'}</span></td>
                    </tr>`).join('');
                this.el.recentPurchases.innerHTML = `<table><thead><tr><th>المورد</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`;
            }
        }
    },

    renderChart() {
        const canvas = document.getElementById('salesChart');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const period = document.querySelector('.modern-select')?.value || '7';
        const days = parseInt(period) || 7;
        const today = new Date();
        const labels = [], data = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today); d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            let total = 0;
            for (const inv of this.state.allInvoices) { if (inv.date === dateStr) total += inv.total || 0; }
            labels.push(d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }));
            data.push(total);
        }
        if (window.salesChartInstance) window.salesChartInstance.destroy();
        window.salesChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'المبيعات', data, borderColor: '#2563eb', backgroundColor: 'rgba(37,99,235,0.1)', fill: true, tension: 0.3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    },

    updateInsights() {
        try {
            const lowStock = this.state.stats.products;
            const lowStockText = document.querySelector('.insight-item.warning p');
            if (lowStockText) lowStockText.textContent = `${lowStock > 0 ? lowStock : 'لا توجد'} منتجات قاربت النفاد`;

            const unpaidInvoices = this.state.recentInvoices.filter(inv => inv.remaining > 0).length;
            const unpaidText = document.querySelector('.insight-item.danger p');
            if (unpaidText) unpaidText.textContent = `يوجد ${unpaidInvoices} فاتورة غير مدفوعة`;
        } catch(e) {}
    },

    updateActivityTimeline() {
        const container = this.el.activityTimeline;
        if (!container) return;
        const activities = [];
        if (this.state.recentInvoices.length) {
            const inv = this.state.recentInvoices[0];
            activities.push({ text: `فاتورة جديدة للعميل ${inv.customer_name || 'نقدي'}`, time: this.timeAgo(inv.date), amount: U.formatMoney(inv.total) });
        }
        if (this.state.recentPurchases.length) {
            const pur = this.state.recentPurchases[0];
            activities.push({ text: `فاتورة شراء من ${pur.supplier_name || 'مورد'}`, time: this.timeAgo(pur.date), amount: U.formatMoney(pur.total) });
        }
        container.innerHTML = activities.length ? activities.map(a => `
            <div class="timeline-item"><div class="timeline-dot"></div><div class="timeline-content"><strong>${a.text}</strong><p>${a.time} - ${a.amount || ''}</p></div></div>
        `).join('') : '<p class="empty">لا توجد نشاطات حديثة</p>';
    },

    timeAgo(dateStr) {
        const now = new Date(); const date = new Date(dateStr);
        const diffMins = Math.floor((now - date) / 60000);
        if (diffMins < 1) return 'الآن';
        if (diffMins < 60) return `منذ ${diffMins} دقيقة`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `منذ ${diffHours} ساعة`;
        const diffDays = Math.floor(diffHours / 24);
        return `منذ ${diffDays} يوم`;
    }
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
