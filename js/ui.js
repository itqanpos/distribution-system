// js/ui.js
window.UI = {
    initPage(title, options = {}) {
        document.title = title + ' - Distribution System';
        if (options.autoSync && options.syncCallback) {
            this._autoSyncInterval = setInterval(options.syncCallback, options.syncInterval || 30000);
        }
    },

    cleanup() {
        if (this._autoSyncInterval) clearInterval(this._autoSyncInterval);
    },

    navigateTo(page) {
        const pages = {
            'sales': './sales.html', 'purchases': './purchases.html', 'customers': './customers.html',
            'cashbox': './cashbox.html', 'invoices': './invoices.html', 'reports': './reports.html',
            'products': './products.html', 'settings': './settings.html', 'pos': './pos.html'
        };
        if (pages[page]) window.location.href = pages[page];
    },

    manualRefresh() {
        if (typeof loadData === 'function') loadData();
        else if (typeof loadDashboardData === 'function') loadDashboardData();
        else location.reload();
    },

    showToast(message, type = 'info', duration = 3000) {
        const toast = document.createElement('div');
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.left = '20px';
        toast.style.backgroundColor = type === 'success' ? '#2ecc71' : (type === 'danger' ? '#e74c3c' : '#3498db');
        toast.style.color = 'white';
        toast.style.padding = '12px 24px';
        toast.style.borderRadius = '40px';
        toast.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
        toast.style.zIndex = '9999';
        toast.style.fontWeight = '500';
        toast.style.fontFamily = 'Segoe UI, sans-serif';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    },

    async confirmDelete(message = 'Are you sure you want to delete?') {
        return confirm(message);
    },

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            Auth.logout();
        }
    }
};

window.addEventListener('beforeunload', () => UI.cleanup());
