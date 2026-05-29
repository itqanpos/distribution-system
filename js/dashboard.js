/* =============================================
   dashboard.js - لوحة التحكم (متوافق مع النواة)
   ============================================= */
'use strict';

const Dashboard = {
    el: {},
    state: {
        ready: false,
        loading: false,
        stats: { salesToday:0, purchasesToday:0, customers:0, products:0, cash:0, weeklySales:0 },
        allInvoices: []
    },

    async init() {
        this.cacheDOM();
        this.bindEvents();
        this.setDate();
        this.applyTheme();
        this.initSidebarUser();

        await this.waitForDB();

        if (window.App) {
            App.requireAuth();
            App.initUserInterface();
            this.updateSidebarUser();
        }

        this.loadAllData();
        setInterval(() => { if (!this.state.loading) this.loadAllData(); }, 30000);
    },

    cacheDOM() {
        const ids = [
            'menuToggle','sidebar','sidebarOverlay','currentDate',
            'salesToday','purchasesToday','customersCount','cashBalance',
            'heroGreeting','sidebarAvatar','sidebarUserName',
            'moreMenuBtn','moreDropdown','refreshDataBtn','logoutBtn',
            'activityTimeline','chartPeriod','salesChart','lowStockAlert','unpaidAlert'
        ];
        ids.forEach(id => this.el[id] = document.getElementById(id));
    },

    bindEvents() {
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });
        this.el.moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show');
        });
        this.el.refreshDataBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadAllData();
            window.Toast?.success('تم تحديث البيانات');
            this.el.moreDropdown?.classList.remove('show');
        });
        this.el.logoutBtn?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
                if (window.App) App.logout();
                else location.href = './index.html';
            }
            this.el.moreDropdown?.classList.remove('show');
        });
        this.el.chartPeriod?.addEventListener('change', () => this.renderChart());
    },

    // ... باقي الدوال loadAllData, loadStats, renderChart, updateStatsUI إلخ
    // مع استبدال window.App.DB بـ window.DB واستخدام limit 500 للفواتير
};

window.addEventListener('DOMContentLoaded', () => Dashboard.init());
