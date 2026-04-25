/* =============================================
   لوحة التحكم - حسابي
   ============================================= */

'use strict';

// تعريف كائن Utils احتياطي
if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        getToday: () => new Date().toISOString().split('T')[0]
    };
}

const Dashboard = {
    // عناصر DOM
    elements: {},
    // البيانات الخام
    invoices: [],
    purchases: [],
    customers: [],
    transactions: [],
    settings: {},
    // مخطط Chart.js
    chartInstance: null,

    async init() {
        this.cacheElements();
        this.bindEvents();
        this.initAuth();
        await this.loadData();
        this.renderStats();
        this.renderChart();
        this.renderRecentTables();
        this.displayDate();
    },

    cacheElements() {
        const ids = [
            'userProfileBtn', 'userDropdown', 'menuToggle', 'sidebar',
            'logoutBtn', 'statsGrid', 'currentDate', 'recentInvoices',
            'recentPurchases'
        ];
        ids.forEach(id => this.elements[id] = document.getElementById(id));
    },

    bindEvents() {
        this.elements.userProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.elements.userDropdown.classList.toggle('show');
        });
        document.addEventListener('click', () => this.elements.userDropdown?.classList.remove('show'));
        this.elements.menuToggle.addEventListener('click', () => {
            this.elements.sidebar.classList.toggle('mobile-open');
        });
        this.elements.logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });
    },

    initAuth() {
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
    },

    async loadData() {
        try {
            if (window.DB) {
                this.invoices = (await DB.getInvoices()).filter(i => i.type === 'sale');
                this.purchases = await DB.getPurchases();
                this.customers = await DB.getParties('customer');
                this.transactions = await DB.getTransactions();
                this.settings = (await DB.getSettings().catch(() => ({})));
            } else {
                console.warn('تعمل بدون قاعدة بيانات - بيانات وهمية');
                this.invoices = [];
                this.purchases = [];
                this.customers = [];
                this.transactions = [];
            }
        } catch (error) {
            console.error('فشل تحميل البيانات:', error);
        }
    },

    // ========== عرض الإحصائيات ==========
    renderStats() {
        const today = Utils.getToday();
        const todaySales = this.invoices.filter(i => i.date === today).reduce((sum, i) => sum + (i.total || 0), 0);
        const todayPurchases = this.purchases.filter(p => p.date === today).reduce((sum, p) => sum + (p.total || 0), 0);
        const totalCustomers = this.customers.length;
        const cashBalance = this.calculateCashBalance();

        const stats = [
            { icon: 'fa-chart-line', value: Utils.formatMoney(todaySales), label: 'المبيعات اليوم', class: 'card-sales' },
            { icon: 'fa-shopping-cart', value: Utils.formatMoney(todayPurchases), label: 'المشتريات اليوم', class: 'card-purchases' },
            { icon: 'fa-users', value: totalCustomers, label: 'عدد العملاء', class: 'card-customers' },
            { icon: 'fa-wallet', value: Utils.formatMoney(cashBalance), label: 'رصيد الصندوق', class: 'card-cash' }
        ];

        this.elements.statsGrid.innerHTML = stats.map(s => `
            <div class="stat-card ${s.class}">
                <div class="icon"><i class="fas ${s.icon}"></i></div>
                <div class="value">${s.value}</div>
                <div class="label">${s.label}</div>
            </div>
        `).join('');
    },

    calculateCashBalance() {
        const opening = this.settings?.financial?.opening_cash_balance || 0;
        let balance = opening;
        this.transactions.forEach(t => {
            if (t.payment_method === 'cash') {
                if (t.type === 'income') balance += t.amount;
                else if (t.type === 'expense') balance -= t.amount;
            }
        });
        return balance;
    },

    // ========== الرسم البياني ==========
    renderChart() {
        const ctx = document.getElementById('salesChart').getContext('2d');
        // تجميع المبيعات اليومية لآخر 30 يومًا
        const dailySales = this.aggregateDailySales(30);
        const labels = Object.keys(dailySales).sort();
        const dataValues = labels.map(date => dailySales[date]);

        if (this.chartInstance) this.chartInstance.destroy();

        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'المبيعات (ج.م)',
                    data: dataValues,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#3b82f6',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    },

    aggregateDailySales(days) {
        const result = {};
        const today = new Date();
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            result[dateStr] = 0;
        }
        this.invoices.forEach(inv => {
            if (result.hasOwnProperty(inv.date)) {
                result[inv.date] += inv.total || 0;
            }
        });
        return result;
    },

    // ========== جداول أحدث الفواتير والمشتريات ==========
    renderRecentTables() {
        const recentInvoices = this.invoices.slice(0, 5);
        const recentPurchases = this.purchases.slice(0, 5);

        this.elements.recentInvoices.innerHTML = this.createTableHtml(recentInvoices, ['id', 'date', 'customer_name', 'total', 'status']);
        this.elements.recentPurchases.innerHTML = this.createTableHtml(recentPurchases, ['id', 'date', 'supplier_name', 'total', 'status']);
    },

    createTableHtml(dataList, columns) {
        if (!dataList.length) return '<div class="loading">لا توجد بيانات</div>';
        const headers = {
            id: 'الرقم',
            date: 'التاريخ',
            customer_name: 'العميل',
            supplier_name: 'المورد',
            total: 'الإجمالي',
            status: 'الحالة'
        };
        let html = '<table><thead><tr>';
        columns.forEach(col => { html += `<th>${headers[col] || col}</th>`; });
        html += '</tr></thead><tbody>';
        dataList.forEach(item => {
            html += '<tr>';
            columns.forEach(col => {
                let value = item[col];
                if (col === 'total') value = Utils.formatMoney(value);
                if (col === 'status') {
                    if (value === 'paid') value = '<span class="badge badge-success">مدفوعة</span>';
                    else if (value === 'unpaid') value = '<span class="badge badge-danger">غير مدفوعة</span>';
                    else if (value === 'held') value = '<span class="badge badge-warning">معلقة</span>';
                    else value = value || '-';
                }
                if (col === 'id') value = value?.substring(0, 8) + '...'; // اختصار المعرف
                html += `<td>${value ?? '-'}</td>`;
            });
            html += '</tr>';
        });
        html += '</tbody></table>';
        return html;
    },

    displayDate() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        this.elements.currentDate.textContent = now.toLocaleDateString('ar-EG', options);
    }
};

// بدء التطبيق
document.addEventListener('DOMContentLoaded', () => Dashboard.init());
