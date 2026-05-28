/* =============================================
   dashboard.js - لوحة تحكم متكاملة
   ============================================= */
'use strict';

const Dashboard = {
    state: {
        stats: { totalSales: 0, totalOrders: 0, totalCustomers: 0, totalProducts: 0 }
    },

    async init() {
        if (!window.DB || !window.App) {
            setTimeout(() => this.init(), 300);
            return;
        }

        this.bindSidebar();
        await this.loadData();
    },

    bindSidebar() {
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const moreBtn = document.getElementById('moreMenuBtn');
        const dropdown = document.getElementById('moreDropdown');
        const logoutBtn = document.getElementById('logoutDropdown');

        menuToggle?.addEventListener('click', () => {
            sidebar?.classList.toggle('open');
            overlay?.classList.toggle('show');
        });
        overlay?.addEventListener('click', () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('show');
        });

        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                sidebar?.classList.remove('open');
                overlay?.classList.remove('show');
            });
        });

        moreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (dropdown && !e.target.closest('.nav-actions')) {
                dropdown.classList.remove('show');
            }
        });

        logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App && App.logout) App.logout();
            else window.location.href = './index.html';
        });
    },

    async loadData() {
        await Promise.allSettled([
            this.loadStats(),
            this.loadDailySales(),
            this.loadTopProducts(),
            this.loadRecentInvoices()
        ]);
    },

    async loadStats() {
        try {
            const [invoices, parties, products] = await Promise.all([
                window.DB.getInvoicesLight().catch(() => []),
                window.DB.getParties().catch(() => []),
                window.DB.getProducts().catch(() => [])
            ]);

            const salesInvoices = invoices.filter(i => i.type === 'sale' && i.status !== 'voided');
            this.state.stats.totalSales = salesInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
            this.state.stats.totalOrders = salesInvoices.length;
            this.state.stats.totalCustomers = parties.filter(p => p.type === 'customer').length;
            this.state.stats.totalProducts = products.length;

            this.renderStats();
        } catch (e) {
            console.error('فشل تحميل الإحصائيات:', e);
        }
    },

    renderStats() {
        const grid = document.getElementById('statsGrid');
        if (!grid) return;

        const fmt = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
        const cards = [
            { label: 'إجمالي المبيعات', value: fmt(this.state.stats.totalSales), icon: 'fa-chart-line', cls: 'sales' },
            { label: 'عدد الفواتير', value: this.state.stats.totalOrders, icon: 'fa-file-invoice', cls: 'orders' },
            { label: 'العملاء', value: this.state.stats.totalCustomers, icon: 'fa-users', cls: 'customers' },
            { label: 'المنتجات', value: this.state.stats.totalProducts, icon: 'fa-boxes', cls: 'inventory' }
        ];

        grid.innerHTML = cards.map(c => `
            <div class="stat-card ${c.cls}">
                <div class="stat-icon"><i class="fas ${c.icon}"></i></div>
                <div class="stat-info">
                    <div class="stat-label">${c.label}</div>
                    <div class="stat-value">${c.value}</div>
                </div>
            </div>
        `).join('');
    },

    async loadDailySales() {
        const container = document.getElementById('dailySalesCards');
        if (!container) return;

        try {
            const invoices = await window.DB.getInvoicesLight().catch(() => []);
            const sales = invoices.filter(i => i.type === 'sale' && i.status !== 'voided');

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

            const fmt = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
            const dailyTotals = days.map(day => ({
                ...day,
                total: sales.filter(inv => inv.date === day.dateStr).reduce((sum, inv) => sum + (Number(inv.total) || 0), 0)
            }));

            container.innerHTML = dailyTotals.map(d => `
                <div class="daily-card">
                    <div class="daily-day">${d.label}</div>
                    <div class="daily-date">${d.fullDate}</div>
                    <div class="daily-amount ${d.total === 0 ? 'zero' : ''}">${fmt(d.total)}</div>
                </div>
            `).join('');
        } catch (e) {
            console.error('فشل تحميل المبيعات اليومية:', e);
            container.innerHTML = '<div class="daily-card skeleton">خطأ في التحميل</div>';
        }
    },

    async loadTopProducts() {
        const listEl = document.getElementById('topProductsList');
        if (!listEl) return;

        try {
            const invoices = await window.DB.getInvoices().catch(() => []);
            const salesInvoices = invoices.filter(i => i.type === 'sale' && i.status !== 'voided').slice(-1000);

            const counts = {};
            for (const inv of salesInvoices) {
                const items = Array.isArray(inv.items) ? inv.items : [];
                for (const item of items) {
                    const name = item.productName || 'منتج';
                    counts[name] = (counts[name] || 0) + (Number(item.quantity) || 0);
                }
            }

            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);

            if (sorted.length === 0) {
                listEl.innerHTML = '<p class="text-center muted">لا توجد بيانات</p>';
                return;
            }

            listEl.innerHTML = sorted.map(([name, qty]) => `
                <div class="product-simple-item">
                    <span class="prod-name">${this._escapeHTML(name)}</span>
                    <span class="prod-qty">${qty.toLocaleString()} قطعة</span>
                </div>
            `).join('');
        } catch (e) {
            console.error('فشل تحميل أفضل المنتجات:', e);
            listEl.innerHTML = '<p class="text-center muted">فشل تحميل البيانات</p>';
        }
    },

    async loadRecentInvoices() {
        const container = document.getElementById('recentInvoicesTable');
        if (!container) return;

        try {
            const invoices = await window.DB.getInvoicesLight().catch(() => []);
            const recent = invoices.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')).slice(0, 10);

            if (recent.length === 0) {
                container.innerHTML = '<p class="text-center muted">لا توجد فواتير</p>';
                return;
            }

            const fmt = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
            const statusMap = {
                paid: { label: 'مدفوعة', cls: 'paid' },
                partial: { label: 'جزئية', cls: 'partial' },
                unpaid: { label: 'غير مدفوعة', cls: 'unpaid' },
                held: { label: 'معلقة', cls: 'partial' }
            };

            container.innerHTML = `
                <table>
                    <thead>
                        <tr><th>رقم الفاتورة</th><th>التاريخ</th><th>العميل</th><th>الإجمالي</th><th>الحالة</th></tr>
                    </thead>
                    <tbody>
                        ${recent.map(inv => {
                            const s = statusMap[inv.status] || { label: inv.status || 'غير معروف', cls: 'unpaid' };
                            return `
                            <tr>
                                <td>${inv.invoice_number || inv.id?.substring(0, 8) || '-'}</td>
                                <td>${inv.date || '-'}</td>
                                <td>${inv.customer_name || 'نقدي'}</td>
                                <td>${fmt(inv.total)}</td>
                                <td><span class="badge ${s.cls}">${s.label}</span></td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            `;
        } catch (e) {
            console.error('فشل تحميل الفواتير:', e);
            container.innerHTML = '<p class="text-center muted">فشل تحميل البيانات</p>';
        }
    },

    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

window.Dashboard = Dashboard;
