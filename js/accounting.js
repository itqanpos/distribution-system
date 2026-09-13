/* =============================================
   accounting.js - Accounting Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============================================
       Chart of Accounts (default)
       ============================================ */
    const DEFAULT_ACCOUNTS = [
        { id: '1000', code: '1000', name: 'الأصول', type: 'asset' },
        { id: '1100', code: '1100', name: 'الصندوق (النقدية)', type: 'asset', parent: '1000' },
        { id: '1200', code: '1200', name: 'العملاء (المدينون)', type: 'asset', parent: '1000' },
        { id: '1300', code: '1300', name: 'المخزون', type: 'asset', parent: '1000' },
        { id: '2000', code: '2000', name: 'الالتزامات', type: 'liability' },
        { id: '2100', code: '2100', name: 'الموردين (الدائنون)', type: 'liability', parent: '2000' },
        { id: '3000', code: '3000', name: 'حقوق الملكية', type: 'equity' },
        { id: '3100', code: '3100', name: 'رأس المال', type: 'equity', parent: '3000' },
        { id: '4000', code: '4000', name: 'الإيرادات', type: 'revenue' },
        { id: '4100', code: '4100', name: 'إيرادات المبيعات', type: 'revenue', parent: '4000' },
        { id: '5000', code: '5000', name: 'المصروفات', type: 'expense' },
        { id: '5100', code: '5100', name: 'تكلفة البضاعة المباعة', type: 'expense', parent: '5000' },
        { id: '5200', code: '5200', name: 'مصروفات عمومية', type: 'expense', parent: '5000' }
    ];

    /* ============================================
       State
       ============================================ */
    const State = {
        currentUser: null,
        entries: [],
        filtered: [],
        accounts: [],
        currentTab: 'ledger',
        filters: {
            search: '',
            date: 'month'
        },
        draftLines: []
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Accounting init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (!window.DB?.client) {
            console.error('❌ Supabase غير محمّل');
            showToast('تعذر الاتصال بالخادم', 'error');
            return;
        }

        await new Promise(r => setTimeout(r, 300));

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        State.accounts = [...DEFAULT_ACCOUNTS];

        await loadData();
        hideLoadingBar();
        console.log('✅ Accounting ready');
    }

    /* ============================================
       Load Data
       ============================================ */
    async function loadData() {
        try {
            // Load journal entries
            if (window.DB?.client) {
                const { data, error } = await window.DB.client
                    .from('journal_entries')
                    .select('*')
                    .is('deleted_at', null)
                    .order('date', { ascending: false })
                    .limit(500);

                if (!error && data) {
                    State.entries = data;
                }
            }

            // Build automatic entries from invoices
            await buildAutoEntries();

            // Calculate balances
            calculateAccountBalances();

            renderSummary();
            renderLedger();
            renderTrialBalance();
            renderAccounts();
            renderPnL();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
        }
    }

    /* ============================================
       Build Automatic Journal Entries from invoices
       ============================================ */
    async function buildAutoEntries() {
        const invoices = await DB.getInvoices(true).catch(() => []);
        const autoEntries = [];

        invoices.forEach((inv, index) => {
            const date = inv.date || (inv.created_at || '').split('T')[0];
            const number = `AUTO-${index + 1}`;
            const total = Number(inv.total) || 0;
            const paid = Number(inv.paid) || 0;
            const remaining = Number(inv.remaining) || 0;

            if (inv.type === 'sale') {
                // Debit: Cash or Customers
                const lines = [
                    { account: paid > 0 ? '1100' : '1200', name: paid > 0 ? 'الصندوق (النقدية)' : 'العملاء (المدينون)', debit: paid > 0 ? paid : total, credit: 0 }
                ];
                // If there's remaining, split
                if (paid > 0 && remaining > 0) {
                    lines[0] = { account: '1100', name: 'الصندوق (النقدية)', debit: paid, credit: 0 };
                    lines.push({ account: '1200', name: 'العملاء (المدينون)', debit: remaining, credit: 0 });
                }
                // Credit: Sales revenue
                lines.push({ account: '4100', name: 'إيرادات المبيعات', debit: 0, credit: total });

                autoEntries.push({
                    id: inv.id + '_auto',
                    entry_number: number,
                    date,
                    description: `فاتورة بيع ${inv.invoice_number || ''} - ${inv.customer_name || ''}`,
                    lines,
                    total_debit: total,
                    total_credit: total,
                    reference_type: 'sale',
                    reference_id: inv.id,
                    is_auto: true
                });
            } else if (inv.type === 'purchase') {
                // Debit: Inventory or Purchases
                const lines = [
                    { account: '1300', name: 'المخزون', debit: total, credit: 0 }
                ];
                // Credit: Cash or Suppliers
                if (paid > 0 && remaining > 0) {
                    lines.push({ account: '1100', name: 'الصندوق (النقدية)', debit: 0, credit: paid });
                    lines.push({ account: '2100', name: 'الموردين (الدائنون)', debit: 0, credit: remaining });
                } else if (paid > 0) {
                    lines.push({ account: '1100', name: 'الصندوق (النقدية)', debit: 0, credit: paid });
                } else {
                    lines.push({ account: '2100', name: 'الموردين (الدائنون)', debit: 0, credit: total });
                }

                autoEntries.push({
                    id: inv.id + '_auto',
                    entry_number: number,
                    date,
                    description: `فاتورة شراء ${inv.invoice_number || ''} - ${inv.supplier_name || ''}`,
                    lines,
                    total_debit: total,
                    total_credit: total,
                    reference_type: 'purchase',
                    reference_id: inv.id,
                    is_auto: true
                });
            }
        });

        // Merge with manual entries, sort by date
        State.entries = [...State.entries, ...autoEntries].sort((a, b) => 
            new Date(b.date || b.created_at) - new Date(a.date || a.created_at)
        );
    }

    /* ============================================
       Calculate Account Balances
       ============================================ */
    function calculateAccountBalances() {
        const balances = {};

        State.accounts.forEach(acc => {
            balances[acc.code] = 0;
        });

        State.entries.forEach(entry => {
            if (!entry.lines) return;
            entry.lines.forEach(line => {
                const code = line.account || line.code;
                if (code === undefined) return;
                if (!balances[code]) balances[code] = 0;
                balances[code] += (Number(line.debit) || 0) - (Number(line.credit) || 0);
            });
        });

        State.accountBalances = balances;
    }

    /* ============================================
       Summary
       ============================================ */
    function renderSummary() {
        let totalDebit = 0;
        let totalCredit = 0;

        State.entries.forEach(e => {
            if (e.lines) {
                e.lines.forEach(l => {
                    totalDebit += Number(l.debit) || 0;
                    totalCredit += Number(l.credit) || 0;
                });
            }
        });

        const balance = totalDebit - totalCredit;

        setText('totalDebit', U.money(totalDebit));
        setText('totalCredit', U.money(totalCredit));
        setText('balanceCheck', U.money(Math.abs(balance)));
        setText('entriesCount', State.entries.length);

        const balEl = $('#balanceCheck');
        if (balEl) {
            balEl.style.color = Math.abs(balance) < 0.01 ? 'var(--success)' : 'var(--danger)';
        }
    }

    function setText(id, value) {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    /* ============================================
       Filters
       ============================================ */
    function applyFilters() {
        let list = [...State.entries];

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(e =>
                (e.description || '').toLowerCase().includes(term) ||
                (e.entry_number || '').toLowerCase().includes(term)
            );
        }

        const now = new Date();
        if (State.filters.date === 'today') {
            const today = U.today();
            list = list.filter(e => (e.date || '').startsWith(today));
        } else if (State.filters.date === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            list = list.filter(e => (e.date || '') >= weekAgo);
        } else if (State.filters.date === 'month') {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
            list = list.filter(e => (e.date || '') >= monthStart);
        } else if (State.filters.date === 'year') {
            list = list.filter(e => (e.date || '').startsWith(now.getFullYear().toString()));
        }

        State.filtered = list;
        renderLedger();
    }

    /* ============================================
       Ledger
       ============================================ */
    function renderLedger() {
        const container = $('#ledgerList');
        if (!container) return;

        const list = State.filtered.length ? State.filtered : State.entries;

        if (!list.length) {
            container.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book"></i>
                    <h3>لا توجد قيود</h3>
                    <p>لم تسجل أي قيود محاسبية بعد</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map((entry, idx) => {
            const totalAmount = (entry.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
            return `
                <div class="ledger-entry">
                    <div class="ledger-entry__header">
                        <div class="ledger-entry__info">
                            <div class="ledger-entry__number">${idx + 1}</div>
                            <div>
                                <div class="ledger-entry__title">${U.escape(entry.description || 'قيد محاسبي')}</div>
                                <div class="ledger-entry__date">
                                    ${U.date(entry.date || entry.created_at)}
                                    ${entry.entry_number ? ` · ${U.escape(entry.entry_number)}` : ''}
                                    ${entry.is_auto ? ' · آلي' : ''}
                                </div>
                            </div>
                        </div>
                        <div class="ledger-entry__amount">${U.money(totalAmount)}</div>
                    </div>
                    <div class="ledger-entry__body">
                        ${(entry.lines || []).map(line => `
                            <div class="ledger-line">
                                <div class="ledger-line__account">
                                    ${U.escape(line.name || getAccountName(line.account) || 'حساب')}
                                    <small>${U.escape(line.account || '')}</small>
                                </div>
                                <div class="ledger-line__debit">${line.debit ? U.moneyRaw(line.debit) : ''}</div>
                                <div class="ledger-line__credit">${line.credit ? U.moneyRaw(line.credit) : ''}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }).join('');
    }

    /* ============================================
       Trial Balance
       ============================================ */
    function renderTrialBalance() {
        const container = $('#trialBalance');
        if (!container) return;

        const rows = State.accounts
            .filter(acc => !acc.parent || acc.parent === '')
            .map(parent => {
                const balance = State.accountBalances[parent.code] || 0;
                return { ...parent, balance };
            });

        // Include children too
        const allRows = State.accounts.map(acc => ({
            ...acc,
            balance: State.accountBalances[acc.code] || 0,
            isChild: !!acc.parent
        })).filter(acc => Math.abs(acc.balance) > 0.01 || acc.parent);

        let totalDebit = 0;
        let totalCredit = 0;

        allRows.forEach(r => {
            if (r.balance > 0) totalDebit += r.balance;
            else totalCredit += Math.abs(r.balance);
        });

        container.innerHTML = `
            <div class="trial-row header">
                <div>الحساب</div>
                <div style="text-align:left;">مدين</div>
                <div style="text-align:left;">دائن</div>
            </div>
            ${allRows.map(r => `
                <div class="trial-row">
                    <div class="trial-row__name" style="${r.isChild ? 'padding-right: 20px; font-weight: 600;' : ''}">
                        ${U.escape(r.name)}
                        <small style="display:block;color:var(--text-muted);font-size:10px;">${r.code}</small>
                    </div>
                    <div class="trial-row__number debit">${r.balance > 0 ? U.moneyRaw(r.balance) : '-'}</div>
                    <div class="trial-row__number credit">${r.balance < 0 ? U.moneyRaw(-r.balance) : '-'}</div>
                </div>
            `).join('')}
            <div class="trial-row total">
                <div>الإجمالي</div>
                <div class="trial-row__number" style="color:var(--success);">${U.moneyRaw(totalDebit)}</div>
                <div class="trial-row__number" style="color:#2563eb;">${U.moneyRaw(totalCredit)}</div>
            </div>
        `;
    }

    /* ============================================
       Accounts
       ============================================ */
    function renderAccounts() {
        const container = $('#accountsList');
        if (!container) return;

        container.innerHTML = State.accounts.map(acc => {
            const balance = State.accountBalances[acc.code] || 0;
            const typeLabels = {
                asset: 'أصول',
                liability: 'التزامات',
                equity: 'حقوق ملكية',
                revenue: 'إيرادات',
                expense: 'مصروفات'
            };
            return `
                <div class="account-card">
                    <span class="account-card__type ${acc.type}">${typeLabels[acc.type] || acc.type}</span>
                    <div class="account-card__code">${acc.code}</div>
                    <div class="account-card__name">${U.escape(acc.name)}</div>
                    <div class="account-card__balance">
                        <span>الرصيد</span>
                        <strong class="${balance < 0 ? 'negative' : ''}">${U.money(Math.abs(balance))}</strong>
                    </div>
                </div>
            `;
        }).join('');
    }

    /* ============================================
       P&L
       ============================================ */
    function renderPnL() {
        const container = $('#pnlContent');
        if (!container) return;

        const revenueAccounts = State.accounts.filter(a => a.type === 'revenue');
        const expenseAccounts = State.accounts.filter(a => a.type === 'expense');

        const revenues = revenueAccounts.map(a => ({
            name: a.name,
            amount: Math.abs(State.accountBalances[a.code] || 0)
        })).filter(r => r.amount > 0);

        const expenses = expenseAccounts.map(a => ({
            name: a.name,
            amount: Math.abs(State.accountBalances[a.code] || 0)
        })).filter(e => e.amount > 0);

        const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
        const totalExpense = expenses.reduce((s, e) => s + e.amount, 0);
        const netProfit = totalRevenue - totalExpense;

        container.innerHTML = `
            <div class="pnl-card">
                <div class="pnl-card__header revenue">
                    <h3><i class="fas fa-arrow-down"></i> الإيرادات</h3>
                    <strong>${U.money(totalRevenue)}</strong>
                </div>
                <div class="pnl-card__body">
                    ${revenues.length ? revenues.map(r => `
                        <div class="pnl-row">
                            <span class="pnl-row__name">${U.escape(r.name)}</span>
                            <span class="pnl-row__value">${U.money(r.amount)}</span>
                        </div>
                    `).join('') : `<div class="pnl-row"><span class="pnl-row__name">لا توجد إيرادات</span></div>`}
                </div>
            </div>

            <div class="pnl-card">
                <div class="pnl-card__header expense">
                    <h3><i class="fas fa-arrow-up"></i> المصروفات</h3>
                    <strong>${U.money(totalExpense)}</strong>
                </div>
                <div class="pnl-card__body">
                    ${expenses.length ? expenses.map(e => `
                        <div class="pnl-row">
                            <span class="pnl-row__name">${U.escape(e.name)}</span>
                            <span class="pnl-row__value">${U.money(e.amount)}</span>
                        </div>
                    `).join('') : `<div class="pnl-row"><span class="pnl-row__name">لا توجد مصروفات</span></div>`}
                </div>
            </div>

            <div class="pnl-card">
                <div class="pnl-total ${netProfit >= 0 ? 'profit' : 'loss'}">
                    <span>${netProfit >= 0 ? 'صافي الربح' : 'صافي الخسارة'}</span>
                    <strong>${U.money(Math.abs(netProfit))}</strong>
                </div>
            </div>
        `;
    }

    /* ============================================
       Helpers
       ============================================ */
    function getAccountName(code) {
        const acc = State.accounts.find(a => a.code === code);
        return acc?.name || '';
    }

    /* ============================================
       Entry Modal
       ============================================ */
    function openEntryModal() {
        $('#entryDate').value = U.today();
        $('#entryDescription').value = '';
        State.draftLines = [];
        addLine();
        addLine();
        updateLedgerTotals();
        openModal('entryModal');
    }

    function addLine() {
        const container = $('#ledgerLines');
        if (!container) return;

        const idx = State.draftLines.length;
        State.draftLines.push({ account: '', name: '', debit: 0, credit: 0 });

        const div = document.createElement('div');
        div.className = 'ledger-line-input';
        div.dataset.idx = idx;
        div.innerHTML = `
            <input type="text" placeholder="الحساب (كود أو اسم)" data-field="account" data-idx="${idx}">
            <input type="number" placeholder="مدين" step="0.01" min="0" data-field="debit" data-idx="${idx}" inputmode="decimal">
            <input type="number" placeholder="دائن" step="0.01" min="0" data-field="credit" data-idx="${idx}" inputmode="decimal">
            <button type="button" data-remove="${idx}"><i class="fas fa-times"></i></button>
        `;

        container.appendChild(div);

        // Bind
        div.querySelectorAll('input').forEach(input => {
            input.addEventListener('input', (e) => {
                const i = +e.target.dataset.idx;
                const f = e.target.dataset.field;
                State.draftLines[i][f] = f === 'account' ? e.target.value : (+e.target.value || 0);
                updateLedgerTotals();
            });
        });

        div.querySelector('[data-remove]')?.addEventListener('click', () => {
            State.draftLines.splice(idx, 1);
            div.remove();
            reindexLines();
            updateLedgerTotals();
        });

        // Suggestions
        const accountInput = div.querySelector('[data-field="account"]');
        accountInput?.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            const match = State.accounts.find(a => 
                a.code === val || a.name.toLowerCase().includes(val)
            );
            if (match && !e.target.dataset.autofilled) {
                e.target.value = match.code;
                State.draftLines[idx].account = match.code;
                State.draftLines[idx].name = match.name;
                e.target.dataset.autofilled = '1';
                updateLedgerTotals();
            }
        });
    }

    function reindexLines() {
        $$('#ledgerLines .ledger-line-input').forEach((el, newIdx) => {
            el.dataset.idx = newIdx;
            el.querySelectorAll('[data-idx]').forEach(input => {
                input.dataset.idx = newIdx;
            });
            el.querySelector('[data-remove]')?.setAttribute('data-remove', newIdx);
        });
    }

    function updateLedgerTotals() {
        let totalDebit = 0;
        let totalCredit = 0;

        State.draftLines.forEach(l => {
            totalDebit += Number(l.debit) || 0;
            totalCredit += Number(l.credit) || 0;
        });

        setText('lineTotalDebit', U.moneyRaw(totalDebit));
        setText('lineTotalCredit', U.moneyRaw(totalCredit));
        setText('lineBalance', U.moneyRaw(Math.abs(totalDebit - totalCredit)));
    }

    async function saveEntry() {
        const date = $('#entryDate').value;
        const description = $('#entryDescription').value.trim();

        if (!date || !description) {
            showToast('أدخل التاريخ والبيان', 'warning');
            return;
        }

        const validLines = State.draftLines.filter(l => 
            l.account && ((Number(l.debit) || 0) > 0 || (Number(l.credit) || 0) > 0)
        );

        if (validLines.length < 2) {
            showToast('القيد يحتاج بندين على الأقل', 'warning');
            return;
        }

        const totalDebit = validLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
        const totalCredit = validLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);

        if (Math.abs(totalDebit - totalCredit) > 0.01) {
            showToast(`القيد غير متوازن (فرق ${U.moneyRaw(Math.abs(totalDebit - totalCredit))})`, 'warning');
            return;
        }

        const btn = $('#saveEntryBtn');
        if (btn) btn.disabled = true;

        try {
            const entry = {
                id: U.uuid(),
                tenant_id: State.currentUser.tenant_id,
                entry_number: 'M-' + Date.now().toString(36).toUpperCase(),
                date,
                description,
                lines: validLines.map(l => ({
                    account: l.account,
                    name: l.name || getAccountName(l.account),
                    debit: Number(l.debit) || 0,
                    credit: Number(l.credit) || 0
                })),
                total_debit: totalDebit,
                total_credit: totalCredit,
                created_by: State.currentUser.id,
                created_at: new Date().toISOString()
            };

            // Save to cloud
            if (window.DB?.client) {
                const { error } = await window.DB.client.from('journal_entries').insert(entry);
                if (error) throw error;
            }

            showToast('تم حفظ القيد بنجاح', 'success');
            closeModal('entryModal');

            await loadData();
            applyFilters();
        } catch (e) {
            console.error('Save error:', e);
            showToast('فشل حفظ القيد', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Export
       ============================================ */
    function exportLedger() {
        if (!State.entries.length) {
            showToast('لا توجد بيانات للتصدير', 'info');
            return;
        }

        const rows = [['رقم القيد', 'التاريخ', 'البيان', 'الحساب', 'مدين', 'دائن']];
        State.entries.forEach(e => {
            (e.lines || []).forEach(l => {
                rows.push([
                    e.entry_number || '',
                    e.date || '',
                    e.description || '',
                    l.name || getAccountName(l.account),
                    Number(l.debit) || 0,
                    Number(l.credit) || 0
                ]);
            });
        });

        const csv = rows.map(row =>
            row.map(cell => {
                const s = String(cell ?? '');
                return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
            }).join(',')
        ).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `journal-${U.today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('تم التصدير', 'success');
    }

    /* ============================================
       Tabs
       ============================================ */
    function switchTab(tab) {
        State.currentTab = tab;
        $$('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });
        $$('.tab-content').forEach(content => {
            content.classList.toggle('active', content.dataset.tabContent === tab);
        });
    }

    /* ============================================
       UI Helpers
       ============================================ */
    function updateUserUI() {
        const avatar = $('#userAvatar');
        const name = $('#sidebarUserName');
        if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
        if (name) name.textContent = State.currentUser.fullName || 'مدير';
    }

    function updateConnStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('is-offline', !online);
        const status = $('#connStatus');
        if (status) {
            status.textContent = online ? 'متصل' : 'غير متصل';
            status.style.color = online ? 'var(--success)' : 'var(--danger)';
        }
    }

    function updateThemeIcon() {
        const btn = $('#themeBtn');
        if (!btn) return;
        const isDark = document.documentElement.dataset.theme === 'dark';
        btn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    function hideLoadingBar() {
        const bar = $('#loading-bar');
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        }
    }

    /* ============================================
       Toast
       ============================================ */
    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }

        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 12px 22px;
            background: ${colors[type] || colors.info};
            color: #fff;
            border-radius: 999px;
            font-weight: 700;
            font-size: 14px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            pointer-events: auto;
        `;
        toast.innerHTML = `<i class="fas fa-${icons[type]}"></i> <span>${U.escape(msg)}</span>`;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    /* ============================================
       Events
       ============================================ */
    function bindEvents() {
        // Sidebar
        $('#menuBtn')?.addEventListener('click', () => {
            $('#sidebar')?.classList.add('open');
            $('#sidebarOverlay')?.classList.add('show');
        });
        $('#sidebarOverlay')?.addEventListener('click', () => {
            $('#sidebar')?.classList.remove('open');
            $('#sidebarOverlay')?.classList.remove('show');
        });
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                $('#sidebar')?.classList.remove('open');
                $('#sidebarOverlay')?.classList.remove('show');
            });
        });

        // Theme
        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        // Logout
        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        // Refresh
        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            DB.clearCache();
            await loadData();
            applyFilters();
            showToast('تم التحديث', 'success');
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportLedger);

        // New entry
        $('#newEntryBtn')?.addEventListener('click', openEntryModal);
        $('#addLineBtn')?.addEventListener('click', addLine);
        $('#saveEntryBtn')?.addEventListener('click', saveEntry);

        // Tabs
        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Search
        $('#searchInput')?.addEventListener('input', U.debounce((e) => {
            State.filters.search = e.target.value.trim();
            const clearBtn = $('#clearSearchBtn');
            if (clearBtn) clearBtn.style.display = e.target.value ? 'grid' : 'none';
            applyFilters();
        }, 200));

        $('#clearSearchBtn')?.addEventListener('click', () => {
            const input = $('#searchInput');
            if (input) input.value = '';
            State.filters.search = '';
            $('#clearSearchBtn').style.display = 'none';
            applyFilters();
        });

        // Date filter
        $('#dateFilter')?.addEventListener('change', (e) => {
            State.filters.date = e.target.value;
            applyFilters();
        });

        // Close modals
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        // ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
            }
        });

        // Connection
        window.addEventListener('online', () => {
            updateConnStatus();
            showToast('عاد الاتصال', 'success');
        });
        window.addEventListener('offline', () => {
            updateConnStatus();
            showToast('انقطع الاتصال', 'warning');
        });
    }

    /* ============================================
       Start
       ============================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
