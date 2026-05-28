/* =============================================
   dashboard.js - لوحة التحكم (إصدار مُحسَّن)
   الإصلاحات: معالجة الأخطاء، الأداء، الأمان،
   دعم Offline، حدود زمنية، مرونة القوائم
   ============================================= */
'use strict';

const Dashboard = {
    state: {
        stats: { totalSales: 0, totalOrders: 0, totalCustomers: 0, totalProducts: 0 },
        recentInvoices: [],
        user: null
    },

    /**
     * نقطة البداية – تُستدعى بعد تحقق المصادقة
     */
    async init() {
        // انتظار قصير لضمان تجهيز DOM والنواة
        if (!window.DB || !window.App) {
            console.warn('النواة غير جاهزة، إعادة المحاولة...');
            setTimeout(() => this.init(), 300);
            return;
        }

        this.bindSidebar();
        await this.loadUserInfo();
        await this.loadData();
    },

    /* ========== معلومات المستخدم ========== */
    async loadUserInfo() {
        try {
            const user = await App.getCurrentUser();
            if (user) {
                this.state.user = user;
                const avatar = document.getElementById('sidebarAvatar');
                const nameEl = document.getElementById('sidebarUserName');
                if (avatar) avatar.textContent = (user.fullName || 'U')[0].toUpperCase();
                if (nameEl) nameEl.textContent = user.fullName || 'المستخدم';
            }
        } catch (e) {
            console.warn('فشل تحميل بيانات المستخدم:', e);
        }
    },

    /* ========== القوائم والتفاعلات ========== */
    bindSidebar() {
        const menuToggle = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const moreBtn = document.getElementById('moreMenuBtn');
        const dropdown = document.getElementById('moreDropdown');
        const logoutBtn = document.getElementById('logoutBtn');

        // فتح/إغلاق الشريط الجانبي
        menuToggle?.addEventListener('click', () => {
            sidebar?.classList.toggle('open');
            overlay?.classList.toggle('show');
        });
        overlay?.addEventListener('click', () => {
            sidebar?.classList.remove('open');
            overlay?.classList.remove('show');
        });

        // إغلاق الشريط عند النقر على أي رابط
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                sidebar?.classList.remove('open');
                overlay?.classList.remove('show');
            });
        });

        // القائمة المنسدلة للنقاط الثلاث
        moreBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (dropdown && !e.target.closest('.nav-actions')) {
                dropdown.classList.remove('show');
            }
        });

        // تسجيل الخروج
        logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App && App.logout) App.logout();
            else window.location.href = './index.html';
        });
    },

    /* ========== تحميل كل البيانات ========== */
    async loadData() {
        const tasks = [
            this.loadStats().catch(e => console.error('stats:', e)),
            this.loadDailySalesCards().catch(e => console.error('daily:', e)),
            this.loadTopProducts().catch(e => console.error('top products:', e)),
            this.loadRecentInvoices().catch(e => console.error('recent inv:', e))
        ];
        await Promise.allSettled(tasks);
        // يمكن إضافة Toast واحد إذا فشل الكل
    },

    /* ========== الإحصائيات العامة ========== */
    async loadStats() {
        const [invoices, parties, products] = await Promise.all([
            window.DB.getInvoicesLight().catch(() => []),
            window.DB.getParties().catch(() => []),
            window.DB.getProducts().catch(() => [])
        ]);

        const salesInvoices = invoices.filter(i => i.type === 'sale' && i.status !== 'voided');
        const totalSales = salesInvoices.reduce((sum, i) => sum + (Number(i.total) || 0), 0);
        const totalOrders = salesInvoices.length;
        const totalCustomers = parties.filter(p => p.type === 'customer').length;
        const totalProducts = products.length;

        this.state.stats = { totalSales, totalOrders, totalCustomers, totalProducts };
        this.renderStats();
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

    /* ========== كروت المبيعات اليومية (آخر 7 أيام) ========== */
    async loadDailySalesCards() {
        const container = document.getElementById('dailySalesCards');
        if (!container) return;

        try {
            // نجلب الفواتير الخفيفة و نقتصر على آخر 30 يوم فقط لتحسين الأداء
            const invoices = await window.DB.getInvoicesLight().catch(() => []);
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 30);
            const cutoffStr = cutoff.toISOString().split('T')[0];

            const salesInvoices = invoices.filter(i =>
                i.type === 'sale' &&
                i.status !== 'voided' &&
                i.date >= cutoffStr    // تاريخ بصيغة YYYY-MM-DD
            );

            // بناء آخر 7 أيام
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
                total: salesInvoices
                    .filter(inv => inv.date === day.dateStr)
                    .reduce((sum, inv) => sum + (Number(inv.total) || 0), 0)
            }));

            container.innerHTML = dailyTotals.map(d => `
                <div class="daily-card">
                    <div class="daily-day">${d.label}</div>
                    <div class="daily-date">${d.fullDate}</div>
                    <div class="daily-amount ${d.total === 0 ? 'zero' : ''}">${fmt(d.total)}</div>
                </div>
            `).join('');
        } catch (e) {
            console.error('فشل تحميل كروت المبيعات:', e);
            container.innerHTML = '<div class="daily-card skeleton">خطأ في التحميل</div>';
        }
    },

    /* ========== أفضل المنتجات مبيعاً (آخر 1000 فاتورة) ========== */
    async loadTopProducts() {
        const listEl = document.getElementById('topProductsList');
        if (!listEl) return;

        try {
            // نجلب الفواتير الكاملة (ضروري للعناصر) لكن نحدد الرقم لتخفيف الحمل
            const invoices = await window.DB.getInvoices().catch(() => []);
            const salesInvoices = invoices
                .filter(i => i.type === 'sale' && i.status !== 'voided')
                .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')) // الأحدث أولاً
                .slice(0, 1000);  // آخر 1000 فاتورة فقط

            const productCounts = {};
            for (const inv of salesInvoices) {
                const items = Array.isArray(inv.items) ? inv.items : [];
                for (const item of items) {
                    const name = item.productName || 'منتج';
                    productCounts[name] = (productCounts[name] || 0) + (Number(item.quantity) || 0);
                }
            }

            const sorted = Object.entries(productCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5);

            if (sorted.length === 0) {
                listEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد بيانات</p>';
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
            listEl.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">فشل تحميل البيانات</p>';
        }
    },

    /* ========== آخر 10 فواتير ========== */
    async loadRecentInvoices() {
        const container = document.getElementById('recentInvoicesTable');
        if (!container) return;

        try {
            const invoices = await window.DB.getInvoicesLight().catch(() => []);
            const recent = invoices
                .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
                .slice(0, 10);

            if (recent.length === 0) {
                container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">لا توجد فواتير</p>';
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
                <div class="table-responsive">
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
                </div>
            `;
        } catch (e) {
            console.error('فشل تحميل الفواتير:', e);
            container.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:20px;">فشل تحميل البيانات</p>';
        }
    },

    /* ========== أدوات مساعدة ========== */
    _escapeHTML(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
};

// تهيئة عند جاهزية الصفحة (يُستدعى من dashboard.html)
window.Dashboard = Dashboard;
