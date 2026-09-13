/* =============================================
   reports.js - Reports Page Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ State ============ */
    const State = {
        currentUser: null,
        invoices: [],
        parties: [],
        products: [],
        transactions: [],
        period: 'today',
        customFrom: null,
        customTo: null,
        activeReport: 'overview'
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Reports init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (!window.DB?.client) {
            console.error('❌ Supabase غير محمّل');
            showToast('تعذر الاتصال بالخادم', 'error');
            return;
        }

        await new Promise(r => setTimeout(r, 300));

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadData();
        hideLoadingBar();
        console.log('✅ Reports ready');
    }

    /* ============================================
       Load Data
       ============================================ */
    async function loadData() {
        showLoading();
        try {
            const [invoices, parties, products, transactions] = await Promise.all([
                DB.getInvoices(true).catch(() => []),
                DB.getParties(null, true).catch(() => []),
                DB.getProducts(true).catch(() => []),
                DB.getPayments().catch(() => [])
            ]);

            State.invoices = invoices || [];
            State.parties = parties || [];
            State.products = products || [];
            State.transactions = transactions || [];

            console.log('📊 Data loaded:', {
                invoices: State.invoices.length,
                parties: State.parties.length,
                products: State.products.length,
                transactions: State.transactions.length
            });

            renderAll();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
        } finally {
            hideLoadingBar();
        }
    }

    /* ============================================
       Period Handling
       ============================================ */
    function getDateRange() {
        const today = new Date();
        const todayStr = U.today();
        let from, to;

        switch (State.period) {
            case 'today':
                from = todayStr;
                to = todayStr;
                break;
            case 'yesterday':
                const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
                from = yesterday.toISOString().split('T')[0];
                to = from;
                break;
            case 'week':
                const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                from = weekAgo.toISOString().split('T')[0];
                to = todayStr;
                break;
            case 'month':
                const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
                from = monthAgo.toISOString().split('T')[0];
                to = todayStr;
                break;
            case 'year':
                const yearAgo = new Date(today.getFullYear(), 0, 1);
                from = yearAgo.toISOString().split('T')[0];
                to = todayStr;
                break;
            case 'custom':
                from = State.customFrom || todayStr;
                to = State.customTo || todayStr;
                break;
            default:
                from = todayStr;
                to = todayStr;
        }

        return { from, to };
    }

    function filterByPeriod(items, dateField = 'date') {
        const { from, to } = getDateRange();
        return items.filter(item => {
            const d = item[dateField] || (item.created_at || '').slice(0, 10);
            return d >= from && d <= to;
        });
    }

    function updatePeriodLabel() {
        const { from, to } = getDateRange();
        const el = $('#reportPeriod');
        if (!el) return;

        if (from === to) {
            el.textContent = `التقرير بتاريخ: ${U.date(from)}`;
        } else {
            el.textContent = `من ${U.date(from)} إلى ${U.date(to)}`;
        }
    }

    /* ============================================
       Render All Reports
       ============================================ */
    function renderAll() {
        updatePeriodLabel();
        renderOverview();
        renderSales();
        renderPurchases();
        renderProducts();
        renderCustomers();
        renderPayments();
    }

    /* ============================================
       Overview Report
       ============================================ */
    function renderOverview() {
        const periodInvoices = filterByPeriod(State.invoices);
        const sales = periodInvoices.filter(i => i.type === 'sale');
        const purchases = periodInvoices.filter(i => i.type === 'purchase');

        const totalSales = sales.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const totalPurchases = purchases.reduce((s, i) => s + (Number(i.total) || 0), 0);

        // حساب الربح
        let totalProfit = 0;
        sales.forEach(inv => {
            (inv.items || []).forEach(item => {
                const cost = Number(item.cost) || 0;
                const price = Number(item.price) || 0;
                const qty = Number(item.quantity) || 0;
                totalProfit += (price - cost) * qty;
            });
        });

        const netProfit = totalProfit - (Number(discounts) || 0);
        const discounts = sales.reduce((s, i) => s + (Number(i.discount) || 0), 0);

        // عدد الفواتير
        const invoiceCount = sales.length;
        const avgInvoice = invoiceCount > 0 ? totalSales / invoiceCount : 0;

        // KPI
        const kpiGrid = $('#overviewKPI');
        if (kpiGrid) {
            kpiGrid.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-card__icon green"><i class="fas fa-chart-line"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي المبيعات</span>
                        <span class="kpi-card__value">${U.money(totalSales)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon blue"><i class="fas fa-file-invoice"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">عدد فواتير البيع</span>
                        <span class="kpi-card__value">${invoiceCount}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon orange"><i class="fas fa-truck"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي المشتريات</span>
                        <span class="kpi-card__value">${U.money(totalPurchases)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon purple"><i class="fas fa-coins"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">صافي الربح</span>
                        <span class="kpi-card__value">${U.money(netProfit)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon teal"><i class="fas fa-calculator"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">متوسط الفاتورة</span>
                        <span class="kpi-card__value">${U.money(avgInvoice)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon red"><i class="fas fa-percentage"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي الخصومات</span>
                        <span class="kpi-card__value">${U.money(discounts)}</span>
                    </div>
                </div>
            `;
        }

        // Chart - daily sales
        renderOverviewChart(sales);

        // Payment breakdown
        renderPaymentBreakdown(sales);

        // Top products
        renderTopProductsOverview(sales);

        // Top customers
        renderTopCustomersOverview(sales);
    }

    function renderOverviewChart(sales) {
        const container = $('#overviewChart');
        if (!container) return;

        const days = [];
        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        // Last 7 days
        for (let i = 6; i >= 0; i--) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split('T')[0];
            const daySales = sales
                .filter(inv => (inv.date || (inv.created_at || '').slice(0, 10)) === dateStr)
                .reduce((s, i) => s + (Number(i.total) || 0), 0);

            days.push({
                name: dayNames[date.getDay()],
                date: dateStr,
                shortDate: `${date.getDate()}/${date.getMonth() + 1}`,
                sales: daySales
            });
        }

        const maxSales = Math.max(...days.map(d => d.sales), 1);
        const allZero = days.every(d => d.sales === 0);

        if (allZero) {
            container.innerHTML = `
                <div class="chart-empty">
                    <i class="fas fa-chart-area"></i>
                    <p>لا توجد مبيعات في آخر 7 أيام</p>
                </div>
            `;
            return;
        }

        container.innerHTML = days.map(d => {
            const percent = (d.sales / maxSales) * 100;
            return `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar" style="height: ${Math.max(percent, 4)}%;">
                        <span class="chart-bar__value">${U.moneyRaw(d.sales)}</span>
                    </div>
                    <span class="chart-bar__label">${d.name}</span>
                    <span class="chart-bar__date">${d.shortDate}</span>
                </div>
            `;
        }).join('');
    }

    function renderPaymentBreakdown(sales) {
        const container = $('#paymentBreakdown');
        if (!container) return;

        const methods = {
            cash: { label: 'نقدي', icon: 'fa-money-bill-wave', class: 'cash', total: 0, count: 0 },
            card: { label: 'بطاقة', icon: 'fa-credit-card', class: 'card', total: 0, count: 0 },
            transfer: { label: 'تحويل', icon: 'fa-exchange-alt', class: 'transfer', total: 0, count: 0 },
            credit: { label: 'آجل', icon: 'fa-hand-holding-usd', class: 'credit', total: 0, count: 0 },
            mixed: { label: 'مختلط', icon: 'fa-layer-group', class: 'mixed', total: 0, count: 0 }
        };

        sales.forEach(inv => {
            const m = inv.payment_method || 'cash';
            if (methods[m]) {
                methods[m].total += Number(inv.total) || 0;
                methods[m].count += 1;
            }
        });

        const total = Object.values(methods).reduce((s, m) => s + m.total, 0);
        const active = Object.entries(methods).filter(([_, m]) => m.count > 0);

        if (!active.length) {
            container.innerHTML = `
                <div class="chart-empty" style="height:180px;">
                    <i class="fas fa-inbox"></i>
                    <p>لا توجد بيانات</p>
                </div>
            `;
            return;
        }

        container.innerHTML = active.map(([key, m]) => {
            const percent = total > 0 ? (m.total / total) * 100 : 0;
            return `
                <div class="payment-item">
                    <div class="payment-item__label">
                        <i class="fas ${m.icon} ${m.class}"></i>
                        <span>${m.label}</span>
                    </div>
                    <div class="payment-item__value">
                        ${U.money(m.total)}
                        <small>${m.count} فاتورة · ${percent.toFixed(1)}%</small>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderTopProductsOverview(sales) {
        const container = $('#topProductsOverview');
        if (!container) return;

        const productSales = new Map();

        sales.forEach(inv => {
            (inv.items || []).forEach(item => {
                const key = item.productId || item.productName;
                const current = productSales.get(key) || {
                    name: item.productName || 'منتج',
                    qty: 0,
                    amount: 0
                };
                current.qty += Number(item.quantity) || 0;
                current.amount += (Number(item.price) || 0) * (Number(item.quantity) || 0);
                productSales.set(key, current);
            });
        });

        const sorted = [...productSales.values()]
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);

        if (!sorted.length) {
            container.innerHTML = `
                <div class="chart-empty" style="height:180px;">
                    <i class="fas fa-star"></i>
                    <p>لا توجد مبيعات</p>
                </div>
            `;
            return;
        }

        const rankClasses = ['gold', 'silver', 'bronze', '', ''];

        container.innerHTML = sorted.map((p, i) => `
            <div class="top-list-item">
                <div class="top-list-item__rank ${rankClasses[i] || ''}">${i + 1}</div>
                <div class="top-list-item__info">
                    <div class="top-list-item__name">${U.escape(p.name)}</div>
                    <div class="top-list-item__meta">${p.qty} وحدة</div>
                </div>
                <div class="top-list-item__amount">${U.money(p.amount)}</div>
            </div>
        `).join('');
    }

    function renderTopCustomersOverview(sales) {
        const container = $('#topCustomersOverview');
        if (!container) return;

        const customerSales = new Map();

        sales.forEach(inv => {
            if (!inv.customer_id) return;
            const current = customerSales.get(inv.customer_id) || {
                name: inv.customer_name || 'عميل',
                total: 0,
                count: 0
            };
            current.total += Number(inv.total) || 0;
            current.count += 1;
            customerSales.set(inv.customer_id, current);
        });

        const sorted = [...customerSales.values()]
            .sort((a, b) => b.total - a.total)
            .slice(0, 5);

        if (!sorted.length) {
            container.innerHTML = `
                <div class="chart-empty" style="height:180px;">
                    <i class="fas fa-users"></i>
                    <p>لا توجد بيانات</p>
                </div>
            `;
            return;
        }

        const rankClasses = ['gold', 'silver', 'bronze', '', ''];

        container.innerHTML = sorted.map((c, i) => `
            <div class="top-list-item">
                <div class="top-list-item__rank ${rankClasses[i] || ''}">${i + 1}</div>
                <div class="top-list-item__info">
                    <div class="top-list-item__name">${U.escape(c.name)}</div>
                    <div class="top-list-item__meta">${c.count} فاتورة</div>
                </div>
                <div class="top-list-item__amount">${U.money(c.total)}</div>
            </div>
        `).join('');
    }

    /* ============================================
       Sales Report
       ============================================ */
    function renderSales() {
        const sales = filterByPeriod(State.invoices).filter(i => i.type === 'sale');

        const total = sales.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const paid = sales.reduce((s, i) => s + (Number(i.paid) || 0), 0);
        const remaining = sales.reduce((s, i) => s + (Number(i.remaining) || 0), 0);
        const discount = sales.reduce((s, i) => s + (Number(i.discount) || 0), 0);

        const kpi = $('#salesKPI');
        if (kpi) {
            kpi.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-card__icon green"><i class="fas fa-money-bill"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي المبيعات</span>
                        <span class="kpi-card__value">${U.money(total)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon blue"><i class="fas fa-check-circle"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">المدفوع</span>
                        <span class="kpi-card__value">${U.money(paid)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon red"><i class="fas fa-clock"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">المتبقي</span>
                        <span class="kpi-card__value">${U.money(remaining)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon orange"><i class="fas fa-percentage"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">الخصومات</span>
                        <span class="kpi-card__value">${U.money(discount)}</span>
                    </div>
                </div>
            `;
        }

        const tbody = $('#salesTableBody');
        if (!tbody) return;

        if (!sales.length) {
            tbody.innerHTML = `
                <tr><td colspan="8">
                    <div class="table-empty">
                        <i class="fas fa-inbox"></i>
                        <p>لا توجد فواتير في هذه الفترة</p>
                    </div>
                </td></tr>
            `;
            return;
        }

        const sorted = sales.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

        tbody.innerHTML = sorted.map((inv, i) => {
            const status = inv.status || 'paid';
            const statusLabel = {
                paid: 'مدفوعة',
                partial: 'جزئية',
                credit: 'آجلة',
                held: 'معلقة'
            }[status] || 'مدفوعة';

            return `
                <tr>
                    <td>${i + 1}</td>
                    <td class="text-primary">${U.escape(inv.invoice_number || '---')}</td>
                    <td>${U.date(inv.date || inv.created_at)}</td>
                    <td>${U.escape(inv.customer_name || 'نقدي')}</td>
                    <td>${U.money(Number(inv.total) || 0)}</td>
                    <td class="text-success">${U.money(Number(inv.paid) || 0)}</td>
                    <td class="text-danger">${U.money(Number(inv.remaining) || 0)}</td>
                    <td><span class="status-badge ${status}">${statusLabel}</span></td>
                </tr>
            `;
        }).join('');
    }

    /* ============================================
       Purchases Report
       ============================================ */
    function renderPurchases() {
        const purchases = filterByPeriod(State.invoices).filter(i => i.type === 'purchase');

        const total = purchases.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const paid = purchases.reduce((s, i) => s + (Number(i.paid) || 0), 0);
        const remaining = purchases.reduce((s, i) => s + (Number(i.remaining) || 0), 0);

        const kpi = $('#purchasesKPI');
        if (kpi) {
            kpi.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-card__icon orange"><i class="fas fa-shopping-cart"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي المشتريات</span>
                        <span class="kpi-card__value">${U.money(total)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon blue"><i class="fas fa-check-circle"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">المدفوع</span>
                        <span class="kpi-card__value">${U.money(paid)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon red"><i class="fas fa-clock"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">المتبقي للموردين</span>
                        <span class="kpi-card__value">${U.money(remaining)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon purple"><i class="fas fa-list"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">عدد الفواتير</span>
                        <span class="kpi-card__value">${purchases.length}</span>
                    </div>
                </div>
            `;
        }

        const tbody = $('#purchasesTableBody');
        if (!tbody) return;

        if (!purchases.length) {
            tbody.innerHTML = `
                <tr><td colspan="8">
                    <div class="table-empty">
                        <i class="fas fa-inbox"></i>
                        <p>لا توجد فواتير في هذه الفترة</p>
                    </div>
                </td></tr>
            `;
            return;
        }

        const sorted = purchases.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

        tbody.innerHTML = sorted.map((inv, i) => {
            const status = inv.status || 'paid';
            const statusLabel = {
                paid: 'مدفوعة',
                partial: 'جزئية',
                credit: 'آجلة'
            }[status] || 'مدفوعة';

            return `
                <tr>
                    <td>${i + 1}</td>
                    <td class="text-primary">${U.escape(inv.invoice_number || '---')}</td>
                    <td>${U.date(inv.date || inv.created_at)}</td>
                    <td>${U.escape(inv.supplier_name || '---')}</td>
                    <td>${U.money(Number(inv.total) || 0)}</td>
                    <td class="text-success">${U.money(Number(inv.paid) || 0)}</td>
                    <td class="text-danger">${U.money(Number(inv.remaining) || 0)}</td>
                    <td><span class="status-badge ${status}">${statusLabel}</span></td>
                </tr>
            `;
        }).join('');
    }

    /* ============================================
       Products Report
       ============================================ */
    function renderProducts() {
        const sales = filterByPeriod(State.invoices).filter(i => i.type === 'sale');

        const productStats = new Map();

        sales.forEach(inv => {
            (inv.items || []).forEach(item => {
                const key = item.productId || item.productName;
                const current = productStats.get(key) || {
                    name: item.productName || 'منتج',
                    qty: 0,
                    revenue: 0,
                    cost: 0
                };
                const q = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const unitCost = Number(item.cost) || 0;

                current.qty += q;
                current.revenue += price * q;
                current.cost += unitCost * q;
                productStats.set(key, current);
            });
        });

        const list = [...productStats.values()];
        const totalRevenue = list.reduce((s, p) => s + p.revenue, 0);
        const totalCost = list.reduce((s, p) => s + p.cost, 0);
        const totalProfit = totalRevenue - totalCost;
        const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

        const kpi = $('#productsKPI');
        if (kpi) {
            kpi.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-card__icon blue"><i class="fas fa-boxes"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">عدد المنتجات المباعة</span>
                        <span class="kpi-card__value">${list.length}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon green"><i class="fas fa-money-bill"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي الإيرادات</span>
                        <span class="kpi-card__value">${U.money(totalRevenue)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon purple"><i class="fas fa-coins"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي الأرباح</span>
                        <span class="kpi-card__value">${U.money(totalProfit)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon teal"><i class="fas fa-percentage"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">متوسط هامش الربح</span>
                        <span class="kpi-card__value">${avgMargin.toFixed(1)}%</span>
                    </div>
                </div>
            `;
        }

        const tbody = $('#productsTableBody');
        if (!tbody) return;

        if (!list.length) {
            tbody.innerHTML = `
                <tr><td colspan="7">
                    <div class="table-empty">
                        <i class="fas fa-box-open"></i>
                        <p>لا توجد مبيعات في هذه الفترة</p>
                    </div>
                </td></tr>
            `;
            return;
        }

        const sorted = list.sort((a, b) => b.qty - a.qty);

        tbody.innerHTML = sorted.map((p, i) => {
            const profit = p.revenue - p.cost;
            const margin = p.revenue > 0 ? (profit / p.revenue) * 100 : 0;
            const marginClass = margin >= 0 ? 'text-success' : 'text-danger';

            return `
                <tr>
                    <td>${i + 1}</td>
                    <td><strong>${U.escape(p.name)}</strong></td>
                    <td>${U.round(p.qty, 3)}</td>
                    <td>${U.money(p.revenue)}</td>
                    <td>${U.money(p.cost)}</td>
                    <td class="${marginClass}">${U.money(profit)}</td>
                    <td class="${marginClass}">${margin.toFixed(1)}%</td>
                </tr>
            `;
        }).join('');
    }

    /* ============================================
       Customers Report
       ============================================ */
    function renderCustomers() {
        const sales = filterByPeriod(State.invoices).filter(i => i.type === 'sale');

        const customerStats = new Map();

        sales.forEach(inv => {
            if (!inv.customer_id) return;
            const current = customerStats.get(inv.customer_id) || {
                id: inv.customer_id,
                name: inv.customer_name || 'عميل',
                phone: '',
                count: 0,
                total: 0,
                paid: 0
            };
            current.count += 1;
            current.total += Number(inv.total) || 0;
            current.paid += Number(inv.paid) || 0;
            customerStats.set(inv.customer_id, current);
        });

        // إضافة أرقام الهواتف والأرصدة
        customerStats.forEach((c, id) => {
            const party = State.parties.find(p => p.id === id);
            if (party) {
                c.phone = party.phone || '';
                c.balance = Number(party.balance) || 0;
            }
        });

        const list = [...customerStats.values()];
        const totalSales = list.reduce((s, c) => s + c.total, 0);
        const totalPaid = list.reduce((s, c) => s + c.paid, 0);
        const totalBalance = list.reduce((s, c) => s + (c.balance || 0), 0);

        const kpi = $('#customersKPI');
        if (kpi) {
            kpi.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-card__icon blue"><i class="fas fa-users"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">عدد العملاء المشترين</span>
                        <span class="kpi-card__value">${list.length}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon green"><i class="fas fa-money-bill"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي المبيعات</span>
                        <span class="kpi-card__value">${U.money(totalSales)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon teal"><i class="fas fa-check-circle"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي المدفوع</span>
                        <span class="kpi-card__value">${U.money(totalPaid)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon red"><i class="fas fa-exclamation-circle"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي الديون</span>
                        <span class="kpi-card__value">${U.money(Math.abs(totalBalance))}</span>
                    </div>
                </div>
            `;
        }

        const tbody = $('#customersTableBody');
        if (!tbody) return;

        if (!list.length) {
            tbody.innerHTML = `
                <tr><td colspan="7">
                    <div class="table-empty">
                        <i class="fas fa-users"></i>
                        <p>لا توجد مبيعات في هذه الفترة</p>
                    </div>
                </td></tr>
            `;
            return;
        }

        const sorted = list.sort((a, b) => b.total - a.total);

        tbody.innerHTML = sorted.map((c, i) => {
            const balance = c.balance || 0;
            const balanceClass = balance > 0 ? 'text-success' : balance < 0 ? 'text-danger' : '';

            return `
                <tr>
                    <td>${i + 1}</td>
                    <td><strong>${U.escape(c.name)}</strong></td>
                    <td class="text-muted">${U.escape(c.phone || '---')}</td>
                    <td>${c.count}</td>
                    <td>${U.money(c.total)}</td>
                    <td class="text-success">${U.money(c.paid)}</td>
                    <td class="${balanceClass}">${U.money(balance)}</td>
                </tr>
            `;
        }).join('');
    }

    /* ============================================
       Payments Report
       ============================================ */
    function renderPayments() {
        const sales = filterByPeriod(State.invoices).filter(i => i.type === 'sale');

        const totalCash = sales.reduce((s, i) => s + (Number(i.cash_paid) || 0), 0);
        const totalCard = sales.reduce((s, i) => s + (Number(i.card_paid) || 0), 0);
        const totalTransfer = sales.reduce((s, i) => s + (Number(i.transfer_paid) || 0), 0);
        const totalCredit = sales.filter(i => i.status === 'credit' || i.status === 'partial')
            .reduce((s, i) => s + (Number(i.remaining) || 0), 0);
        const totalUsedBalance = sales.reduce((s, i) => s + (Number(i.used_balance) || 0), 0);

        const totalCollected = totalCash + totalCard + totalTransfer;

        const kpi = $('#paymentsKPI');
        if (kpi) {
            kpi.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-card__icon green"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">نقدي</span>
                        <span class="kpi-card__value">${U.money(totalCash)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon blue"><i class="fas fa-credit-card"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">بطاقة</span>
                        <span class="kpi-card__value">${U.money(totalCard)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon orange"><i class="fas fa-exchange-alt"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">تحويل</span>
                        <span class="kpi-card__value">${U.money(totalTransfer)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon red"><i class="fas fa-hand-holding-usd"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">آجل</span>
                        <span class="kpi-card__value">${U.money(totalCredit)}</span>
                    </div>
                </div>
            `;
        }

        // Payment methods chart
        const chartContainer = $('#paymentMethodsChart');
        if (chartContainer) {
            const data = [
                { label: 'نقدي', value: totalCash, color: '#10b981' },
                { label: 'بطاقة', value: totalCard, color: '#2563eb' },
                { label: 'تحويل', value: totalTransfer, color: '#f59e0b' },
                { label: 'آجل', value: totalCredit, color: '#ef4444' }
            ].filter(d => d.value > 0);

            if (!data.length) {
                chartContainer.innerHTML = `
                    <div class="chart-empty" style="height:180px;">
                        <i class="fas fa-chart-pie"></i>
                        <p>لا توجد بيانات</p>
                    </div>
                `;
            } else {
                const total = data.reduce((s, d) => s + d.value, 0);
                chartContainer.innerHTML = data.map(d => {
                    const percent = (d.value / total) * 100;
                    return `
                        <div class="payment-item">
                            <div class="payment-item__label">
                                <i class="fas fa-circle" style="color: ${d.color}; font-size: 12px;"></i>
                                <span>${d.label}</span>
                            </div>
                            <div class="payment-item__value" style="flex:1;">
                                ${U.money(d.value)}
                                <div class="progress-bar">
                                    <div class="progress-bar__fill" style="width: ${percent}%; background: ${d.color};"></div>
                                </div>
                                <small>${percent.toFixed(1)}%</small>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }

        // Summary
        const summaryContainer = $('#paymentSummary');
        if (summaryContainer) {
            summaryContainer.innerHTML = `
                <div class="summary-box">
                    <div class="summary-box__row">
                        <span>إجمالي التحصيل</span>
                        <strong class="text-success">${U.money(totalCollected)}</strong>
                    </div>
                    <div class="summary-box__row">
                        <span>استُخدم من رصيد العملاء</span>
                        <strong>${U.money(totalUsedBalance)}</strong>
                    </div>
                    <div class="summary-box__row">
                        <span>مبالغ آجلة</span>
                        <strong class="text-danger">${U.money(totalCredit)}</strong>
                    </div>
                    <div class="summary-box__row highlight">
                        <span>إجمالي المبيعات</span>
                        <strong>${U.money(totalCollected + totalCredit + totalUsedBalance)}</strong>
                    </div>
                </div>
            `;
        }
    }

    /* ============================================
       Export Functions
       ============================================ */
    function exportToCSV(filename, headers, rows) {
        const csv = [
            headers,
            ...rows
        ].map(row =>
            row.map(cell => {
                const s = String(cell ?? '');
                return (s.includes(',') || s.includes('"') || s.includes('\n'))
                    ? '"' + s.replace(/"/g, '""') + '"'
                    : s;
            }).join(',')
        ).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        showToast('تم التصدير', 'success');
    }

    function exportSales() {
        const sales = filterByPeriod(State.invoices).filter(i => i.type === 'sale');
        if (!sales.length) { showToast('لا توجد بيانات', 'info'); return; }

        const headers = ['رقم الفاتورة', 'التاريخ', 'العميل', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'];
        const rows = sales.map(inv => [
            inv.invoice_number || '',
            inv.date || '',
            inv.customer_name || 'نقدي',
            Number(inv.total) || 0,
            Number(inv.paid) || 0,
            Number(inv.remaining) || 0,
            inv.status || 'paid'
        ]);

        const { from, to } = getDateRange();
        exportToCSV(`sales-${from}_${to}.csv`, headers, rows);
    }

    function exportPurchases() {
        const purchases = filterByPeriod(State.invoices).filter(i => i.type === 'purchase');
        if (!purchases.length) { showToast('لا توجد بيانات', 'info'); return; }

        const headers = ['رقم الفاتورة', 'التاريخ', 'المورد', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'];
        const rows = purchases.map(inv => [
            inv.invoice_number || '',
            inv.date || '',
            inv.supplier_name || '',
            Number(inv.total) || 0,
            Number(inv.paid) || 0,
            Number(inv.remaining) || 0,
            inv.status || 'paid'
        ]);

        const { from, to } = getDateRange();
        exportToCSV(`purchases-${from}_${to}.csv`, headers, rows);
    }

    function exportProducts() {
        const sales = filterByPeriod(State.invoices).filter(i => i.type === 'sale');
        const productStats = new Map();

        sales.forEach(inv => {
            (inv.items || []).forEach(item => {
                const key = item.productId || item.productName;
                const current = productStats.get(key) || {
                    name: item.productName || 'منتج',
                    qty: 0, revenue: 0, cost: 0
                };
                current.qty += Number(item.quantity) || 0;
                current.revenue += (Number(item.price) || 0) * (Number(item.quantity) || 0);
                current.cost += (Number(item.cost) || 0) * (Number(item.quantity) || 0);
                productStats.set(key, current);
            });
        });

        const list = [...productStats.values()].sort((a, b) => b.qty - a.qty);
        if (!list.length) { showToast('لا توجد بيانات', 'info'); return; }

        const headers = ['المنتج', 'الكمية المباعة', 'الإيرادات', 'التكلفة', 'الربح', 'هامش %'];
        const rows = list.map(p => {
            const profit = p.revenue - p.cost;
            const margin = p.revenue > 0 ? (profit / p.revenue) * 100 : 0;
            return [p.name, p.qty, p.revenue, p.cost, profit, margin.toFixed(1)];
        });

        const { from, to } = getDateRange();
        exportToCSV(`products-${from}_${to}.csv`, headers, rows);
    }

    function exportCustomers() {
        const sales = filterByPeriod(State.invoices).filter(i => i.type === 'sale');
        const customerStats = new Map();

        sales.forEach(inv => {
            if (!inv.customer_id) return;
            const current = customerStats.get(inv.customer_id) || {
                name: inv.customer_name || 'عميل',
                phone: '',
                count: 0,
                total: 0,
                paid: 0,
                balance: 0
            };
            current.count += 1;
            current.total += Number(inv.total) || 0;
            current.paid += Number(inv.paid) || 0;
            customerStats.set(inv.customer_id, current);
        });

        customerStats.forEach((c, id) => {
            const party = State.parties.find(p => p.id === id);
            if (party) {
                c.phone = party.phone || '';
                c.balance = Number(party.balance) || 0;
            }
        });

        const list = [...customerStats.values()].sort((a, b) => b.total - a.total);
        if (!list.length) { showToast('لا توجد بيانات', 'info'); return; }

        const headers = ['العميل', 'الهاتف', 'عدد الفواتير', 'إجمالي المشتريات', 'المدفوع', 'الرصيد'];
        const rows = list.map(c => [c.name, c.phone, c.count, c.total, c.paid, c.balance]);

        const { from, to } = getDateRange();
        exportToCSV(`customers-${from}_${to}.csv`, headers, rows);
    }

    /* ============================================
       Print
       ============================================ */
    function printReport() {
        const { from, to } = getDateRange();
        const type = State.activeReport;

        let content = '';

        // Build print content based on active report
        const titles = {
            overview: 'نظرة عامة',
            sales: 'تقرير المبيعات',
            purchases: 'تقرير المشتريات',
            products: 'تقرير المنتجات',
            customers: 'تقرير العملاء',
            payments: 'تقرير المدفوعات'
        };

        const settings = U.ls.get('settings', {}) || {};
        const shopName = settings.shopName || 'حسابي';
        const shopPhone = settings.phone || '';

        content += `
            <div style="text-align:center;margin-bottom:20px;">
                <h1 style="font-size:22px;margin-bottom:4px;">${U.escape(shopName)}</h1>
                ${shopPhone ? `<p style="font-size:12px;color:#666;">هاتف: ${U.escape(shopPhone)}</p>` : ''}
                <h2 style="font-size:18px;margin-top:12px;">${titles[type] || 'تقرير'}</h2>
                <p style="font-size:12px;color:#666;">الفترة: ${U.date(from)} - ${U.date(to)}</p>
                <p style="font-size:11px;color:#999;">تاريخ الطباعة: ${U.dateTime(new Date())}</p>
            </div>
        `;

        // Content based on active tab
        if (type === 'overview') {
            const kpiGrid = $('#overviewKPI')?.innerHTML || '';
            content += `<div>${kpiGrid}</div>`;
        } else if (type === 'sales') {
            const table = $('#salesTable')?.outerHTML || '';
            content += table;
        } else if (type === 'purchases') {
            const table = $('#purchasesTable')?.outerHTML || '';
            content += table;
        } else if (type === 'products') {
            const table = $('#productsTable')?.outerHTML || '';
            content += table;
        } else if (type === 'customers') {
            const table = $('#customersTable')?.outerHTML || '';
            content += table;
        }

        const win = window.open('', '_blank', 'width=900,height=700');
        win.document.write(`
            <!DOCTYPE html>
            <html dir="rtl"><head><meta charset="UTF-8">
            <title>طباعة التقرير</title>
            <style>
                body { font-family: 'Cairo', Arial, sans-serif; padding: 20px; font-size: 12px; direction: rtl; }
                .kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
                .kpi-card { padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
                .kpi-card__label { font-size: 10px; color: #666; }
                .kpi-card__value { font-size: 14px; font-weight: bold; margin-top: 4px; }
                .report-table { width: 100%; border-collapse: collapse; }
                .report-table th, .report-table td { padding: 6px; border-bottom: 1px solid #ddd; font-size: 11px; text-align: right; }
                .report-table th { background: #f5f5f5; font-weight: bold; }
                .text-success { color: #10b981; }
                .text-danger { color: #ef4444; }
                .text-primary { color: #4f46e5; }
                .status-badge { padding: 2px 6px; border-radius: 4px; font-size: 9px; }
                @media print { body { padding: 0; } }
            </style>
            </head><body>${content}</body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    /* ============================================
       UI Helpers
       ============================================ */
    function updateUserUI() {
        const avatar = $('#userAvatar');
        const name = $('#sidebarUserName');
        if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
        if (name) name.textContent = State.currentUser.fullName || 'مدير';
    }

    function updateConnStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('is-offline', !online);
        const status = $('#connStatus');
        if (status) {
            status.textContent = online ? 'متصل' : 'غير متصل';
            status.style.color = online ? 'var(--success)' : 'var(--danger)';
        }
    }

    function updateThemeIcon() {
        const btn = $('#themeBtn');
        if (!btn) return;
        const isDark = document.documentElement.dataset.theme === 'dark';
        btn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    function showLoading() {
        const bar = $('#loading-bar');
        if (bar) bar.style.width = '70%';
    }

    function hideLoadingBar() {
        const bar = $('#loading-bar');
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        }
    }

    /* ============================================
       Toast
       ============================================ */
    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }

        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 12px 22px;
            background: ${colors[type] || colors.info};
            color: #fff;
            border-radius: 999px;
            font-weight: 700;
            font-size: 14px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            pointer-events: auto;
        `;
        toast.innerHTML = `<i class="fas fa-${icons[type]}"></i> <span>${U.escape(msg)}</span>`;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    /* ============================================
       Events
       ============================================ */
    function bindEvents() {
        // Sidebar
        $('#menuBtn')?.addEventListener('click', () => {
            $('#sidebar')?.classList.add('open');
            $('#sidebarOverlay')?.classList.add('show');
        });
        $('#sidebarOverlay')?.addEventListener('click', () => {
            $('#sidebar')?.classList.remove('open');
            $('#sidebarOverlay')?.classList.remove('show');
        });
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                $('#sidebar')?.classList.remove('open');
                $('#sidebarOverlay')?.classList.remove('show');
            });
        });

        // Theme
        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        // Logout
        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        // Refresh
        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            DB.clearCache();
            await loadData();
            showToast('تم التحديث', 'success');
        });

        // Print & Export
        $('#printReportBtn')?.addEventListener('click', printReport);
        $('#exportReportBtn')?.addEventListener('click', () => {
            // Export based on active report
            const type = State.activeReport;
            if (type === 'sales') exportSales();
            else if (type === 'purchases') exportPurchases();
            else if (type === 'products') exportProducts();
            else if (type === 'customers') exportCustomers();
            else exportSales(); // default
        });

        // Period tabs
        $$('.period-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.period-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                State.period = btn.dataset.period;

                if (State.period === 'custom') {
                    $('#customPeriod').style.display = 'grid';
                } else {
                    $('#customPeriod').style.display = 'none';
                    renderAll();
                }
            });
        });

        // Custom period apply
        $('#applyCustomPeriod')?.addEventListener('click', () => {
            const from = $('#fromDate').value;
            const to = $('#toDate').value;

            if (!from || !to) {
                showToast('يرجى إدخال التاريخين', 'warning');
                return;
            }
            if (from > to) {
                showToast('تاريخ البداية يجب أن يكون قبل النهاية', 'warning');
                return;
            }

            State.customFrom = from;
            State.customTo = to;
            renderAll();
        });

        // Report tabs
        $$('.report-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.report-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                State.activeReport = btn.dataset.report;

                $$('.report-content').forEach(c => c.classList.remove('active'));
                $(`[data-report-content="${State.activeReport}"]`)?.classList.add('active');
            });
        });

        // Export buttons
        $('#exportSalesBtn')?.addEventListener('click', exportSales);
        $('#exportPurchasesBtn')?.addEventListener('click', exportPurchases);
        $('#exportProductsBtn')?.addEventListener('click', exportProducts);
        $('#exportCustomersBtn')?.addEventListener('click', exportCustomers);

        // Connection
        window.addEventListener('online', () => {
            updateConnStatus();
            showToast('عاد الاتصال', 'success');
        });
        window.addEventListener('offline', () => {
            updateConnStatus();
            showToast('انقطع الاتصال', 'warning');
        });
    }

    /* ============================================
       Start
       ============================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
