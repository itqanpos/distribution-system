// js/utils.js
window.Utils = {
    // تنسيق العملة (بالأرقام الإنجليزية)
    formatMoney(amount) {
        if (amount === undefined || amount === null) amount = 0;
        return Number(amount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' EGP';
    },

    // تنسيق رقم بدون عملة
    formatNumber(num) {
        return Number(num).toLocaleString('en-US');
    },

    getToday() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    getTimestamp() {
        return new Date().toISOString();
    },

    sortByDateDesc(arr) {
        return arr.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    },

    calculateBalance(transactions) {
        let balance = 0;
        transactions.forEach(t => {
            if (t.type === 'income') balance += t.amount || 0;
            else if (t.type === 'expense') balance -= t.amount || 0;
        });
        return balance;
    },

    generateId(prefix = '') {
        return prefix + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    },

    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    showToast(message, type = 'info') {
        if (window.UI && window.UI.showToast) {
            window.UI.showToast(message, type);
        } else {
            alert(message);
        }
    }
};
