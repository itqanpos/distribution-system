/* =============================================
   dashboard.js - Dashboard Logic
   Version: 2.0.0

   Fixes:
   - [DASH-1] تواريخ محلية بدل UTC في stats/weekly
   - [DASH-2] استبعاد voided وheld من مبيعات/مشتريات
   - [DASH-3] رسم بياني بمرور واحد
   - [DASH-4] تعطيل زر التحديث أثناء العمل
   - [DASH-5] showToast صحيح (لا يُعرض عند الفشل)
   - [DASH-6] console gated by DEBUG
   - [DASH-7] عدّاد فواتير معلقة صحيح
   - [DASH-8] تفادي السحر رقم العتبة للديون
   - [DASH-9] قبول استخدام window.Toast إن وُجد
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);

    const DEBUG = window.APP_CONFIG?.DEBUG === true ||
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1';
    const log = (...a) => { if (DEBUG) console.log(...a); };

    // ✅ [DASH-1] تاريخ محلي (Y-M-D)
    function localDateStr(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function invoiceLocalDate(inv) {
        if (!inv) return '';
        if (inv.date) return inv.date;                      // Y-M-D من DB
        if (inv.created_at) {
            const d = new Date(inv.created_at);
            return localDateStr(d);
        }
        return '';
    }

    // ✅ [DASH-2] استبعاد الملغاة والمعلقة من الأرقام المالية
    function isCountedSale(inv) {
        return inv
            && inv.type === 'sale'
            && inv.status !== 'voided'
            && inv.status !== 'held';
    }
    function isCountedPurchase(inv) {
        return inv
            && inv.type === 'purchase'
            && inv.status !== 'voided'
            && inv.status !== 'held';
    }

    /* ============ State ============ */
    const State = {
        currentUser: null,
        products: [],
        parties: [],
        invoices: [],
        loaded: false,
        _refreshing: false
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        log('🚀 Dashboard init...');

        // انتظار جهوزية DB.client
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

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        log('👤 User:', State.currentUser.email);

        updateUserUI();
        updateConnStatus();
        updateDate();
        initTheme();
        bindEvents();

        showSkeleton();
        await loadData();
        hideLoadingBar();
        log('✅ Dashboard ready');
    }

    /* ============================================
       Load Data
       ============================================ */
    async function loadData() {
        try {
            const [invoices, parties, products] = await Promise.all([
                DB.getInvoices(true).catch(() => []),
                DB.getParties(null, true).catch(() => []),
                DB.getProducts(true).catch(() => [])
            ]);

            State.invoices = invoices || [];
            State.parties = parties || [];
            State.products = products || [];
            State.loaded = true;

            log('📊 Data:', {
                invoices: State.invoices.length,
                parties: State.parties.length,
                products: State.products.length
            });

            renderStats();
            renderWeeklyChart();
            renderTopProducts();
            renderRecentInvoices();
            renderAlerts();
            return true;
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
            return false;
        }
    }

    /* ============================================
       User UI
       ============================================ */
    function updateUserUI() {
        const avatar = $('#userAvatar');
        const sidebarName = $('#sidebarUserName');
        const welcomeName = $('#welcomeName');

        const name = State.currentUser.fullName || 'مدير';

        if (avatar) avatar.textContent = (name || 'U')[0].toUpperCase();
        if (sidebarName) sidebarName.textContent = name;
        if (welcomeName) welcomeName.textContent = name.split(' ')[0] || name;
    }

    function updateDate() {
        const el = $('#currentDate');
        if (!el) return;

        const now = new Date();
        const dayName = now.toLocaleDateString('ar-EG', { weekday: 'long' });
        const dateStr = now.toLocaleDateString('ar-EG', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        el.textContent = `${dayName} · ${dateStr}`;
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
        const icon = btn.querySelector('i');
        if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    /* ============================================
       Stats Cards
       ============================================ */
    function renderStats() {
        const grid = $('#statsGrid');
        if (!grid) return;

        // ✅ [DASH-1] تواريخ محلية
        const today = localDateStr(new Date());
        const yesterday = localDateStr(new Date(Date.now() - 24 * 60 * 60 * 1000));
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        const startOfMonth = localDateStr(firstOfMonth);

        // ✅ [DASH-2] استبعاد voided وheld
        let todaySales = 0;
        let yesterdaySales = 0;
        let monthlySales = 0;
        let todayPurchases = 0;
        let pendingCount = 0;

        for (const inv of State.invoices) {
            if (!inv) continue;

            const invDate = invoiceLocalDate(inv);

            // ملغاة: تُحتسب فقط في "المعلقة"؟ لا. تتخطى الجميع
            if (inv.status === 'voided') continue;

            if (isCountedSale(inv)) {
                if (invDate === today) todaySales += Number(inv.total) || 0;
                if (invDate === yesterday) yesterdaySales += Number(inv.total) || 0;
                if (invDate >= startOfMonth) monthlySales += Number(inv.total) || 0;
            }

            if (isCountedPurchase(inv) && invDate === today) {
                todayPurchases += Number(inv.total) || 0;
            }

            // ✅ [DASH-7] المعلقة = held فقط (partial وcredit فواتير مكتملة)
            if (inv.status === 'held') pendingCount++;
        }

        // ديون العملاء (رصيد سالب)
        let totalDebt = 0;
        for (const p of State.parties) {
            if (!p) continue;
            if (p.type !== 'customer' && p.type !== 'both') continue;
            const bal = Number(p.balance) || 0;
            if (bal < 0) totalDebt += Math.abs(bal);
        }

        // Trend
        let salesTrend = null;
        if (yesterdaySales > 0) {
            const diff = ((todaySales - yesterdaySales) / yesterdaySales) * 100;
            salesTrend = {
                value: Math.abs(diff).toFixed(0),
                direction: diff >= 0 ? 'up' : 'down'
            };
        }

        const stats = [
            {
                label: 'مبيعات اليوم',
                value: U.money(todaySales),
                icon: 'fa-chart-line',
                color: 'green',
                trend: salesTrend
            },
            {
                label: 'مبيعات الشهر',
                value: U.money(monthlySales),
                icon: 'fa-calendar-alt',
                color: 'blue'
            },
            {
                label: 'مشتريات اليوم',
                value: U.money(todayPurchases),
                icon: 'fa-truck',
                color: 'orange'
            },
            {
                label: 'فواتير معلقة',
                value: pendingCount,
                icon: 'fa-clock',
                color: 'purple'
            },
            {
                label: 'ديون العملاء',
                value: U.money(totalDebt),
                icon: 'fa-hand-holding-usd',
                color: 'red'
            },
            {
                label: 'المنتجات',
                value: State.products.length,
                icon: 'fa-box',
                color: 'teal'
            }
        ];

        grid.innerHTML = stats.map(s => {
            let trendHtml = '';
            if (s.trend) {
                const icon = s.trend.direction === 'up' ? 'arrow-up' : 'arrow-down';
                trendHtml = `
                    <span class="stat-card__trend ${s.trend.direction}">
                        <i class="fas fa-${icon}"></i> ${s.trend.value}%
                    </span>
                `;
            }
            return `
                <div class="stat-card">
                    <div class="stat-card__header">
                        <div class="stat-card__icon ${s.color}">
                            <i class="fas ${s.icon}"></i>
                        </div>
                        ${trendHtml}
                    </div>
                    <div class="stat-card__info">
                        <label>${s.label}</label>
                        <span>${s.value}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    /* ============================================
       Weekly Chart
       ✅ [DASH-1] تواريخ محلية
       ✅ [DASH-3] مرور واحد
       ============================================ */
    function renderWeeklyChart() {
        const container = $('#weeklyChart');
        if (!container) return;

        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        // بناء الأيام السبعة الأخيرة
        const days = [];
        const dayMap = new Map();
        for (let i = 6; i >= 0; i--) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = localDateStr(date);
            const entry = {
                name: dayNames[date.getDay()],
                date: dateStr,
                shortDate: `${date.getDate()}/${date.getMonth() + 1}`,
                sales: 0
            };
            days.push(entry);
            dayMap.set(dateStr, entry);
        }

        // ✅ مرور واحد على الفواتير
        for (const inv of State.invoices) {
            if (!isCountedSale(inv)) continue;
            const invDate = invoiceLocalDate(inv);
            const day = dayMap.get(invDate);
            if (day) day.sales += Number(inv.total) || 0;
        }

        const maxSales = Math.max(...days.map(d => d.sales), 1);
        const allZero = days.every(d => d.sales === 0);

        if (allZero) {
            container.innerHTML = `
                <div class="chart-empty">
                    <i class="fas fa-chart-area"></i>
                    <p>لا توجد مبيعات هذا الأسبوع</p>
                </div>
            `;
            return;
        }

        container.innerHTML = days.map(d => {
            const percent = (d.sales / maxSales) * 100;
            return `
                <div class="chart-bar-wrapper">
                    <div class="chart-bar" style="height: ${Math.max(percent, 4)}%;" data-amount="${d.sales}">
                        <span class="chart-bar__value">${U.moneyRaw(d.sales)}</span>
                    </div>
                    <span class="chart-bar__label">${d.name}</span>
                    <span class="chart-bar__date">${d.shortDate}</span>
                </div>
            `;
        }).join('');
    }

    /* ============================================
       Top Products — ✅ [DASH-2] استبعاد voided/held
       ============================================ */
    function renderTopProducts() {
        const container = $('#topProducts');
        if (!container) return;

        const productSales = new Map();

        for (const inv of State.invoices) {
            if (!isCountedSale(inv)) continue;
            if (!Array.isArray(inv.items)) continue;

            for (const item of inv.items) {
                const key = item.productId || item.product_id || item.productName;
                if (!key) continue;
                const current = productSales.get(key) || {
                    name: item.productName || 'منتج',
                    qty: 0,
                    amount: 0
                };
                const qty = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                current.qty += qty;
                current.amount += price * qty;
                productSales.set(key, current);
            }
        }

        const sorted = [...productSales.values()]
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5);

        if (!sorted.length) {
            container.innerHTML = `
                <div class="empty-mini">
                    <i class="fas fa-star"></i>
                    <p>لا توجد مبيعات بعد</p>
                </div>
            `;
            return;
        }

        const rankClasses = ['gold', 'silver', 'bronze', '', ''];

        container.innerHTML = sorted.map((p, i) => `
            <div class="top-product-item">
                <div class="top-product-item__rank ${rankClasses[i] || ''}">${i + 1}</div>
                <div class="top-product-item__info">
                    <div class="top-product-item__name">${U.escape(p.name)}</div>
                    <div class="top-product-item__qty">${p.qty} وحدة</div>
                </div>
                <div class="top-product-item__amount">${U.money(p.amount)}</div>
            </div>
        `).join('');
    }

    /* ============================================
       Recent Invoices
       ============================================ */
    function renderRecentInvoices() {
        const container = $('#recentInvoices');
        if (!container) return;

        const recent = [...State.invoices]
            .sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date))
            .slice(0, 5);

        if (!recent.length) {
            container.innerHTML = `
                <div class="empty-mini">
                    <i class="fas fa-inbox"></i>
                    <p>لا توجد فواتير حديثة</p>
                </div>
            `;
            return;
        }

        container.innerHTML = recent.map(inv => {
            const isPurchase = inv.type === 'purchase';
            const statusLabel = getStatusLabel(inv.status);
            const statusClass = inv.status || 'paid';
            const customerName = inv.customer_name || inv.supplier_name || 'نقدي';

            return `
                <div class="recent-invoice-item" data-id="${U.escape(inv.id)}">
                    <div class="recent-invoice-item__icon ${isPurchase ? 'purchase' : ''}">
                        <i class="fas fa-${isPurchase ? 'shopping-cart' : 'file-invoice'}"></i>
                    </div>
                    <div class="recent-invoice-item__info">
                        <div class="recent-invoice-item__number">${U.escape(inv.invoice_number || '---')}</div>
                        <div class="recent-invoice-item__customer">${U.escape(customerName)}</div>
                    </div>
                    <div class="recent-invoice-item__amount">${U.money(Number(inv.total) || 0)}</div>
                    <div class="recent-invoice-item__status ${statusClass}">${statusLabel}</div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.recent-invoice-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                if (!id) return;
                window.location.href = `./invoices.html?invoice=${encodeURIComponent(id)}`;
            });
        });
    }

    function getStatusLabel(status) {
        return {
            paid: 'مدفوعة',
            partial: 'جزئية',
            credit: 'آجلة',
            held: 'معلقة',
            voided: 'ملغية'
        }[status] || 'مدفوعة';
    }

    /* ============================================
       Alerts — ✅ [DASH-8] عتبة من CFG
       ============================================ */
    function renderAlerts() {
        const container = $('#alertsList');
        if (!container) return;

        const alerts = [];
        const debtThreshold = Number(window.APP_CONFIG?.DASHBOARD_DEBT_THRESHOLD) || 1000;

        // Low stock
        const lowStock = State.products.filter(p => {
            const stock = p.units?.[0]?.stock || 0;
            return stock > 0 && stock <= 5;
        });
        if (lowStock.length > 0) {
            alerts.push({
                type: 'warning',
                icon: 'fa-exclamation-triangle',
                title: 'منتجات قاربت على النفاد',
                desc: `${lowStock.length} منتج بمخزون منخفض (≤5)`,
                link: './products.html?filter=low'
            });
        }

        // Out of stock
        const outOfStock = State.products.filter(p => (p.units?.[0]?.stock || 0) <= 0);
        if (outOfStock.length > 0) {
            alerts.push({
                type: 'danger',
                icon: 'fa-times-circle',
                title: 'منتجات نفدت',
                desc: `${outOfStock.length} منتج بدون مخزون`,
                link: './products.html?filter=out'
            });
        }

        // Held invoices
        const held = State.invoices.filter(inv => inv.status === 'held');
        if (held.length > 0) {
            alerts.push({
                type: 'info',
                icon: 'fa-pause-circle',
                title: 'فواتير معلقة',
                desc: `${held.length} فاتورة بحاجة لمراجعة`,
                link: './invoices.html?status=held'
            });
        }

        // Big debts
        const bigDebts = State.parties.filter(p => (Number(p.balance) || 0) < -debtThreshold);
        if (bigDebts.length > 0) {
            alerts.push({
                type: 'danger',
                icon: 'fa-user-times',
                title: 'ديون كبيرة',
                desc: `${bigDebts.length} عميل بمبالغ مستحقة كبيرة`,
                link: './customers.html?filter=debit'
            });
        }

        // Credit invoices
        const credit = State.invoices.filter(inv => inv.status === 'credit');
        if (credit.length > 0) {
            const total = credit.reduce((s, i) => s + (Number(i.remaining) || 0), 0);
            alerts.push({
                type: 'warning',
                icon: 'fa-hand-holding-usd',
                title: 'فواتير آجلة',
                desc: `${credit.length} فاتورة بإجمالي ${U.money(total)}`,
                link: './invoices.html?status=credit'
            });
        }

        if (!alerts.length) {
            container.innerHTML = `
                <div class="alert-empty">
                    <i class="fas fa-check-circle"></i>
                    <p>كل شيء على ما يرام ✅</p>
                </div>
            `;
            return;
        }

        container.innerHTML = alerts.slice(0, 5).map(a => `
            <div class="alert-item ${a.type}" data-link="${U.escape(a.link)}">
                <div class="alert-item__icon">
                    <i class="fas ${a.icon}"></i>
                </div>
                <div class="alert-item__content">
                    <div class="alert-item__title">${U.escape(a.title)}</div>
                    <div class="alert-item__desc">${U.escape(a.desc)}</div>
                </div>
            </div>
        `).join('');

        container.querySelectorAll('.alert-item[data-link]').forEach(el => {
            el.addEventListener('click', () => {
                const url = el.dataset.link;
                if (url) window.location.href = url;
            });
        });
    }

    /* ============================================
       Skeleton
       ============================================ */
    function showSkeleton() {
        const statsGrid = $('#statsGrid');
        if (statsGrid) {
            statsGrid.innerHTML = Array(6).fill(`
                <div class="skeleton-card">
                    <div style="display:flex;justify-content:space-between;margin-bottom:14px;">
                        <div style="width:44px;height:44px;background:var(--bg-sunken);border-radius:12px;"></div>
                    </div>
                    <div class="skeleton-line short"></div>
                    <div class="skeleton-line large"></div>
                </div>
            `).join('');
        }

        const weeklyChart = $('#weeklyChart');
        if (weeklyChart) {
            weeklyChart.innerHTML = `
                <div class="chart-empty">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>جاري التحميل...</p>
                </div>
            `;
        }

        const topProducts = $('#topProducts');
        if (topProducts) {
            topProducts.innerHTML = Array(3).fill(`
                <div style="display:flex;gap:12px;padding:10px 0;">
                    <div style="width:32px;height:32px;background:var(--bg-sunken);border-radius:10px;"></div>
                    <div style="flex:1;">
                        <div class="skeleton-line medium"></div>
                        <div class="skeleton-line short"></div>
                    </div>
                </div>
            `).join('');
        }
    }

    function hideLoadingBar() {
        const bar = $('#loading-bar');
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        }
    }

    /* ============================================
       Toast — ✅ [DASH-9] يفضل window.Toast إن وُجد
       ============================================ */
    function showToast(msg, type = 'info') {
        // استخدم النظام الموحّد إن وُجد
        if (window.Toast && typeof window.Toast.show === 'function') {
            try { window.Toast.show(msg, type); return; } catch (e) { /* fallthrough */ }
        }

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
       Events — ✅ [DASH-4] تعطيل التحديث أثناء العمل
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
        const refreshBtn = $('#refreshBtn');
        refreshBtn?.addEventListener('click', async () => {
            if (State._refreshing) return;
            State._refreshing = true;
            refreshBtn.disabled = true;
            refreshBtn.classList.add('is-spinning');

            try {
                DB.clearCache();
                showSkeleton();
                const ok = await loadData();
                if (ok) {
                    showToast('تم التحديث', 'success');
                } else {
                    showToast('فشل التحديث، تحقق من الاتصال', 'error');
                }
            } finally {
                refreshBtn.disabled = false;
                refreshBtn.classList.remove('is-spinning');
                State._refreshing = false;
            }
        });

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
