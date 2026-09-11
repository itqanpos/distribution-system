/* =============================================
   dashboard.js - Dashboard Logic
   متوافق مع التصميم الأصلي
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    let currentUser = null;
    let allInvoices = [];
    let allParties = [];
    let allProducts = [];

    /* ============ Init ============ */
    async function init() {
        console.log('🚀 Dashboard init...');

        // 1. التحقق من المصادقة
        try {
            currentUser = await Auth.requireAuth();
            if (!currentUser) return;
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        console.log('👤 User:', currentUser.email);

        // 2. تحديث الواجهة
        updateUserUI();
        updateDate();
        updateConnStatus();

        // 3. ربط الأحداث
        bindEvents();

        // 4. تحميل البيانات
        await loadDashboardData();

        // 5. إخفاء شريط التحميل
        hideLoadingBar();
    }

    /* ============ User UI ============ */
    function updateUserUI() {
        const avatar = $('#sidebarAvatar');
        const name = $('#sidebarUserName');

        if (avatar) {
            avatar.textContent = (currentUser.fullName || 'U')[0].toUpperCase();
        }
        if (name) {
            name.textContent = currentUser.fullName || currentUser.email || 'مدير';
        }
    }

    function updateDate() {
        const el = $('#currentDate');
        if (!el) return;
        el.textContent = new Date().toLocaleDateString('ar-EG', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    function updateConnStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('is-offline', !online);
        const navbar = $('#mainNavbar');
        if (navbar) navbar.classList.toggle('offline', !online);
    }

    /* ============ Bind Events ============ */
    function bindEvents() {
        // القائمة الجانبية
        $('#menuToggle')?.addEventListener('click', () => {
            $('#sidebar')?.classList.add('open');
            $('#sidebarOverlay')?.classList.add('show');
        });
        $('#sidebarOverlay')?.addEventListener('click', () => {
            $('#sidebar')?.classList.remove('open');
            $('#sidebarOverlay')?.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                $('#sidebar')?.classList.remove('open');
                $('#sidebarOverlay')?.classList.remove('show');
            });
        });

        // تحديث
        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            DB.clearCache();
            await loadDashboardData();
            showToast('تم التحديث', 'success');
        });

        // عرض كل الفواتير
        $('#viewAllInvoices')?.addEventListener('click', () => {
            location.href = './invoices.html';
        });

        // حالة الاتصال
        window.addEventListener('online', () => {
            updateConnStatus();
            showToast('عاد الاتصال بالإنترنت', 'success');
            loadDashboardData();
        });
        window.addEventListener('offline', () => {
            updateConnStatus();
            showToast('انقطع الاتصال بالإنترنت', 'warning');
        });
    }

    /* ============ Toast بسيط ============ */
    function showToast(msg, type = 'info') {
        // إنشاء الحاوية إذا لم توجد
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

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${msg}`;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    /* ============ Loading Bar ============ */
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

    /* ============ Load Data ============ */
    async function loadDashboardData() {
        showLoading();
        showSkeleton();

        try {
            const [invoices, parties, products] = await Promise.allSettled([
                DB.getInvoices(true).catch(() => []),
                DB.getParties(null, true).catch(() => []),
                DB.getProducts(true).catch(() => [])
            ]);

            allInvoices = invoices.status === 'fulfilled' ? (invoices.value || []) : [];
            allParties = parties.status === 'fulfilled' ? (parties.value || []) : [];
            allProducts = products.status === 'fulfilled' ? (products.value || []) : [];

            console.log('📊 Data loaded:', {
                invoices: allInvoices.length,
                parties: allParties.length,
                products: allProducts.length
            });

            renderStats();
            renderSummary();
            renderRecentInvoices();
        } catch (e) {
            console.error('Dashboard load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
        } finally {
            hideLoadingBar();
        }
    }

    /* ============ Skeleton ============ */
    function showSkeleton() {
        const grid = $('#statsGrid');
        if (!grid) return;
        grid.innerHTML = Array(6).fill(0).map(() => `
            <div class="stat-card" style="opacity: 0.5;">
                <div style="width:52px;height:52px;background:var(--bg-input);border-radius:14px;"></div>
                <div style="flex:1;">
                    <div style="height:14px;background:var(--bg-input);border-radius:6px;margin-bottom:8px;"></div>
                    <div style="height:22px;background:var(--bg-input);border-radius:6px;"></div>
                </div>
            </div>
        `).join('');
    }

    /* ============ Render Stats ============ */
    function renderStats() {
        const grid = $('#statsGrid');
        if (!grid) return;

        const today = U.today();

        // مبيعات اليوم
        const todaySales = allInvoices
            .filter(inv => {
                const invDate = inv.date || (inv.created_at || '').slice(0, 10);
                return invDate === today && inv.type === 'sale';
            })
            .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

        // مشتريات اليوم
        const todayPurchases = allInvoices
            .filter(inv => {
                const invDate = inv.date || (inv.created_at || '').slice(0, 10);
                return invDate === today && inv.type === 'purchase';
            })
            .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

        // فواتير معلقة
        const heldCount = allInvoices.filter(inv =>
            ['held', 'partial', 'credit'].includes(inv.status)
        ).length;

        // العملاء
        const customersCount = allParties.filter(p =>
            p.type === 'customer' || p.type === 'both'
        ).length;

        // الموردين
        const suppliersCount = allParties.filter(p =>
            p.type === 'supplier' || p.type === 'both'
        ).length;

        // المنتجات
        const productsCount = allProducts.length;

        const stats = [
            {
                label: 'مبيعات اليوم',
                value: U.money(todaySales),
                icon: 'fa-chart-line',
                color: 'green'
            },
            {
                label: 'مشتريات اليوم',
                value: U.money(todayPurchases),
                icon: 'fa-truck',
                color: 'blue'
            },
            {
                label: 'فواتير معلقة',
                value: heldCount,
                icon: 'fa-clock',
                color: 'orange'
            },
            {
                label: 'المنتجات',
                value: productsCount,
                icon: 'fa-box',
                color: 'purple'
            },
            {
                label: 'العملاء',
                value: customersCount,
                icon: 'fa-users',
                color: 'teal'
            },
            {
                label: 'الموردين',
                value: suppliersCount,
                icon: 'fa-user-tie',
                color: 'rose'
            }
        ];

        const colorMap = {
            green: { bg: 'rgba(16,185,129,0.15)', fg: '#10b981' },
            blue: { bg: 'rgba(59,130,246,0.15)', fg: '#3b82f6' },
            orange: { bg: 'rgba(245,158,11,0.15)', fg: '#f59e0b' },
            purple: { bg: 'rgba(139,92,246,0.15)', fg: '#8b5cf6' },
            teal: { bg: 'rgba(20,184,166,0.15)', fg: '#14b8a6' },
            rose: { bg: 'rgba(244,63,94,0.15)', fg: '#f43f5e' }
        };

        grid.innerHTML = stats.map(s => {
            const c = colorMap[s.color] || colorMap.blue;
            return `
                <div class="stat-card">
                    <div class="stat-icon" style="background:${c.bg};color:${c.fg};">
                        <i class="fas ${s.icon}"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${s.label}</h3>
                        <p>${s.value}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    /* ============ Render Summary ============ */
    function renderSummary() {
        const el = $('#summaryContent');
        if (!el) return;

        const today = U.today();

        const todayInvoices = allInvoices.filter(inv => {
            const invDate = inv.date || (inv.created_at || '').slice(0, 10);
            return invDate === today;
        });

        const salesCount = todayInvoices.filter(i => i.type === 'sale').length;
        const purchasesCount = todayInvoices.filter(i => i.type === 'purchase').length;

        const totalSales = todayInvoices
            .filter(i => i.type === 'sale')
            .reduce((s, i) => s + (Number(i.total) || 0), 0);

        const totalPurchases = todayInvoices
            .filter(i => i.type === 'purchase')
            .reduce((s, i) => s + (Number(i.total) || 0), 0);

        const net = totalSales - totalPurchases;

        el.innerHTML = `
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
                <span style="color:var(--text-muted);font-weight:600;">عدد فواتير البيع</span>
                <strong>${salesCount}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
                <span style="color:var(--text-muted);font-weight:600;">عدد فواتير الشراء</span>
                <strong>${purchasesCount}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
                <span style="color:var(--text-muted);font-weight:600;">إجمالي المبيعات</span>
                <strong style="color:var(--success);">${U.money(totalSales)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
                <span style="color:var(--text-muted);font-weight:600;">إجمالي المشتريات</span>
                <strong style="color:var(--danger);">${U.money(totalPurchases)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;">
                <span style="color:var(--text-muted);font-weight:600;">صافي اليوم</span>
                <strong style="color:var(--primary);">${U.money(net)}</strong>
            </div>
        `;
    }

    /* ============ Render Recent Invoices ============ */
    function renderRecentInvoices() {
        const el = $('#recentInvoicesContent');
        if (!el) return;

        const recent = allInvoices.slice(0, 5);

        if (!recent.length) {
            el.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:var(--text-muted);">
                    <i class="fas fa-inbox" style="font-size:40px;opacity:0.3;margin-bottom:12px;display:block;"></i>
                    <p>لا توجد فواتير حديثة</p>
                </div>
            `;
            return;
        }

        el.innerHTML = recent.map(inv => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;">
                <span style="color:var(--primary);font-weight:700;">${U.escape(inv.invoice_number || '---')}</span>
                <span style="color:var(--text-soft);">${U.escape(inv.customer_name || inv.supplier_name || 'نقدي')}</span>
                <strong>${U.money(inv.total)}</strong>
            </div>
        `).join('');
    }

    /* ============ Start ============ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
