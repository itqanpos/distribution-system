/* =============================================
   reports.js - التقارير (إصدار مُحسَّن)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return dateStr; }
        },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase),
        hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
    };
}

const Reports = {
    invoices: [],
    purchases: [],
    customers: [],
    products: [],
    transactions: [],
    settings: {},
    currentTab: 'sales',
    dateFrom: '',
    dateTo: '',
    chartInstances: {},

    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadAllData();
    },

    cacheElements() {
        this.el = {
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            reportContent: document.getElementById('reportContent'),
            tabBtns: document.querySelectorAll('.tab-btn'),
            toast: document.getElementById('toast')
        };
    },

    bindEvents() {
        this.el.userProfileBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));

        // القائمة مع الطبقة الداكنة
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

        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        this.el.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.el.tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.renderReport();
            });
        });
    },

    async loadAllData() {
        try {
            if (Utils.isDBReady()) {
                this.invoices = (await DB.getInvoices()).filter(i => i.type === 'sale');
                this.purchases = await DB.getPurchases();
                this.customers = await DB.getParties('customer');
                this.products = await DB.getProducts();
                this.transactions = await DB.getTransactions();
                this.settings = (await DB.getSettings().catch(() => ({})));
            } else if (Utils.hasLocalDB()) {
                const allInvoices = await localDB.getAll('invoices') || [];
                this.invoices = allInvoices.filter(i => i.type === 'sale');
                this.purchases = await localDB.getAll('purchases') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.customers = allParties.filter(p => p.type === 'customer');
                this.products = await localDB.getAll('products') || [];
                this.transactions = await localDB.getAll('transactions') || [];
                const s = await localDB.getById('settings', 'main').catch(() => null);
                this.settings = s?.data || {};
            } else {
                this.invoices = [];
                this.purchases = [];
                this.customers = [];
                this.products = [];
                this.transactions = [];
                this.settings = { financial: { opening_cash_balance: 0 } };
            }
            this.renderReport();
        } catch (err) {
            console.error('فشل تحميل بيانات التقارير:', err);
            this.el.reportContent.innerHTML = '<div class="empty-message">فشل تحميل البيانات</div>';
        }
    },

    getDefaultDateRange() {
        const today = new Date();
        const from = new Date(today);
        from.setDate(today.getDate() - 30);
        return {
            from: from.toISOString().split('T')[0],
            to: Utils.getToday()
        };
    },

    renderReport() {
        const range = this.getDefaultDateRange();
        this.dateFrom = range.from;
        this.dateTo = range.to;

        switch (this.currentTab) {
            case 'sales': this.renderSalesReport(); break;
            case 'purchases': this.renderPurchasesReport(); break;
            case 'inventory': this.renderInventoryReport(); break;
            case 'customers': this.renderCustomersReport(); break;
            case 'profits': this.renderProfitsReport(); break;
            case 'cashflow': this.renderCashflowReport(); break;
        }
    },

    // ======================= تقرير المبيعات =======================
    renderSalesReport() {
        const filteredInvoices = this.invoices.filter(inv => inv.date >= this.dateFrom && inv.date <= this.dateTo);
        const totalSales = filteredInvoices.reduce((s, i) => s + i.total, 0);
        const invoiceCount = filteredInvoices.length;
        const average = invoiceCount ? totalSales / invoiceCount : 0;
        const totalPaid = filteredInvoices.reduce((s, i) => s + i.paid, 0);
        const totalRemaining = totalSales - totalPaid;

        const dailySales = {};
        filteredInvoices.forEach(inv => {
            dailySales[inv.date] = (dailySales[inv.date] || 0) + inv.total;
        });

        let html = `
            <div class="report-stats">
                <div class="stat-card"><div class="icon" style="color:#16a34a;"><i class="fas fa-money-bill-wave"></i></div><div class="value">${Utils.formatMoney(totalSales)}</div><div class="label">إجمالي المبيعات</div></div>
                <div class="stat-card"><div class="icon" style="color:#3b82f6;"><i class="fas fa-receipt"></i></div><div class="value">${invoiceCount}</div><div class="label">عدد الفواتير</div></div>
                <div class="stat-card"><div class="icon" style="color:#8b5cf6;"><i class="fas fa-calculator"></i></div><div class="value">${Utils.formatMoney(average)}</div><div class="label">متوسط الفاتورة</div></div>
                <div class="stat-card"><div class="icon" style="color:#f59e0b;"><i class="fas fa-clock"></i></div><div class="value">${Utils.formatMoney(totalRemaining)}</div><div class="label">المتبقي غير المحصل</div></div>
            </div>
            <div class="chart-box">
                <h3>المبيعات اليومية</h3>
                <div class="chart-wrapper"><canvas id="salesChart"></canvas></div>
            </div>
            <div class="report-table-container">
                <h3>أعلى 10 عملاء من حيث المبيعات</h3>
                <table class="report-table">
                    <thead><tr><th>العميل</th><th>عدد الفواتير</th><th>إجمالي المبيعات</th></tr></thead>
                    <tbody>
                        ${this.getTopCustomers().map(c => `<tr><td>${c.name}</td><td>${c.count}</td><td>${Utils.formatMoney(c.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty-message">لا توجد بيانات</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
        this.el.reportContent.innerHTML = html;
        this.renderSalesChart(Object.keys(dailySales).sort(), Object.values(dailySales));
    },

    getTopCustomers() {
        const map = {};
        this.invoices.forEach(inv => {
            const name = inv.customer_name || this.customers.find(c => c.id === inv.customer_id)?.name || 'نقدي';
            if (!map[name]) map[name] = { name, count: 0, total: 0 };
            map[name].count++;
            map[name].total += inv.total;
        });
        return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10);
    },

    renderSalesChart(labels, data) {
        this.destroyChart('salesChart');
        setTimeout(() => {
            const ctx = document.getElementById('salesChart')?.getContext('2d');
            if (!ctx) return;
            this.chartInstances.salesChart = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets: [{ label: 'المبيعات (ج.م)', data, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.1)', fill: true, tension: 0.3 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
            });
        }, 100);
    },

    // ======================= تقرير المشتريات =======================
    renderPurchasesReport() {
        const filteredPurchases = this.purchases.filter(p => p.date >= this.dateFrom && p.date <= this.dateTo);
        const totalPurchases = filteredPurchases.reduce((s, p) => s + p.total, 0);
        const count = filteredPurchases.length;
        const average = count ? totalPurchases / count : 0;

        const bySupplier = {};
        filteredPurchases.forEach(p => {
            const name = p.supplier_name || 'غير معروف';
            if (!bySupplier[name]) bySupplier[name] = { name, count: 0, total: 0 };
            bySupplier[name].count++;
            bySupplier[name].total += p.total;
        });

        this.el.reportContent.innerHTML = `
            <div class="report-stats">
                <div class="stat-card"><div class="icon" style="color:#dc2626;"><i class="fas fa-shopping-cart"></i></div><div class="value">${Utils.formatMoney(totalPurchases)}</div><div class="label">إجمالي المشتريات</div></div>
                <div class="stat-card"><div class="icon" style="color:#3b82f6;"><i class="fas fa-receipt"></i></div><div class="value">${count}</div><div class="label">عدد فواتير الشراء</div></div>
                <div class="stat-card"><div class="icon" style="color:#8b5cf6;"><i class="fas fa-calculator"></i></div><div class="value">${Utils.formatMoney(average)}</div><div class="label">متوسط الفاتورة</div></div>
            </div>
            <div class="report-table-container">
                <h3>المشتريات حسب المورد</h3>
                <table class="report-table">
                    <thead><tr><th>المورد</th><th>عدد الفواتير</th><th>إجمالي المشتريات</th></tr></thead>
                    <tbody>
                        ${Object.values(bySupplier).sort((a,b) => b.total - a.total).map(s => `<tr><td>${s.name}</td><td>${s.count}</td><td>${Utils.formatMoney(s.total)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty-message">لا توجد بيانات</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    },

    // ======================= تقرير المخزون =======================
    renderInventoryReport() {
        const lowStock = this.products.filter(p => (p.units?.[0]?.stock || 0) <= (p.min_stock || 5));
        const totalStockValue = this.products.reduce((sum, p) => sum + ((p.units?.[0]?.stock || 0) * (p.units?.[0]?.cost || 0)), 0);

        this.el.reportContent.innerHTML = `
            <div class="report-stats">
                <div class="stat-card"><div class="icon" style="color:#3b82f6;"><i class="fas fa-boxes"></i></div><div class="value">${this.products.length}</div><div class="label">إجمالي المنتجات</div></div>
                <div class="stat-card"><div class="icon" style="color:#ef4444;"><i class="fas fa-exclamation-triangle"></i></div><div class="value">${lowStock.length}</div><div class="label">منتجات منخفضة المخزون</div></div>
                <div class="stat-card"><div class="icon" style="color:#f59e0b;"><i class="fas fa-coins"></i></div><div class="value">${Utils.formatMoney(totalStockValue)}</div><div class="label">قيمة المخزون الحالي</div></div>
            </div>
            <div class="report-table-container">
                <h3>المنتجات منخفضة المخزون</h3>
                <table class="report-table">
                    <thead><tr><th>المنتج</th><th>التصنيف</th><th>المخزون الحالي</th><th>الحد الأدنى</th></tr></thead>
                    <tbody>
                        ${lowStock.length ? lowStock.map(p => {
                            const stock = p.units?.[0]?.stock || 0;
                            const unitName = p.units?.[0]?.name || '';
                            return `<tr><td>${p.name}</td><td>${p.category || '-'}</td><td>${stock} ${unitName}</td><td>${p.min_stock || 5}</td></tr>`;
                        }).join('') : '<tr><td colspan="4" class="empty-message">لا توجد منتجات منخفضة المخزون</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    },

    // ======================= تقرير العملاء =======================
    renderCustomersReport() {
        const totalBalances = this.customers.reduce((s, c) => s + c.balance, 0);
        this.el.reportContent.innerHTML = `
            <div class="report-stats">
                <div class="stat-card"><div class="icon" style="color:#3b82f6;"><i class="fas fa-users"></i></div><div class="value">${this.customers.length}</div><div class="label">عدد العملاء</div></div>
                <div class="stat-card"><div class="icon" style="color:#8b5cf6;"><i class="fas fa-wallet"></i></div><div class="value">${Utils.formatMoney(totalBalances)}</div><div class="label">إجمالي الأرصدة</div></div>
            </div>
            <div class="report-table-container">
                <h3>العملاء حسب أعلى رصيد</h3>
                <table class="report-table">
                    <thead><tr><th>العميل</th><th>رقم الهاتف</th><th>الرصيد</th></tr></thead>
                    <tbody>
                        ${this.customers.length ? [...this.customers].sort((a,b) => b.balance - a.balance).map(c => `<tr><td>${c.name}</td><td>${c.phone || '-'}</td><td>${Utils.formatMoney(c.balance)}</td></tr>`).join('') : '<tr><td colspan="3" class="empty-message">لا توجد بيانات</td></tr>'}
                    </tbody>
                </table>
            </div>
        `;
    },

    // ======================= تقرير الأرباح =======================
    renderProfitsReport() {
        const filteredInvoices = this.invoices.filter(inv => inv.date >= this.dateFrom && inv.date <= this.dateTo);
        const totalSales = filteredInvoices.reduce((s, i) => s + i.total, 0);

        let totalCostOfSales = 0;
        filteredInvoices.forEach(inv => {
            (inv.items || []).forEach(item => {
                const prod = this.products.find(p => p.name === item.productName);
                if (prod) {
                    const unit = prod.units.find(u => u.name === item.unitName);
                    if (unit) totalCostOfSales += (unit.cost || 0) * item.quantity;
                }
            });
        });

        const grossProfit = totalSales - totalCostOfSales;
        const profitMargin = totalSales ? (grossProfit / totalSales) * 100 : 0;

        this.el.reportContent.innerHTML = `
            <div class="report-stats">
                <div class="stat-card"><div class="icon" style="color:#16a34a;"><i class="fas fa-chart-line"></i></div><div class="value">${Utils.formatMoney(totalSales)}</div><div class="label">إجمالي المبيعات</div></div>
                <div class="stat-card"><div class="icon" style="color:#dc2626;"><i class="fas fa-money-bill-wave"></i></div><div class="value">${Utils.formatMoney(totalCostOfSales)}</div><div class="label">تكلفة المبيعات</div></div>
                <div class="stat-card"><div class="icon" style="color:#8b5cf6;"><i class="fas fa-coins"></i></div><div class="value">${Utils.formatMoney(grossProfit)}</div><div class="label">إجمالي الربح</div></div>
                <div class="stat-card"><div class="icon" style="color:#f59e0b;"><i class="fas fa-percent"></i></div><div class="value">${profitMargin.toFixed(1)}%</div><div class="label">هامش الربح</div></div>
            </div>
        `;
    },

    // ======================= تقرير التدفق النقدي =======================
    renderCashflowReport() {
        const filteredTransactions = this.transactions.filter(tr => tr.date >= this.dateFrom && tr.date <= this.dateTo);
        const totalIncome = filteredTransactions.filter(tr => tr.type === 'income').reduce((s, tr) => s + tr.amount, 0);
        const totalExpense = filteredTransactions.filter(tr => tr.type === 'expense').reduce((s, tr) => s + tr.amount, 0);
        const netCashflow = totalIncome - totalExpense;
        const openingBalance = this.settings?.financial?.opening_cash_balance || 0;
        const closingBalance = openingBalance + netCashflow;

        const dailyFlow = {};
        filteredTransactions.forEach(tr => {
            if (!dailyFlow[tr.date]) dailyFlow[tr.date] = 0;
            dailyFlow[tr.date] += tr.type === 'income' ? tr.amount : -tr.amount;
        });

        let html = `
            <div class="report-stats">
                <div class="stat-card"><div class="icon" style="color:#16a34a;"><i class="fas fa-arrow-down"></i></div><div class="value">${Utils.formatMoney(totalIncome)}</div><div class="label">إجمالي الوارد</div></div>
                <div class="stat-card"><div class="icon" style="color:#dc2626;"><i class="fas fa-arrow-up"></i></div><div class="value">${Utils.formatMoney(totalExpense)}</div><div class="label">إجمالي الصادر</div></div>
                <div class="stat-card"><div class="icon" style="color:#3b82f6;"><i class="fas fa-balance-scale"></i></div><div class="value">${Utils.formatMoney(netCashflow)}</div><div class="label">صافي التدفق</div></div>
                <div class="stat-card"><div class="icon" style="color:#8b5cf6;"><i class="fas fa-wallet"></i></div><div class="value">${Utils.formatMoney(closingBalance)}</div><div class="label">الرصيد النهائي</div></div>
            </div>
            <div class="chart-box">
                <h3>التدفق النقدي اليومي</h3>
                <div class="chart-wrapper"><canvas id="cashflowChart"></canvas></div>
            </div>
        `;
        this.el.reportContent.innerHTML = html;
        const dates = Object.keys(dailyFlow).sort();
        setTimeout(() => this.renderCashflowChart(dates, dates.map(d => dailyFlow[d])), 100);
    },

    renderCashflowChart(labels, data) {
        this.destroyChart('cashflowChart');
        const ctx = document.getElementById('cashflowChart')?.getContext('2d');
        if (!ctx) return;
        this.chartInstances.cashflowChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'التدفق (ج.م)',
                    data,
                    backgroundColor: data.map(v => v >= 0 ? 'rgba(16,185,129,0.6)' : 'rgba(239,68,68,0.6)')
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
        });
    },

    destroyChart(key) {
        if (this.chartInstances[key]) {
            this.chartInstances[key].destroy();
            this.chartInstances[key] = null;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Reports.init());
