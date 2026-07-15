/* =============================================
   app.js - نقطة الدخول المركزية لجميع الصفحات (مُنقّحة)
   ============================================= */
(async function() {
    'use strict';

    // ========== 1. انتظار النواة ==========
    async function waitForCore(timeoutMs = 10000) {
        const start = Date.now();
        while (!window.App || !window.DB) {
            if (Date.now() - start > timeoutMs) {
                throw new Error('النواة غير محملة (App أو DB)');
            }
            await new Promise(resolve => setTimeout(resolve, 200));
        }
    }

    try {
        await waitForCore();
    } catch (e) {
        console.error(e);
        // عرض رسالة خطأ مع إمكانية إعادة التحميل
        document.body.innerHTML = `
            <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
                <div class="text-center">
                    <i class="fas fa-exclamation-triangle text-5xl text-red-400 mb-4"></i>
                    <p class="text-gray-600 dark:text-gray-300 mb-4">تعذر تحميل التطبيق. تأكد من اتصالك بالإنترنت.</p>
                    <button onclick="location.reload()" class="px-4 py-2 bg-blue-600 text-white rounded-lg">
                        <i class="fas fa-redo-alt ml-2"></i>إعادة المحاولة
                    </button>
                </div>
            </div>
        `;
        return;
    }

    // ========== 2. المصادقة ==========
    const authorized = await App.requireAuth();
    if (!authorized) return;

    const user = await App.getCurrentUser();
    if (!user) return;

    // ========== 3. التحقق من الصلاحيات والتوجيه ==========
    const role = (user.role || '').toLowerCase();
    const currentPath = window.location.pathname;
    const pageName = (currentPath.split('/').pop() || '').replace('.html', '');

    const adminOnlyPages = ['admin', 'settings', 'accounting'];
    const repOnlyPages = ['pos'];

    // توجيه المندوب إلى نقطة البيع إذا حاول دخول صفحات أخرى
    if (role === 'rep' && !repOnlyPages.includes(pageName)) {
        window.location.href = './pos.html';
        return;
    }

    // توجيه المشرف إلى لوحة التحكم إذا حاول دخول نقطة البيع (اختياري)
    if (role === 'admin' && repOnlyPages.includes(pageName)) {
        window.location.href = './dashboard.html';
        return;
    }

    // ========== 4. تحديث واجهة المستخدم العامة ==========
    App.initUserInterface();

    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) userDisplay.textContent = user.fullName || user.email;

    // ========== 5. تهيئة الصفحة الخاصة ==========
    const pageHandlers = {
        dashboard: initDashboard,
        pos: initPOS,
        products: initProductsPage,
        invoices: initInvoicesPage,
        purchases: initPurchasesPage,
        customers: initPartiesPage,
        cashbox: initCashboxPage,
        reports: initReportsPage,
        settings: initSettingsPage,
        accounting: initAccountingPage,
        admin: initAdminPage
    };

    if (pageHandlers[pageName]) {
        try {
            await pageHandlers[pageName]();
        } catch (e) {
            console.error(`فشل تحميل صفحة ${pageName}:`, e);
            window.Toast?.error?.('حدث خطأ أثناء تحميل الصفحة');
        }
    }

    // ========== دوال تهيئة الصفحات ==========

    // --- Dashboard ---
    async function initDashboard() {
        if (window.initDashboardCustom) return window.initDashboardCustom();
        const grid = document.getElementById('statsGrid');
        if (!grid) return;

        showSkeletonLoading(grid, 6);
        try {
            const [invoices, purchases, products, parties] = await Promise.allSettled([
                DB.getInvoices().catch(() => []),
                DB.getPurchases().catch(() => []),
                DB.getProducts().catch(() => []),
                DB.getParties().catch(() => [])
            ]);

            const invoicesData = getValue(invoices);
            const purchasesData = getValue(purchases);
            const productsData = getValue(products);
            const partiesData = getValue(parties);

            const today = new Date().toISOString().split('T')[0];
            const todaySales = invoicesData
                .filter(inv => inv.date === today && inv.type === 'sale')
                .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0);
            const todayPurchases = purchasesData
                .filter(p => p.date === today)
                .reduce((sum, p) => sum + (Number(p.total) || 0), 0);
            const pendingInvoices = invoicesData.filter(inv =>
                ['held', 'partial', 'pending'].includes(inv.status)
            ).length;

            const stats = [
                { label: 'مبيعات اليوم', value: formatCurrency(todaySales), icon: 'fa-chart-line', color: 'green' },
                { label: 'مشتريات اليوم', value: formatCurrency(todayPurchases), icon: 'fa-truck', color: 'blue' },
                { label: 'فواتير معلقة', value: pendingInvoices, icon: 'fa-clock', color: 'orange' },
                { label: 'المنتجات', value: productsData.length, icon: 'fa-box', color: 'purple' },
                { label: 'العملاء', value: partiesData.filter(p => p.type === 'customer').length, icon: 'fa-users', color: 'teal' },
                { label: 'الموردين', value: partiesData.filter(p => p.type === 'supplier').length, icon: 'fa-user-tie', color: 'rose' }
            ];

            renderStatCards(grid, stats);
        } catch (e) {
            grid.innerHTML = errorState('تعذر تحميل الإحصائيات');
        }
    }

    // --- نقطة البيع (POS) ---
    async function initPOS() {
        if (window.POS && typeof window.POS.init === 'function') {
            await window.POS.init();
        } else {
            console.warn('POS غير محمل');
        }
    }

    // --- المنتجات ---
    async function initProductsPage() {
        if (window.initProductsPageCustom) return window.initProductsPageCustom();
        const container = document.getElementById('productsContainer');
        if (!container) return;
        try {
            const products = await DB.getProducts();
            renderProductList(container, products);
        } catch (e) {
            container.innerHTML = errorState('فشل تحميل المنتجات');
        }
    }

    // --- الفواتير ---
    async function initInvoicesPage() {
        if (window.initInvoicesPageCustom) return window.initInvoicesPageCustom();
        const container = document.getElementById('invoicesContainer');
        if (!container) return;
        try {
            const invoices = await DB.getInvoices();
            renderInvoicesList(container, invoices);
        } catch (e) {
            container.innerHTML = errorState('فشل تحميل الفواتير');
        }
    }

    // --- المشتريات ---
    async function initPurchasesPage() {
        if (window.initPurchasesPageCustom) return window.initPurchasesPageCustom();
        const container = document.getElementById('purchasesContainer');
        if (!container) return;
        try {
            const purchases = await DB.getPurchases();
            renderPurchasesList(container, purchases);
        } catch (e) {
            container.innerHTML = errorState('فشل تحميل المشتريات');
        }
    }

    // --- العملاء والموردين ---
    async function initPartiesPage() {
        if (window.initPartiesPageCustom) return window.initPartiesPageCustom();
        const container = document.getElementById('partiesContainer');
        if (!container) return;
        try {
            const parties = await DB.getParties();
            renderPartiesList(container, parties);
        } catch (e) {
            container.innerHTML = errorState('فشل تحميل جهات الاتصال');
        }
    }

    // --- الصندوق ---
    async function initCashboxPage() {
        if (window.initCashboxPageCustom) return window.initCashboxPageCustom();
        // محتوى مخصص
    }

    // --- التقارير ---
    async function initReportsPage() {
        if (window.initReportsPageCustom) return window.initReportsPageCustom();
        // محتوى مخصص
    }

    // --- الإعدادات ---
    async function initSettingsPage() {
        if (window.initSettingsPageCustom) return window.initSettingsPageCustom();
        const form = document.getElementById('settingsForm');
        if (!form) return;
        try {
            const settings = await DB.getSettings();
            populateSettingsForm(form, settings);
        } catch (e) {
            console.error('فشل تحميل الإعدادات', e);
        }
    }

    // --- المحاسبة ---
    async function initAccountingPage() {
        if (window.initAccountingPageCustom) return window.initAccountingPageCustom();
        // عرض الحسابات
    }

    // --- الإدارة (للمشرف العام) ---
    async function initAdminPage() {
        if (window.initAdminPageCustom) return window.initAdminPageCustom();
        const container = document.getElementById('tenantsContainer');
        if (!container) return;
        try {
            const tenants = await DB.getAllTenantsData();
            renderTenantsTable(container, tenants);
        } catch (e) {
            container.innerHTML = errorState('فشل تحميل بيانات المستأجرين');
        }
    }

    // ========== دوال مساعدة عامة ==========
    function getValue(promiseResult) {
        return promiseResult.status === 'fulfilled' ? promiseResult.value : [];
    }

    function formatCurrency(value) {
        return Number(value || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    }

    // حل مشكلة ألوان Tailwind الديناميكية باستخدام كائن ثابت
    const colorClasses = {
        green:  { bg: 'bg-green-50 dark:bg-green-900', text: 'text-green-600 dark:text-green-300' },
        blue:   { bg: 'bg-blue-50 dark:bg-blue-900', text: 'text-blue-600 dark:text-blue-300' },
        orange: { bg: 'bg-orange-50 dark:bg-orange-900', text: 'text-orange-600 dark:text-orange-300' },
        purple: { bg: 'bg-purple-50 dark:bg-purple-900', text: 'text-purple-600 dark:text-purple-300' },
        teal:   { bg: 'bg-teal-50 dark:bg-teal-900', text: 'text-teal-600 dark:text-teal-300' },
        rose:   { bg: 'bg-rose-50 dark:bg-rose-900', text: 'text-rose-600 dark:text-rose-300' }
    };

    function showSkeletonLoading(container, count = 4) {
        container.innerHTML = Array(count).fill(0).map(() => `
            <div class="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 animate-pulse">
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
                <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
            </div>
        `).join('');
    }

    function errorState(message) {
        return `
            <div class="col-span-full text-center py-12">
                <i class="fas fa-exclamation-triangle text-4xl text-gray-300 dark:text-gray-600 mb-4"></i>
                <p class="text-gray-500 dark:text-gray-400">${message}</p>
                <button onclick="location.reload()" class="mt-3 px-4 py-2 bg-primary text-white rounded-lg text-sm">
                    <i class="fas fa-redo-alt ml-2"></i>إعادة المحاولة
                </button>
            </div>
        `;
    }

    function renderStatCards(grid, stats) {
        grid.innerHTML = stats.map(stat => {
            const color = colorClasses[stat.color] || colorClasses.blue;
            return `
                <div class="bg-white dark:bg-gray-800 rounded-xl p-5 border border-gray-100 dark:border-gray-700 shadow-sm hover:shadow-md transition-shadow">
                    <div class="flex items-center justify-between mb-3">
                        <span class="text-sm font-medium text-gray-500 dark:text-gray-400">${stat.label}</span>
                        <div class="w-10 h-10 rounded-full ${color.bg} ${color.text} flex items-center justify-center text-lg">
                            <i class="fas ${stat.icon}"></i>
                        </div>
                    </div>
                    <p class="text-2xl font-bold text-gray-900 dark:text-white">${stat.value}</p>
                </div>
            `;
        }).join('');
    }

    // ========== وظائف عرض القوائم ==========
    function renderProductList(container, products) {
        if (!products.length) {
            container.innerHTML = `<p class="text-center py-10 text-gray-500">لا توجد منتجات</p>`;
            return;
        }
        container.innerHTML = products.map(p => {
            // السعر إما في p.price القديم أو في أول وحدة
            const price = p.price ?? p.units?.[0]?.price ?? '-';
            return `
                <div class="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
                    <span>${p.name || '-'}</span>
                    <span class="font-bold">${formatCurrency(price)}</span>
                </div>
            `;
        }).join('');
    }

    function renderInvoicesList(container, invoices) {
        if (!invoices.length) {
            container.innerHTML = `<p class="text-center py-10 text-gray-500">لا توجد فواتير</p>`;
            return;
        }
        container.innerHTML = invoices.map(inv => `
            <div class="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
                <span>${inv.invoice_number || inv.id}</span>
                <span>${formatCurrency(inv.total)}</span>
            </div>
        `).join('');
    }

    function renderPurchasesList(container, purchases) {
        // استخدام نفس طريقة عرض الفواتير مؤقتًا
        renderInvoicesList(container, purchases);
    }

    function renderPartiesList(container, parties) {
        if (!parties.length) {
            container.innerHTML = `<p class="text-center py-10 text-gray-500">لا توجد جهات</p>`;
            return;
        }
        container.innerHTML = parties.map(p => `
            <div class="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
                <span>${p.name}</span>
                <span class="text-sm">${p.type === 'customer' ? 'عميل' : 'مورد'}</span>
            </div>
        `).join('');
    }

    function renderTenantsTable(container, tenants) {
        if (!tenants.length) {
            container.innerHTML = `<p class="text-center py-10 text-gray-500">لا يوجد مستأجرين</p>`;
            return;
        }
        container.innerHTML = tenants.map(t => `
            <div class="flex justify-between items-center p-4 border-b border-gray-100 dark:border-gray-700">
                <span>${t.name || '-'}</span>
                <span>${t.plan || '-'}</span>
            </div>
        `).join('');
    }

    function populateSettingsForm(form, settings) {
        // مثال: تعبئة حقل اسم الشركة من إعدادات مخزنة
        // يُفترض أن الإعدادات كائن { company: { name: '...' } }
        const companyName = settings?.company?.name || '';
        const input = form.querySelector('[name="company_name"]');
        if (input) input.value = companyName;
        // يمكن إضافة حقول أخرى بنفس الطريقة
    }

})();
