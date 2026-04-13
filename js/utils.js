// js/utils.js - دوال مساعدة عامة
const Utils = {
    formatMoney(amount, currency = 'ج') {
        if (amount === null || amount === undefined) return '0 ' + currency;
        return new Intl.NumberFormat('ar-EG').format(amount) + ' ' + currency;
    },

    formatDate(date, format = 'dd/mm/yyyy') {
        if (!date) return '';
        const d = new Date(date);
        if (isNaN(d.getTime())) return '';
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return format.replace('dd', day).replace('mm', month).replace('yyyy', year);
    },

    getToday() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    generateId(prefix = '') {
        return prefix + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
    },

    search(array, term, fields) {
        if (!term) return array;
        const lowerTerm = String(term).toLowerCase();
        return array.filter(item => fields.some(field => {
            const value = item[field];
            return value && String(value).toLowerCase().includes(lowerTerm);
        }));
    },

    calculateBalance(transactions) {
        return transactions.reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);
    },

    groupBy(array, key) {
        return array.reduce((result, item) => {
            const groupKey = item[key];
            if (!result[groupKey]) result[groupKey] = [];
            result[groupKey].push(item);
            return result;
        }, {});
    },

    sumBy(array, key) {
        return array.reduce((sum, item) => sum + (parseFloat(item[key]) || 0), 0);
    },

    sortByDateDesc(array, dateKey = 'date') {
        return [...array].sort((a, b) => new Date(b[dateKey]) - new Date(a[dateKey]));
    }
};

window.Utils = Utils;
