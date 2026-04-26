/* =============================================
   العملاء والموردين - حسابي
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

const Parties = {
    parties: [],
    invoices: [],
    purchases: [],
    transactions: [],
    currentTab: 'customers',
    isDBReady: false,

    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadAllData();
    },

    cacheElements() {
        this.el = {
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            addPartyBtn: document.getElementById('addPartyBtn'),
            customerCount: document.getElementById('customerCount'),
            supplierCount: document.getElementById('supplierCount'),
            totalCustomerBalance: document.getElementById('totalCustomerBalance'),
            totalSupplierBalance: document.getElementById('totalSupplierBalance'),
            partiesBody: document.getElementById('partiesBody'),
            tabBtns: document.querySelectorAll('.tab-btn'),
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
            statementModal: document.getElementById('statementModal'),
            statementTitle: document.getElementById('statementTitle'),
            statementContent: document.getElementById('statementContent'),
            closeStatementBtn: document.getElementById('closeStatementBtn'),
            collectionModal: document.getElementById('collectionModal'),
            closeCollectionBtn: document.getElementById('closeCollectionBtn'),
            cancelCollectionBtn: document.getElementById('cancelCollectionBtn'),
            collectionForm: document.getElementById('collectionForm'),
            collectionPartyId: document.getElementById('collectionPartyId'),
            collectionDate: document.getElementById('collectionDate'),
            collectionAmount: document.getElementById('collectionAmount'),
            collectionType: document.getElementById('collectionType'),
            collectionMethod: document.getElementById('collectionMethod'),
            collectionNotes: document.getElementById('collectionNotes')
        };
    },

    bindEvents() {
        this.el.userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle.addEventListener('click', () => this.el.sidebar.classList.toggle('mobile-open'));
        this.el.logoutBtn.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.addPartyBtn.addEventListener('click', () => this.openPartyModal());
        this.el.closePartyModalBtn.addEventListener('click', () => this.closePartyModal());
        this.el.cancelPartyModalBtn.addEventListener('click', () => this.closePartyModal());
        this.el.partyForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveParty(); });
        this.el.closeStatementBtn.addEventListener('click', () => this.el.statementModal.style.display = 'none');
        this.el.closeCollectionBtn.addEventListener('click', () => this.el.collectionModal.style.display = 'none');
        this.el.cancelCollectionBtn.addEventListener('click', () => this.el.collectionModal.style.display = 'none');
        this.el.collectionForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveCollection(); });

        this.el.tabBtns.forEach(btn => btn.addEventListener('click', () => {
            this.el.tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            this.currentTab = btn.dataset.tab;
            this.renderTable();
        }));
    },

    async loadAllData() {
        this.isDBReady = !!(window.DB && window.supabase);
        try {
            if (this.isDBReady) {
                this.parties = await DB.getParties();
                this.invoices = await DB.getInvoices();
                this.purchases = await DB.getPurchases();
                this.transactions = await DB.getTransactions();
            } else {
                this.parties = [{ id: 'c1', name: 'عميل 1', type: 'customer', balance: 150, phone: '0100' }];
                this.invoices = [];
                this.purchases = [];
                this.transactions = [];
            }
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error(err);
        }
    },

    updateStats() {
        const customers = this.parties.filter(p => p.type === 'customer');
        const suppliers = this.parties.filter(p => p.type === 'supplier');
        this.el.customerCount.textContent = customers.length;
        this.el.supplierCount.textContent = suppliers.length;
        this.el.totalCustomerBalance.textContent = Utils.formatMoney(customers.reduce((s, c) => s + (c.balance || 0), 0));
        this.el.totalSupplierBalance.textContent = Utils.formatMoney(suppliers.reduce((s, c) => s + (c.balance || 0), 0));
    },

    renderTable() {
        const filtered = this.parties.filter(p => p.type === this.currentTab);
        if (!filtered.length) {
            this.el.partiesBody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:30px;">لا توجد بيانات</td></tr>';
            return;
        }
        this.el.partiesBody.innerHTML = filtered.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>${p.phone || '-'}</td>
                <td>${p.address || '-'}</td>
                <td>${Utils.formatMoney(p.balance || 0)}</td>
                <td class="action-icons">
                    <i class="fas fa-file-invoice" onclick="Parties.showStatement('${p.id}')" title="كشف حساب"></i>
                    <i class="fas fa-hand-holding-usd" onclick="Parties.openCollection('${p.id}')" title="تحصيل"></i>
                    <i class="fas fa-edit" onclick="Parties.editParty('${p.id}')"></i>
                    <i class="fas fa-trash" onclick="Parties.deleteParty('${p.id}')"></i>
                </td>
            </tr>
        `).join('');
    },

    // ====================== إدارة الطرف ======================
    openPartyModal(party = null) {
        this.el.modalTitle.textContent = party ? 'تعديل' : 'عميل / مورد جديد';
        this.el.partyId.value = party?.id || '';
        this.el.partyName.value = party?.name || '';
        this.el.partyType.value = party?.type || this.currentTab;
        this.el.partyPhone.value = party?.phone || '';
        this.el.partyAddress.value = party?.address || '';
        this.el.partyBalance.value = party?.balance || 0;
        this.el.partyModal.style.display = 'flex';
    },

    closePartyModal() { this.el.partyModal.style.display = 'none'; },

    async saveParty() {
        const name = this.el.partyName.value.trim();
        if (!name) { alert('الاسم مطلوب'); return; }
        const data = {
            id: this.el.partyId.value || crypto.randomUUID(),
            name,
            type: this.el.partyType.value,
            phone: this.el.partyPhone.value.trim() || null,
            address: this.el.partyAddress.value.trim() || null,
            balance: parseFloat(this.el.partyBalance.value) || 0
        };
        try {
            if (this.isDBReady) await DB.saveParty(data);
            else {
                const arr = JSON.parse(localStorage.getItem('parties') || '[]');
                const idx = arr.findIndex(p => p.id === data.id);
                if (idx >= 0) arr[idx] = data;
                else arr.push(data);
                localStorage.setItem('parties', JSON.stringify(arr));
            }
            this.closePartyModal();
            await this.loadAllData();
        } catch (err) { alert('فشل الحفظ'); }
    },

    editParty(id) {
        const p = this.parties.find(x => x.id === id);
        if (p) this.openPartyModal(p);
    },

    async deleteParty(id) {
        if (!confirm('حذف هذا الطرف؟')) return;
        if (this.isDBReady) await DB.deleteParty(id);
        await this.loadAllData();
    },

    // ====================== كشف الحساب ======================
    showStatement(partyId) {
        const party = this.parties.find(p => p.id === partyId);
        if (!party) return;
        this.el.statementTitle.textContent = `كشف حساب: ${party.name}`;

        // الفواتير المرتبطة (مبيعات للعميل، مشتريات للمورد)
        let invoices = [];
        if (party.type === 'customer') {
            invoices = this.invoices.filter(inv => inv.type === 'sale' && (inv.customer_id === partyId || inv.customer_name === party.name));
        } else {
            invoices = this.purchases.filter(p => p.supplier_id === partyId || p.supplier_name === party.name);
        }

        // التحصيلات (معاملات مالية مرتبطة بالطرف - نستخدم description يحتوي على اسم الطرف أو id)
        const relatedTransactions = this.transactions.filter(tr => 
            (tr.description || '').includes(partyId) || (tr.description || '').includes(party.name)
        );

        let totalDebit = 0, totalCredit = 0;
        // بناء الصفوف
        let rows = '';
        // صفوف الفواتير (مدين للعميل، دائن للمورد؟ حسب المنظور)
        invoices.forEach(inv => {
            const amount = inv.total || 0;
            rows += `<tr>
                <td>${inv.date}</td>
                <td>${inv.type === 'sale' ? 'فاتورة بيع' : 'فاتورة شراء'}</td>
                <td>${inv.id.substring(0,8)}</td>
                <td class="debit">${party.type === 'customer' ? Utils.formatMoney(amount) : ''}</td>
                <td class="credit">${party.type === 'supplier' ? Utils.formatMoney(amount) : ''}</td>
                <td>${Utils.formatMoney(party.type === 'customer' ? amount : -amount)}</td>
            </tr>`;
            if (party.type === 'customer') totalDebit += amount;
            else totalCredit += amount;
        });

        // صفوف التحصيلات
        relatedTransactions.forEach(tr => {
            const isPayment = tr.type === 'income'; // تحصيل من العميل = income، دفع للمورد = expense
            rows += `<tr>
                <td>${tr.date}</td>
                <td>${isPayment ? 'تحصيل' : 'دفع'}</td>
                <td>${tr.description || '-'}</td>
                <td class="credit">${isPayment ? Utils.formatMoney(tr.amount) : ''}</td>
                <td class="debit">${!isPayment ? Utils.formatMoney(tr.amount) : ''}</td>
                <td>${Utils.formatMoney(isPayment ? -tr.amount : tr.amount)}</td>
            </tr>`;
            if (isPayment) totalCredit += tr.amount;
            else totalDebit += tr.amount;
        });

        const net = party.type === 'customer' ? totalCredit - totalDebit : totalDebit - totalCredit;

        this.el.statementContent.innerHTML = `
            <div class="statement-header">
                <span><strong>الرصيد الحالي:</strong> ${Utils.formatMoney(party.balance || 0)}</span>
                <span><strong>مدين:</strong> ${Utils.formatMoney(totalDebit)}</span>
                <span><strong>دائن:</strong> ${Utils.formatMoney(totalCredit)}</span>
            </div>
            <table class="statement-table">
                <thead><tr><th>التاريخ</th><th>البيان</th><th>المرجع</th><th>مدين</th><th>دائن</th><th>الرصيد</th></tr></thead>
                <tbody>${rows || '<tr><td colspan="6">لا توجد حركات</td></tr>'}</tbody>
            </table>
            <button class="btn btn-primary" onclick="Parties.openCollection('${partyId}')"><i class="fas fa-plus"></i> إضافة تحصيل / دفعة</button>
            <button class="btn" onclick="window.print()" style="margin-right:10px;"><i class="fas fa-print"></i> طباعة</button>
        `;
        this.el.statementModal.style.display = 'flex';
    },

    // ====================== التحصيل ======================
    openCollection(partyId) {
        const party = this.parties.find(p => p.id === partyId);
        if (!party) return;
        this.el.collectionPartyId.value = partyId;
        this.el.collectionDate.value = Utils.getToday();
        this.el.collectionAmount.value = '';
        this.el.collectionNotes.value = '';
        this.el.collectionType.value = party.type === 'customer' ? 'income' : 'expense';
        this.el.collectionModal.style.display = 'flex';
    },

    async saveCollection() {
        const partyId = this.el.collectionPartyId.value;
        const party = this.parties.find(p => p.id === partyId);
        if (!party) return;
        const date = this.el.collectionDate.value;
        const amount = parseFloat(this.el.collectionAmount.value);
        const type = this.el.collectionType.value;
        const method = this.el.collectionMethod.value;
        const notes = this.el.collectionNotes.value.trim();

        if (!amount || amount <= 0) { alert('المبلغ مطلوب'); return; }

        // تحديث رصيد الطرف
        if (type === 'income') {
            party.balance = (party.balance || 0) - amount; // تحصيل من العميل يقلل رصيده
        } else {
            party.balance = (party.balance || 0) + amount; // دفع للمورد يزيد رصيده
        }

        const transaction = {
            id: crypto.randomUUID(),
            date,
            type,
            amount,
            description: `${notes || (type === 'income' ? 'تحصيل من ' : 'دفع إلى ')} ${party.name}`,
            payment_method: method
        };

        try {
            if (this.isDBReady) {
                await DB.saveParty(party);
                await DB.saveTransaction(transaction);
            } else {
                // تخزين محلي
                const arr = JSON.parse(localStorage.getItem('parties') || '[]');
                const idx = arr.findIndex(p => p.id === party.id);
                if (idx >= 0) arr[idx] = party;
                else arr.push(party);
                localStorage.setItem('parties', JSON.stringify(arr));

                const trs = JSON.parse(localStorage.getItem('transactions') || '[]');
                trs.push(transaction);
                localStorage.setItem('transactions', JSON.stringify(trs));
            }
            this.el.collectionModal.style.display = 'none';
            await this.loadAllData();
            // إذا كان كشف الحساب مفتوحاً، أعد تحميله
            if (this.el.statementModal.style.display === 'flex') {
                this.showStatement(partyId);
            }
            alert('تم حفظ التحصيل');
        } catch (err) { console.error(err); alert('فشل الحفظ'); }
    }
};

window.Parties = Parties;
document.addEventListener('DOMContentLoaded', () => Parties.init());
