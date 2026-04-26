/* =============================================
   المحاسبة - حسابي (شاملة)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        getToday: () => new Date().toISOString().split('T')[0]
    };
}

const Accounting = {
    // البيانات الخام
    invoices: [],
    purchases: [],
    products: [],
    customers: [],
    suppliers: [],
    transactions: [],
    settings: {},
    
    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadData();
    },

    cacheElements() {
        this.el = {
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            tabContent: document.getElementById('tabContent'),
            tabs: document.querySelectorAll('.tab')
        };
    },

    bindEvents() {
        this.el.userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle.addEventListener('click', () => this.el.sidebar.classList.toggle('mobile-open'));
        this.el.logoutBtn.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        // تبويبات
        this.el.tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                this.el.tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.renderTab(tab.dataset.tab);
            });
        });
    },

    async loadData() {
        try {
            if (window.DB) {
                this.invoices = (await DB.getInvoices()).filter(i => i.type === 'sale');
                this.purchases = await DB.getPurchases();
                this.products = await DB.getProducts();
                this.customers = await DB.getParties('customer');
                this.suppliers = await DB.getParties('supplier');
                this.transactions = await DB.getTransactions();
                this.settings = await DB.getSettings().catch(() => ({}));
            } else {
                // بيانات وهمية للاختبار
                this.invoices = [];
                this.purchases = [];
                this.products = [];
                this.customers = [];
                this.suppliers = [];
                this.transactions = [];
                this.settings = { financial: { opening_cash_balance: 0 } };
            }
            // عرض التبويب النشط
            const activeTab = document.querySelector('.tab.active')?.dataset.tab || 'summary';
            this.renderTab(activeTab);
        } catch (err) {
            console.error(err);
            this.el.tabContent.innerHTML = '<div class="loading">فشل تحميل البيانات</div>';
        }
    },

    renderTab(tabName) {
        switch(tabName) {
            case 'summary': this.renderSummary(); break;
            case 'income': this.renderIncomeStatement(); break;
            case 'balance': this.renderBalanceSheet(); break;
            case 'inventory': this.renderInventory(); break;
            case 'receivables': this.renderReceivables(); break;
        }
    },

    // ========== دوال مساعدة مالية ==========
    getTotalSales() {
        return this.invoices.reduce((s, inv) => s + (inv.total || 0), 0);
    },
    getTotalSalesCost() {
        // تكلفة البضاعة المباعة = مجموع (الكمية المباعة × تكلفة الوحدة)
        let cost = 0;
        this.invoices.forEach(inv => {
            (inv.items || []).forEach(item => {
                const product = this.products.find(p => p.id === item.productId);
                if (product) {
                    const unit = product.units.find(u => u.name === item.unitName);
                    if (unit) {
                        const itemCost = (unit.cost || 0) * item.quantity;
                        cost += itemCost;
                    }
                }
            });
        });
        return cost;
    },
    getTotalPurchases() {
        return this.purchases.reduce((s, p) => s + (p.total || 0), 0);
    },
    getCashBalance() {
        const opening = this.settings?.financial?.opening_cash_balance || 0;
        let balance = opening;
        this.transactions.forEach(tr => {
            if (tr.type === 'income') balance += tr.amount;
            else if (tr.type === 'expense') balance -= tr.amount;
        });
        return balance;
    },
    getInventoryValue() {
        // قيمة المخزون = مجموع (المخزون الأساسي × تكلفة الوحدة الأساسية)
        let total = 0;
        this.products.forEach(prod => {
            const baseUnit = prod.units?.[0];
            if (baseUnit) {
                total += (baseUnit.stock || 0) * (baseUnit.cost || 0);
            }
        });
        return total;
    },
    getCustomerBalances() {
        return this.customers.reduce((s, c) => s + (c.balance || 0), 0);
    },
    getSupplierBalances() {
        return this.suppliers.reduce((s, s_) => s + (s_.balance || 0), 0);
    },
    getOperatingExpenses() {
        // المصروفات التشغيلية من المعاملات (باستثناء مشتريات البضاعة)
        return this.transactions
            .filter(tr => tr.type === 'expense' && !tr.description?.includes('فاتورة شراء'))
            .reduce((s, tr) => s + tr.amount, 0);
    },

    // ========== عرض التبويبات ==========

    // 1. الملخص المالي
    renderSummary() {
        const totalSales = this.getTotalSales();
        const totalPurchases = this.getTotalPurchases();
        const grossProfit = totalSales - this.getTotalSalesCost();
        const expenses = this.getOperatingExpenses();
        const netProfit = grossProfit - expenses;
        const cash = this.getCashBalance();
        const inventory = this.getInventoryValue();
        const receivables = this.getCustomerBalances();
        const payables = this.getSupplierBalances();

        const html = `
            <div class="stats-grid">
                <div class="stat-card"><div class="value">${Utils.formatMoney(totalSales)}</div><div class="label">إجمالي المبيعات</div></div>
                <div class="stat-card"><div class="value positive">${Utils.formatMoney(grossProfit)}</div><div class="label">مجمل الربح</div></div>
                <div class="stat-card"><div class="value ${netProfit >= 0 ? 'positive' : 'negative'}">${Utils.formatMoney(netProfit)}</div><div class="label">صافي الربح</div></div>
                <div class="stat-card"><div class="value">${Utils.formatMoney(cash)}</div><div class="label">النقدية</div></div>
                <div class="stat-card"><div class="value">${Utils.formatMoney(inventory)}</div><div class="label">المخزون</div></div>
                <div class="stat-card"><div class="value">${Utils.formatMoney(receivables)}</div><div class="label">الذمم المدينة (عملاء)</div></div>
                <div class="stat-card"><div class="value">${Utils.formatMoney(payables)}</div><div class="label">الذمم الدائنة (موردين)</div></div>
                <div class="stat-card"><div class="value">${Utils.formatMoney(expenses)}</div><div class="label">المصروفات التشغيلية</div></div>
            </div>
        `;
        this.el.tabContent.innerHTML = html;
    },

    // 2. قائمة الدخل
    renderIncomeStatement() {
        const sales = this.getTotalSales();
        const costOfSales = this.getTotalSalesCost();
        const grossProfit = sales - costOfSales;
        const operatingExpenses = this.getOperatingExpenses();
        const netProfit = grossProfit - operatingExpenses;

        const html = `
            <div class="section">
                <div class="section-title"><i class="fas fa-file-invoice-dollar"></i> قائمة الدخل</div>
                <div class="table-container">
                    <table class="financial-table">
                        <tr><td>إيرادات المبيعات</td><td>${Utils.formatMoney(sales)}</td></tr>
                        <tr><td>تكلفة البضاعة المباعة</td><td>(${Utils.formatMoney(costOfSales)})</td></tr>
                        <tr class="sub-total"><td>مجمل الربح</td><td>${Utils.formatMoney(grossProfit)}</td></tr>
                        <tr><td>المصروفات التشغيلية</td><td>(${Utils.formatMoney(operatingExpenses)})</td></tr>
                        <tr class="grand-total"><td>صافي الربح</td><td>${Utils.formatMoney(netProfit)}</td></tr>
                    </table>
                </div>
            </div>
            <div class="section">
                <div class="section-title"><i class="fas fa-receipt"></i> تفاصيل المصروفات</div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>التاريخ</th><th>البيان</th><th>المبلغ</th></tr></thead>
                        <tbody>
                            ${this.transactions.filter(tr => tr.type === 'expense' && !tr.description?.includes('فاتورة شراء')).map(tr => `
                                <tr><td>${tr.date}</td><td>${tr.description || '-'}</td><td>${Utils.formatMoney(tr.amount)}</td></tr>
                            `).join('') || '<tr><td colspan="3" class="loading">لا توجد مصروفات</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        this.el.tabContent.innerHTML = html;
    },

    // 3. الميزانية العمومية
    renderBalanceSheet() {
        const cash = this.getCashBalance();
        const inventory = this.getInventoryValue();
        const receivables = this.getCustomerBalances();
        const totalCurrentAssets = cash + inventory + receivables;
        const payables = this.getSupplierBalances();
        const netWorth = totalCurrentAssets - payables;

        const html = `
            <div class="section">
                <div class="section-title"><i class="fas fa-balance-scale"></i> الميزانية العمومية</div>
                <div class="table-container">
                    <table class="financial-table">
                        <tr><td colspan="2"><strong>الأصول المتداولة</strong></td></tr>
                        <tr><td>النقدية</td><td>${Utils.formatMoney(cash)}</td></tr>
                        <tr><td>المخزون</td><td>${Utils.formatMoney(inventory)}</td></tr>
                        <tr><td>ذمم العملاء</td><td>${Utils.formatMoney(receivables)}</td></tr>
                        <tr class="sub-total"><td>إجمالي الأصول المتداولة</td><td>${Utils.formatMoney(totalCurrentAssets)}</td></tr>
                        <tr><td colspan="2"><strong>الخصوم المتداولة</strong></td></tr>
                        <tr><td>ذمم الموردين</td><td>${Utils.formatMoney(payables)}</td></tr>
                        <tr class="sub-total"><td>إجمالي الخصوم</td><td>${Utils.formatMoney(payables)}</td></tr>
                        <tr class="grand-total"><td>صافي حقوق الملكية</td><td>${Utils.formatMoney(netWorth)}</td></tr>
                    </table>
                </div>
            </div>
        `;
        this.el.tabContent.innerHTML = html;
    },

    // 4. المخزون
    renderInventory() {
        const totalValue = this.getInventoryValue();
        let rows = '';
        this.products.forEach(prod => {
            const base = prod.units?.[0];
            if (base && base.stock > 0) {
                rows += `<tr>
                    <td>${prod.name}</td>
                    <td>${base.stock} ${base.name}</td>
                    <td>${Utils.formatMoney(base.cost)}</td>
                    <td>${Utils.formatMoney(base.stock * base.cost)}</td>
                </tr>`;
            }
        });

        const html = `
            <div class="section">
                <div class="section-title"><i class="fas fa-boxes"></i> تقييم المخزون</div>
                <div class="stats-grid" style="margin-bottom:20px;">
                    <div class="stat-card"><div class="value">${Utils.formatMoney(totalValue)}</div><div class="label">قيمة المخزون الإجمالية</div></div>
                    <div class="stat-card"><div class="value">${this.products.length}</div><div class="label">عدد المنتجات</div></div>
                </div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>المنتج</th><th>المخزون</th><th>تكلفة الوحدة</th><th>القيمة</th></tr></thead>
                        <tbody>${rows || '<tr><td colspan="4" class="loading">لا يوجد مخزون</td></tr>'}</tbody>
                        <tr class="total-row"><td colspan="3">الإجمالي</td><td>${Utils.formatMoney(totalValue)}</td></tr>
                    </table>
                </div>
            </div>
        `;
        this.el.tabContent.innerHTML = html;
    },

    // 5. أرصدة العملاء والموردين
    renderReceivables() {
        const customerRows = this.customers.map(c => `
            <tr><td>${c.name}</td><td>${c.phone || '-'}</td><td>${Utils.formatMoney(c.balance || 0)}</td></tr>
        `).join('');
        const supplierRows = this.suppliers.map(s => `
            <tr><td>${s.name}</td><td>${s.phone || '-'}</td><td>${Utils.formatMoney(s.balance || 0)}</td></tr>
        `).join('');

        const html = `
            <div class="section">
                <div class="section-title"><i class="fas fa-users"></i> أرصدة العملاء</div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>العميل</th><th>الهاتف</th><th>الرصيد</th></tr></thead>
                        <tbody>${customerRows || '<tr><td colspan="3">لا يوجد عملاء</td></tr>'}</tbody>
                        <tr class="total-row"><td colspan="2">إجمالي الذمم المدينة</td><td>${Utils.formatMoney(this.getCustomerBalances())}</td></tr>
                    </table>
                </div>
            </div>
            <div class="section">
                <div class="section-title"><i class="fas fa-truck"></i> أرصدة الموردين</div>
                <div class="table-container">
                    <table>
                        <thead><tr><th>المورد</th><th>الهاتف</th><th>الرصيد</th></tr></thead>
                        <tbody>${supplierRows || '<tr><td colspan="3">لا يوجد موردين</td></tr>'}</tbody>
                        <tr class="total-row"><td colspan="2">إجمالي الذمم الدائنة</td><td>${Utils.formatMoney(this.getSupplierBalances())}</td></tr>
                    </table>
                </div>
            </div>
        `;
        this.el.tabContent.innerHTML = html;
    }
};

window.Accounting = Accounting;
document.addEventListener('DOMContentLoaded', () => Accounting.init());
