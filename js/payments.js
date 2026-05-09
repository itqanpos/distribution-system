/* =============================================
   payments.js - المدفوعات (إصدار مُحسَّن)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return dateStr; }
        },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase),
        hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
    };
}

const Payments = {
    payments: [],
    parties: [],
    editingId: null,

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
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            searchInput: document.getElementById('searchInput'),
            typeFilter: document.getElementById('typeFilter'),
            refreshBtn: document.getElementById('refreshBtn'),
            paymentsBody: document.getElementById('paymentsBody'),
            newPaymentBtn: document.getElementById('newPaymentBtn'),
            paymentModal: document.getElementById('paymentModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelModalBtn: document.getElementById('cancelModalBtn'),
            paymentForm: document.getElementById('paymentForm'),
            paymentId: document.getElementById('paymentId'),
            paymentType: document.getElementById('paymentType'),
            paymentDate: document.getElementById('paymentDate'),
            paymentParty: document.getElementById('paymentParty'),
            paymentAmount: document.getElementById('paymentAmount'),
            paymentMethod: document.getElementById('paymentMethod'),
            paymentNotes: document.getElementById('paymentNotes'),
            partyList: document.getElementById('partyList'),
            statsGrid: document.getElementById('statsGrid'),
            toast: document.getElementById('toast')
        };
    },

    bindEvents() {
        this.el.userProfileBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));

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

        this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.searchInput?.addEventListener('input', () => this.renderTable());
        this.el.typeFilter?.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () => this.loadData());

        this.el.newPaymentBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.paymentForm?.addEventListener('submit', (e) => { e.preventDefault(); this.savePayment(); });
    },

    async loadData() {
        try {
            if (Utils.isDBReady()) {
                this.payments = await DB.getPayments?.() || [];
                this.parties = await DB.getParties() || [];
            } else if (Utils.hasLocalDB()) {
                this.payments = await localDB.getAll('payments') || [];
                this.parties = await localDB.getAll('parties') || [];
            } else {
                this.payments = [];
                this.parties = [];
            }
            this.populatePartyList();
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error('فشل تحميل المدفوعات:', err);
        }
    },

    populatePartyList() {
        if (!this.el.partyList) return;
        this.el.partyList.innerHTML = this.parties.map(p =>
            `<option value="${p.name}">${p.name}</option>`
        ).join('');
    },

    updateStats() {
        const collections = this.payments.filter(p => p.type === 'collection');
        const paymentsOut = this.payments.filter(p => p.type === 'payment');
        const totalCollected = collections.reduce((s, p) => s + (p.amount || 0), 0);
        const totalPaid = paymentsOut.reduce((s, p) => s + (p.amount || 0), 0);

        if (this.el.statsGrid) {
            this.el.statsGrid.innerHTML = `
                <div class="stat-card"><div class="stat-icon" style="color:#16a34a;"><i class="fas fa-arrow-down"></i></div><div class="stat-content"><div class="stat-title">إجمالي المحصل</div><div class="stat-value">${Utils.formatMoney(totalCollected)}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#ef4444;"><i class="fas fa-arrow-up"></i></div><div class="stat-content"><div class="stat-title">إجمالي المدفوع</div><div class="stat-value">${Utils.formatMoney(totalPaid)}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#3b82f6;"><i class="fas fa-exchange-alt"></i></div><div class="stat-content"><div class="stat-title">عدد المعاملات</div><div class="stat-value">${this.payments.length}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#f59e0b;"><i class="fas fa-wallet"></i></div><div class="stat-content"><div class="stat-title">صافي التدفق</div><div class="stat-value">${Utils.formatMoney(totalCollected - totalPaid)}</div></div></div>
            `;
        }
    },

    renderTable() {
        const term = this.el.searchInput?.value.trim().toLowerCase() || '';
        const type = this.el.typeFilter?.value || 'all';

        let filtered = this.payments.filter(p => {
            const matchSearch = !term || (p.party_name || '').includes(term);
            const matchType = type === 'all' || p.type === type;
            return matchSearch && matchType;
        });

        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!filtered.length) {
            this.el.paymentsBody.innerHTML = '<tr><td colspan="6" class="empty-message">لا توجد مدفوعات</td></tr>';
            return;
        }

        this.el.paymentsBody.innerHTML = filtered.map(p => `
            <tr>
                <td>${Utils.formatDate(p.date)}</td>
                <td>${p.party_name || '-'}</td>
                <td>${p.type === 'collection' ? 'تحصيل' : 'دفع'}</td>
                <td>${Utils.formatMoney(p.amount)}</td>
                <td>${p.method === 'cash' ? 'نقدي' : 'تحويل'}</td>
                <td>${p.notes || '-'}</td>
            </tr>
        `).join('');
    },

    openModal(payment = null) {
        this.editingId = payment?.id || null;
        this.el.modalTitle.textContent = payment ? 'تعديل دفعة' : 'دفعة جديدة';
        this.el.paymentId.value = payment?.id || '';
        this.el.paymentType.value = payment?.type || 'collection';
        this.el.paymentDate.value = payment?.date || Utils.getToday();
        this.el.paymentParty.value = payment?.party_name || '';
        this.el.paymentAmount.value = payment?.amount || '';
        this.el.paymentMethod.value = payment?.method || 'cash';
        this.el.paymentNotes.value = payment?.notes || '';
        this.el.paymentModal.classList.add('open');
    },

    closeModal() {
        this.el.paymentModal.classList.remove('open');
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    },

    async savePayment() {
        const partyName = this.el.paymentParty?.value.trim();
        const amount = parseFloat(this.el.paymentAmount?.value) || 0;
        if (!partyName || amount <= 0) { alert('الطرف والمبلغ مطلوبان'); return; }

        const payment = {
            id: this.editingId || (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
            date: this.el.paymentDate?.value || Utils.getToday(),
            type: this.el.paymentType?.value || 'collection',
            party_name: partyName,
            amount,
            method: this.el.paymentMethod?.value || 'cash',
            notes: this.el.paymentNotes?.value.trim()
        };

        try {
            if (Utils.isDBReady()) await DB.savePayment?.(payment);
            else if (Utils.hasLocalDB()) await localDB.put('payments', payment);
            this.closeModal();
            await this.loadData();
            this.showToast('تم حفظ الدفعة بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الدفعة');
        }
    }
};

window.Payments = Payments;
document.addEventListener('DOMContentLoaded', () => Payments.init());
