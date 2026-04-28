/* =============================================
   لوحة التحكم - حسابي (Production-Ready v2.0)
   ============================================= */
'use strict';

// ==================== الأدوات المساعدة ====================
const Utils = window.Utils || {
    formatMoney: (amount, currency = 'ج.م') => {
        return Number(amount).toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        }) + ' ' + currency;
    },
    getToday: () => new Date().toISOString().split('T')[0],
    escapeHTML: (str) => {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    },
    round: (value, decimals = 2) => {
        return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
    }
};

if (!window.Utils) window.Utils = Utils;

// ==================== Dashboard Controller ====================
const Dashboard = {
    state: {
        isDBReady: false,
        isLoading: false,
        stats: {
            todaySales: 0,
            todayPurchases: 0,
            customersCount: 0,
            productsCount: 0,
            cashBalance: 0
        },
        chartData: [],
        recentInvoices: [],
        recentPurchases: []
    },

    el: {},

    init() {
        this.cacheElements();
        this.bindEvents();
        this.setCurrentDate();
        this.state.isDBReady = !!(window.DB && window.supabase);
        
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }

        this.loadAllData();
    },

    cacheElements() {
        const ids = [
            'menuToggle', 'sidebar', 'userDropdown', 'userProfileBtn',
            'logoutBtn', 'currentDate', 'statsGrid', 'salesChart',
            'recentInvoices', 'recentPurchases', 'loadingIndicator',
            'chartError', 'toast'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    bindEvents() {
        // القائمة الجانبية
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
        });

        // قائمة المستخدم
        this.el.userProfileBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.userDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', () => {
            this.el.userDropdown?.classList.remove('show');
        });

        // تسجيل الخروج
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });
    },

    setCurrentDate() {
        if (!this.el.currentDate) return;
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        this.el.currentDate.textContent = now.toLocaleDateString('ar-EG', options);
    },

    showLoading(show = true) {
        if (this.el.loadingIndicator) {
            this.el.loadingIndicator.style.display = show ? 'block' : 'none';
        }
        this.state.isLoading = show;
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    },

    // ==================== تحميل البيانات ====================
    async loadAllData() {
        this.showLoading(true);
        try {
            await Promise.all([
                this.loadStats(),
                this.loadInvoices(),
                this.loadPurchases()
            ]);
            this.renderStats();
            this.renderTables();
            this.renderChart();
        } catch (e) {
            console.error('خطأ في تحميل بيانات لوحة التحكم:', e);
            this.showToast('فشل تحميل بعض البيانات');
        } finally {
            this.showLoading(false);
        }
    },

    async loadStats() {
        try {
            const today = Utils.getToday();
            
            if (this.state.isDBReady) {
                // تحميل الإحصائيات من Supabase أو المحلي
                const [invoices, purchases, parties, products, transactions] = await Promise.all([
                    DB.getInvoices().catch(() => []),
                    DB.getPurchases().catch(() => []),
                    DB.getParties('customer').catch(() => []),
                    DB.getProducts().catch(() => []),
                    DB.getTransactions().catch(() => [])
                ]);

                // مبيعات اليوم
                const todayInvoices = invoices.filter(inv => inv.date === today && inv.type === 'sale');
                this.state.stats.todaySales = Utils.round(
                    todayInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0)
                );
                this.state.chartData = this.prepareChartData(invoices);

                // مشتريات اليوم
                const todayPurchases = purchases.filter(p => p.date === today);
                this.state.stats.todayPurchases = Utils.round(
                    todayPurchases.reduce((sum, p) => sum + (p.total || 0), 0)
                );

                // عدد العملاء
                this.state.stats.customersCount = parties.length;

                // عدد المنتجات
                this.state.stats.productsCount = products.length;

                // رصيد الصندوق
                const cashTransactions = transactions.filter(t => 
                    t.payment_method === 'cash' || !t.payment_method
                );
                const income = cashTransactions.filter(t => t.type === 'income')
                    .reduce((s, t) => s + (t.amount || 0), 0);
                const expense = cashTransactions.filter(t => t.type === 'expense')
                    .reduce((s, t) => s + (t.amount || 0), 0);
                const settings = await DB.getSettings().catch(() => ({}));
                const openingBalance = settings.openingBalance || 0;
                this.state.stats.cashBalance = Utils.round(openingBalance + income - expense);
            } else {
                // بيانات افتراضية للتطوير
                this.state.stats = {
                    todaySales: 12500,
                    todayPurchases: 4530,
                    customersCount: 45,
                    productsCount: 120,
                    cashBalance: 28000
                };
                this.state.chartData = this.generateDummyChartData();
            }
        } catch (e) {
            console.error('خطأ تحميل الإحصائيات:', e);
        }
    },

    async loadInvoices() {
        try {
            if (this.state.isDBReady) {
                const invoices = await DB.getInvoices().catch(() => []);
                this.state.recentInvoices = invoices
                    .filter(inv => inv.type === 'sale')
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .slice(0, 5);
            } else {
                this.state.recentInvoices = [
                    { id: '1', invoice_number: '28-0005', customer_name: 'أحمد محمد', date: Utils.getToday(), total: 1500, status: 'paid' },
                    { id: '2', invoice_number: '28-0004', customer_name: 'نقدي', date: Utils.getToday(), total: 350, status: 'paid' }
                ];
            }
        } catch (e) {
            console.error('خطأ تحميل الفواتير:', e);
            this.state.recentInvoices = [];
        }
    },

    async loadPurchases() {
        try {
            if (this.state.isDBReady) {
                const purchases = await DB.getPurchases().catch(() => []);
                this.state.recentPurchases = purchases
                    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                    .slice(0, 5);
            } else {
                this.state.recentPurchases = [
                    { id: '1', supplier_name: 'شركة الأمل', date: Utils.getToday(), total: 4500, status: 'paid' }
                ];
            }
        } catch (e) {
            console.error('خطأ تحميل المشتريات:', e);
            this.state.recentPurchases = [];
        }
    },

    prepareChartData(invoices) {
        const days = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const dayTotal = invoices
                .filter(inv => inv.date === dateStr && inv.type === 'sale')
                .reduce((sum, inv) => sum + (inv.total || 0), 0);
            days.push({
                date: dateStr,
                label: d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
                total: Utils.round(dayTotal)
            });
        }
        return days;
    },

    generateDummyChartData() {
        const days = [];
        const now = new Date();
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            days.push({
                date: d.toISOString().split('T')[0],
                label: d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }),
                total: Math.floor(Math.random() * 5000) + 500
            });
        }
        return days;
    },

    // ==================== عرض البيانات ====================
    renderStats() {
        if (!this.el.statsGrid) return;
        const s = this.state.stats;
        
        const cards = [
            { title: 'مبيعات اليوم', value: Utils.formatMoney(s.todaySales), icon: 'fa-chart-line', color: '#16a34a' },
            { title: 'مشتريات اليوم', value: Utils.formatMoney(s.todayPurchases), icon: 'fa-shopping-cart', color: '#dc2626' },
            { title: 'العملاء', value: s.customersCount, icon: 'fa-users', color: '#3b82f6' },
            { title: 'المنتجات', value: s.productsCount, icon: 'fa-boxes', color: '#f59e0b' },
            { title: 'رصيد الصندوق', value: Utils.formatMoney(s.cashBalance), icon: 'fa-cash-register', color: '#8b5cf6' }
        ];

        this.el.statsGrid.innerHTML = cards.map(card => `
            <div class="stat-card" style="border-right: 4px solid ${card.color};">
                <div class="stat-icon" style="color:${card.color};"><i class="fas ${card.icon}"></i></div>
                <div class="stat-content">
                    <div class="stat-title">${Utils.escapeHTML(card.title)}</div>
                    <div class="stat-value">${Utils.escapeHTML(String(card.value))}</div>
                </div>
            </div>
        `).join('');

        // إضافة تأثير hover للبطاقات
        document.querySelectorAll('.stat-card').forEach(card => {
            card.addEventListener('mouseenter', () => card.style.transform = 'translateY(-2px)');
            card.addEventListener('mouseleave', () => card.style.transform = 'translateY(0)');
        });
    },

    renderTables() {
        // جدول آخر الفواتير
        if (this.el.recentInvoices) {
            if (!this.state.recentInvoices.length) {
                this.el.recentInvoices.innerHTML = '<div style="text-align:center; padding:20px;">لا توجد فواتير</div>';
            } else {
                let html = '<table><thead><tr><th>الرقم</th><th>العميل</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>';
                html += this.state.recentInvoices.map(inv => {
                    const safeNum = Utils.escapeHTML(inv.invoice_number || inv.id?.substring(0,8) || '');
                    const safeName = Utils.escapeHTML(inv.customer_name || 'نقدي');
                    const date = new Date(inv.date || Date.now()).toLocaleDateString('ar-EG');
                    const amount = Utils.formatMoney(inv.total || 0);
                    const statusClass = inv.status === 'paid' ? 'badge-success' : 
                                       inv.status === 'held' ? 'badge-warning' : 'badge-danger';
                    const statusText = inv.status === 'paid' ? 'مدفوعة' : 
                                      inv.status === 'held' ? 'معلقة' : 'غير مدفوعة';
                    return `<tr>
                        <td>${safeNum}</td>
                        <td>${safeName}</td>
                        <td>${date}</td>
                        <td>${amount}</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                    </tr>`;
                }).join('');
                html += '</tbody></table>';
                this.el.recentInvoices.innerHTML = html;
            }
        }

        // جدول آخر المشتريات
        if (this.el.recentPurchases) {
            if (!this.state.recentPurchases.length) {
                this.el.recentPurchases.innerHTML = '<div style="text-align:center; padding:20px;">لا توجد مشتريات</div>';
            } else {
                let html = '<table><thead><tr><th>المورد</th><th>التاريخ</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>';
                html += this.state.recentPurchases.map(p => {
                    const safeName = Utils.escapeHTML(p.supplier_name || 'غير معروف');
                    const date = new Date(p.date || Date.now()).toLocaleDateString('ar-EG');
                    const amount = Utils.formatMoney(p.total || 0);
                    const statusClass = p.status === 'paid' ? 'badge-success' : 'badge-danger';
                    const statusText = p.status === 'paid' ? 'مدفوعة' : 'غير مدفوعة';
                    return `<tr>
                        <td>${safeName}</td>
                        <td>${date}</td>
                        <td>${amount}</td>
                        <td><span class="badge ${statusClass}">${statusText}</span></td>
                    </tr>`;
                }).join('');
                html += '</tbody></table>';
                this.el.recentPurchases.innerHTML = html;
            }
        }
    },

    renderChart() {
        if (!this.el.salesChart || !this.state.chartData.length) {
            if (this.el.chartError) {
                this.el.chartError.style.display = 'block';
                this.el.chartError.textContent = 'لا توجد بيانات كافية لعرض الرسم البياني';
            }
            return;
        }

        try {
            if (this._chartInstance) {
                this._chartInstance.destroy();
            }

            const ctx = this.el.salesChart.getContext('2d');
            this._chartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: this.state.chartData.map(d => d.label),
                    datasets: [{
                        label: 'المبيعات (ج.م)',
                        data: this.state.chartData.map(d => d.total),
                        backgroundColor: 'rgba(59, 130, 246, 0.6)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (ctx) => `${Utils.formatMoney(ctx.raw)}`
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: (value) => Utils.formatMoney(value)
                            }
                        }
                    }
                }
            });
        } catch (e) {
            console.error('خطأ في رسم المخطط:', e);
            if (this.el.chartError) {
                this.el.chartError.style.display = 'block';
                this.el.chartError.textContent = 'فشل عرض الرسم البياني';
            }
        }
    }
};

// ==================== بدء التشغيل ====================
window.addEventListener('DOMContentLoaded', () => Dashboard.init());

// تعريض الدوال للاستخدام الخارجي
window.Dashboard = Dashboard;
