/* =============================================
   app.js - Application Entry Point
   ============================================= */
(async function() {
    'use strict';
    if (!window.App || !window.DB) {
        console.error('النواة غير محملة');
        return;
    }

    const auth = await App.requireAuth();
    if (!auth) return;

    const user = await App.getCurrentUser();
    if (!user) return;

    // تحديث واجهة المستخدم
    App.initUserInterface();
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) userDisplay.textContent = user.fullName || user.email;

    // تحميل ملخص لوحة التحكم إذا كنا في dashboard
    if (window.location.pathname.includes('dashboard.html')) {
        loadDashboardStats();
    }

    async function loadDashboardStats() {
        const grid = document.getElementById('statsGrid');
        if (!grid) return;

        try {
            const [invoices, purchases, products, parties] = await Promise.all([
                DB.getInvoicesLight(),
                DB.getPurchasesLight(),
                DB.getProducts(),
                DB.getParties()
            ]);

            const today = new Date().toISOString().split('T')[0];
            const todaySales = invoices.filter(inv => inv.date === today && inv.type === 'sale').reduce((sum, inv) => sum + (inv.total || 0), 0);
            const todayPurchases = purchases.filter(p => p.date === today).reduce((sum, p) => sum + (p.total || 0), 0);
            const pendingInvoices = invoices.filter(inv => inv.status !== 'مدفوعة').length;

            const stats = [
                { label: 'مبيعات اليوم', value: todaySales.toLocaleString() + ' ج', icon: 'fa-chart-line', color: 'bg-green-50 text-green-600' },
                { label: 'مشتريات اليوم', value: todayPurchases.toLocaleString() + ' ج', icon: 'fa-truck', color: 'bg-blue-50 text-blue-600' },
                { label: 'فواتير معلقة', value: pendingInvoices, icon: 'fa-clock', color: 'bg-orange-50 text-orange-600' },
                { label: 'عدد المنتجات', value: products.length, icon: 'fa-box', color: 'bg-purple-50 text-purple-600' }
            ];

            grid.innerHTML = stats.map(stat => `
                <div class="card flex items-center gap-4 p-4">
                    <div class="w-12 h-12 rounded-full ${stat.color} flex items-center justify-center text-xl">
                        <i class="fas ${stat.icon}"></i>
                    </div>
                    <div>
                        <p class="text-sm text-gray-500">${stat.label}</p>
                        <p class="text-2xl font-bold text-gray-800">${stat.value}</p>
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('فشل تحميل الإحصائيات:', e);
            Toast.error('تعذر تحميل البيانات');
        }
    }
})();
