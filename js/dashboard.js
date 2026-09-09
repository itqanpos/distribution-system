/* =============================================
   dashboard.js - منطق لوحة التحكم
   ============================================= */
(async function() {
    'use strict';

    // ========== عناصر DOM ==========
    const loadingBar = document.getElementById('loading-bar');
    const statsGrid = document.getElementById('statsGrid');
    const summaryContent = document.getElementById('summaryContent');
    const recentInvoicesContent = document.getElementById('recentInvoicesContent');
    const currentDateEl = document.getElementById('currentDate');
    const refreshBtn = document.getElementById('refreshBtn');
    const viewAllInvoicesBtn = document.getElementById('viewAllInvoices');
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const mainNavbar = document.getElementById('mainNavbar');

    // ========== دوال مساعدة ==========
    function safeToast(msg, type = 'error') {
        if (window.Toast && typeof window.Toast[type] === 'function') {
            window.Toast[type](msg);
        } else if (window.Toast && typeof window.Toast.show === 'function') {
            window.Toast.show(msg, type);
        } else {
            alert(msg);
        }
    }

    function formatCurrency(value) {
        return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    }

    function showLoading() {
        loadingBar.style.width = '80%';
    }

    function hideLoading() {
        loadingBar.style.width = '100%';
        setTimeout(() => { loadingBar.style.width = '0%'; }, 300);
    }

    function updateConnStatus() {
        const isOffline = !navigator.onLine;
        document.body.classList.toggle('offline', isOffline);
        if (mainNavbar) mainNavbar.classList.toggle('offline', isOffline);
    }

    function showSkeleton() {
        statsGrid.innerHTML = Array(6).fill(0).map(() => `
            <div class="skeleton-card">
                <div style="display:flex;align-items:center;gap:16px;">
                    <div style="width:50px;height:50px;background:var(--bg-input);border-radius:12px;"></div>
                    <div style="flex:1;">
                        <div style="height:14px;background:var(--bg-input);border-radius:6px;margin-bottom:8px;"></div>
                        <div style="height:24px;background:var(--bg-input);border-radius:6px;"></div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // ========== ربط القائمة الجانبية ==========
    function bindSidebar() {
        if (menuToggle && sidebar && sidebarOverlay) {
            menuToggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
                sidebarOverlay.classList.toggle('show');
            });
            sidebarOverlay.addEventListener('click', () => {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
            });
            document.querySelectorAll('.menu-item').forEach(item => {
                item.addEventListener('click', () => {
                    sidebar.classList.remove('open');
                    sidebarOverlay.classList.remove('show');
                });
            });
        }
    }

    // ========== تحميل بيانات المستخدم ==========
    async function loadUserInfo() {
        try {
            if (!window.App?.getCurrentUser) return;
            const user = await App.getCurrentUser();
            if (user) {
                if (sidebarAvatar) sidebarAvatar.textContent = (user.fullName || 'U')[0].toUpperCase();
                if (sidebarUserName) sidebarUserName.textContent = user.fullName || user.email || 'مدير';
            }
        } catch (e) {
            console.warn('فشل تحميل بيانات المستخدم', e);
        }
    }

    // ========== تحميل الإحصائيات ==========
    async function loadDashboardStats() {
        if (!statsGrid) return;
        showLoading();
        showSkeleton();

        try {
            const [invoicesRes, purchasesRes, productsRes, partiesRes] = await Promise.allSettled([
                DB.getInvoices().catch(() => []),
                DB.getPurchases().catch(() => []),
                DB.getProducts().catch(() => []),
                DB.getParties().catch(() => [])
            ]);

            const invoices = invoicesRes.status === 'fulfilled' ? invoicesRes.value : [];
            const purchases = purchasesRes.status === 'fulfilled' ? purchasesRes.value : [];
            const products = productsRes.status === 'fulfilled' ? productsRes.value : [];
            const parties = partiesRes.status === 'fulfilled' ? partiesRes.value : [];

            const today = new Date().toISOString().split('T')[0];

            // الحسابات
            const todaySales = invoices
                .filter(inv => inv.date === today && inv.type === 'sale')
                .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);

            const todayPurchases = purchases
                .filter(p => p.date === today)
                .reduce((sum, p) => sum + (Number(p.total) || 0), 0);

            const pendingInvoices = invoices.filter(inv =>
                ['held', 'partial', 'pending'].includes(inv.status)
            ).length;

            const productsCount = products.length;
            const customersCount = parties.filter(p => p.type === 'customer').length;
            const suppliersCount = parties.filter(p => p.type === 'supplier').length;

            // بناء الكروت
            const stats = [
                { label: 'مبيعات اليوم', value: formatCurrency(todaySales), icon: 'fa-chart-line', colorClass: 'green' },
                { label: 'مشتريات اليوم', value: formatCurrency(todayPurchases), icon: 'fa-truck', colorClass: 'blue' },
                { label: 'فواتير معلقة', value: pendingInvoices, icon: 'fa-clock', colorClass: 'orange' },
                { label: 'المنتجات', value: productsCount, icon: 'fa-box', colorClass: 'purple' },
                { label: 'العملاء', value: customersCount, icon: 'fa-users', colorClass: 'teal' },
                { label: 'الموردين', value: suppliersCount, icon: 'fa-user-tie', colorClass: 'rose' }
            ];

            statsGrid.innerHTML = stats.map(stat => `
                <div class="stat-card">
                    <div class="stat-icon ${stat.colorClass}">
                        <i class="fas ${stat.icon}"></i>
                    </div>
                    <div class="stat-info">
                        <h3>${stat.label}</h3>
                        <p>${stat.value}</p>
                    </div>
                </div>
            `).join('');

            // الملخص السريع
            if (summaryContent) {
                summaryContent.innerHTML = `
                    <div class="summary-row-item">
                        <span class="label">إجمالي المبيعات اليوم</span>
                        <span class="value text-success">${formatCurrency(todaySales)}</span>
                    </div>
                    <div class="summary-row-item">
                        <span class="label">إجمالي المشتريات اليوم</span>
                        <span class="value text-danger">${formatCurrency(todayPurchases)}</span>
                    </div>
                    <div class="summary-row-item">
                        <span class="label">فواتير معلقة</span>
                        <span class="value" style="color: var(--warning);">${pendingInvoices}</span>
                    </div>
                    <div class="summary-row-item">
                        <span class="label">إجمالي المنتجات</span>
                        <span class="value">${productsCount}</span>
                    </div>
                `;
            }

            // أحدث الفواتير
            if (recentInvoicesContent) {
                const recent = invoices.slice(0, 5);
                if (recent.length) {
                    recentInvoicesContent.innerHTML = recent.map(inv => `
                        <div class="invoice-item">
                            <span class="invoice-number">${inv.invoice_number || inv.id?.substring(0, 8)}</span>
                            <span class="invoice-customer">${inv.customer_name || 'نقدي'}</span>
                            <span class="invoice-total">${formatCurrency(inv.total)}</span>
                        </div>
                    `).join('');
                } else {
                    recentInvoicesContent.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-inbox"></i>
                            <p>لا توجد فواتير حديثة</p>
                        </div>
                    `;
                }
            }
        } catch (e) {
            console.error('فشل تحميل الإحصائيات:', e);
            statsGrid.innerHTML = `
                <div class="empty-state" style="grid-column: 1 / -1;">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>تعذر تحميل البيانات</p>
                </div>
            `;
            safeToast('تعذر تحميل البيانات', 'error');
        } finally {
            hideLoading();
        }
    }

    // ========== إعداد Realtime ==========
    function setupRealtimeSync() {
        if (!window.supabaseClient) return;
        window.supabaseClient
            .channel('dashboard-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
                loadDashboardStats();
            })
            .subscribe();
    }

    // ========== عرض التاريخ ==========
    function displayCurrentDate() {
        if (currentDateEl) {
            const now = new Date();
            currentDateEl.textContent = now.toLocaleDateString('ar-EG', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        }
    }

    // ========== التهيئة ==========
    async function init() {
        try {
            // التحقق من النواة
            if (!window.App || !window.DB) {
                safeToast('النواة غير محملة', 'error');
                return;
            }

            // المصادقة
            const authorized = await App.requireAuth();
            if (!authorized) return;

            // صلاحيات
            if (!App.requireRole || !(await App.requireRole(['admin', 'rep']))) return;

            // تحديث واجهة المستخدم
            App.initUserInterface?.();

            // ربط العناصر
            bindSidebar();
            updateConnStatus();
            displayCurrentDate();
            await loadUserInfo();
            await loadDashboardStats();
            setupRealtimeSync();

            // أحداث
            if (refreshBtn) refreshBtn.addEventListener('click', loadDashboardStats);
            if (viewAllInvoicesBtn) viewAllInvoicesBtn.addEventListener('click', () => {
                window.location.href = './invoices.html';
            });

            // حالة الاتصال
            window.addEventListener('online', () => {
                updateConnStatus();
                loadDashboardStats();
            });
            window.addEventListener('offline', updateConnStatus);

        } catch (e) {
            console.error('خطأ في التهيئة:', e);
            safeToast('فشل تحميل لوحة التحكم', 'error');
        }
    }

    init();
})();
