/* =============================================
   dashboard.js - لوحة التحكم (مستقل) - مُحسَّن
   ============================================= */
'use strict';

console.log('✅ لوحة التحكم – بدء التحميل');

// الأدوات المساعدة
const U = {
    formatMoney: (v) => Number(v || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2 }) + ' ج.م',
    escapeHTML: (s) => { const d = document.createElement('div'); d.appendChild(document.createTextNode(s)); return d.innerHTML; },
    today: () => new Date().toISOString().split('T')[0],
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    dbReady: () => window.App && window.App.DB // التحقق من وجود واجهة DB موحدة
};

const Dashboard = {
    el: {},
    state: {
        ready: false,
        loading: false,
        stats: { salesToday: 0, purchasesToday: 0, customers: 0, products: 0, cash: 0 },
        chartData: [],
        recentInvoices: [],
        recentPurchases: []
    },

    async init() {
        console.log('1️⃣ تهيئة Dashboard');
        this.cacheDOM();
        this.bindEvents();
        this.setDate();
        this.startDateUpdater(); // تحديث التاريخ تلقائياً

        // انتظار تجهيز DB (باستخدام الواجهة الموحدة)
        await this.waitForDB();
        console.log('هل DB جاهز؟', this.state.ready);

        if (window.App) {
            App.requireAuth();
            App.initUserInterface();
        }

        // عرض الهياكل الأساسية فوراً
        this.renderStats();
        this.renderTables();
        // تحميل البيانات
        this.loadAllData();
    },

    cacheDOM() {
        const ids = ['menuToggle', 'sidebar', 'userDropdown', 'userProfileBtn', 'logoutBtn',
                     'currentDate', 'statsGrid', 'salesChart', 'recentInvoices', 'recentPurchases',
                     'loadingIndicator', 'chartError', 'toast'];
        ids.forEach(id => this.el[id] = document.getElementById(id));
        console.log('2️⃣ DOM تم تخزينه');
    },

    bindEvents() {
        // زر القائمة الجانبية
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
        });

        // قائمة المستخدم المنسدلة
        this.el.userProfileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.userDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));

        // تسجيل الخروج مع تأكيد
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
                if (window.App) App.logout();
                else location.href = './index.html';
            }
        });

        // إغلاق القائمة الجانبية عند النقر على أي رابط
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                this.el.sidebar.classList.remove('open');
            });
        });

        // تحديث تلقائي عند استعادة الاتصال (مع منع التكرار)
        window.addEventListener('online', () => {
            this.toast('تم استعادة الاتصال – جاري التحديث...');
            this.loadAllData();
        });

        // تحديث عند العودة للصفحة (إذا لم تكن في حالة تحميل)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible' && !this.state.loading) {
                this.loadAllData();
            }
        });

        // إغلاق القائمة الجانبية عند النقر خارجها على الجوال
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (!this.el.sidebar.contains(e.target) && e.target !== this.el.menuToggle) {
                    this.el.sidebar.classList.remove('open');
                }
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

    // تحديث التاريخ تلقائياً كل دقيقة (ليظهر اليوم الجديد تلقائياً)
    startDateUpdater() {
        setInterval(() => {
            const newDate = new Date().toLocaleDateString('ar-EG', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
            });
            if (this.el.currentDate && this.el.currentDate.textContent !== newDate) {
                this.el.currentDate.textContent = newDate;
                // إعادة تحميل البيانات عند تغير اليوم تلقائياً
                this.loadAllData();
            }
        }, 60000);
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

    // انتظار واجهة DB موحدة (App.DB) أو الاعتماد على localDB كبديل أخير
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
                    console.warn('لم يتم تحميل DB الأساسي، جاري محاولة استخدام IndexedDB المحلي...');
                    // محاولة استخدام localDB إذا كان معرفاً
                    if (window.localDB) {
                        this.state.ready = 'local';
                    } else {
                        console.error('لا يوجد نظام تخزين متاح!');
                        this.toast('خطأ: نظام التخزين غير متوفر');
                    }
                    resolve();
                }
            }, 100);
        });
    },

    async loadAllData() {
        if (this.state.loading) {
            console.log('تحميل بالفعل قيد التنفيذ، تم التجاهل.');
            return;
        }
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
            this.toast('تعذر تحميل بعض البيانات. يرجى المحاولة لاحقاً.');
        } finally {
            this.toggleLoading(false);
            this.renderStats();
            this.renderTables();
            this.renderChart();
            console.log('4️⃣ تم عرض كل البيانات');
        }
    },

    async loadStats() {
        try {
            const today = U.today();
            let invoices=[], purchases=[], parties=[], products=[], transactions=[], settings={};

            try {
                if (this.state.ready === true && window.App && window.App.DB) {
                    const DB = window.App.DB;
                    [invoices, purchases, parties, products, transactions, settings] = await Promise.all([
                        DB.getInvoices().catch(err => { console.warn('فشل جلب الفواتير', err); return []; }),
                        DB.getPurchases().catch(err => { console.warn('فشل جلب المشتريات', err); return []; }),
                        DB.getParties('customer').catch(err => { console.warn('فشل جلب العملاء', err); return []; }),
                        DB.getProducts().catch(err => { console.warn('فشل جلب المنتجات', err); return []; }),
                        DB.getTransactions().catch(err => { console.warn('فشل جلب المعاملات', err); return []; }),
                        DB.getSettings().catch(err => { console.warn('فشل جلب الإعدادات', err); return {}; })
                    ]);
                } else if (window.localDB) {
                    invoices = await localDB.getAll('invoices').catch(() => []) || [];
                    purchases = await localDB.getAll('purchases').catch(() => []) || [];
                    const allParties = await localDB.getAll('parties').catch(() => []) || [];
                    parties = allParties.filter(p => p.type === 'customer');
                    products = await localDB.getAll('products').catch(() => []) || [];
                    transactions = await localDB.getAll('transactions').catch(() => []) || [];
                    const s = await localDB.getById('settings', 'main').catch(() => null);
                    settings = s?.data || {};
                } else {
                    throw new Error('لا يوجد نظام تخزين متاح');
                }
            } catch (fetchError) {
                console.error('فشل جلب البيانات من التخزين:', fetchError);
            }

            console.log('📦 الفواتير:', invoices.length, 'المشتريات:', purchases.length, 'العملاء:', parties.length, 'المنتجات:', products.length);

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

            this.state.chartData = this._prepareChart(invoices);
        } catch (e) {
            console.error('فشل loadStats:', e);
            this.toast('تعذر تحميل الإحصائيات');
        }
    },

    async loadRecentInvoices() {
        try {
            const maxItems = 5;
            if (this.state.ready === true && window.App && window.App.DB) {
                const invs = await window.App.DB.getInvoices().catch(() => []);
                this.state.recentInvoices = invs.filter(i=>i.type==='sale').sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0, maxItems);
            } else if (window.localDB) {
                const invs = await localDB.getAll('invoices').catch(() => []) || [];
                this.state.recentInvoices = invs.filter(i=>i.type==='sale').sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0, maxItems);
            }
        } catch (e) {
            console.warn('فشل تحميل الفواتير الحديثة:', e);
        }
    },

    async loadRecentPurchases() {
        try {
            const maxItems = 5;
            if (this.state.ready === true && window.App && window.App.DB) {
                const pur = await window.App.DB.getPurchases().catch(() => []);
                this.state.recentPurchases = pur.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0, maxItems);
            } else if (window.localDB) {
                const pur = await localDB.getAll('purchases').catch(() => []) || [];
                this.state.recentPurchases = pur.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0, maxItems);
            }
        } catch (e) {
            console.warn('فشل تحميل المشتريات الحديثة:', e);
        }
    },

    renderStats() {
        console.log('5️⃣ renderStats');
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
            <div class="stat-card" style="border-right:4px solid ${c.color};">
                <div class="stat-icon" style="color:${c.color};"><i class="fas ${c.icon}"></i></div>
                <div class="stat-content">
                    <div class="stat-title">${U.escapeHTML(c.title)}</div>
                    <div class="stat-value">${U.escapeHTML(String(c.value))}</div>
                </div>
            </div>
        `).join('');
        console.log('✔️ البطاقات تم عرضها');
    },

    renderTables() {
        console.log('6️⃣ renderTables');
        if (this.el.recentInvoices) {
            const invs = this.state.recentInvoices;
            if (!invs || !invs.length) {
                this.el.recentInvoices.innerHTML = '<div class="empty">لا توجد فواتير حديثة</div>';
            } else {
                let rows = invs.map(inv => `
                    <tr>
                        <td>${U.escapeHTML(inv.invoice_number || '—')}</td>
                        <td>${U.escapeHTML(inv.customer_name || 'نقدي')}</td>
                        <td>${new Date(inv.date).toLocaleDateString('ar-EG')}</td>
                        <td>${U.formatMoney(inv.total)}</td>
                        <td><span class="badge ${inv.status==='paid'?'badge-success':(inv.status==='held'?'badge-warning':'badge-danger')}">${inv.status==='paid'?'مدفوعة':(inv.status==='held'?'معلقة':'غير مدفوعة')}</span></td>
                    </tr>
                `).join('');
                this.el.recentInvoices.innerHTML = `<table><thead><tr><th>الرقم</th><th>العميل</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`;
            }
        }

        if (this.el.recentPurchases) {
            const pur = this.state.recentPurchases;
            if (!pur || !pur.length) {
                this.el.recentPurchases.innerHTML = '<div class="empty">لا توجد مشتريات حديثة</div>';
            } else {
                let rows = pur.map(p => `
                    <tr>
                        <td>${U.escapeHTML(p.supplier_name || 'غير معروف')}</td>
                        <td>${new Date(p.date).toLocaleDateString('ar-EG')}</td>
                        <td>${U.formatMoney(p.total)}</td>
                        <td><span class="badge ${p.status==='paid'?'badge-success':'badge-danger'}">${p.status==='paid'?'مدفوعة':'غير مدفوعة'}</span></td>
                    </tr>
                `).join('');
                this.el.recentPurchases.innerHTML = `<table><thead><tr><th>المورد</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>${rows}</tbody></table>`;
            }
        }
        console.log('✔️ الجداول تم عرضها');
    },

    renderChart() {
        console.log('7️⃣ renderChart');
        if (!this.el.salesChart) return;
        // التأكد من أن الكانفاس موجود ولم يتم تدميره
        if (!document.body.contains(this.el.salesChart)) {
            console.warn('عنصر canvas غير موجود في DOM');
            return;
        }
        if (!this.state.chartData || !this.state.chartData.length) {
            if (this.el.chartError) {
                this.el.chartError.style.display = 'block';
                this.el.chartError.textContent = 'لا توجد بيانات كافية للرسم البياني';
            }
            return;
        }
        if (this.el.chartError) this.el.chartError.style.display = 'none';
        try {
            if (this._chart) {
                this._chart.destroy();
                this._chart = null;
            }
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
            console.log('✔️ الرسم البياني تم');
        } catch (chartError) {
            console.error('فشل رسم البيان:', chartError);
            if (this.el.chartError) {
                this.el.chartError.style.display = 'block';
                this.el.chartError.textContent = 'خطأ في إنشاء الرسم البياني';
            }
        }
    },

    _prepareChart(invoices) {
        const days = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const ds = d.toISOString().split('T')[0];
            const total = invoices.filter(inv => inv.date === ds && inv.type === 'sale').reduce((s, inv) => s + (inv.total || 0), 0);
            days.push({ date: ds, label: d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }), total: U.round(total) });
        }
        return days;
    }
};

// بدء التشغيل عند تحميل الصفحة
window.addEventListener('DOMContentLoaded', () => Dashboard.init());

// Service Worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
}
