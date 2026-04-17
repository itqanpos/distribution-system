// js/ui.js
window.UI = {
    // تهيئة الصفحة العامة
    initPage(title, options = {}) {
        document.title = title + ' - نظام التوزيع';
        
        // إعدادات السحب للتحديث (إذا دُعمت)
        if (options.enablePullToRefresh) {
            this._setupPullToRefresh(options.refreshCallback);
        }
        
        // تحديث تلقائي
        if (options.autoSync && options.syncCallback) {
            const interval = options.syncInterval || 30000;
            this._autoSyncInterval = setInterval(options.syncCallback, interval);
        }

        // عرض الوقت الحالي في شريط المعلومات إن وجد
        const timeEl = document.getElementById('currentTime');
        if (timeEl) {
            const updateTime = () => {
                timeEl.textContent = new Date().toLocaleString('ar-EG');
            };
            updateTime();
            setInterval(updateTime, 1000);
        }
    },

    // تنظيف المؤقتات عند مغادرة الصفحة
    cleanup() {
        if (this._autoSyncInterval) {
            clearInterval(this._autoSyncInterval);
        }
    },

    _setupPullToRefresh(callback) {
        let startY = 0;
        const threshold = 80;
        const container = document.querySelector('.main-content') || document.body;
        
        container.addEventListener('touchstart', e => {
            if (container.scrollTop === 0) startY = e.touches[0].clientY;
        });
        
        container.addEventListener('touchmove', e => {
            if (startY === 0) return;
            const y = e.touches[0].clientY;
            const diff = y - startY;
            if (diff > threshold && container.scrollTop === 0) {
                this.showToast('تحديث...', 'info');
                if (callback) callback();
                startY = 0;
            }
        });
    },

    // التنقل بين الصفحات
    navigateTo(page) {
        const pages = {
            'sales': './sales.html',
            'purchases': './purchases.html',
            'customers': './customers.html',
            'cashbox': './cashbox.html',
            'invoices': './invoices.html',
            'reports': './reports.html',
            'products': './products.html',
            'settings': './settings.html'
        };
        const url = pages[page];
        if (url) window.location.href = url;
        else console.warn('صفحة غير معروفة:', page);
    },

    // تحديث يدوي
    manualRefresh() {
        if (typeof loadDashboardData === 'function') loadDashboardData();
        else if (typeof loadPageData === 'function') loadPageData();
        else location.reload();
    },

    // عرض إشعار (Toast)
    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '20px';
        toast.style.backgroundColor = type === 'success' ? '#2ecc71' : (type === 'warning' ? '#f39c12' : '#3498db');
        toast.style.color = 'white';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '40px';
        toast.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
        toast.style.zIndex = '9999';
        toast.style.fontWeight = '500';
        toast.textContent = message;
        
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    },

    // تأكيد الحذف
    async confirmDelete(message = 'هل أنت متأكد من الحذف؟') {
        return confirm(message);
    },

    // تسجيل الخروج
    logout() {
        if (confirm('هل تريد تسجيل الخروج؟')) {
            Auth.logout();
        }
    }
};

// تنظيف المؤقتات عند مغادرة الصفحة
window.addEventListener('beforeunload', () => {
    UI.cleanup();
});

console.log('✅ UI module loaded');
