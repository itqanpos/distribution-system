/* =============================================
   cashbox.js - الصندوق (إصدار فائق السرعة)
   ============================================= */
'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try {
                return new Date(dateStr).toLocaleDateString('ar-EG', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            } catch (e) {
                return dateStr;
            }
        },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase),
        hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
    };
}

const Cashbox = {
    transactions: [],
    settings: {},
    isDBReady: false,

    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.initSidebarUser();
        this.loadData();
    },

    cacheElements() {
        this.el = {
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            logoutBtn: document.getElementById('logoutBtn'),
            searchInput: document.getElementById('searchInput'),
            typeFilter: document.getElementById('typeFilter'),
            methodFilter: document.getElementById('methodFilter'),
            dateFrom: document.getElementById('dateFrom'),
            dateTo: document.getElementById('dateTo'),
            refreshBtn: document.getElementById('refreshBtn'),
            transactionsBody: document.getElementById('transactionsBody'),
            addTransactionBtn: document.getElementById('addTransactionBtn'),
            currentBalance: document.getElementById('currentBalance'),
            totalIncome: document.getElementById('totalIncome'),
            totalExpense: document.getElementById('totalExpense'),
            transactionCount: document.getElementById('transactionCount'),
            transactionModal: document.getElementById('transactionModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelModalBtn: document.getElementById('cancelModalBtn'),
            transactionForm: document.getElementById('transactionForm'),
            transactionId: document.getElementById('transactionId'),
            transType: document.getElementById('transType'),
            transDate: document.getElementById('transDate'),
            transAmount: document.getElementById('transAmount'),
            transMethod: document.getElementById('transMethod'),
            transDescription: document.getElementById('transDescription'),
            moreMenuBtn: document.getElementById('moreMenuBtn'),
            moreDropdown: document.getElementById('moreDropdown'),
            refreshDataBtn: document.getElementById('refreshDataBtn'),
            sidebarAvatar: document.getElementById('sidebarAvatar'),
            sidebarUserName: document.getElementById('sidebarUserName'),
            toast: document.getElementById('toast')
        };
    },

    bindEvents() {
        // القائمة الجانبية
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay?.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                this.el.sidebar.classList.remove('open');
                this.el.sidebarOverlay?.classList.remove('show');
            });
        });

        // زر النقاط الثلاث والقائمة المنسدلة
        this.el.moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show');
        });

        this.el.refreshDataBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            this.loadData();
            this.toast('تم تحديث البيانات');
            this.el.moreDropdown?.classList.remove('show');
        });
        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        // الفلاتر والبحث
        this.el.searchInput?.addEventListener('input', () => this.renderTable());
        this.el.typeFilter?.addEventListener('change', () => this.renderTable());
        this.el.methodFilter?.addEventListener('change', () => this.renderTable());
        this.el.dateFrom?.addEventListener('change', () => this.renderTable());
        this.el.dateTo?.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () => this.loadData());

        this.el.addTransactionBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.transactionForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveTransaction(); });
    },

    initSidebarUser() {
        const user = window.App?.getCurrentUser?.();
        if (user) {
            if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = user.avatar || 'U';
            if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
        }
    },

    async loadData() {
        this.isDBReady = Utils.isDBReady();
        try {
            if (this.isDBReady) {
                this.transactions = await DB.getTransactions() || [];
                this.settings = await DB.getSettings().catch(() => ({}));
            } else if (Utils.hasLocalDB()) {
                this.transactions = await localDB.getAll('transactions') || [];
                const s = await localDB.getById('settings', 'main').catch(() => null);
                this.settings = s?.data || {};
            } else {
                this.transactions = [];
                this.settings = { financial: { opening_cash_balance: 0 } };
            }
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error('فشل تحميل بيانات الصندوق:', err);
            this.el.transactionsBody.innerHTML = '<tr><td colspan="6" class="empty-message">فشل تحميل البيانات</td></tr>';
        }
    },

    calculateBalance() {
        const opening = this.settings?.financial?.opening_cash_balance || 0;
        let balance = opening;
        for (const tr of this.transactions) {
            if (tr.type === 'income') balance += tr.amount;
            else balance -= tr.amount;
        }
        return balance;
    },

    updateStats() {
        let totalInc = 0, totalExp = 0;
        for (const tr of this.transactions) {
            if (tr.type === 'income') totalInc += tr.amount;
            else totalExp += tr.amount;
        }
        if (this.el.currentBalance) this.el.currentBalance.textContent = Utils.formatMoney(this.calculateBalance());
        if (this.el.totalIncome) this.el.totalIncome.textContent = Utils.formatMoney(totalInc);
        if (this.el.totalExpense) this.el.totalExpense.textContent = Utils.formatMoney(totalExp);
        if (this.el.transactionCount) this.el.transactionCount.textContent = this.transactions.length;
    },

    renderTable() {
        const term = this.el.searchInput?.value.trim().toLowerCase() || '';
        const type = this.el.typeFilter?.value || 'all';
        const method = this.el.methodFilter?.value || 'all';
        const from = this.el.dateFrom?.value || '';
        const to = this.el.dateTo?.value || '';

        let filtered = this.transactions.filter(tr => {
            const matchSearch = !term || (tr.description || '').toLowerCase().includes(term);
            const matchType = type === 'all' || tr.type === type;
            const matchMethod = method === 'all' || tr.payment_method === method;
            const matchDateFrom = !from || tr.date >= from;
            const matchDateTo = !to || tr.date <= to;
            return matchSearch && matchType && matchMethod && matchDateFrom && matchDateTo;
        });

        filtered.sort((a, b) => {
            if (b.date !== a.date) return (b.date || '').localeCompare(a.date || '');
            return (b.timestamp || b.created_at || '').localeCompare(a.timestamp || a.created_at || '');
        });

        if (!filtered.length) {
            this.el.transactionsBody.innerHTML = '<tr><td colspan="6" class="empty-message">لا توجد معاملات</td></tr>';
            return;
        }

        // حساب الرصيد التراكمي مرة واحدة
        const balanceMap = new Map();
        let runningBalance = this.settings?.financial?.opening_cash_balance || 0;
        const sortedAsc = [...this.transactions].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));
        for (const tr of sortedAsc) {
            if (tr.type === 'income') runningBalance += tr.amount;
            else runningBalance -= tr.amount;
            balanceMap.set(tr.id, runningBalance);
        }

        // تجميع الصفوف دفعة واحدة
        let rowsHTML = '';
        for (const tr of filtered) {
            const typeClass = tr.type === 'income' ? 'income-text' : 'expense-text';
            const typeText = tr.type === 'income' ? 'إيراد' : 'مصروف';
            const methodText = tr.payment_method === 'cash' ? 'نقدي' : (tr.payment_method === 'bank' ? 'تحويل' : tr.payment_method || '-');
            const sign = tr.type === 'income' ? '+' : '-';
            const balanceAfter = balanceMap.get(tr.id) || 0;
            rowsHTML += `<tr>
                <td>${Utils.formatDate(tr.date)}</td>
                <td class="${typeClass}">${typeText}</td>
                <td>${tr.description || '-'}</td>
                <td class="${typeClass}">${sign} ${Utils.formatMoney(tr.amount)}</td>
                <td>${methodText}</td>
                <td class="balance-cell">${Utils.formatMoney(balanceAfter)}</td>
            </tr>`;
        }
        this.el.transactionsBody.innerHTML = rowsHTML;
    },

    openModal(transaction = null) {
        this.el.modalTitle.textContent = transaction ? 'تعديل معاملة' : 'معاملة جديدة';
        this.el.transactionId.value = transaction?.id || '';
        this.el.transType.value = transaction?.type || 'income';
        this.el.transDate.value = transaction?.date || Utils.getToday();
        this.el.transAmount.value = transaction?.amount || '';
        this.el.transMethod.value = transaction?.payment_method || 'cash';
        this.el.transDescription.value = transaction?.description || '';
        this.el.transactionModal.classList.add('open');
    },

    closeModal() {
        this.el.transactionModal.classList.remove('open');
    },

    async saveTransaction() {
        const type = this.el.transType?.value || 'income';
        const date = this.el.transDate?.value || Utils.getToday();
        const amount = parseFloat(this.el.transAmount?.value) || 0;
        const method = this.el.transMethod?.value || 'cash';
        const description = this.el.transDescription?.value.trim() || null;

        if (!amount || amount <= 0) { alert('المبلغ مطلوب'); return; }

        // التحقق من الرصيد في حالة السحب
        if (type === 'expense') {
            const currentBalance = this.calculateBalance();
            if (amount > currentBalance) {
                alert(`الرصيد غير كافٍ. الرصيد الحالي: ${Utils.formatMoney(currentBalance)}`);
                return;
            }
        }

        const transaction = {
            id: this.el.transactionId?.value || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
            date,
            type,
            amount,
            description,
            payment_method: method
        };

        try {
            if (this.isDBReady) {
                await DB.saveTransaction(transaction);
            } else if (Utils.hasLocalDB()) {
                await localDB.put('transactions', transaction);
            } else {
                const local = JSON.parse(localStorage.getItem('transactions') || '[]');
                const idx = local.findIndex(t => t.id === transaction.id);
                if (idx >= 0) local[idx] = transaction;
                else local.push(transaction);
                localStorage.setItem('transactions', JSON.stringify(local));
            }
            this.closeModal();
            await this.loadData();
            this.showToast('تم حفظ المعاملة بنجاح');
        } catch (err) {
            console.error('فشل حفظ المعاملة:', err);
            alert('فشل حفظ المعاملة: ' + err.message);
        }
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.Cashbox = Cashbox;
document.addEventListener('DOMContentLoaded', () => Cashbox.init());
