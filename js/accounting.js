/* =============================================
   accounting.js - المحاسبة (إصدار احترافي)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return dateStr; }
        },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase),
        hasLocalDB: () => !!(window.localDB)
    };
}

const Accounting = {
    journalEntries: [],
    accounts: [],
    isDBReady: false,
    currentTab: 'dashboard',
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
            tabContent: document.getElementById('tabContent'),
            addJournalEntryBtn: document.getElementById('addJournalEntryBtn'),
            journalEntryModal: document.getElementById('journalEntryModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelModalBtn: document.getElementById('cancelModalBtn'),
            journalEntryForm: document.getElementById('journalEntryForm'),
            entryId: document.getElementById('entryId'),
            entryDate: document.getElementById('entryDate'),
            entryDescription: document.getElementById('entryDescription'),
            entryLines: document.getElementById('entryLines'),
            addEntryLineBtn: document.getElementById('addEntryLineBtn'),
            totalDebit: document.getElementById('totalDebit'),
            totalCredit: document.getElementById('totalCredit'),
            balanceDiff: document.getElementById('balanceDiff'),
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

        // Tabs
        this.el.tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.el.tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentTab = btn.dataset.tab;
                this.renderTabContent();
            });
        });

        this.el.addJournalEntryBtn?.addEventListener('click', () => this.openJournalEntryModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.journalEntryForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveJournalEntry(); });
        this.el.addEntryLineBtn?.addEventListener('click', () => this.addEntryLine());
    },

    async loadData() {
        this.isDBReady = Utils.isDBReady();
        try {
            // تحميل القيود المحاسبية
            if (this.isDBReady) {
                this.journalEntries = await DB.getJournalEntries?.() || [];
                this.accounts = await DB.getAccounts?.() || [];
            } else if (Utils.hasLocalDB()) {
                this.journalEntries = await localDB.getAll('journal_entries') || [];
                this.accounts = await localDB.getAll('accounts') || [];
            } else {
                this.journalEntries = [];
                this.accounts = this.getDefaultAccounts();
            }

            // إذا لم تكن هناك حسابات، استخدم الافتراضية
            if (!this.accounts.length) {
                this.accounts = this.getDefaultAccounts();
            }

            this.renderTabContent();
        } catch (err) {
            console.error('فشل تحميل البيانات المحاسبية:', err);
        }
    },

    getDefaultAccounts() {
        // شجرة حسابات افتراضية
        return [
            { id: '1', name: 'الأصول', type: 'asset', parent: null },
            { id: '11', name: 'الأصول المتداولة', type: 'asset', parent: '1' },
            { id: '111', name: 'الصندوق', type: 'asset', parent: '11' },
            { id: '112', name: 'البنك', type: 'asset', parent: '11' },
            { id: '113', name: 'العملاء', type: 'asset', parent: '11' },
            { id: '114', name: 'المخزون', type: 'asset', parent: '11' },
            { id: '12', name: 'الأصول الثابتة', type: 'asset', parent: '1' },
            { id: '121', name: 'معدات', type: 'asset', parent: '12' },
            { id: '2', name: 'الخصوم', type: 'liability', parent: null },
            { id: '21', name: 'الخصوم المتداولة', type: 'liability', parent: '2' },
            { id: '211', name: 'الموردين', type: 'liability', parent: '21' },
            { id: '3', name: 'حقوق الملكية', type: 'equity', parent: null },
            { id: '31', name: 'رأس المال', type: 'equity', parent: '3' },
            { id: '4', name: 'الإيرادات', type: 'revenue', parent: null },
            { id: '41', name: 'مبيعات', type: 'revenue', parent: '4' },
            { id: '5', name: 'المصروفات', type: 'expense', parent: null },
            { id: '51', name: 'تكلفة المبيعات', type: 'expense', parent: '5' },
            { id: '52', name: 'مصروفات عمومية', type: 'expense', parent: '5' }
        ];
    },

    renderTabContent() {
        if (!this.el.tabContent) return;
        switch (this.currentTab) {
            case 'dashboard': this.renderDashboard(); break;
            case 'journal': this.renderJournal(); break;
            case 'trial-balance': this.renderTrialBalance(); break;
            case 'income': this.renderIncomeStatement(); break;
            case 'accounts': this.renderChartOfAccounts(); break;
        }
    },

    // ========== لوحة المعلومات ==========
    renderDashboard() {
        const totalAssets = this.calculateTotalByType('asset');
        const totalLiabilities = this.calculateTotalByType('liability');
        const totalEquity = this.calculateTotalByType('equity');
        const totalRevenue = this.calculateTotalByType('revenue');
        const totalExpenses = this.calculateTotalByType('expense');
        const netIncome = totalRevenue - totalExpenses;

        this.el.tabContent.innerHTML = `
            <div class="stats-grid">
                <div class="stat-card"><div class="stat-icon" style="color:#3b82f6;"><i class="fas fa-coins"></i></div><div class="stat-content"><div class="stat-title">إجمالي الأصول</div><div class="stat-value">${Utils.formatMoney(totalAssets)}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#ef4444;"><i class="fas fa-hand-holding-usd"></i></div><div class="stat-content"><div class="stat-title">إجمالي الخصوم</div><div class="stat-value">${Utils.formatMoney(totalLiabilities)}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#8b5cf6;"><i class="fas fa-user-tie"></i></div><div class="stat-content"><div class="stat-title">حقوق الملكية</div><div class="stat-value">${Utils.formatMoney(totalEquity)}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#10b981;"><i class="fas fa-chart-line"></i></div><div class="stat-content"><div class="stat-title">الإيرادات</div><div class="stat-value">${Utils.formatMoney(totalRevenue)}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#f59e0b;"><i class="fas fa-receipt"></i></div><div class="stat-content"><div class="stat-title">المصروفات</div><div class="stat-value">${Utils.formatMoney(totalExpenses)}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:${netIncome >= 0 ? '#10b981' : '#ef4444'};"><i class="fas fa-balance-scale"></i></div><div class="stat-content"><div class="stat-title">صافي الربح</div><div class="stat-value">${Utils.formatMoney(netIncome)}</div></div></div>
            </div>
            <div class="chart-container"><canvas id="incomeChart"></canvas></div>
        `;

        this.renderIncomeChart(totalRevenue, totalExpenses, netIncome);
    },

    renderIncomeChart(revenue, expenses, net) {
        const ctx = document.getElementById('incomeChart')?.getContext('2d');
        if (!ctx) return;
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['الإيرادات', 'المصروفات', 'صافي الربح'],
                datasets: [{
                    data: [revenue, expenses, net],
                    backgroundColor: ['#10b981', '#ef4444', net >= 0 ? '#3b82f6' : '#ef4444']
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    },

    // ========== دفتر اليومية ==========
    renderJournal() {
        const sorted = [...this.journalEntries].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
        
        if (!sorted.length) {
            this.el.tabContent.innerHTML = '<div class="table-container"><p class="empty-message">لا توجد قيود محاسبية</p></div>';
            return;
        }

        let html = '<div class="table-container"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>عدد الأسطر</th><th>إجراءات</th></tr></thead><tbody>';
        sorted.forEach(entry => {
            html += `<tr>
                <td>${Utils.formatDate(entry.date)}</td>
                <td>${entry.description || '-'}</td>
                <td>${entry.lines?.length || 0}</td>
                <td class="action-icons">
                    <i class="fas fa-eye" onclick="Accounting.viewEntry('${entry.id}')"></i>
                    <i class="fas fa-edit" onclick="Accounting.editEntry('${entry.id}')"></i>
                </td>
            </tr>`;
        });
        html += '</tbody></table></div>';
        this.el.tabContent.innerHTML = html;
    },

    viewEntry(id) {
        const entry = this.journalEntries.find(e => e.id === id);
        if (!entry) return;
        let linesHtml = entry.lines?.map(line => `
            <tr>
                <td>${this.getAccountName(line.accountId)}</td>
                <td class="text-success">${line.debit > 0 ? Utils.formatMoney(line.debit) : ''}</td>
                <td class="text-danger">${line.credit > 0 ? Utils.formatMoney(line.credit) : ''}</td>
            </tr>
        `).join('') || '';
        this.el.tabContent.innerHTML = `
            <div class="table-container">
                <h3 style="margin-bottom:12px;">تفاصيل القيد</h3>
                <p><strong>التاريخ:</strong> ${Utils.formatDate(entry.date)}</p>
                <p><strong>البيان:</strong> ${entry.description || '-'}</p>
                <table style="margin-top:12px;"><thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>${linesHtml}</tbody></table>
                <button class="btn btn-cancel" onclick="Accounting.renderJournal()" style="margin-top:12px;">رجوع</button>
            </div>
        `;
    },

    editEntry(id) {
        const entry = this.journalEntries.find(e => e.id === id);
        if (entry) this.openJournalEntryModal(entry);
    },

    // ========== ميزان المراجعة ==========
    renderTrialBalance() {
        const balances = this.calculateTrialBalance();
        if (!balances.length) {
            this.el.tabContent.innerHTML = '<div class="table-container"><p class="empty-message">لا توجد حركات لعرض ميزان المراجعة</p></div>';
            return;
        }
        let totalDebit = 0, totalCredit = 0;
        let rows = balances.map(b => {
            totalDebit += b.debit;
            totalCredit += b.credit;
            return `<tr><td>${b.accountName}</td><td>${Utils.formatMoney(b.debit)}</td><td>${Utils.formatMoney(b.credit)}</td></tr>`;
        }).join('');
        rows += `<tr style="font-weight:bold; background:#f1f5f9;"><td>المجموع</td><td>${Utils.formatMoney(totalDebit)}</td><td>${Utils.formatMoney(totalCredit)}</td></tr>`;
        this.el.tabContent.innerHTML = `<div class="table-container"><table><thead><tr><th>الحساب</th><th>مدين</th><th>دائن</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    },

    calculateTrialBalance() {
        const map = new Map();
        this.journalEntries.forEach(entry => {
            (entry.lines || []).forEach(line => {
                const accId = line.accountId;
                if (!map.has(accId)) map.set(accId, { accountName: this.getAccountName(accId), debit: 0, credit: 0 });
                const bal = map.get(accId);
                bal.debit += line.debit || 0;
                bal.credit += line.credit || 0;
            });
        });
        return Array.from(map.values()).filter(b => b.debit > 0 || b.credit > 0);
    },

    // ========== قائمة الدخل ==========
    renderIncomeStatement() {
        const revenueAccounts = this.accounts.filter(a => a.type === 'revenue');
        const expenseAccounts = this.accounts.filter(a => a.type === 'expense');
        const balances = this.calculateTrialBalanceAccountMap();
        
        let totalRevenue = 0, totalExpenses = 0;
        let revenueRows = revenueAccounts.map(acc => {
            const bal = balances.get(acc.id) || { debit: 0, credit: 0 };
            const amount = bal.credit - bal.debit;
            totalRevenue += amount;
            return `<tr><td>${acc.name}</td><td>${Utils.formatMoney(amount)}</td></tr>`;
        }).join('');
        let expenseRows = expenseAccounts.map(acc => {
            const bal = balances.get(acc.id) || { debit: 0, credit: 0 };
            const amount = bal.debit - bal.credit;
            totalExpenses += amount;
            return `<tr><td>${acc.name}</td><td>${Utils.formatMoney(amount)}</td></tr>`;
        }).join('');
        const netIncome = totalRevenue - totalExpenses;

        this.el.tabContent.innerHTML = `
            <div class="table-container">
                <h3>الإيرادات</h3>
                <table>${revenueRows || '<tr><td colspan="2">لا توجد إيرادات</td></tr>'}</table>
                <h3 style="margin-top:20px;">المصروفات</h3>
                <table>${expenseRows || '<tr><td colspan="2">لا توجد مصروفات</td></tr>'}</table>
                <div style="display:flex; justify-content:space-between; padding:12px; font-weight:700; font-size:1.1rem; background:#f1f5f9; border-radius:8px; margin-top:12px;">
                    <span>صافي الربح / الخسارة</span>
                    <span class="${netIncome >= 0 ? 'text-success' : 'text-danger'}">${Utils.formatMoney(netIncome)}</span>
                </div>
            </div>
        `;
    },

    // ========== شجرة الحسابات ==========
    renderChartOfAccounts() {
        const renderTree = (parentId = null, level = 0) => {
            const children = this.accounts.filter(a => a.parent === parentId);
            if (!children.length) return '';
            return children.map(acc => `
                <tr>
                    <td style="padding-right:${level * 20}px;">${level > 0 ? '↳ ' : ''}${acc.name}</td>
                    <td>${this.getAccountTypeName(acc.type)}</td>
                </tr>
                ${renderTree(acc.id, level + 1)}
            `).join('');
        };
        this.el.tabContent.innerHTML = `
            <div class="table-container">
                <table><thead><tr><th>الحساب</th><th>النوع</th></tr></thead><tbody>${renderTree()}</tbody></table>
            </div>
        `;
    },

    // ========== دوال مساعدة ==========
    calculateTotalByType(type) {
        const balances = this.calculateTrialBalanceAccountMap();
        let total = 0;
        this.accounts.filter(a => a.type === type).forEach(acc => {
            const bal = balances.get(acc.id) || { debit: 0, credit: 0 };
            if (type === 'asset' || type === 'expense') total += bal.debit - bal.credit;
            else total += bal.credit - bal.debit;
        });
        return total;
    },

    calculateTrialBalanceAccountMap() {
        const map = new Map();
        this.journalEntries.forEach(entry => {
            (entry.lines || []).forEach(line => {
                if (!map.has(line.accountId)) map.set(line.accountId, { debit: 0, credit: 0 });
                const bal = map.get(line.accountId);
                bal.debit += line.debit || 0;
                bal.credit += line.credit || 0;
            });
        });
        return map;
    },

    getAccountName(id) {
        return this.accounts.find(a => a.id === id)?.name || id;
    },
    getAccountTypeName(type) {
        const map = { asset: 'أصل', liability: 'خصم', equity: 'ملكية', revenue: 'إيراد', expense: 'مصروف' };
        return map[type] || type;
    },

    // ========== إدارة القيود ==========
    openJournalEntryModal(entry = null) {
        this.editingId = entry?.id || null;
        this.el.modalTitle.textContent = entry ? 'تعديل قيد' : 'قيد جديد';
        this.el.entryDate.value = entry?.date || Utils.getToday();
        this.el.entryDescription.value = entry?.description || '';
        this.el.entryLines.innerHTML = '';

        if (entry?.lines?.length) {
            entry.lines.forEach(line => this.addEntryLine(line));
        } else {
            this.addEntryLine();
            this.addEntryLine();
        }
        this.updateBalanceCheck();
        this.el.journalEntryModal.classList.add('open');
    },

    closeModal() {
        this.el.journalEntryModal.classList.remove('open');
    },

    addEntryLine(line = null) {
        const div = document.createElement('div');
        div.className = 'entry-line';
        div.innerHTML = `
            <select class="account-select">
                ${this.accounts.map(a => `<option value="${a.id}" ${line?.accountId === a.id ? 'selected' : ''}>${a.name}</option>`).join('')}
            </select>
            <input type="number" class="debit-input" placeholder="مدين" step="0.01" min="0" value="${line?.debit || ''}" oninput="Accounting.updateBalanceCheck()">
            <input type="number" class="credit-input" placeholder="دائن" step="0.01" min="0" value="${line?.credit || ''}" oninput="Accounting.updateBalanceCheck()">
            <button type="button" class="remove-line-btn" onclick="this.closest('.entry-line').remove(); Accounting.updateBalanceCheck();"><i class="fas fa-times"></i></button>
        `;
        this.el.entryLines.appendChild(div);
        this.updateBalanceCheck();
    },

    updateBalanceCheck() {
        let totalDebit = 0, totalCredit = 0;
        this.el.entryLines.querySelectorAll('.entry-line').forEach(line => {
            totalDebit += parseFloat(line.querySelector('.debit-input')?.value) || 0;
            totalCredit += parseFloat(line.querySelector('.credit-input')?.value) || 0;
        });
        this.el.totalDebit.textContent = Utils.formatMoney(totalDebit);
        this.el.totalCredit.textContent = Utils.formatMoney(totalCredit);
        const diff = Math.abs(totalDebit - totalCredit);
        this.el.balanceDiff.textContent = Utils.formatMoney(diff);
        this.el.balanceDiff.classList.toggle('text-danger', diff > 0.01);
        this.el.balanceDiff.classList.toggle('text-success', diff <= 0.01);
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    },

    async saveJournalEntry() {
        const date = this.el.entryDate?.value || Utils.getToday();
        const description = this.el.entryDescription?.value.trim();
        if (!description) { alert('البيان مطلوب'); return; }

        const lines = [];
        let totalDebit = 0, totalCredit = 0;
        this.el.entryLines.querySelectorAll('.entry-line').forEach(line => {
            const accountId = line.querySelector('.account-select')?.value;
            const debit = parseFloat(line.querySelector('.debit-input')?.value) || 0;
            const credit = parseFloat(line.querySelector('.credit-input')?.value) || 0;
            if (accountId && (debit > 0 || credit > 0)) {
                lines.push({ accountId, debit, credit });
                totalDebit += debit;
                totalCredit += credit;
            }
        });

        if (lines.length < 2) { alert('يجب إضافة سطرين على الأقل'); return; }
        if (Math.abs(totalDebit - totalCredit) > 0.01) { alert('القيد غير متوازن'); return; }

        const entry = {
            id: this.editingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
            date,
            description,
            lines
        };

        try {
            if (this.isDBReady) {
                await DB.saveJournalEntry?.(entry);
            } else if (Utils.hasLocalDB()) {
                await localDB.put('journal_entries', entry);
            } else {
                const local = JSON.parse(localStorage.getItem('journal_entries') || '[]');
                const idx = local.findIndex(e => e.id === entry.id);
                if (idx >= 0) local[idx] = entry; else local.push(entry);
                localStorage.setItem('journal_entries', JSON.stringify(local));
            }
            this.closeModal();
            await this.loadData();
            this.showToast('تم حفظ القيد بنجاح');
        } catch (err) {
            console.error('فشل حفظ القيد:', err);
            alert('فشل حفظ القيد');
        }
    }
};

window.Accounting = Accounting;
document.addEventListener('DOMContentLoaded', () => Accounting.init());
