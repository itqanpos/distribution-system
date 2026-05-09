/* =============================================
   customers.js - العملاء والموردين (إصدار مُحسَّن)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return dateStr; }
        },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase && typeof DB.getParties === 'function'),
        hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
    };
}

const Customers = {
    parties: [],
    currentTab: 'customer',
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
            tabBtns: document.querySelectorAll('.tab-btn'),
            partiesBody: document.getElementById('partiesBody'),
            addPartyBtn: document.getElementById('addPartyBtn'),
            partyModal: document.getElementById('partyModal'),
            modalTitle: document.getElementById('modalTitle'),
            closePartyModalBtn: document.getElementById('closePartyModalBtn'),
            cancelPartyModalBtn: document.getElementById('cancelPartyModalBtn'),
            partyForm: document.getElementById('partyForm'),
            partyId: document.getElementById('partyId'),
            partyName: document.getElementById('partyName'),
            partyType: document.getElementById('partyType'),
            partyPhone: document.getElementById('partyPhone'),
            partyAddress: document.getElementById('partyAddress'),
            partyBalance: document.getElementById('partyBalance'),
            // ⭐ عناصر التسوية
            settlementModal: document.getElementById('settlementModal'),
            closeSettlementBtn: document.getElementById('closeSettlementBtn'),
            cancelSettlementBtn: document.getElementById('cancelSettlementBtn'),
            settlementForm: document.getElementById('settlementForm'),
            settlementPartyId: document.getElementById('settlementPartyId'),
            settlementDate: document.getElementById('settlementDate'),
            settlementAmount: document.getElementById('settlementAmount'),
            settlementType: document.getElementById('settlementType'),
            settlementMethod: document.getElementById('settlementMethod'),
            settlementNotes: document.getElementById('settlementNotes'),
            // إحصائيات
            customerCount: document.getElementById('customerCount'),
            supplierCount: document.getElementById('supplierCount'),
            totalCustomerBalance: document.getElementById('totalCustomerBalance'),
            totalSupplierBalance: document.getElementById('totalSupplierBalance'),
            toast: document.getElementById('toast')
        };
    },

    bindEvents() {
        // الشريط الجانبي والمستخدم
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

        // التبويبات
        this.el.tabBtns.forEach(btn => btn.addEventListener('click', () => {
            this.el.tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.currentTab = btn.dataset.tab;
            this.renderTable();
        }));

        // إضافة طرف
        this.el.addPartyBtn?.addEventListener('click', () => this.openPartyModal());
        this.el.closePartyModalBtn?.addEventListener('click', () => this.closeModal(this.el.partyModal));
        this.el.cancelPartyModalBtn?.addEventListener('click', () => this.closeModal(this.el.partyModal));
        this.el.partyForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveParty(); });

        // التسوية
        this.el.closeSettlementBtn?.addEventListener('click', () => this.closeModal(this.el.settlementModal));
        this.el.cancelSettlementBtn?.addEventListener('click', () => this.closeModal(this.el.settlementModal));
        this.el.settlementForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveSettlement(); });
    },

    async loadData() {
        try {
            if (Utils.isDBReady()) {
                const customers = await DB.getParties('customer') || [];
                const suppliers = await DB.getParties('supplier') || [];
                this.parties = [...customers, ...suppliers];
            } else if (Utils.hasLocalDB()) {
                const allParties = await localDB.getAll('parties') || [];
                this.parties = allParties;
            } else {
                this.parties = [];
            }
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error('فشل تحميل بيانات الأطراف:', err);
            this.el.partiesBody.innerHTML = '<tr><td colspan="5" class="empty-message">فشل تحميل البيانات</td></tr>';
        }
    },

    updateStats() {
        const customers = this.parties.filter(p => p.type === 'customer');
        const suppliers = this.parties.filter(p => p.type === 'supplier');
        const totalCustBal = customers.reduce((s, c) => s + (c.balance || 0), 0);
        const totalSuppBal = suppliers.reduce((s, s_) => s + (s_.balance || 0), 0);

        if (this.el.customerCount) this.el.customerCount.textContent = customers.length;
        if (this.el.supplierCount) this.el.supplierCount.textContent = suppliers.length;
        if (this.el.totalCustomerBalance) this.el.totalCustomerBalance.textContent = Utils.formatMoney(totalCustBal);
        if (this.el.totalSupplierBalance) this.el.totalSupplierBalance.textContent = Utils.formatMoney(totalSuppBal);
    },

    renderTable() {
        let list = this.parties.filter(p => p.type === this.currentTab);
        if (!list.length) {
            this.el.partiesBody.innerHTML = `<tr><td colspan="5" class="empty-message">لا يوجد ${this.currentTab === 'customer' ? 'عملاء' : 'موردين'}</td></tr>`;
            return;
        }

        this.el.partiesBody.innerHTML = list.map(p => `
            <tr>
                <td>${p.name || '-'}</td>
                <td>${p.phone || '-'}</td>
                <td>${p.address || '-'}</td>
                <td>${Utils.formatMoney(p.balance || 0)}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" onclick="Customers.openPartyModal('${p.id}')"></i>
                    <i class="fas fa-money-bill-wave" onclick="Customers.openSettlement('${p.id}')"></i>
                    <i class="fas fa-history" onclick="Customers.viewHistory('${p.id}')"></i>
                </td>
            </tr>
        `).join('');
    },

    openPartyModal(partyId = null) {
        this.editingId = partyId;
        this.el.modalTitle.textContent = partyId ? 'تعديل طرف' : 'طرف جديد';
        const party = partyId ? this.parties.find(p => p.id === partyId) : null;
        this.el.partyId.value = party?.id || '';
        this.el.partyName.value = party?.name || '';
        this.el.partyType.value = party?.type || 'customer';
        this.el.partyPhone.value = party?.phone || '';
        this.el.partyAddress.value = party?.address || '';
        this.el.partyBalance.value = party?.balance || 0;
        this.el.partyModal.classList.add('open');
    },

    closeModal(modal) {
        if (modal) modal.classList.remove('open');
    },

    async saveParty() {
        const name = this.el.partyName?.value.trim();
        if (!name) return alert('الاسم مطلوب');

        const partyData = {
            id: this.editingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
            name,
            type: this.el.partyType?.value || 'customer',
            phone: this.el.partyPhone?.value.trim() || null,
            address: this.el.partyAddress?.value.trim() || null,
            balance: parseFloat(this.el.partyBalance?.value) || 0
        };

        try {
            if (Utils.isDBReady()) await DB.saveParty(partyData);
            else if (Utils.hasLocalDB()) await localDB.put('parties', partyData);
            this.closeModal(this.el.partyModal);
            await this.loadData();
            this.showToast('تم حفظ الطرف بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الطرف');
        }
    },

    openSettlement(partyId) {
        const party = this.parties.find(p => p.id === partyId);
        if (!party) return;
        this.el.settlementPartyId.value = party.id;
        this.el.settlementDate.value = Utils.getToday();
        this.el.settlementAmount.value = Math.abs(party.balance || 0);
        this.el.settlementType.value = party.balance > 0 ? 'income' : 'expense';
        this.el.settlementModal.classList.add('open');
    },

    async saveSettlement() {
        const partyId = this.el.settlementPartyId?.value;
        const amount = parseFloat(this.el.settlementAmount?.value) || 0;
        const type = this.el.settlementType?.value;
        const date = this.el.settlementDate?.value || Utils.getToday();
        const method = this.el.settlementMethod?.value;
        const notes = this.el.settlementNotes?.value.trim();

        if (!partyId || amount <= 0) return alert('المبلغ مطلوب');

        const party = this.parties.find(p => p.id === partyId);
        if (!party) return;

        // تحديث رصيد الطرف
        party.balance = (party.balance || 0) + (type === 'expense' ? amount : -amount);

        try {
            // حفظ الطرف والحركة المالية
            if (Utils.isDBReady()) {
                await DB.saveParty(party);
                await DB.saveTransaction({
                    id: crypto.randomUUID(), date, type,
                    amount, description: `تسوية ${party.name} - ${notes || ''}`, payment_method: method
                });
            } else if (Utils.hasLocalDB()) {
                await localDB.put('parties', party);
                const trans = { id: crypto.randomUUID(), date, type, amount, description: notes, payment_method: method };
                await localDB.put('transactions', trans);
            }
            this.closeModal(this.el.settlementModal);
            await this.loadData();
            this.showToast('تمت التسوية بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشلت التسوية');
        }
    },

    viewHistory(partyId) {
        const party = this.parties.find(p => p.id === partyId);
        if (!party) return;
        alert(`سجل حركات ${party.name} - قيد التطوير`);
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

window.Customers = Customers;
document.addEventListener('DOMContentLoaded', () => Customers.init());
