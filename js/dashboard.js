/* =============================================
   dashboard.js - Dashboard Logic
   Version: 3.0.2 - With session wait
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

        // 1. انتظر حتى يُحمَّل Supabase
        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (!window.DB?.client) {
            console.error('❌ Supabase لم يُحمَّل');
            showToast('تعذر الاتصال بالخادم', 'error');
            return;
        }

        console.log('✅ Supabase ready');

        // 2. انتظر قليلاً لاستعادة الجلسة
        await new Promise(r => setTimeout(r, 300));

        // 3. التحقق من المصادقة
        try {
            currentUser = await Auth.requireAuth();
            if (!currentUser) {
                console.log('⏹️ لا يوجد مستخدم، إيقاف التحميل');
                return;
            }
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        console.log('👤 User:', currentUser.email);

        // 4. تحديث الواجهة
        updateUserUI();
        updateDate();
        updateConnStatus();

        // 5. ربط الأحداث
        bindEvents();

        // 6. تحميل البيانات
        await loadDashboardData();

        // 7. إخفاء شريط التحميل
        hideLoadingBar();

        console.log('✅ Dashboard ready');
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

    /* ============ Toast ============ */
    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 99999;
                pointer-events: none;
            `;
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
            font-weight: 600;
            font-size: 0.9rem;
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: toastIn 0.3s;
            pointer-events: auto;
        `;
        toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> <span>${msg}</span>`;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
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
        
        const skeletonCard = `
            <div style="background:var(--bg-elev,#fff);border:1px solid var(--border,#e2e8f0);border-radius:16px;padding:18px;display:flex;align-items:center;gap:14px;opacity:0.6;">
                <div style="width:52px;height:52px;background:var(--bg-sunken,#f8fafc);border-radius:14px;"></div>
                <div style="flex:1;">
                    <div style="height:14px;background:var(--bg-sunken,#f8fafc);border-radius:6px;margin-bottom:8px;"></div>
                    <div style="height:22px;background:var(--bg-sunken,#f8fafc);border-radius:6px;width:60%;"></div>
                </div>
            </div>
        `;
        
        grid.innerHTML = Array(6).fill(skeletonCard).join('');
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
                <div class="stat-card" style="background:var(--bg-elev,#fff);border:1px solid var(--border,#e2e8f0);border-radius:16px;padding:18px;display:flex;align-items:center;gap:14px;transition:all 0.2s;">
                    <div style="width:52px;height:52px;border-radius:14px;display:grid;place-items:center;font-size:22px;flex-shrink:0;background:${c.bg};color:${c.fg};">
                        <i class="fas ${s.icon}"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <h3 style="font-size:13px;font-weight:700;color:var(--text-muted,#64748b);margin-bottom:4px;">${s.label}</h3>
                        <p style="font-size:20px;font-weight:800;color:var(--text,#0f172a);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${s.value}</p>
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

        const rowStyle = 'display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border,#e2e8f0);';
        const labelStyle = 'color:var(--text-muted,#64748b);font-weight:600;';
        const valueStyle = 'font-weight:800;';

        el.innerHTML = `
            <div style="${rowStyle}">
                <span style="${labelStyle}">عدد فواتير البيع</span>
                <strong style="${valueStyle}">${salesCount}</strong>
            </div>
            <div style="${rowStyle}">
                <span style="${labelStyle}">عدد فواتير الشراء</span>
                <strong style="${valueStyle}">${purchasesCount}</strong>
            </div>
            <div style="${rowStyle}">
                <span style="${labelStyle}">إجمالي المبيعات</span>
                <strong style="${valueStyle}color:var(--success,#10b981);">${U.money(totalSales)}</strong>
            </div>
            <div style="${rowStyle}">
                <span style="${labelStyle}">إجمالي المشتريات</span>
                <strong style="${valueStyle}color:var(--danger,#ef4444);">${U.money(totalPurchases)}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;padding:10px 0;">
                <span style="${labelStyle}">صافي اليوم</span>
                <strong style="${valueStyle}color:var(--primary,#4f46e5);">${U.money(net)}</strong>
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
                <div style="text-align:center;padding:40px 20px;color:var(--text-muted,#64748b);">
                    <i class="fas fa-inbox" style="font-size:40px;opacity:0.3;margin-bottom:12px;display:block;"></i>
                    <p>لا توجد فواتير حديثة</p>
                </div>
            `;
            return;
        }

        el.innerHTML = recent.map(inv => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--border,#e2e8f0);font-size:13px;gap:8px;">
                <span style="color:var(--primary,#4f46e5);font-weight:700;">${U.escape(inv.invoice_number || '---')}</span>
                <span style="color:var(--text-soft,#334155);flex:1;text-align:center;">${U.escape(inv.customer_name || inv.supplier_name || 'نقدي')}</span>
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
