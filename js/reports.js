/* =============================================
   reports.js - Reports Page Logic
   Version: 2.0.0 - Fixes: TDZ, local dates, CSV safety, unified payments
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
       Date Helpers — توقيت محلي (لا UTC)
       ============================================ */
    function localDateStr(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function addDays(date, days) {
        const d = new Date(date);
        d.setDate(d.getDate() + days);
        return d;
    }

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Reports init...');

        // ✅ انتظار promise موحّد بدل polling
        try {
            await Promise.race([
                window.DB?.ready || window.DB?.init?.(),
                new Promise((_, r) => setTimeout(() => r(new Error('DB timeout')), 15000))
            ]);
        } catch (e) {
            console.error('❌ DB not ready', e);
            showToast('تعذر الاتصال بالخادم', 'error');
            return;
        }

        if (!window.DB?.client) {
            console.error('❌ Supabase غير محمّل');
            showToast('تعذر الاتصال بالخادم', 'error');
            return;
        }

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
                DB.getInvoices(true).catch(e => {
                    console.error('getInvoices failed', e);
                    showToast('فشل تحميل الفواتير', 'error');
                    return [];
                }),
                DB.getParties(null, true).catch(e => {
                    console.error('getParties failed', e);
                    return [];
                }),
                DB.getProducts(true).catch(e => {
                    console.error('getProducts failed', e);
                    return [];
                }),
                DB.getPayments().catch(e => {
                    console.error('getPayments failed', e);
                    return [];
                })
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
        const todayStr = localDateStr(today);
        let from, to;

        switch (State.period) {
            case 'today':
                from = to = todayStr;
                break;
            case 'yesterday':
                from = to = localDateStr(addDays(today, -1));
                break;
            case 'week':
                from = localDateStr(addDays(today, -7));
                to = todayStr;
                break;
            case 'month':
                from = localDateStr(addDays(today, -30));
                to = todayStr;
                break;
            case 'year':
                from = localDateStr(new Date(today.getFullYear(), 0, 1));
                to = todayStr;
                break;
            case 'custom':
                from = State.customFrom || todayStr;
                to = State.customTo || todayStr;
                break;
            default:
                from = to = todayStr;
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
       Computed Stats — يُحسب مرة واحدة
       ============================================ */
    function computeStats() {
        const { from, to } = getDateRange();
        const inRange = State.invoices.filter(i => {
            const d = i.date || (i.created_at || '').slice(0, 10);
            return d >= from && d <= to;
        });

        const sales = inRange.filter(i => i.type === 'sale');
        const purchases = inRange.filter(i => i.type === 'purchase');

        return {
            from, to,
            sales, purchases,
            overview: computeOverview(sales, purchases),
            productStats: computeProductStats(sales),
            customerStats: computeCustomerStats(sales),
            paymentSplit: computePaymentSplit(sales)
        };
    }

    function computeOverview(sales, purchases) {
        const totalSales = sales.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const totalPurchases = purchases.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const discounts = sales.reduce((s, i) => s + (Number(i.discount) || 0), 0);

        // ✅ حساب الربح — مع تكلفة احتياطية من كتالوج المنتجات
        let totalProfit = 0;
        let missingCostCount = 0;

        sales.forEach(inv => {
            (inv.items || []).forEach(item => {
                const price = Number(item.price) || 0;
                const qty = Number(item.quantity) || 0;
                let cost = Number(item.cost) || 0;

                if (!cost || cost <= 0) {
                    const prod = State.products.find(p =>
                        p.id === (item.productId || item.product_id));
                    if (prod?.units?.length) {
                        const baseUnit = prod.units.find(u => u.isBase) || prod.units[0];
                        cost = Number(baseUnit.cost) || 0;
                    }
                }
                if (!cost || cost <= 0) missingCostCount++;

                totalProfit += (price - cost) * qty;
            });
        });

        // ملاحظة: price في invoice_items يفترض أنه قبل الخصم
        const netProfit = totalProfit - discounts;
        const invoiceCount = sales.length;
        const avgInvoice = invoiceCount > 0 ? totalSales / invoiceCount : 0;

        return {
            totalSales, totalPurchases, discounts,
            totalProfit, netProfit, invoiceCount,
            avgInvoice, missingCostCount
        };
    }

    function computeProductStats(sales) {
        const map = new Map();
        sales.forEach(inv => {
            (inv.items || []).forEach(item => {
                const key = item.productId || item.product_id || item.productName;
                const cur = map.get(key) || {
                    name: item.productName || item.product_name || 'منتج',
                    qty: 0, revenue: 0, cost: 0
                };
                const q = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                let unitCost = Number(item.cost) || 0;
                if (!unitCost || unitCost <= 0) {
                    const prod = State.products.find(p => p.id === key);
                    if (prod?.units?.length) {
                        const baseUnit = prod.units.find(u => u.isBase) || prod.units[0];
                        unitCost = Number(baseUnit.cost) || 0;
                    }
                }
                cur.qty += q;
                cur.revenue += price * q;
                cur.cost += unitCost * q;
                map.set(key, cur);
            });
        });
        return [...map.values()].sort((a, b) => b.qty - a.qty);
    }

    function computeCustomerStats(sales) {
        const map = new Map();
        sales.forEach(inv => {
            if (!inv.customer_id) return;
            const cur = map.get(inv.customer_id) || {
                id: inv.customer_id,
                name: inv.customer_name || 'عميل',
                phone: '', balance: 0,
                count: 0, total: 0, paid: 0
            };
            cur.count += 1;
            cur.total += Number(inv.total) || 0;
            cur.paid += Number(inv.paid) || 0;
            map.set(inv.customer_id, cur);
        });
        map.forEach((c, id) => {
            const party = State.parties.find(p => p.id === id);
            if (party) {
                c.phone = party.phone || '';
                c.balance = Number(party.balance) || 0;
            }
        });
        return [...map.values()].sort((a, b) => b.total - a.total);
    }

    // ✅ مصدر موحّد لتفاصيل الدفع
    function computePaymentSplit(sales) {
        const r = {
            cash: 0, card: 0, transfer: 0,
            credit: 0, usedBalance: 0,
            methods: { cash: 0, card: 0, transfer: 0, credit: 0, mixed: 0 }
        };

        sales.forEach(inv => {
            const cash = Number(inv.cash_paid) || 0;
            const card = Number(inv.card_paid) || 0;
            const transfer = Number(inv.transfer_paid) || 0;
            const remaining = Number(inv.remaining) || 0;
            const usedBal = Number(inv.used_balance) || 0;
            const method = inv.payment_method || 'cash';

            r.cash += cash;
            r.card += card;
            r.transfer += transfer;
            r.credit += remaining;
            r.usedBalance += usedBal;

            if (r.methods[method] !== undefined) r.methods[method] += 1;
            else r.methods.mixed += 1;
        });

        return r;
    }

    /* ============================================
       Render All — يحسب مرة واحدة
       ============================================ */
    function renderAll() {
        const stats = computeStats();
        updatePeriodLabel();
        renderOverview(stats);
        renderSales(stats);
        renderPurchases(stats);
        renderProducts(stats);
        renderCustomers(stats);
        renderPayments(stats);
    }

    /* ============================================
       Overview Report
       ============================================ */
    function renderOverview(stats) {
        const o = stats.overview;

        const kpiGrid = $('#overviewKPI');
        if (kpiGrid) {
            const missingWarning = o.missingCostCount > 0
                ? `<div class="kpi-card" style="grid-column: 1/-1; background: #fef3c7; border-right: 3px solid #f59e0b;">
                       <div class="kpi-card__info">
                           <span class="kpi-card__label">⚠️ تنبيه</span>
                           <span class="kpi-card__value" style="font-size: 13px;">
                               ${o.missingCostCount} صنف بدون تكلفة مسجّلة — الأرباح تقديرية
                           </span>
                       </div>
                   </div>` : '';

            kpiGrid.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-card__icon green"><i class="fas fa-chart-line"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي المبيعات</span>
                        <span class="kpi-card__value">${U.money(o.totalSales)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon blue"><i class="fas fa-file-invoice"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">عدد فواتير البيع</span>
                        <span class="kpi-card__value">${o.invoiceCount}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon orange"><i class="fas fa-truck"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي المشتريات</span>
                        <span class="kpi-card__value">${U.money(o.totalPurchases)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon purple"><i class="fas fa-coins"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">صافي الربح</span>
                        <span class="kpi-card__value">${U.money(o.netProfit)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon teal"><i class="fas fa-calculator"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">متوسط الفاتورة</span>
                        <span class="kpi-card__value">${U.money(o.avgInvoice)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon red"><i class="fas fa-percentage"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">إجمالي الخصومات</span>
                        <span class="kpi-card__value">${U.money(o.discounts)}</span>
                    </div>
                </div>
                ${missingWarning}
            `;
        }

        renderOverviewChart(stats.sales);
        renderPaymentBreakdown(stats);
        renderTopProductsOverview(stats.productStats);
        renderTopCustomersOverview(stats.customerStats);
    }

    function renderOverviewChart(sales) {
        const container = $('#overviewChart');
        if (!container) return;

        const days = [];
        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const today = new Date();

        // ✅ آخر 7 أيام بالتوقيت المحلي
        for (let i = 6; i >= 0; i--) {
            const d = addDays(today, -i);
            const dateStr = localDateStr(d);
            const daySales = sales
                .filter(inv => (inv.date || (inv.created_at || '').slice(0, 10)) === dateStr)
                .reduce((s, inv) => s + (Number(inv.total) || 0), 0);

            days.push({
                name: dayNames[d.getDay()],
                date: dateStr,
                shortDate: `${d.getDate()}/${d.getMonth() + 1}`,
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

    function renderPaymentBreakdown(stats) {
        const container = $('#paymentBreakdown');
        if (!container) return;

        const p = stats.paymentSplit;
        const methods = [
            { key: 'cash',     label: 'نقدي',   icon: 'fa-money-bill-wave', cls: 'cash',     total: p.cash,     count: p.methods.cash },
            { key: 'card',     label: 'بطاقة',  icon: 'fa-credit-card',     cls: 'card',     total: p.card,     count: p.methods.card },
            { key: 'transfer', label: 'تحويل',  icon: 'fa-exchange-alt',    cls: 'transfer', total: p.transfer, count: p.methods.transfer },
            { key: 'credit',   label: 'آجل',    icon: 'fa-hand-holding-usd',cls: 'credit',   total: p.credit,   count: p.methods.credit },
            { key: 'mixed',    label: 'مختلط',  icon: 'fa-layer-group',     cls: 'mixed',    total: 0,          count: p.methods.mixed }
        ];

        const active = methods.filter(m => m.count > 0 || m.total > 0);
        const total = active.reduce((s, m) => s + m.total, 0);

        if (!active.length) {
            container.innerHTML = `
                <div class="chart-empty" style="height:180px;">
                    <i class="fas fa-inbox"></i>
                    <p>لا توجد بيانات</p>
                </div>
            `;
            return;
        }

        container.innerHTML = active.map(m => {
            const percent = total > 0 ? (m.total / total) * 100 : 0;
            return `
                <div class="payment-item">
                    <div class="payment-item__label">
                        <i class="fas ${m.icon} ${m.cls}"></i>
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

    function renderTopProductsOverview(productStats) {
        const container = $('#topProductsOverview');
        if (!container) return;

        const sorted = productStats.slice(0, 5);

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
                <div class="top-list-item__amount">${U.money(p.revenue)}</div>
            </div>
        `).join('');
    }

    function renderTopCustomersOverview(customerStats) {
        const container = $('#topCustomersOverview');
        if (!container) return;

        const sorted = customerStats.slice(0, 5);

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
    function renderSales(stats) {
        const sales = stats.sales;
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

        // ✅ نسخة جديدة قبل الترتيب (لا نعدّل المصدر)
        const sorted = [...sales].sort((a, b) =>
            new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

        tbody.innerHTML = sorted.map((inv, i) => {
            const status = inv.status || 'paid';
            const statusLabel = {
                paid: 'مدفوعة', partial: 'جزئية',
                credit: 'آجلة', held: 'معلقة'
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
    function renderPurchases(stats) {
        const purchases = stats.purchases;
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

        const sorted = [...purchases].sort((a, b) =>
            new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

        tbody.innerHTML = sorted.map((inv, i) => {
            const status = inv.status || 'paid';
            const statusLabel = {
                paid: 'مدفوعة', partial: 'جزئية', credit: 'آجلة'
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
    function renderProducts(stats) {
        const list = stats.productStats;
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

        tbody.innerHTML = list.map((p, i) => {
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
    function renderCustomers(stats) {
        const list = stats.customerStats;
        const totalSales = list.reduce((s, c) => s + c.total, 0);
        const totalPaid = list.reduce((s, c) => s + c.paid, 0);

        // ✅ فصل المدين عن الدائن
        const totalDebit = list
            .filter(c => (c.balance || 0) > 0)
            .reduce((s, c) => s + c.balance, 0);
        const totalCredit = list
            .filter(c => (c.balance || 0) < 0)
            .reduce((s, c) => s + Math.abs(c.balance), 0);

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
                        <span class="kpi-card__label">الديون المستحقة</span>
                        <span class="kpi-card__value">${U.money(totalCredit)}</span>
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

        tbody.innerHTML = list.map((c, i) => {
            const balance = c.balance || 0;
            const balanceClass = balance > 0 ? 'text-success'
                               : balance < 0 ? 'text-danger' : '';

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
    function renderPayments(stats) {
        const p = stats.paymentSplit;
        const totalCollected = p.cash + p.card + p.transfer;
        const totalSalesSum = totalCollected + p.credit + p.usedBalance;

        const kpi = $('#paymentsKPI');
        if (kpi) {
            kpi.innerHTML = `
                <div class="kpi-card">
                    <div class="kpi-card__icon green"><i class="fas fa-money-bill-wave"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">نقدي</span>
                        <span class="kpi-card__value">${U.money(p.cash)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon blue"><i class="fas fa-credit-card"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">بطاقة</span>
                        <span class="kpi-card__value">${U.money(p.card)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon orange"><i class="fas fa-exchange-alt"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">تحويل</span>
                        <span class="kpi-card__value">${U.money(p.transfer)}</span>
                    </div>
                </div>
                <div class="kpi-card">
                    <div class="kpi-card__icon red"><i class="fas fa-hand-holding-usd"></i></div>
                    <div class="kpi-card__info">
                        <span class="kpi-card__label">آجل</span>
                        <span class="kpi-card__value">${U.money(p.credit)}</span>
                    </div>
                </div>
            `;
        }

        const chartContainer = $('#paymentMethodsChart');
        if (chartContainer) {
            const data = [
                { label: 'نقدي', value: p.cash, color: '#10b981' },
                { label: 'بطاقة', value: p.card, color: '#2563eb' },
                { label: 'تحويل', value: p.transfer, color: '#f59e0b' },
                { label: 'آجل', value: p.credit, color: '#ef4444' }
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
                        <strong>${U.money(p.usedBalance)}</strong>
                    </div>
                    <div class="summary-box__row">
                        <span>مبالغ آجلة</span>
                        <strong class="text-danger">${U.money(p.credit)}</strong>
                    </div>
                    <div class="summary-box__row highlight">
                        <span>إجمالي المبيعات</span>
                        <strong>${U.money(totalSalesSum)}</strong>
                    </div>
                </div>
            `;
        }
    }

    /* ============================================
       Export Functions
       ============================================ */
    function escapeCSVCell(cell) {
        let s = String(cell ?? '');
        // ✅ حماية Formula Injection — فقط للحقول النصية
        const isNumeric = /^-?\d+(\.\d+)?$/.test(s);
        if (!isNumeric && /^[=+\-@\t\r]/.test(s)) {
            s = "'" + s;
        }
        if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
            s = '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }

    function exportToCSV(filename, headers, rows) {
        const csv = [headers, ...rows]
            .map(row => row.map(escapeCSVCell).join(','))
            .join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            a.remove();
        }, 200);
        showToast('تم التصدير', 'success');
    }

    function exportSales(stats) {
        const sales = stats?.sales || filterByPeriod(State.invoices).filter(i => i.type === 'sale');
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

    function exportPurchases(stats) {
        const purchases = stats?.purchases || filterByPeriod(State.invoices).filter(i => i.type === 'purchase');
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

    function exportProducts(stats) {
        const list = stats?.productStats || computeProductStats(
            filterByPeriod(State.invoices).filter(i => i.type === 'sale'));
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

    function exportCustomers(stats) {
        const list = stats?.customerStats || computeCustomerStats(
            filterByPeriod(State.invoices).filter(i => i.type === 'sale'));
        if (!list.length) { showToast('لا توجد بيانات', 'info'); return; }

        const headers = ['العميل', 'الهاتف', 'عدد الفواتير', 'إجمالي المشتريات', 'المدفوع', 'الرصيد'];
        const rows = list.map(c => [c.name, c.phone, c.count, c.total, c.paid, c.balance]);

        const { from, to } = getDateRange();
        exportToCSV(`customers-${from}_${to}.csv`, headers, rows);
    }

    function exportPayments(stats) {
        const p = stats?.paymentSplit || computePaymentSplit(
            filterByPeriod(State.invoices).filter(i => i.type === 'sale'));
        const { from, to } = getDateRange();

        const headers = ['طريقة الدفع', 'المبلغ'];
        const rows = [
            ['نقدي', p.cash],
            ['بطاقة', p.card],
            ['تحويل', p.transfer],
            ['آجل', p.credit],
            ['رصيد مستخدم', p.usedBalance]
        ];

        exportToCSV(`payments-${from}_${to}.csv`, headers, rows);
    }

    /* ============================================
       Print — iframe بدل window.open
       ============================================ */
    function printReport() {
        const stats = computeStats();
        const type = State.activeReport;
        const { from, to } = stats;

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

        let content = `
            <div style="text-align:center;margin-bottom:20px;">
                <h1 style="font-size:22px;margin-bottom:4px;">${U.escape(shopName)}</h1>
                ${shopPhone ? `<p style="font-size:12px;color:#666;">هاتف: ${U.escape(shopPhone)}</p>` : ''}
                <h2 style="font-size:18px;margin-top:12px;">${titles[type] || 'تقرير'}</h2>
                <p style="font-size:12px;color:#666;">الفترة: ${U.date(from)} - ${U.date(to)}</p>
                <p style="font-size:11px;color:#999;">تاريخ الطباعة: ${U.dateTime(new Date())}</p>
            </div>
        `;

        if (type === 'overview') {
            content += $('#overviewKPI')?.innerHTML || '';
        } else if (type === 'sales') {
            content += $('#salesTable')?.outerHTML || buildPrintTable(stats.sales, 'sales');
        } else if (type === 'purchases') {
            content += $('#purchasesTable')?.outerHTML || buildPrintTable(stats.purchases, 'purchases');
        } else if (type === 'products') {
            content += $('#productsTable')?.outerHTML || '';
        } else if (type === 'customers') {
            content += $('#customersTable')?.outerHTML || '';
        }

        const html = `
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
        `;

        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
        document.body.appendChild(iframe);

        const doc = iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        iframe.onload = () => {
            setTimeout(() => {
                iframe.contentWindow.focus();
                iframe.contentWindow.print();
                setTimeout(() => iframe.remove(), 1000);
            }, 200);
        };
    }

    function buildPrintTable(list, kind) {
        if (!list?.length) return '<p>لا توجد بيانات</p>';
        // يمكن إضافة تفاصيل إضافية لاحقًا
        return '';
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

        // ✅ مؤشر العمليات المعلقة
        if (window.DB?.getPendingSyncCount) {
            window.DB.getPendingSyncCount().then(n => {
                if (n > 0 && status) {
                    status.textContent = `${n} عملية معلقة`;
                    status.style.color = 'var(--warning, #f59e0b)';
                }
            }).catch(() => {});
        }
    }

    function updateThemeIcon() {
        const btn = $('#themeBtn');
        if (!btn) return;
        const isDark = document.documentElement.dataset.theme === 'dark';
        const icon = btn.querySelector('i');
        if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
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

        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            DB.clearCache();
            await loadData();
            await DB.flushSyncQueue().catch(() => {});
            showToast('تم التحديث', 'success');
        });

        $('#printReportBtn')?.addEventListener('click', printReport);
        $('#exportReportBtn')?.addEventListener('click', () => {
            const stats = computeStats();
            const type = State.activeReport;
            switch (type) {
                case 'sales':     exportSales(stats); break;
                case 'purchases': exportPurchases(stats); break;
                case 'products':  exportProducts(stats); break;
                case 'customers': exportCustomers(stats); break;
                case 'payments':  exportPayments(stats); break;
                case 'overview':
                default:
                    showToast('يرجى اختيار تقرير محدد للتصدير', 'info');
            }
        });

        $$('.period-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.period-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.period = btn.dataset.period;

                const cp = $('#customPeriod');
                if (State.period === 'custom') {
                    if (cp) cp.style.display = 'grid';
                } else {
                    if (cp) cp.style.display = 'none';
                    renderAll();
                }
            });
        });

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

        $$('.report-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.report-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                State.activeReport = btn.dataset.report;

                $$('.report-content').forEach(c => c.classList.remove('active'));
                $(`[data-report-content="${State.activeReport}"]`)?.classList.add('active');
            });
        });

        $('#exportSalesBtn')?.addEventListener('click', () => exportSales(computeStats()));
        $('#exportPurchasesBtn')?.addEventListener('click', () => exportPurchases(computeStats()));
        $('#exportProductsBtn')?.addEventListener('click', () => exportProducts(computeStats()));
        $('#exportCustomersBtn')?.addEventListener('click', () => exportCustomers(computeStats()));

        window.addEventListener('online', () => {
            updateConnStatus();
            showToast('عاد الاتصال', 'success');
            DB.flushSyncQueue().catch(() => {});
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
