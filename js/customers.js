/* =============================================
   customers.js - Parties Page Logic v2.0
   مع التحصيل والسداد والفواتير
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
        transactions: [],
        currentUser: null,
        currentType: 'customer',
        editingId: null,
        deletingId: null,
        viewingId: null,
        paymentPartyId: null,
        paymentType: null,
        invoicesFilter: 'all',
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
        
        const searchInput = $('#searchInput');
        if (searchInput) searchInput.value = '';
        const clearBtn = $('#clearSearchBtn');
        if (clearBtn) clearBtn.style.display = 'none';

        $$('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        const emptyText = $('#emptyStateText');
        if (emptyText) {
            emptyText.textContent = type === 'customer' 
                ? 'ابدأ بإضافة عميل جديد' 
                : 'ابدأ بإضافة مورد جديد';
        }

        renderSummary();
        applyFilters();
    }

    /* ============================================
       Summary
       ============================================ */
    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const type = State.currentType;
        const list = State.parties.filter(p => p.type === type || p.type === 'both');

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

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.phone || '').includes(term) ||
                (p.email || '').toLowerCase().includes(term)
            );
        }

        if (State.filters.balance) {
            list = list.filter(p => {
                const bal = p.balance || 0;
                if (State.filters.balance === 'debit') return bal < 0;
                if (State.filters.balance === 'credit') return bal > 0;
                if (State.filters.balance === 'zero') return bal === 0;
                return true;
            });
        }

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
                    <button class="icon-action" data-action="payment" title="تحصيل/سداد">
                        <i class="fas fa-hand-holding-usd"></i>
                    </button>
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
            } else if (action === 'payment') {
                e.stopPropagation();
                openPaymentModal(id);
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
       Payment / Collection
       ============================================ */
    function openPaymentModal(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;

        State.paymentPartyId = id;
        State.paymentType = p.type === 'supplier' ? 'payment_out' : 'payment_in';

        const title = $('#paymentModalTitle');
        const avatar = $('#paymentAvatar');
        const name = $('#paymentPartyName');
        const balEl = $('#paymentCurrentBalance');
        const submitBtn = $('#confirmPaymentBtn');
        const btnText = submitBtn?.querySelector('span') || submitBtn;

        if (title) title.textContent = State.paymentType === 'payment_in' ? 'تحصيل من عميل' : 'سداد لمورد';
        if (avatar) avatar.textContent = (p.name || '?').trim()[0] || '?';
        if (name) name.textContent = p.name || '';

        const bal = p.balance || 0;
        const balLabel = bal < 0 ? `عليه: ${U.money(-bal)}` : bal > 0 ? `له: ${U.money(bal)}` : 'لا رصيد';
        if (balEl) balEl.textContent = balLabel;

        // Change submit button
        if (submitBtn) {
            const newBtn = submitBtn.cloneNode(true);
            newBtn.innerHTML = `<i class="fas fa-check"></i> ${State.paymentType === 'payment_in' ? 'تحصيل' : 'سداد'}`;
            submitBtn.parentNode.replaceChild(newBtn, submitBtn);
            newBtn.addEventListener('click', submitPayment);
        }

        // Reset fields
        $('#paymentPartyId').value = id;
        $('#paymentType').value = State.paymentType;
        $('#paymentAmount').value = '';
        $('#paymentReference').value = '';
        $('#paymentNotesInput').value = '';
        setPaymentMethod('cash');

        // Suggest amount based on balance
        renderQuickAmounts(bal);

        // Preview
        updateBalancePreview();

        openModal('paymentModal');
        setTimeout(() => $('#paymentAmount')?.focus(), 200);

        // Bind amount input
        const amountInput = $('#paymentAmount');
        if (amountInput) {
            const newInput = amountInput.cloneNode(true);
            amountInput.parentNode.replaceChild(newInput, amountInput);
            newInput.addEventListener('input', updateBalancePreview);
        }
    }

    function renderQuickAmounts(bal) {
        const container = $('#quickAmounts');
        if (!container) return;

        // If customer owes (bal < 0), suggest collecting the full amount
        // If supplier is owed (bal > 0 for supplier means we owe them?), suggest paying
        const suggestions = new Set();
        
        const absBal = Math.abs(bal);
        if (absBal > 0) {
            suggestions.add(Math.round(absBal));
            if (absBal >= 100) {
                suggestions.add(Math.round(absBal / 2));
                suggestions.add(100);
                suggestions.add(500);
            } else if (absBal >= 10) {
                suggestions.add(50);
                suggestions.add(100);
            }
        }
        suggestions.add(100);
        suggestions.add(500);
        suggestions.add(1000);

        const list = [...suggestions].filter(v => v > 0).sort((a, b) => a - b).slice(0, 4);

        container.innerHTML = list.map(v => 
            `<button type="button" data-amount="${v}">${v}</button>`
        ).join('');

        container.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                const input = $('#paymentAmount');
                if (input) {
                    input.value = btn.dataset.amount;
                    updateBalancePreview();
                }
            });
        });
    }

    function setPaymentMethod(method) {
        $$('.method-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });
        $('#paymentMethod').value = method;
    }

    function updateBalancePreview() {
        const p = State.parties.find(x => x.id === State.paymentPartyId);
        if (!p) return;

        const amount = Number($('#paymentAmount')?.value) || 0;
        const currentBal = Number(p.balance) || 0;
        const type = State.paymentType;

        // payment_in: customer pays us → balance increases
        // payment_out: we pay supplier → balance decreases
        const newBal = type === 'payment_in' 
            ? currentBal + amount 
            : currentBal - amount;

        const el = $('#newBalanceDisplay');
        const box = $('#balancePreview');
        
        if (el) el.textContent = U.money(Math.abs(newBal));
        if (box) {
            box.classList.remove('positive', 'negative');
            if (newBal < 0) box.classList.add('negative');
            else if (newBal > 0) box.classList.add('positive');
        }
    }

    async function submitPayment() {
        const partyId = $('#paymentPartyId').value;
        const type = $('#paymentType').value;
        const amount = Number($('#paymentAmount').value) || 0;
        const method = $('#paymentMethod').value || 'cash';
        const reference = $('#paymentReference').value.trim();
        const notes = $('#paymentNotesInput').value.trim();

        if (amount <= 0) {
            showToast('أدخل مبلغاً صحيحاً', 'warning');
            return;
        }

        const btn = $('#confirmPaymentBtn');
        if (btn) btn.disabled = true;

        try {
            await DB.addPayment({
                party_id: partyId,
                type,
                amount,
                payment_method: method,
                reference,
                notes
            });

            showToast(type === 'payment_in' ? 'تم التحصيل بنجاح' : 'تم السداد بنجاح', 'success');
            closeModal('paymentModal');

            await loadData();

        } catch (e) {
            console.error('Payment error:', e);
            showToast(e.message || 'فشلت العملية', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
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

    async function saveParty() {
        const name = $('#partyName')?.value.trim();
        if (!name) {
            showToast('الاسم مطلوب', 'warning');
            return;
        }

        const phone = $('#partyPhone')?.value.trim() || '';
        const email = $('#partyEmail')?.value.trim() || '';

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

        // Update footer buttons
        const payBtnText = $('#viewPaymentBtnText');
        if (payBtnText) {
            payBtnText.textContent = p.type === 'supplier' ? 'سداد' : 'تحصيل';
        }

        const payBtn = $('#viewPaymentBtn');
        if (payBtn) {
            const newPayBtn = payBtn.cloneNode(true);
            payBtn.parentNode.replaceChild(newPayBtn, payBtn);
            newPayBtn.addEventListener('click', () => {
                closeModal('viewPartyModal');
                setTimeout(() => openPaymentModal(id), 200);
            });
        }

        const editBtn = $('#viewEditBtn');
        if (editBtn) {
            const newEditBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newEditBtn, editBtn);
            newEditBtn.addEventListener('click', () => {
                closeModal('viewPartyModal');
                setTimeout(() => openPartyModal(id), 200);
            });
        }

        const invBtn = $('#viewInvoicesBtn');
        if (invBtn) {
            const newInvBtn = invBtn.cloneNode(true);
            invBtn.parentNode.replaceChild(newInvBtn, invBtn);
            newInvBtn.addEventListener('click', () => {
                closeModal('viewPartyModal');
                setTimeout(() => openPartyInvoices(id), 200);
            });
        }

        openModal('viewPartyModal');
    }

    /* ============================================
       Party Invoices
       ============================================ */
    function openPartyInvoices(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;

        State.viewingId = id;
        State.invoicesFilter = 'all';

        const title = $('#partyInvoicesTitle');
        if (title) title.textContent = `فواتير - ${p.name}`;

        // Reset filter pills
        $$('.filter-pill').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));

        renderPartyInvoices(id);
        openModal('partyInvoicesModal');
    }

    function renderPartyInvoices(partyId) {
        const container = $('#partyInvoicesList');
        if (!container) return;

        let list = State.invoices.filter(inv => 
            inv.customer_id === partyId || inv.supplier_id === partyId
        );

        // Apply filter
        if (State.invoicesFilter === 'sale') {
            list = list.filter(i => i.type === 'sale');
        } else if (State.invoicesFilter === 'purchase') {
            list = list.filter(i => i.type === 'purchase');
        } else if (State.invoicesFilter === 'credit') {
            list = list.filter(i => i.status === 'credit' || i.status === 'partial');
        }

        // Sort by date descending
        list.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

        if (!list.length) {
            container.innerHTML = `
                <div class="party-invoices-empty">
                    <i class="fas fa-file-invoice"></i>
                    <p>لا توجد فواتير</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(inv => {
            const total = Number(inv.total) || 0;
            const isPurchase = inv.type === 'purchase';
            const statusClass = inv.status || 'paid';
            const statusLabel = {
                paid: 'مدفوعة',
                partial: 'جزئية',
                credit: 'آجلة',
                held: 'معلقة'
            }[inv.status] || 'مدفوعة';

            return `
                <div class="party-invoice-item" data-invoice-id="${inv.id}">
                    <div class="party-invoice-item__icon ${isPurchase ? 'purchase' : ''}">
                        <i class="fas fa-${isPurchase ? 'shopping-cart' : 'file-invoice'}"></i>
                    </div>
                    <div class="party-invoice-item__info">
                        <div class="party-invoice-item__number">${U.escape(inv.invoice_number || '---')}</div>
                        <div class="party-invoice-item__date">${U.date(inv.date || inv.created_at)}</div>
                    </div>
                    <div class="party-invoice-item__amount">${U.money(total)}</div>
                    <div class="party-invoice-item__status ${statusClass}">${statusLabel}</div>
                </div>
            `;
        }).join('');

        // Bind clicks
        container.querySelectorAll('.party-invoice-item').forEach(el => {
            el.addEventListener('click', () => {
                const invoiceId = el.dataset.invoiceId;
                openInvoiceInInvoicesPage(invoiceId);
            });
        });
    }

    function openInvoiceInInvoicesPage(invoiceId) {
        // Navigate to invoices page with the invoice parameter
        window.location.href = `./invoices.html?invoice=${invoiceId}`;
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
            btn.addEventListener('click', () => switchTab(btn.dataset.type));
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

        // Payment methods
        $$('.method-btn').forEach(btn => {
            btn.addEventListener('click', () => setPaymentMethod(btn.dataset.method));
        });

        // Save
        $('#savePartyBtn')?.addEventListener('click', saveParty);

        // Delete
        $('#confirmDeleteBtn')?.addEventListener('click', confirmDelete);

        // Filter pills (invoices)
        $$('.filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                State.invoicesFilter = pill.dataset.filter;
                $$('.filter-pill').forEach(b => b.classList.toggle('active', b === pill));
                if (State.viewingId) renderPartyInvoices(State.viewingId);
            });
        });

        // Go to invoices page
        $('#gotoInvoicesBtn')?.addEventListener('click', () => {
            if (State.viewingId) {
                const p = State.parties.find(x => x.id === State.viewingId);
                if (p) {
                    window.location.href = `./invoices.html?party=${State.viewingId}&type=${p.type}`;
                }
            }
        });

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
