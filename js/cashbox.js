/* =============================================
   الصندوق - حسابي
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        getToday: () => new Date().toISOString().split('T')[0]
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
        this.loadData();
    },

    cacheElements() {
        this.el = {
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
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
            transDescription: document.getElementById('transDescription')
        };
    },

    bindEvents() {
        this.el.userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle.addEventListener('click', () => this.el.sidebar.classList.toggle('mobile-open'));
        this.el.logoutBtn.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.searchInput.addEventListener('input', () => this.renderTable());
        this.el.typeFilter.addEventListener('change', () => this.renderTable());
        this.el.methodFilter.addEventListener('change', () => this.renderTable());
        this.el.dateFrom.addEventListener('change', () => this.renderTable());
        this.el.dateTo.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn.addEventListener('click', () => this.loadData());

        this.el.addTransactionBtn.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.el.transactionForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveTransaction(); });
    },

    async loadData() {
        this.isDBReady = !!(window.DB && window.supabase);
        try {
            if (this.isDBReady) {
                this.transactions = await DB.getTransactions();
                this.settings = await DB.getSettings().catch(() => ({}));
            } else {
                this.transactions = [];
                this.settings = { financial: { opening_cash_balance: 0 } };
            }
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error(err);
            this.el.transactionsBody.innerHTML = '<tr><td colspan="6" class="empty-message">فشل تحميل البيانات</td></tr>';
        }
    },

    calculateBalance() {
        const opening = this.settings?.financial?.opening_cash_balance || 0;
        let balance = opening;
        this.transactions.forEach(tr => {
            if (tr.type === 'income') balance += tr.amount;
            else if (tr.type === 'expense') balance -= tr.amount;
        });
        return balance;
    },

    updateStats() {
        let totalInc = 0, totalExp = 0;
        this.transactions.forEach(tr => {
            if (tr.type === 'income') totalInc += tr.amount;
            else totalExp += tr.amount;
        });
        this.el.currentBalance.textContent = Utils.formatMoney(this.calculateBalance());
        this.el.totalIncome.textContent = Utils.formatMoney(totalInc);
        this.el.totalExpense.textContent = Utils.formatMoney(totalExp);
        this.el.transactionCount.textContent = this.transactions.length;
    },

    renderTable() {
        const term = this.el.searchInput.value.trim().toLowerCase();
        const type = this.el.typeFilter.value;
        const method = this.el.methodFilter.value;
        const from = this.el.dateFrom.value;
        const to = this.el.dateTo.value;

        let filtered = this.transactions.filter(tr => {
            const matchSearch = !term || (tr.description || '').toLowerCase().includes(term);
            const matchType = type === 'all' || tr.type === type;
            const matchMethod = method === 'all' || tr.payment_method === method;
            const matchDateFrom = !from || tr.date >= from;
            const matchDateTo = !to || tr.date <= to;
            return matchSearch && matchType && matchMethod && matchDateFrom && matchDateTo;
        });

        // ترتيب تنازلي حسب التاريخ والوقت (إن وجد timestamp)
        filtered.sort((a, b) => {
            if (b.date !== a.date) return (b.date || '').localeCompare(a.date || '');
            return (b.timestamp || b.created_at || '').localeCompare(a.timestamp || a.created_at || '');
        });

        if (!filtered.length) {
            this.el.transactionsBody.innerHTML = '<tr><td colspan="6" class="empty-message">لا توجد معاملات</td></tr>';
            return;
        }

        // حساب الرصيد التراكمي للعرض
        let runningBalance = this.calculateBalance();
        // نقوم بإنشاء مصفوفة عكسية لإظهار الرصيد بعد كل معاملة من الأحدث للأقدم
        const sortedAsc = [...filtered].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));
        const balanceAfterMap = new Map();
        let bal = this.settings?.financial?.opening_cash_balance || 0;
        // يجب إعادة ترتيب كل المعاملات من البداية لحساب الرصيد الصحيح قبل كل معاملة في القائمة المصفاة
        // للتبسيط نعرض الرصيد بعد المعاملة حسب ترتيب تنازلي، لذا نعكس الحساب.
        // سنقوم بحساب الرصيد بعد كل معاملة في الترتيب التنازلي عن طريق البدء من الرصيد الحالي ثم التراجع.
        // الطريقة الأدق: ترتيب تصاعدي لكل المعاملات، حساب الرصيد التراكمي، ثم عكس القائمة.
        const allSortedAsc = [...this.transactions].sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.timestamp || '').localeCompare(b.timestamp || ''));
        const balanceMap = new Map();
        let b = this.settings?.financial?.opening_cash_balance || 0;
        allSortedAsc.forEach(tr => {
            if (tr.type === 'income') b += tr.amount;
            else b -= tr.amount;
            balanceMap.set(tr.id, b);
        });

        this.el.transactionsBody.innerHTML = filtered.map(tr => {
            const typeClass = tr.type === 'income' ? 'income-text' : 'expense-text';
            const typeText = tr.type === 'income' ? 'إيراد' : 'مصروف';
            const methodText = tr.payment_method === 'cash' ? 'نقدي' : (tr.payment_method === 'bank' ? 'تحويل' : tr.payment_method || '-');
            const sign = tr.type === 'income' ? '+' : '-';
            const balanceAfter = balanceMap.get(tr.id) || 0;
            return `<tr>
                <td>${tr.date}</td>
                <td class="${typeClass}">${typeText}</td>
                <td>${tr.description || '-'}</td>
                <td class="${typeClass}">${sign} ${Utils.formatMoney(tr.amount)}</td>
                <td>${methodText}</td>
                <td class="balance-cell">${Utils.formatMoney(balanceAfter)}</td>
            </tr>`;
        }).join('');
    },

    // ========== إدارة المودال ==========
    openModal(transaction = null) {
        this.el.modalTitle.textContent = transaction ? 'تعديل معاملة' : 'معاملة جديدة';
        this.el.transactionId.value = transaction?.id || '';
        this.el.transType.value = transaction?.type || 'income';
        this.el.transDate.value = transaction?.date || Utils.getToday();
        this.el.transAmount.value = transaction?.amount || '';
        this.el.transMethod.value = transaction?.payment_method || 'cash';
        this.el.transDescription.value = transaction?.description || '';
        this.el.transactionModal.style.display = 'flex';
    },

    closeModal() {
        this.el.transactionModal.style.display = 'none';
    },

    async saveTransaction() {
        const type = this.el.transType.value;
        const date = this.el.transDate.value;
        const amount = parseFloat(this.el.transAmount.value);
        const method = this.el.transMethod.value;
        const description = this.el.transDescription.value.trim();

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
            id: this.el.transactionId.value || crypto.randomUUID(),
            date,
            type,
            amount,
            description: description || null,
            payment_method: method
        };

        try {
            if (this.isDBReady) {
                await DB.saveTransaction(transaction);
            } else {
                const local = JSON.parse(localStorage.getItem('transactions') || '[]');
                const idx = local.findIndex(t => t.id === transaction.id);
                if (idx >= 0) local[idx] = transaction;
                else local.push(transaction);
                localStorage.setItem('transactions', JSON.stringify(local));
            }
            this.closeModal();
            await this.loadData();
        } catch (err) {
            console.error(err);
            alert('فشل حفظ المعاملة: ' + err.message);
        }
    }
};

window.Cashbox = Cashbox;
document.addEventListener('DOMContentLoaded', () => Cashbox.init());
