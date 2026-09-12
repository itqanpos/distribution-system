/* =============================================
   customers.js - Parties Page Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ State ============ */
    const State = {
        parties: [],
        filtered: [],
        invoices: [],
        currentUser: null,
        currentType: 'customer',
        editingId: null,
        deletingId: null,
        viewingId: null,
        filters: {
            search: '',
            balance: '',
            sort: 'name'
        }
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Customers init...');

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

        await loadData();
        hideLoadingBar();
        console.log('✅ Customers ready');
    }

    /* ============================================
       Load Data
       ============================================ */
    async function loadData() {
        showSkeleton();
        try {
            const [parties, invoices] = await Promise.all([
                DB.getParties(null, true).catch(() => []),
                DB.getInvoices(true).catch(() => [])
            ]);

            State.parties = parties || [];
            State.invoices = invoices || [];

            console.log('👥 Parties:', State.parties.length);
            console.log('📄 Invoices:', State.invoices.length);

            updateTabCounts();
            renderSummary();
            applyFilters();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
            showEmpty(true);
        } finally {
            hideSkeleton();
        }
    }

    /* ============================================
       Tabs
       ============================================ */
    function updateTabCounts() {
        const customers = State.parties.filter(p => p.type === 'customer' || p.type === 'both').length;
        const suppliers = State.parties.filter(p => p.type === 'supplier' || p.type === 'both').length;

        const custCount = $('#customersTabCount');
        const suppCount = $('#suppliersTabCount');
        if (custCount) custCount.textContent = customers;
        if (suppCount) suppCount.textContent = suppliers;
    }

    function switchTab(type) {
        State.currentType = type;
        State.filters.search = '';
        
        // Clear search input
        const searchInput = $('#searchInput');
        if (searchInput) searchInput.value = '';
        const clearBtn = $('#clearSearchBtn');
        if (clearBtn) clearBtn.style.display = 'none';

        $$('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        // Update empty state text
        const emptyText = $('#emptyStateText');
        if (emptyText) {
            emptyText.textContent = type === 'customer' 
                ? 'ابدأ بإضافة عميل جديد' 
                : 'ابدأ بإضافة مورد جديد';
        }

        applyFilters();
    }

    /* ============================================
       Summary
       ============================================ */
    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const type = State.currentType;
        const list = State.parties.filter(p => 
            p.type === type || p.type === 'both'
        );

        const totalDebit = list
            .filter(p => (p.balance || 0) < 0)
            .reduce((sum, p) => sum + Math.abs(p.balance || 0), 0);

        const totalCredit = list
            .filter(p => (p.balance || 0) > 0)
            .reduce((sum, p) => sum + (p.balance || 0), 0);

        const totalCount = list.length;

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon blue">
                    <i class="fas fa-users"></i>
                </div>
                <div class="summary-card__info">
                    <label>العدد الإجمالي</label>
                    <span>${totalCount}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon red">
                    <i class="fas fa-arrow-down"></i>
                </div>
                <div class="summary-card__info">
                    <label>${type === 'customer' ? 'مدينون لنا' : 'مستحق لهم'}</label>
                    <span>${U.money(totalDebit)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green">
                    <i class="fas fa-arrow-up"></i>
                </div>
                <div class="summary-card__info">
                    <label>${type === 'customer' ? 'دائنون لنا' : 'مدفوع لهم'}</label>
                    <span>${U.money(totalCredit)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon purple">
                    <i class="fas fa-balance-scale"></i>
                </div>
                <div class="summary-card__info">
                    <label>الصافي</label>
                    <span>${U.money(totalDebit - totalCredit)}</span>
                </div>
            </div>
        `;
    }

    /* ============================================
       Filters & Sorting
       ============================================ */
    function applyFilters() {
        let list = State.parties.filter(p => 
            p.type === State.currentType || p.type === 'both'
        );

        // Search
        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.phone || '').includes(term) ||
                (p.email || '').toLowerCase().includes(term)
            );
        }

        // Balance filter
        if (State.filters.balance) {
            list = list.filter(p => {
                const bal = p.balance || 0;
                if (State.filters.balance === 'debit') return bal < 0;
                if (State.filters.balance === 'credit') return bal > 0;
                if (State.filters.balance === 'zero') return bal === 0;
                return true;
            });
        }

        // Sort
        const sort = State.filters.sort;
        list.sort((a, b) => {
            if (sort === 'name') return (a.name || '').localeCompare(b.name || '', 'ar');
            if (sort === 'name-desc') return (b.name || '').localeCompare(a.name || '', 'ar');
            if (sort === 'balance') return (a.balance || 0) - (b.balance || 0);
            if (sort === 'balance-desc') return (b.balance || 0) - (a.balance || 0);
            if (sort === 'recent') return (b.created_at || '').localeCompare(a.created_at || '');
            return 0;
        });

        State.filtered = list;
        renderParties();
        updateCount();
    }

    function updateCount() {
        const el = $('#partiesCount');
        if (el) {
            const total = State.filtered.length;
            const typeName = State.currentType === 'customer' ? 'عميل' : 'مورد';
            el.textContent = total === 1 ? `1 ${typeName}` : `${total} ${typeName}`;
        }
    }

    /* ============================================
       Render Parties
       ============================================ */
    function renderParties() {
        const gridView = $('#partiesGridView');
        const listView = $('#partiesListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            showEmpty(true);
            return;
        }

        showEmpty(false);

        if (gridView) {
            gridView.innerHTML = State.filtered.map(p => renderPartyCard(p)).join('');
            gridView.querySelectorAll('.party-item').forEach(el => bindPartyActions(el));
        }

        if (listView) {
            listView.innerHTML = State.filtered.map(p => renderPartyListItem(p)).join('');
            listView.querySelectorAll('.party-list-item').forEach(el => bindPartyActions(el));
        }
    }

    function renderPartyCard(p) {
        const bal = p.balance || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? `عليه: ${U.money(-bal)}` : bal > 0 ? `له: ${U.money(bal)}` : 'لا رصيد';
        const initials = (p.name || '?').trim()[0] || '?';
        const typeClass = p.type === 'supplier' ? 'supplier' : p.type === 'both' ? 'both' : '';
        const typeLabel = p.type === 'customer' ? 'عميل' : p.type === 'supplier' ? 'مورد' : 'عميل/مورد';

        return `
            <div class="party-item" data-id="${p.id}">
                <div class="party-item__actions">
                    <button class="icon-action" data-action="edit" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-action danger" data-action="delete" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="party-item__head">
                    <div class="party-item__avatar ${typeClass}">${U.escape(initials)}</div>
                    <div class="party-item__title">
                        <div class="party-item__name">${U.escape(p.name || '')}</div>
                        <span class="party-item__type ${typeClass}">${typeLabel}</span>
                    </div>
                </div>
                <div class="party-item__body">
                    <div class="party-item__field">
                        <label>الهاتف</label>
                        <span>${U.escape(p.phone || '-')}</span>
                    </div>
                    <div class="party-item__field">
                        <label>البريد</label>
                        <span>${U.escape(p.email || '-')}</span>
                    </div>
                    <div class="party-item__balance ${balClass}">
                        <span>الرصيد</span>
                        <strong>${balLabel}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    function renderPartyListItem(p) {
        const bal = p.balance || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? `${U.moneyRaw(-bal)}-` : bal > 0 ? `+${U.moneyRaw(bal)}` : '0';
        const initials = (p.name || '?').trim()[0] || '?';
        const typeClass = p.type === 'supplier' ? 'supplier' : '';

        return `
            <div class="party-list-item" data-id="${p.id}">
                <div class="party-list-item__avatar ${typeClass}">${U.escape(initials)}</div>
                <div class="party-list-item__info">
                    <div class="party-list-item__name">${U.escape(p.name || '')}</div>
                    <div class="party-list-item__meta">${U.escape(p.phone || p.email || '-')}</div>
                </div>
                <div class="party-list-item__balance ${balClass}">${balLabel}</div>
            </div>
        `;
    }

    function bindPartyActions(el) {
        const id = el.dataset.id;

        el.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;

            if (action === 'edit') {
                e.stopPropagation();
                openPartyModal(id);
            } else if (action === 'delete') {
                e.stopPropagation();
                openDeleteConfirm(id);
            } else {
                openViewModal(id);
            }
        });
    }

    function showEmpty(show) {
        const el = $('#emptyState');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    /* ============================================
       Add/Edit Modal
       ============================================ */
    function openPartyModal(id = null) {
        State.editingId = id;

        const title = $('#partyModalTitle');
        const form = $('#partyForm');
        if (form) form.reset();

        if (id) {
            const p = State.parties.find(x => x.id === id);
            if (!p) return;

            if (title) title.textContent = 'تعديل بيانات';
            $('#partyId').value = id;
            $('#partyName').value = p.name || '';
            $('#partyPhone').value = p.phone || '';
            $('#partyEmail').value = p.email || '';
            $('#partyAddress').value = p.address || '';
            $('#partyBalance').value = p.balance || 0;
            $('#partyCreditLimit').value = p.credit_limit || 0;
            $('#partyNotes').value = p.notes || '';
            setPartyType(p.type || 'customer');
        } else {
            if (title) title.textContent = State.currentType === 'customer' 
                ? 'إضافة عميل جديد' 
                : 'إضافة مورد جديد';
            $('#partyId').value = '';
            $('#partyBalance').value = 0;
            $('#partyCreditLimit').value = 0;
            setPartyType(State.currentType);
        }

        openModal('partyModal');
        setTimeout(() => $('#partyName')?.focus(), 200);
    }

    function setPartyType(type) {
        $('#partyType').value = type;
        $$('.type-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });
    }

    /* ============================================
       Save Party
       ============================================ */
    async function saveParty() {
        const name = $('#partyName')?.value.trim();
        if (!name) {
            showToast('الاسم مطلوب', 'warning');
            return;
        }

        const phone = $('#partyPhone')?.value.trim() || '';
        const email = $('#partyEmail')?.value.trim() || '';

        // Basic email validation
        if (email && !email.includes('@')) {
            showToast('صيغة البريد الإلكتروني غير صحيحة', 'warning');
            return;
        }

        const saveBtn = $('#savePartyBtn');
        if (saveBtn) saveBtn.disabled = true;

        try {
            const data = {
                id: State.editingId || undefined,
                name,
                type: $('#partyType')?.value || 'customer',
                phone,
                email,
                address: $('#partyAddress')?.value.trim() || '',
                balance: +$('#partyBalance')?.value || 0,
                credit_limit: +$('#partyCreditLimit')?.value || 0,
                notes: $('#partyNotes')?.value.trim() || ''
            };

            console.log('💾 Saving party:', data);

            await DB.saveParty(data);

            showToast(State.editingId ? 'تم التحديث' : 'تمت الإضافة', 'success');
            closeModal('partyModal');

            await loadData();

        } catch (e) {
            console.error('Save error:', e);
            showToast(e.message || 'فشل الحفظ', 'error');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    /* ============================================
       View Party
       ============================================ */
    function openViewModal(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;

        State.viewingId = id;

        const body = $('#viewPartyBody');
        if (!body) return;

        const bal = p.balance || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? `عليه دين` : bal > 0 ? `له رصيد` : 'لا رصيد';
        const initials = (p.name || '?').trim()[0] || '?';
        const typeClass = p.type === 'supplier' ? 'supplier' : '';
        const typeLabel = p.type === 'customer' ? 'عميل' : p.type === 'supplier' ? 'مورد' : 'عميل ومورد';

        body.innerHTML = `
            <div class="view-party__header">
                <div class="view-party__avatar ${typeClass}">${U.escape(initials)}</div>
                <div class="view-party__title">
                    <h3>${U.escape(p.name || '')}</h3>
                    <p>${typeLabel} · ${U.date(p.created_at || new Date())}</p>
                </div>
            </div>

            <div class="view-party__balance ${balClass}">
                <label>${balLabel}</label>
                <strong>${U.money(Math.abs(bal))}</strong>
            </div>

            <div class="view-party__grid">
                ${p.phone ? `
                    <div class="view-party__item">
                        <label>الهاتف</label>
                        <span><a href="tel:${U.escape(p.phone)}">${U.escape(p.phone)}</a></span>
                    </div>
                ` : ''}
                ${p.email ? `
                    <div class="view-party__item">
                        <label>البريد</label>
                        <span><a href="mailto:${U.escape(p.email)}">${U.escape(p.email)}</a></span>
                    </div>
                ` : ''}
                ${p.address ? `
                    <div class="view-party__item" style="grid-column: 1 / -1;">
                        <label>العنوان</label>
                        <span>${U.escape(p.address)}</span>
                    </div>
                ` : ''}
                ${p.credit_limit ? `
                    <div class="view-party__item">
                        <label>حد الدين</label>
                        <span>${U.money(p.credit_limit)}</span>
                    </div>
                ` : ''}
                ${p.notes ? `
                    <div class="view-party__item" style="grid-column: 1 / -1;">
                        <label>ملاحظات</label>
                        <span>${U.escape(p.notes)}</span>
                    </div>
                ` : ''}
            </div>
        `;

        // Bind buttons
        const editBtn = $('#viewEditBtn');
        const newEditBtn = editBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newEditBtn, editBtn);
        newEditBtn.addEventListener('click', () => {
            closeModal('viewPartyModal');
            setTimeout(() => openPartyModal(id), 200);
        });

        const stmtBtn = $('#viewStatementBtn');
        const newStmtBtn = stmtBtn.cloneNode(true);
        stmtBtn.parentNode.replaceChild(newStmtBtn, stmtBtn);
        newStmtBtn.addEventListener('click', () => {
            closeModal('viewPartyModal');
            setTimeout(() => openStatement(id), 200);
        });

        openModal('viewPartyModal');
    }

    /* ============================================
       Statement
       ============================================ */
    function openStatement(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;

        const title = $('#statementTitle');
        if (title) title.textContent = `كشف حساب - ${p.name}`;

        const body = $('#statementBody');
        if (!body) return;

        // Filter invoices for this party
        const partyInvoices = State.invoices.filter(inv => 
            inv.customer_id === id || inv.supplier_id === id
        );

        // Calculate totals
        const sales = partyInvoices.filter(i => i.type === 'sale');
        const purchases = partyInvoices.filter(i => i.type === 'purchase');

        const totalSales = sales.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const totalPurchases = purchases.reduce((s, i) => s + (Number(i.total) || 0), 0);

        if (!partyInvoices.length) {
            body.innerHTML = `
                <div class="statement-empty">
                    <i class="fas fa-file-invoice"></i>
                    <p>لا توجد معاملات</p>
                    <small style="display:block;margin-top:6px;color:var(--text-muted);">لم يتم إجراء أي فواتير مع هذا الحساب بعد</small>
                </div>
            `;
        } else {
            const rows = partyInvoices
                .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))
                .slice(0, 50);

            body.innerHTML = `
                <div class="statement-summary">
                    <div class="statement-summary__item">
                        <label>عدد الفواتير</label>
                        <strong>${partyInvoices.length}</strong>
                    </div>
                    <div class="statement-summary__item">
                        <label>المبيعات</label>
                        <strong style="color:var(--success);">${U.money(totalSales)}</strong>
                    </div>
                    <div class="statement-summary__item">
                        <label>المشتريات</label>
                        <strong style="color:var(--warning);">${U.money(totalPurchases)}</strong>
                    </div>
                </div>

                <div class="statement-list">
                    ${rows.map(inv => {
                        const isSale = inv.type === 'sale';
                        const amount = Number(inv.total) || 0;
                        return `
                            <div class="statement-row">
                                <div class="statement-row__icon ${isSale ? 'sale' : 'purchase'}">
                                    <i class="fas fa-${isSale ? 'arrow-up' : 'arrow-down'}"></i>
                                </div>
                                <div class="statement-row__info">
                                    <strong>${U.escape(inv.invoice_number || '---')}</strong>
                                    <small>${U.date(inv.date || inv.created_at)} · ${isSale ? 'فاتورة بيع' : 'فاتورة شراء'}</small>
                                </div>
                                <div class="statement-row__amount ${isSale ? 'credit' : 'debit'}">
                                    ${isSale ? '+' : '-'}${U.money(amount)}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        }

        openModal('statementModal');
    }

    function printStatement() {
        const title = $('#statementTitle')?.textContent || 'كشف حساب';
        const content = $('#statementBody')?.innerHTML || '';

        const win = window.open('', '_blank', 'width=600,height=800');
        win.document.write(`
            <!DOCTYPE html>
            <html dir="rtl"><head><meta charset="UTF-8">
            <title>${title}</title>
            <style>
                body { font-family: 'Cairo', Arial, sans-serif; padding: 20px; font-size: 13px; }
                h2 { text-align: center; margin-bottom: 20px; }
                .statement-summary {
                    display: grid; grid-template-columns: repeat(3, 1fr);
                    gap: 10px; margin-bottom: 16px;
                }
                .statement-summary__item {
                    background: #f8fafc; border-radius: 10px; padding: 12px; text-align: center;
                }
                .statement-summary__item label { display: block; font-size: 10px; color: #666; margin-bottom: 4px; }
                .statement-summary__item strong { font-size: 15px; }
                .statement-row {
                    display: grid; grid-template-columns: auto 1fr auto;
                    gap: 12px; padding: 10px; background: #f8fafc;
                    border-radius: 10px; margin-bottom: 6px; align-items: center;
                }
                .statement-row__info strong { display: block; font-size: 13px; }
                .statement-row__info small { font-size: 11px; color: #666; }
                .statement-row__amount { font-weight: bold; }
                .statement-row__amount.credit { color: #10b981; }
                .statement-row__amount.debit { color: #ef4444; }
                @media print { body { padding: 0; } }
            </style>
            </head><body>
                <h2>${U.escape(title)}</h2>
                ${content}
            </body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    /* ============================================
       Delete
       ============================================ */
    function openDeleteConfirm(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;

        State.deletingId = id;
        const nameEl = $('#deletePartyName');
        if (nameEl) nameEl.textContent = p.name;

        openModal('confirmDeleteModal');
    }

    async function confirmDelete() {
        if (!State.deletingId) return;

        const btn = $('#confirmDeleteBtn');
        if (btn) btn.disabled = true;

        try {
            await DB.deleteParty(State.deletingId);
            showToast('تم الحذف', 'success');
            closeModal('confirmDeleteModal');
            State.deletingId = null;
            await loadData();
        } catch (e) {
            console.error('Delete error:', e);
            showToast('فشل الحذف', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Export
       ============================================ */
    function exportParties() {
        if (!State.filtered.length) {
            showToast('لا توجد بيانات للتصدير', 'info');
            return;
        }

        const rows = [['الاسم', 'النوع', 'الهاتف', 'البريد', 'العنوان', 'الرصيد', 'حد الدين']];
        
        State.filtered.forEach(p => {
            rows.push([
                p.name || '',
                p.type === 'customer' ? 'عميل' : p.type === 'supplier' ? 'مورد' : 'عميل ومورد',
                p.phone || '',
                p.email || '',
                p.address || '',
                p.balance || 0,
                p.credit_limit || 0
            ]);
        });

        const csv = rows.map(row =>
            row.map(cell => {
                const s = String(cell ?? '');
                return (s.includes(',') || s.includes('"') || s.includes('\n'))
                    ? '"' + s.replace(/"/g, '""') + '"'
                    : s;
            }).join(',')
        ).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${State.currentType === 'customer' ? 'customers' : 'suppliers'}-${U.today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('تم التصدير', 'success');
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

    function openModal(id) {
        document.getElementById(id)?.classList.add('open');
    }
    function closeModal(id) {
        document.getElementById(id)?.classList.remove('open');
    }

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#partiesGridView');
        const listView = $('#partiesListView');
        const empty = $('#emptyState');

        if (skeleton) {
            skeleton.innerHTML = Array(6).fill(`
                <div class="skeleton-card">
                    <div style="display:flex;gap:12px;margin-bottom:16px;">
                        <div style="width:48px;height:48px;background:var(--bg-sunken);border-radius:50%;"></div>
                        <div style="flex:1;">
                            <div style="height:16px;background:var(--bg-sunken);border-radius:6px;margin-bottom:8px;"></div>
                            <div style="height:12px;background:var(--bg-sunken);border-radius:6px;width:50%;"></div>
                        </div>
                    </div>
                    <div style="height:40px;background:var(--bg-sunken);border-radius:10px;"></div>
                </div>
            `).join('');
            skeleton.style.display = 'grid';
        }
        if (gridView) gridView.style.display = 'none';
        if (listView) listView.style.display = 'none';
        if (empty) empty.style.display = 'none';
    }

    function hideSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#partiesGridView');
        const listView = $('#partiesListView');

        if (skeleton) skeleton.style.display = 'none';
        if (gridView) gridView.style.display = '';
        if (listView) listView.style.display = '';
    }

    function showLoading() {
        const bar = $('#loading-bar');
        if (bar) bar.style.width = '70%';
    }

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
            showToast('تم التحديث', 'success');
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportParties);

        // Tabs
        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.type);
                renderSummary();
            });
        });

        // Add
        $('#addPartyBtn')?.addEventListener('click', () => openPartyModal());
        $('#fabAddBtn')?.addEventListener('click', () => openPartyModal());

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

        // Filters
        $('#balanceFilter')?.addEventListener('change', (e) => {
            State.filters.balance = e.target.value;
            applyFilters();
        });
        $('#sortFilter')?.addEventListener('change', (e) => {
            State.filters.sort = e.target.value;
            applyFilters();
        });

        // Party type selector
        $$('.type-btn').forEach(btn => {
            btn.addEventListener('click', () => setPartyType(btn.dataset.type));
        });

        // Save
        $('#savePartyBtn')?.addEventListener('click', saveParty);

        // Delete
        $('#confirmDeleteBtn')?.addEventListener('click', confirmDelete);

        // Print statement
        $('#printStatementBtn')?.addEventListener('click', printStatement);

        // Modals
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        // Keyboard
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
