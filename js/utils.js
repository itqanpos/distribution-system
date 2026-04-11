// js/utils.js
// دوال مساعدة عامة

const Utils = {
    // تنسيق العملة
    formatMoney(amount, currency = 'ج') {
        return new Intl.NumberFormat('ar-EG').format(amount) + ' ' + currency;
    },

    // تنسيق التاريخ
    formatDate(date, format = 'dd/mm/yyyy') {
        if (!date) return '';
        const d = new Date(date);
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return format.replace('dd', day).replace('mm', month).replace('yyyy', year);
    },

    // الحصول على تاريخ اليوم بصيغة YYYY-MM-DD
    getToday() {
        return new Date().toISOString().split('T')[0];
    },

    // إنشاء معرف فريد
    generateId(prefix = '') {
        return prefix + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    },

    // البحث في مصفوفة كائنات
    search(array, term, fields) {
        if (!term) return array;
        const lowerTerm = term.toLowerCase();
        return array.filter(item => 
            fields.some(field => String(item[field]).toLowerCase().includes(lowerTerm))
        );
    },

    // حساب الرصيد الإجمالي
    calculateBalance(transactions) {
        return transactions.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
    },

    // تحويل النص إلى slug (للروابط)
    slugify(text) {
        return text.toString().toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w\-]+/g, '')
            .replace(/\-\-+/g, '-');
    },

    // تنفيذ دالة بعد تأخير (debounce)
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    },

    // نسخ النص إلى الحافظة
    copyToClipboard(text) {
        navigator.clipboard?.writeText(text).then(() => {
            alert('تم النسخ إلى الحافظة');
        }).catch(() => {
            prompt('انسخ يدوياً:', text);
        });
    },

    // عرض إشعار (يمكن تطويره لـ Toast)
    showNotification(message, type = 'info') {
        // يمكن استبدالها بمكتبة إشعارات
        alert(message);
    },

    // تأكيد الإجراء
    confirmAction(message, callback) {
        if (confirm(message)) {
            callback();
        }
    }
};

window.Utils = Utils;
