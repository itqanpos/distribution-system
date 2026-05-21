/* =============================================
   dashboard.js - لوحة التحكم (بدون رسم بياني)
   ============================================= */
'use strict';

const Dashboard = {
    state: {
        stats: {
            totalSales: 0,
            totalOrders: 0,
            totalCustomers: 0,
            totalProducts: 0
        },
        recentInvoices: []
    },

    init() {
        this.bindSidebar();
        this.loadData();
    },

    bindSidebar() {
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const sidebarOverlay = document.getElementById('sidebarOverlay');
        const moreMenuBtn = document.getElementById('moreMenuBtn');
        const moreDropdown = document.getElementById('moreDropdown');
        const logoutBtn = document.getElementById('logoutBtn');

        menuToggle?.addEventListener('click', () => {
            sidebar?.classList.toggle('open');
            sidebarOverlay?.classList.toggle('show');
        });
        sidebarOverlay?.addEventListener('click', () => {
            sidebar?.classList.remove('open');
            sidebarOverlay?.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                sidebar?.classList.remove('open');
                sidebarOverlay?.classList.remove('show');
            });
        });

        moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) {
                moreDropdown?.classList.remove('show');
            }
        });
        logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });
    },

    async loadData() {
        try {
            await Promise.all([
                this.loadStats(),
                this.loadDailySalesCards(),
                this.loadTopProducts(),
                this.loadRecentInvoices()
            ]);
        } catch (e) {
            console.error('فشل تحميل بيانات الداشبورد:', e);
            if (window.Toast) Toast.error('فشل تحميل بعض البيانات');
        }
    },

    async loadStats() {
        try {
            const [invoices, parties, products] = await Promise.all([
                window.DB.getInvoicesLight().catch(() => []),
                window.DB.getParties().catch(() => []),
                window.DB.getProducts().catch(() => [])
            ]);

            const salesInvoices = invoices.filter(i => i.type === 'sale' && i.status !== 'voided');
            const totalSales = salesInvoices.reduce((sum, i) => sum + (parseFloat(i.total) || 0), 0);
            const totalOrders = salesInvoices.length;
            const totalCustomers = parties.filter(p => p.type === 'customer').length;
            const totalProducts = products.length;

            this.state.stats = { totalSales, totalOrders, totalCustomers, totalProducts };
            this.renderStats();
        } catch (e) {
            console.error('فشل تحميل الإحصائيات:', e);
        }
    },

    renderStats() {
        const grid = document.getElementById('statsGrid');
        if (!grid) return;

        const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

        const cards = [
            {
                label: 'إجمالي المبيعات',
                value: formatMoney(this.state.stats.totalSales),
                icon: 'fa-chart-line',
                className: 'sales'
            },
            {
                label: 'عدد الفواتير',
                value: this.state.stats.totalOrders,
                icon: 'fa-file-invoice',
                className: 'orders'
            },
            {
                label: 'العملاء',
                value: this.state.stats.totalCustomers,
                icon: 'fa-users',
                className: 'customers'
            },
            {
                label: 'المنتجات',
                value: this.state.stats.totalProducts,
                icon: 'fa-boxes',
                className: 'inventory'
            }
        ];

        grid.innerHTML = cards.map(c => `
            <div class="stat-card ${c.className}">
                <div class="stat-icon"><i class="fas ${c.icon}"></i></div>
                <div class="stat-info">
                    <div class="stat-label">${c.label}</div>
                    <div class="stat-value">${c.value}</div>
                </div>
            </div>
        `).join('');
    },

    async loadDailySalesCards() {
        const container = document.getElementById('dailySalesCards');
        if (!container) return;

        try {
            const invoices = await window.DB.getInvoicesLight().catch(() => []);
            const salesInvoices = invoices.filter(i => i.type === 'sale' && i.status !== 'voided');

            // آخر 7 أيام
            const days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                days.push({
                    dateStr: d.toISOString().split('T')[0],
                    label: d.toLocaleDateString('ar-EG', { weekday: 'short' }),
                    fullDate: d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'numeric' })
                });
            }

            const dailyTotals = days.map(day => ({
                ...day,
                total: salesInvoices
                    .filter(inv => inv.date === day.dateStr)
                    .reduce((sum, inv) => sum + (parseFloat(inv.total) || 0), 0)
            }));

            const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';

            container.innerHTML = dailyTotals.map(d => `
                <div class="daily-card">
                    <div class="daily-day">${d.label}</div>
                    <div class="daily-date">${d.fullDate}</div>
                    <div class="daily-amount ${d.total === 0 ? 'zero' : ''}">${formatMoney(d.total)}</div>
                </div>
            `).join('');

        } catch (e) {
            console.error('فشل تحميل كروت المبيعات اليومية:', e);
            container.innerHTML = '<div class="daily-card skeleton">بيانات غير متاحة</div>';
        }
    },

    async loadTopProducts() {
        const listEl = document.getElementById('topProductsList');
        if (!listEl) return;

        try {
            const invoices = await window.DB.getInvoices().catch(() => []);
            const salesInvoices = invoices.filter(i => i.type === 'sale' && i.status !== 'voided');

            const productCounts = {};
            for (const inv of salesInvoices) {
                const items = Array.isArray(inv.items) ? inv.items : [];
                for (const item of items) {
                    const name = item.productName || 'منتج';
                    productCounts[name] = (productCounts[name] || 0) + (parseFloat(item.quantity) || 0);
                }
            }

            const sorted = Object.entries(productCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (sorted.length === 0) {
                listEl.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">لا توجد بيانات</p>';
                return;
            }

            listEl.innerHTML = sorted.map(([name, qty]) => `
                <div class="product-simple-item">
                    <span class="prod-name">${name}</span>
                    <span class="prod-qty">${qty.toLocaleString()} قطعة</span>
                </div>
            `).join('');
        } catch (e) {
            console.error('فشل تحميل أفضل المنتجات:', e);
        }
    },

    async loadRecentInvoices() {
        const container = document.getElementById('recentInvoicesTable');
        if (!container) return;

        try {
            const invoices = await window.DB.getInvoicesLight().catch(() => []);
            const recent = invoices.slice(0, 10);

            if (recent.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">لا توجد فواتير</p>';
                return;
            }

            const formatMoney = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
            const statusLabel = { paid: 'مدفوعة', partial: 'جزئية', unpaid: 'غير مدفوعة', held: 'معلقة' };
            const statusClass = { paid: 'paid', partial: 'partial', unpaid: 'unpaid', held: 'partial' };

            container.innerHTML = `
                <div class="table-responsive">
                    <table>
                        <thead>
                            <tr>
                                <th>رقم الفاتورة</th>
                                <th>التاريخ</th>
                                <th>العميل</th>
                                <th>الإجمالي</th>
                                <th>الحالة</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${recent.map(inv => `
                                <tr>
                                    <td>${inv.invoice_number || inv.id?.substring(0, 8) || '-'}</td>
                                    <td>${inv.date || '-'}</td>
                                    <td>${inv.customer_name || 'نقدي'}</td>
                                    <td>${formatMoney(inv.total)}</td>
                                    <td><span class="badge ${statusClass[inv.status] || 'unpaid'}">${statusLabel[inv.status] || inv.status}</span></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            `;
        } catch (e) {
            console.error('فشل تحميل الفواتير:', e);
            container.innerHTML = '<p style="text-align:center;color:var(--gray-400);padding:20px;">فشل تحميل البيانات</p>';
        }
    }
};

window.Dashboard = Dashboard;
