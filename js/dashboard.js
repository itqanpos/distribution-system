/* =============================================
   dashboard.js - Dashboard Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ State ============ */
    const State = {
        currentUser: null,
        products: [],
        parties: [],
        invoices: [],
        loaded: false
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Dashboard init...');

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

        console.log('👤 User:', State.currentUser.email);

        updateUserUI();
        updateConnStatus();
        updateDate();
        initTheme();
        bindEvents();

        showSkeleton();
        await loadData();
        hideLoadingBar();
        console.log('✅ Dashboard ready');
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

            console.log('📊 Data:', {
                invoices: State.invoices.length,
                parties: State.parties.length,
                products: State.products.length
            });

            renderStats();
            renderWeeklyChart();
            renderTopProducts();
            renderRecentInvoices();
            renderAlerts();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
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
        btn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
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

        const today = U.today();
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

        // Today's sales
        const todaySales = State.invoices
            .filter(inv => (inv.date === today || (inv.created_at || '').startsWith(today)) && inv.type === 'sale')
            .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

        const yesterdaySales = State.invoices
            .filter(inv => (inv.date === yesterday || (inv.created_at || '').startsWith(yesterday)) && inv.type === 'sale')
            .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

        // Monthly sales
        const monthlySales = State.invoices
            .filter(inv => {
                const invDate = inv.date || (inv.created_at || '').slice(0, 10);
                return invDate >= startOfMonth && inv.type === 'sale';
            })
            .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

        // Today's purchases
        const todayPurchases = State.invoices
            .filter(inv => (inv.date === today || (inv.created_at || '').startsWith(today)) && inv.type === 'purchase')
            .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

        // Pending invoices count
        const pendingCount = State.invoices
            .filter(inv => ['held', 'partial', 'credit'].includes(inv.status))
            .length;

        // Total debt (customer debit)
        const totalDebt = State.parties
            .filter(p => p.type === 'customer' || p.type === 'both')
            .filter(p => (p.balance || 0) < 0)
            .reduce((sum, p) => sum + Math.abs(p.balance || 0), 0);

        // Trend calculation
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
       ============================================ */
    function renderWeeklyChart() {
        const container = $('#weeklyChart');
        if (!container) return;

        // Build last 7 days data
        const days = [];
        const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

        for (let i = 6; i >= 0; i--) {
            const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
            const dateStr = date.toISOString().split('T')[0];
            const sales = State.invoices
                .filter(inv => {
                    const invDate = inv.date || (inv.created_at || '').slice(0, 10);
                    return invDate === dateStr && inv.type === 'sale';
                })
                .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

            days.push({
                name: dayNames[date.getDay()],
                date: dateStr,
                shortDate: `${date.getDate()}/${date.getMonth() + 1}`,
                sales
            });
        }

        const maxSales = Math.max(...days.map(d => d.sales), 1);

        // Check if all zero
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
       Top Products
       ============================================ */
    function renderTopProducts() {
        const container = $('#topProducts');
        if (!container) return;

        // Aggregate products sold
        const productSales = new Map();

        State.invoices
            .filter(inv => inv.type === 'sale' && Array.isArray(inv.items))
            .forEach(inv => {
                inv.items.forEach(item => {
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
                <div class="recent-invoice-item" data-id="${inv.id}">
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

        // Bind click to open invoices page
        container.querySelectorAll('.recent-invoice-item').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.dataset.id;
                window.location.href = `./invoices.html?invoice=${id}`;
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
       Alerts
       ============================================ */
    function renderAlerts() {
        const container = $('#alertsList');
        if (!container) return;

        const alerts = [];

        // Alert: Low stock products
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

        // Alert: Out of stock
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

        // Alert: Pending invoices
        const pending = State.invoices.filter(inv => inv.status === 'held');
        if (pending.length > 0) {
            alerts.push({
                type: 'info',
                icon: 'fa-pause-circle',
                title: 'فواتير معلقة',
                desc: `${pending.length} فاتورة بحاجة لمراجعة`,
                link: './invoices.html?status=held'
            });
        }

        // Alert: High debts
        const bigDebts = State.parties.filter(p => (p.balance || 0) < -1000);
        if (bigDebts.length > 0) {
            alerts.push({
                type: 'danger',
                icon: 'fa-user-times',
                title: 'ديون كبيرة',
                desc: `${bigDebts.length} عميل بمبالغ مستحقة كبيرة`,
                link: './customers.html?filter=debit'
            });
        }

        // Alert: Credit invoices
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
            <div class="alert-item ${a.type}" data-link="${a.link}">
                <div class="alert-item__icon">
                    <i class="fas ${a.icon}"></i>
                </div>
                <div class="alert-item__content">
                    <div class="alert-item__title">${a.title}</div>
                    <div class="alert-item__desc">${a.desc}</div>
                </div>
            </div>
        `).join('');

        // Bind click to navigate
        container.querySelectorAll('.alert-item[data-link]').forEach(el => {
            el.addEventListener('click', () => {
                window.location.href = el.dataset.link;
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
            showSkeleton();
            await loadData();
            showToast('تم التحديث', 'success');
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
