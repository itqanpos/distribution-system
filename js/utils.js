// js/utils.js
window.Utils = {
    // تنسيق المبلغ كعملة
    formatMoney(amount) {
        if (amount === undefined || amount === null) amount = 0;
        return Number(amount).toLocaleString('ar-EG', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }) + ' ج.م';
    },

    // الحصول على تاريخ اليوم بصيغة YYYY-MM-DD
    getToday() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    // الحصول على الوقت الحالي بصيغة HH:MM:SS
    getCurrentTime() {
        const d = new Date();
        return d.toLocaleTimeString('ar-EG', { hour12: false });
    },

    // الحصول على طابع زمني كامل (ISO)
    getTimestamp() {
        return new Date().toISOString();
    },

    // ترتيب المصفوفة تنازلياً حسب التاريخ (يفترض وجود حقل date بصيغة YYYY-MM-DD)
    sortByDateDesc(arr) {
        return arr.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    },

    // حساب رصيد الصندوق من مجموعة حركات
    calculateBalance(transactions) {
        let balance = 0;
        transactions.forEach(t => {
            if (t.type === 'income') balance += t.amount || 0;
            else if (t.type === 'expense') balance -= t.amount || 0;
        });
        return balance;
    },

    // توليد معرف فريد قصير (للاستخدام المؤقت قبل الحفظ)
    generateId(prefix = '') {
        return prefix + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    },

    // نسخ عميق آمن
    deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    },

    // عرض رسالة خطأ / نجاح (ستُستخدم مع UI)
    showToast(message, type = 'info') {
        if (window.UI && window.UI.showToast) {
            window.UI.showToast(message, type);
        } else {
            alert(message);
        }
    }
};

console.log('✅ Utils module loaded');
