/* =============================================
   cashbox.js - صفحة الصندوق (إصدار محسّن)
   ============================================= */
'use strict';

const CashboxPage = {
    state: {
        transactions: [],
        filteredTransactions: [],
        balance: 0,
        currentPage: 1,
        pageSize: 15,
        filters: { type: 'all', search: '' },
        loading: false,
        editingTransaction: null,
        currentUser: null,
        balanceMap: new Map()
    },
    el: {},
    refreshTimer: null,
    _toastTimer: null,

    /* ---------- أدوات مساعدة ---------- */
    _utils: {
        formatMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
        escapeHTML: (str) => { const div = document.createElement('div'); div.appendChild(document.createTextNode(str || '')); return div.innerHTML; },
        today: () => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        },
        formatDate: (dateStr) => { if (!dateStr) return ''; try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return dateStr; } }
    },

    /* ---------- التهيئة ---------- */
    async init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            const ok = await App.requireAuth();
            if (!ok) return;
            App.initUserInterface();
        }
        await this.initSidebarUser();
        await this.loadData();
        this.setupPeriodicRefresh();
        window.addEventListener('online', () => this.loadData());
        window.addEventListener('beforeunload', () => this.cleanup());
    },

    cacheElements() {
        const ids = [
            'balanceDisplay', 'searchInput', 'filterType', 'tableBody', 'pagination', 'addTransactionBtn',
            'transactionModal', 'modalTitle', 'transactionType', 'transactionAmount', 'transactionDescription',
            'transactionDate', 'saveTransactionBtn', 'closeTransactionModalBtn', 'deleteTransactionBtn',
            'sidebar', 'sidebarOverlay', 'menuToggle', 'moreMenuBtn', 'moreDropdown', 'logoutBtn',
            'sidebarAvatar', 'sidebarUserName'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    bindEvents() {
        this.el.menuToggle?.addEventListener('click', () => { this.el.sidebar?.classList.toggle('open'); this.el.sidebarOverlay?.classList.toggle('show'); });
        this.el.sidebarOverlay?.addEventListener('click', () => { this.el.sidebar?.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); });
        document.querySelectorAll('.menu-item').forEach(l => l.addEventListener('click', () => { this.el.sidebar?.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); }));

        this.el.moreMenuBtn?.addEventListener('click', e => { e.stopPropagation(); this.el.moreDropdown?.classList.toggle('show'); });
        document.addEventListener('click', e => { if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show'); });
        this.el.logoutBtn?.addEventListener('click', e => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.filterType?.addEventListener('change', () => this.applyFilters());
        this.el.searchInput?.addEventListener('input', () => this.applyFilters());

        this.el.addTransactionBtn?.addEventListener('click', () => this.openTransactionModal());
        this.el.closeTransactionModalBtn?.addEventListener('click', () => this.closeModal('transactionModal'));
        this.el.saveTransactionBtn?.addEventListener('click', () => this.saveTransaction());
        this.el.deleteTransactionBtn?.addEventListener('click', () => this.deleteCurrentTransaction());

        this.el.transactionModal?.addEventListener('click', e => {
            if (e.target === this.el.transactionModal) this.closeModal('transactionModal');
        });
    },

    async initSidebarUser() {
        const user = await window.App?.getCurrentUser?.();
        this.state.currentUser = user;
        if (!user) return;
        if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
        if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
    },

    showToast(msg, type = 'info') {
        if (window.Toast) {
            if (type === 'error') Toast.error(msg);
            else if (type === 'success') Toast.success(msg);
            else Toast.info(msg);
        } else {
            alert(msg);
        }
    },

    /* ---------- تحميل البيانات ---------- */
    async loadData() {
        if (this.state.loading) return;
        this.state.loading = true;
        try {
            const tx = await window.DB?.getTransactions().catch(() => []);
            this.state.transactions = (tx || []).map(t => ({ ...t, amount: Number(t.amount || 0) }));
            this.calculateBalance();
            this.buildBalanceMap();
            this.applyFilters();
        } catch (e) {
            console.error('فشل تحميل المعاملات:', e);
            this.showToast('فشل تحميل بيانات الصندوق', 'error');
            this.state.transactions = [];
            this.applyFilters();
        } finally {
            this.state.loading = false;
        }
    },

    calculateBalance() {
        this.state.balance = this.state.transactions.reduce((acc, t) => {
            return t.type === 'income' ? acc + Number(t.amount) : acc - Number(t.amount);
        }, 0);
        if (this.el.balanceDisplay) {
            this.el.balanceDisplay.textContent = this._utils.formatMoney(this.state.balance);
            this.el.balanceDisplay.classList.toggle('text-success', this.state.balance >= 0);
            this.el.balanceDisplay.classList.toggle('text-danger', this.state.balance < 0);
        }
    },

    buildBalanceMap() {
        this.state.balanceMap.clear();
        let cumulative = 0;
        const sortedAsc = [...this.state.transactions].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        for (const t of sortedAsc) {
            if (t.type === 'income') cumulative += t.amount;
            else cumulative -= t.amount;
            this.state.balanceMap.set(t.id, cumulative);
        }
    },

    /* ---------- الفلاتر ---------- */
    applyFilters() {
        const type = this.el.filterType?.value || 'all';
        const search = (this.el.searchInput?.value || '').trim().toLowerCase();

        let filtered = [...this.state.transactions];
        if (type !== 'all') filtered = filtered.filter(t => t.type === type);
        if (search) {
            filtered = filtered.filter(t => (t.description || '').toLowerCase().includes(search));
        }

        // إصلاح مقارنة timestamp (رقمي)
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

        this.state.filteredTransactions = filtered;
        this.state.currentPage = 1;
        this.renderTable();
    },

    /* ---------- عرض الجدول ---------- */
    renderTable() {
        const { filteredTransactions, currentPage, pageSize } = this.state;
        const totalPages = Math.ceil(filteredTransactions.length / pageSize);
        const start = (currentPage - 1) * pageSize;
        const pageData = filteredTransactions.slice(start, start + pageSize);

        if (!this.el.tableBody) return;
        if (!pageData.length) {
            this.el.tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-muted);">لا توجد معاملات</td></tr>';
            this.renderPagination(0);
            return;
        }

        const esc = this._utils.escapeHTML;
        const fm = this._utils.formatMoney;
        const fmtDate = this._utils.formatDate;

        this.el.tableBody.innerHTML = pageData.map(t => `
            <tr>
                <td>${fmtDate(t.date)}</td>
                <td>${t.type === 'income' ? 'دخل' : 'مصروف'}</td>
                <td>${esc(t.description || '-')}</td>
                <td class="${t.type === 'income' ? 'text-success' : 'text-danger'}">${fm(t.amount)}</td>
                <td>
                    <div class="action-btns">
                        <button class="action-btn" onclick="CashboxPage.editTransaction('${t.id}')"><i class="fas fa-edit"></i></button>
                        <button class="action-btn danger" onclick="CashboxPage.deleteTransaction('${t.id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');

        this.renderPagination(totalPages);
    },

    renderPagination(totalPages) {
        if (!this.el.pagination || totalPages <= 1) {
            if (this.el.pagination) this.el.pagination.innerHTML = '';
            return;
        }
        let html = '';
        const cp = this.state.currentPage;
        html += `<button ${cp === 1 ? 'disabled' : ''} onclick="CashboxPage.goToPage(${cp - 1})">«</button>`;
        for (let i = 1; i <= totalPages; i++) {
            html += `<button class="${i === cp ? 'active' : ''}" onclick="CashboxPage.goToPage(${i})">${i}</button>`;
        }
        html += `<button ${cp === totalPages ? 'disabled' : ''} onclick="CashboxPage.goToPage(${cp + 1})">»</button>`;
        this.el.pagination.innerHTML = html;
    },

    goToPage(page) {
        const total = Math.ceil(this.state.filteredTransactions.length / this.state.pageSize);
        if (page < 1 || page > total) return;
        this.state.currentPage = page;
        this.renderTable();
    },

    /* ---------- إدارة المعاملات ---------- */
    openTransactionModal(transaction = null) {
        const isEdit = !!transaction;
        this.state.editingTransaction = transaction;
        if (this.el.modalTitle) this.el.modalTitle.textContent = isEdit ? 'تعديل معاملة' : 'إضافة معاملة';
        if (this.el.transactionType) {
            this.el.transactionType.value = transaction?.type || 'income';
            this.el.transactionType.disabled = isEdit;
        }
        if (this.el.transactionAmount) this.el.transactionAmount.value = transaction?.amount || '';
        if (this.el.transactionDescription) this.el.transactionDescription.value = transaction?.description || '';
        if (this.el.transactionDate) this.el.transactionDate.value = transaction?.date || this._utils.today();
        if (this.el.deleteTransactionBtn) this.el.deleteTransactionBtn.style.display = isEdit ? 'inline-flex' : 'none';
        this.el.transactionModal?.classList.add('open');
    },

    closeModal(id) {
        this.el[id]?.classList.remove('open');
        this.state.editingTransaction = null;
    },

    async saveTransaction() {
        const type = this.el.transactionType?.value || 'income';
        const amount = parseFloat(this.el.transactionAmount?.value);
        const description = (this.el.transactionDescription?.value || '').trim();
        const date = this.el.transactionDate?.value || this._utils.today();

        if (isNaN(amount) || amount <= 0) {
            this.showToast('المبلغ غير صالح', 'error');
            return;
        }
        if (!description) {
            this.showToast('يرجى كتابة وصف', 'error');
            return;
        }

        const isEdit = !!this.state.editingTransaction;
        const transaction = {
            id: isEdit ? this.state.editingTransaction.id : crypto.randomUUID(),
            type,
            amount: Number(amount),
            description,
            date,
            timestamp: Date.now(),
            tenant_id: this.state.currentUser?.tenant_id
        };

        // عند التعديل، نخصم المعاملة القديمة من الرصيد المحلي ثم نضيف الجديدة
        if (isEdit) {
            const oldAmount = this.state.editingTransaction.amount;
            const oldType = this.state.editingTransaction.type;
            if (oldType === 'income') this.state.balance -= oldAmount;
            else this.state.balance += oldAmount;

            if (type === 'income') this.state.balance += amount;
            else this.state.balance -= amount;
        }

        try {
            await window.DB?.saveTransaction(transaction);
            this.showToast(isEdit ? 'تم تعديل المعاملة' : 'تمت الإضافة', 'success');
            this.closeModal('transactionModal');
            await this.loadData();
        } catch (e) {
            console.error(e);
            this.showToast('فشل حفظ المعاملة', 'error');
        }
    },

    async deleteTransaction(id) {
        const tx = this.state.transactions.find(t => t.id === id);
        if (!tx) return;
        if (!confirm(`حذف معاملة "${tx.description}"؟`)) return;

        try {
            if (window.DB?.deleteTransaction) {
                await window.DB.deleteTransaction(id);
            } else {
                // تحديث محلي فقط في وضع offline
                this.state.transactions = this.state.transactions.filter(t => t.id !== id);
            }
            this.showToast('تم الحذف', 'success');
            if (this.el.transactionModal?.classList.contains('open') && this.state.editingTransaction?.id === id) {
                this.closeModal('transactionModal');
            }
            await this.loadData();
        } catch (e) {
            console.error(e);
            this.showToast('فشل حذف المعاملة', 'error');
        }
    },

    editTransaction(id) {
        const tx = this.state.transactions.find(t => t.id === id);
        if (tx) this.openTransactionModal(tx);
    },

    deleteCurrentTransaction() {
        const tx = this.state.editingTransaction;
        if (tx) this.deleteTransaction(tx.id);
    },

    /* ---------- تحديث دوري وتنظيف ---------- */
    setupPeriodicRefresh() {
        this.refreshTimer = setInterval(() => {
            if (!this.state.loading && document.visibilityState === 'visible') {
                this.loadData();
            }
        }, 30000);
    },

    cleanup() {
        if (this.refreshTimer) clearInterval(this.refreshTimer);
        if (this._toastTimer) clearTimeout(this._toastTimer);
        window.removeEventListener('online', () => this.loadData());
    }
};

window.CashboxPage = CashboxPage;
