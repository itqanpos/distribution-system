/* =============================================
   customers.js - Customers Page Logic
   Version: 3.1.0

   Changelog من v3.0:
   - [CUST-1] احترام type='both' — لا إخفاء ولا تحويل
   - [CUST-2] تحميل كسول للفواتير (lazy) بدل التحميل الأولي
   - [CUST-3] فحص تسجيل دخول مزدوج (_saving)
   - [CUST-4] Auth.onChange — توجيه عند الخروج من تبويب آخر
   - [CUST-5] showToast يفضّل window.Toast
   - [CUST-6] refreshBtn محمي
   - [CUST-7] translateError للأخطاء
   - [CUST-8] console gated by DEBUG
   - [CUST-9] عرض المرتجعات في فواتير العميل
   - [CUST-10] تحذير عند تحصيل يتجاوز الدين
   - [CUST-11] عملة من APP_CONFIG
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    const DEBUG = window.APP_CONFIG?.DEBUG === true ||
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1';
    const log = (...a) => { if (DEBUG) console.log(...a); };

    const DB_ERROR_MESSAGES = {
        '23505': 'قيمة مكررة',
        '23514': 'قيمة خارج النطاق المسموح',
        '23503': 'مرجع غير موجود',
        'P0001': 'السجل غير موجود',
        'P0003': 'هذه العملية تتطلب صلاحيات مدير',
        'P0004': 'بيانات غير صالحة',
        'P0006': 'المبلغ غير صحيح',
        'NO_TENANT': 'لا يوجد مستأجر مرتبط بالحساب',
        '42501': 'ليس لديك صلاحية لهذه العملية'
    };

    function translateError(err) {
        const code = err?.code || '';
        if (DB_ERROR_MESSAGES[code]) return DB_ERROR_MESSAGES[code];
        return err?.message || 'فشل العملية';
    }

    /* ============ State ============ */
    const State = {
        customers: [],
        filtered: [],
        invoices: [],
        currentUser: null,
        editingId: null,
        deletingId: null,
        viewingId: null,
        collectCustomerId: null,
        invoicesFilter: 'all',
        _saving: false,
        _refreshing: false,
        _invoicesLoaded: false,
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
        log('🚀 Customers init...');

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

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        // ✅ [CUST-4] مراقبة الجلسة
        Auth.onChange((u) => {
            if (!u && State.currentUser) {
                State.currentUser = null;
                location.replace('./index.html');
            } else if (u) {
                State.currentUser = u;
            }
        });

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadData();
        hideLoadingBar();
        log('✅ Customers ready');
    }

    /* ============================================
       Load Data — ✅ [CUST-2] بدون فواتير (lazy)
       ============================================ */
    async function loadData() {
        showSkeleton();
        try {
            // ✅ [CUST-1] احتفظ بالعملاء والمزدوجين (both)
            const raw = await DB.getParties('customer', true).catch(() => []);
            State.customers = (raw || []).filter(c =>
                c.type === 'customer' || c.type === 'both'
            );

            log('👥 Customers:', State.customers.length);

            renderSummary();
            applyFilters();
            return true;
        } catch (e) {
            console.error('Load error:', e);
            showToast(translateError(e) || 'تعذر تحميل البيانات', 'error');
            showEmpty(true);
            return false;
        } finally {
            hideSkeleton();
        }
    }

    // ✅ [CUST-2] تحميل الفواتير عند الحاجة فقط
    async function ensureInvoicesLoaded() {
        if (State._invoicesLoaded) return State.invoices;
        try {
            State.invoices = await DB.getInvoices(false).catch(() => []) || [];
            State._invoicesLoaded = true;
            return State.invoices;
        } catch (e) {
            console.warn('Failed to load invoices', e);
            return State.invoices;
        }
    }

    /* ============================================
       Summary
       ============================================ */
    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const totalCount = State.customers.length;

        let totalDebit = 0, totalCredit = 0, debitCount = 0;
        for (const c of State.customers) {
            const bal = Number(c.balance) || 0;
            if (bal < 0) {
                totalDebit += Math.abs(bal);
                debitCount++;
            } else if (bal > 0) {
                totalCredit += bal;
            }
        }

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon blue">
                    <i class="fas fa-users"></i>
                </div>
                <div class="summary-card__info">
                    <label>إجمالي العملاء</label>
                    <span>${totalCount}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon red">
                    <i class="fas fa-arrow-down"></i>
                </div>
                <div class="summary-card__info">
                    <label>مدينون لنا</label>
                    <span>${U.money(totalDebit)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green">
                    <i class="fas fa-arrow-up"></i>
                </div>
                <div class="summary-card__info">
                    <label>دائنون لنا</label>
                    <span>${U.money(totalCredit)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon purple">
                    <i class="fas fa-user-clock"></i>
                </div>
                <div class="summary-card__info">
                    <label>عملاء عليهم دين</label>
                    <span>${debitCount}</span>
                </div>
            </div>
        `;
    }

    /* ============================================
       Filters & Sorting
       ============================================ */
    function applyFilters() {
        let list = [...State.customers];

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(c =>
                (c.name || '').toLowerCase().includes(term) ||
                (c.phone || '').includes(term) ||
                (c.email || '').toLowerCase().includes(term)
            );
        }

        if (State.filters.balance) {
            list = list.filter(c => {
                const bal = c.balance || 0;
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
            if (sort === 'recent') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
            return 0;
        });

        State.filtered = list;
        renderCustomers();
        updateCount();
    }

    function updateCount() {
        const el = $('#customersCount');
        if (el) {
            const total = State.filtered.length;
            el.textContent = total === 1 ? '1 عميل' : `${total} عميل`;
        }
    }

    /* ============================================
       Render Customers
       ============================================ */
    function renderCustomers() {
        const gridView = $('#customersGridView');
        const listView = $('#customersListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            showEmpty(true);
            return;
        }

        showEmpty(false);

        if (gridView) {
            gridView.innerHTML = State.filtered.map(c => renderCustomerCard(c)).join('');
            gridView.querySelectorAll('.customer-item').forEach(el => bindCustomerActions(el));
        }

        if (listView) {
            listView.innerHTML = State.filtered.map(c => renderCustomerListItem(c)).join('');
            listView.querySelectorAll('.customer-list-item').forEach(el => bindCustomerActions(el));
        }
    }

    function renderCustomerCard(c) {
        const bal = Number(c.balance) || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? 'مدين' : bal > 0 ? 'دائن' : 'لا رصيد';
        const balValue = U.money(Math.abs(bal));
        const initials = (c.name || '?').trim()[0] || '?';
        const isBoth = c.type === 'both';

        return `
            <div class="customer-item" data-id="${U.escape(c.id)}">
                <div class="customer-item__actions">
                    <button class="icon-action success" data-action="collect" title="تحصيل" type="button">
                        <i class="fas fa-hand-holding-usd"></i>
                    </button>
                    <button class="icon-action" data-action="edit" title="تعديل" type="button">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-action danger" data-action="delete" title="حذف" type="button">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="customer-item__head">
                    <div class="customer-item__avatar">${U.escape(initials)}</div>
                    <div class="customer-item__title">
                        <div class="customer-item__name">
                            ${U.escape(c.name || '')}
                            ${isBoth ? '<span style="font-size:10px;padding:2px 6px;background:var(--primary);color:#fff;border-radius:6px;margin-right:6px;">مورد أيضاً</span>' : ''}
                        </div>
                        ${c.phone ? `<div class="customer-item__phone"><i class="fas fa-phone"></i>${U.escape(c.phone)}</div>` : ''}
                    </div>
                </div>
                <div class="customer-item__body">
                    <div class="customer-item__field">
                        <label>البريد</label>
                        <span>${U.escape(c.email || '-')}</span>
                    </div>
                    <div class="customer-item__field">
                        <label>حد الدين</label>
                        <span>${c.credit_limit ? U.money(c.credit_limit) : '-'}</span>
                    </div>
                    <div class="customer-item__balance ${balClass}">
                        <span>${balLabel}</span>
                        <strong>${balValue}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    function renderCustomerListItem(c) {
        const bal = Number(c.balance) || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? `${U.moneyRaw(-bal)}-` : bal > 0 ? `+${U.moneyRaw(bal)}` : '0';
        const initials = (c.name || '?').trim()[0] || '?';

        return `
            <div class="customer-list-item" data-id="${U.escape(c.id)}">
                <div class="customer-list-item__avatar">${U.escape(initials)}</div>
                <div class="customer-list-item__info">
                    <div class="customer-list-item__name">${U.escape(c.name || '')}</div>
                    <div class="customer-list-item__phone">${U.escape(c.phone || c.email || '-')}</div>
                </div>
                <div class="customer-list-item__balance ${balClass}">${balLabel}</div>
            </div>
        `;
    }

    function bindCustomerActions(el) {
        const id = el.dataset.id;

        el.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;

            if (action === 'edit') {
                e.stopPropagation();
                openCustomerModal(id);
            } else if (action === 'delete') {
                e.stopPropagation();
                openDeleteConfirm(id);
            } else if (action === 'collect') {
                e.stopPropagation();
                openCollectModal(id);
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
       Add/Edit Customer — ✅ [CUST-1] احترام type
       ============================================ */
    function openCustomerModal(id = null) {
        State.editingId = id;

        const title = $('#customerModalTitle');
        const form = $('#customerForm');
        if (form) form.reset();

        if (id) {
            const c = State.customers.find(x => x.id === id);
            if (!c) return;

            if (title) title.textContent = 'تعديل بيانات العميل';
            $('#customerId').value = id;
            $('#customerName').value = c.name || '';
            $('#customerPhone').value = c.phone || '';
            $('#customerEmail').value = c.email || '';
            $('#customerAddress').value = c.address || '';
            $('#customerBalance').value = c.balance || 0;
            $('#customerCreditLimit').value = c.credit_limit || 0;
            $('#customerNotes').value = c.notes || '';
        } else {
            if (title) title.textContent = 'إضافة عميل جديد';
            $('#customerId').value = '';
            $('#customerBalance').value = 0;
            $('#customerCreditLimit').value = 0;
        }

        openModal('customerModal');
        setTimeout(() => $('#customerName')?.focus(), 200);
    }

    async function saveCustomer() {
        if (State._saving) return;

        const name = $('#customerName')?.value.trim();
        if (!name) {
            showToast('الاسم مطلوب', 'warning');
            return;
        }

        const phone = $('#customerPhone')?.value.trim() || '';
        const email = $('#customerEmail')?.value.trim() || '';

        if (email && (!email.includes('@') || !email.includes('.'))) {
            showToast('صيغة البريد الإلكتروني غير صحيحة', 'warning');
            return;
        }

        // ✅ [CUST-1] احترم type الأصلي عند التعديل
        const existing = State.editingId
            ? State.customers.find(x => x.id === State.editingId)
            : null;
        const originalType = existing?.type || 'customer';
        const type = (originalType === 'both') ? 'both' : 'customer';

        State._saving = true;
        const saveBtn = $('#saveCustomerBtn');
        if (saveBtn) saveBtn.disabled = true;

        try {
            const data = {
                id: State.editingId || undefined,
                name,
                type,
                phone,
                email,
                address: $('#customerAddress')?.value.trim() || '',
                balance: +$('#customerBalance')?.value || 0,
                credit_limit: +$('#customerCreditLimit')?.value || 0,
                notes: $('#customerNotes')?.value.trim() || ''
            };

            await DB.saveParty(data);

            showToast(State.editingId ? 'تم تحديث بيانات العميل' : 'تم إضافة العميل', 'success');
            closeModal('customerModal');

            await loadData();
        } catch (e) {
            console.error('Save error:', e);
            showToast(translateError(e), 'error');
        } finally {
            State._saving = false;
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    /* ============================================
       View Customer
       ============================================ */
    function openViewModal(id) {
        const c = State.customers.find(x => x.id === id);
        if (!c) return;

        State.viewingId = id;

        const body = $('#viewCustomerBody');
        if (!body) return;

        const bal = Number(c.balance) || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? 'عليه دين' : bal > 0 ? 'له رصيد' : 'لا رصيد';
        const initials = (c.name || '?').trim()[0] || '?';
        const isBoth = c.type === 'both';
        const typeLabel = isBoth ? 'عميل ومورد' : 'عميل';

        body.innerHTML = `
            <div class="view-customer__header">
                <div class="view-customer__avatar">${U.escape(initials)}</div>
                <div class="view-customer__title">
                    <h3>${U.escape(c.name || '')}</h3>
                    <p>${U.escape(typeLabel)} · ${U.date(c.created_at || new Date())}</p>
                </div>
            </div>

            <div class="view-customer__balance ${balClass}">
                <label>${balLabel}</label>
                <strong>${U.money(Math.abs(bal))}</strong>
            </div>

            <div class="view-customer__grid">
                ${c.phone ? `
                    <div class="view-customer__item">
                        <label>الهاتف</label>
                        <span><a href="tel:${U.escape(c.phone)}">${U.escape(c.phone)}</a></span>
                    </div>
                ` : ''}
                ${c.email ? `
                    <div class="view-customer__item">
                        <label>البريد</label>
                        <span><a href="mailto:${U.escape(c.email)}">${U.escape(c.email)}</a></span>
                    </div>
                ` : ''}
                ${c.credit_limit ? `
                    <div class="view-customer__item">
                        <label>حد الدين</label>
                        <span>${U.money(c.credit_limit)}</span>
                    </div>
                ` : ''}
                ${c.address ? `
                    <div class="view-customer__item full">
                        <label>العنوان</label>
                        <span>${U.escape(c.address)}</span>
                    </div>
                ` : ''}
                ${c.notes ? `
                    <div class="view-customer__item full">
                        <label>ملاحظات</label>
                        <span>${U.escape(c.notes)}</span>
                    </div>
                ` : ''}
            </div>
        `;

        rebindButton('#viewCollectBtn', () => {
            closeModal('viewCustomerModal');
            setTimeout(() => openCollectModal(id), 200);
        });

        rebindButton('#viewEditBtn', () => {
            closeModal('viewCustomerModal');
            setTimeout(() => openCustomerModal(id), 200);
        });

        rebindButton('#viewInvoicesBtn', () => {
            closeModal('viewCustomerModal');
            setTimeout(() => openCustomerInvoices(id), 200);
        });

        openModal('viewCustomerModal');
    }

    function rebindButton(selector, handler) {
        const btn = $(selector);
        if (!btn) return;
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', handler);
    }

    /* ============================================
       Collect — ✅ [CUST-10] تحذير عند التجاوز
       ============================================ */
    function openCollectModal(id) {
        const c = State.customers.find(x => x.id === id);
        if (!c) return;

        State.collectCustomerId = id;

        $('#collectCustomerId').value = id;
        $('#collectAvatar').textContent = (c.name || 'A')[0].toUpperCase();
        $('#collectCustomerName').textContent = c.name;

        const bal = Number(c.balance) || 0;
        const balLabel = bal < 0 ? `عليه: ${U.money(-bal)}` : bal > 0 ? `له: ${U.money(bal)}` : 'لا رصيد';
        $('#collectCurrentBalance').textContent = balLabel;

        $('#collectAmount').value = bal < 0 ? Math.abs(bal) : '';
        $('#collectReference').value = '';
        $('#collectNotes').value = '';
        setCollectMethod('cash');

        const quick = $('#collectQuickAmounts');
        const absBal = Math.abs(bal);
        if (absBal > 0) {
            const opts = [
                Math.round(absBal),
                Math.round(absBal / 2),
                100,
                500
            ];
            const uniq = [...new Set(opts.filter(v => v > 0))].slice(0, 4);
            quick.innerHTML = uniq.map(v => `<button type="button" data-amount="${v}">${v}</button>`).join('');
            quick.querySelectorAll('button').forEach(b => {
                b.addEventListener('click', () => {
                    $('#collectAmount').value = b.dataset.amount;
                    updateCollectPreview();
                });
            });
        } else {
            quick.innerHTML = '';
        }

        updateCollectPreview();

        const amountInput = $('#collectAmount');
        if (amountInput) {
            const newInput = amountInput.cloneNode(true);
            amountInput.parentNode.replaceChild(newInput, amountInput);
            newInput.addEventListener('input', updateCollectPreview);
        }

        openModal('collectModal');
        setTimeout(() => $('#collectAmount')?.focus(), 200);
    }

    function setCollectMethod(method) {
        $$('#collectModal .method-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.method === method);
        });
        $('#collectMethod').value = method;
    }

    function updateCollectPreview() {
        const c = State.customers.find(x => x.id === State.collectCustomerId);
        if (!c) return;

        const amount = Number($('#collectAmount')?.value) || 0;
        const currentBal = Number(c.balance) || 0;

        const newBal = U.round(currentBal + amount);

        const el = $('#collectNewBalance');
        const box = $('#collectPreview');
        const warningEl = $('#collectWarning');

        if (el) el.textContent = U.money(Math.abs(newBal));
        if (box) {
            box.classList.remove('positive', 'negative');
            if (newBal < 0) box.classList.add('negative');
            else if (newBal > 0) box.classList.add('positive');
        }

        // ✅ [CUST-10] تحذير عند تجاوز الدين
        if (warningEl) {
            const willOvershoot = currentBal < 0 && amount > Math.abs(currentBal) + 0.001;
            if (willOvershoot) {
                const over = amount - Math.abs(currentBal);
                warningEl.textContent = `تحصيل ${U.money(over)} زيادة عن الدين — سيصبح للعميل رصيد دائن.`;
                warningEl.style.display = 'block';
            } else {
                warningEl.style.display = 'none';
            }
        }
    }

    async function confirmCollect() {
        const customerId = $('#collectCustomerId').value;
        const amount = +$('#collectAmount').value || 0;
        const method = $('#collectMethod').value || 'cash';
        const reference = $('#collectReference').value.trim();
        const notes = $('#collectNotes').value.trim();

        if (amount <= 0) {
            showToast('أدخل مبلغاً صحيحاً', 'warning');
            return;
        }

        const c = State.customers.find(x => x.id === customerId);
        const currentBal = c ? (Number(c.balance) || 0) : 0;

        // ✅ تأكيد عند التجاوز
        if (currentBal < 0 && amount > Math.abs(currentBal) + 0.001) {
            const over = amount - Math.abs(currentBal);
            if (!confirm(`المبلغ يتجاوز الدين بـ ${U.money(over)}. سيصبح للعميل رصيد دائن. متابعة؟`)) {
                return;
            }
        }

        const btn = $('#confirmCollectBtn');
        if (btn) btn.disabled = true;

        try {
            await DB.addPayment({
                party_id: customerId,
                type: 'payment_in',
                amount,
                payment_method: method,
                reference,
                notes
            });

            showToast('تم التحصيل بنجاح', 'success');
            closeModal('collectModal');
            await loadData();
        } catch (e) {
            console.error('Collect error:', e);
            showToast(translateError(e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Customer Invoices — ✅ [CUST-2, CUST-9]
       ============================================ */
    async function openCustomerInvoices(id) {
        const c = State.customers.find(x => x.id === id);
        if (!c) return;

        State.viewingId = id;
        State.invoicesFilter = 'all';

        const title = $('#customerInvoicesTitle');
        if (title) title.textContent = `فواتير - ${c.name}`;

        $$('.filter-pill').forEach(b => b.classList.toggle('active', b.dataset.filter === 'all'));

        // ✅ [CUST-2] تحميل كسول
        const container = $('#customerInvoicesList');
        if (container) {
            container.innerHTML = `
                <div class="invoices-empty">
                    <i class="fas fa-spinner fa-spin"></i>
                    <p>جاري التحميل...</p>
                </div>
            `;
        }

        await ensureInvoicesLoaded();
        renderCustomerInvoices(id);
        openModal('customerInvoicesModal');
    }

    function renderCustomerInvoices(customerId) {
        const container = $('#customerInvoicesList');
        if (!container) return;

        // ✅ [CUST-9] يشمل البيع والمرتجعات
        let list = State.invoices.filter(inv =>
            inv.customer_id === customerId &&
            (inv.type === 'sale' || inv.type === 'return_sale') &&
            inv.status !== 'voided'
        );

        if (State.invoicesFilter !== 'all') {
            list = list.filter(i => i.status === State.invoicesFilter);
        }

        list.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

        if (!list.length) {
            container.innerHTML = `
                <div class="invoices-empty">
                    <i class="fas fa-file-invoice"></i>
                    <p>لا توجد فواتير</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.map(inv => {
            const isReturn = inv.type === 'return_sale';
            const total = Number(inv.total) || 0;
            const statusClass = inv.status || 'paid';
            const statusLabel = {
                paid: 'مدفوعة',
                partial: 'جزئية',
                credit: 'آجلة',
                held: 'معلقة'
            }[inv.status] || 'مدفوعة';

            return `
                <div class="customer-invoice-item" data-invoice-id="${U.escape(inv.id)}">
                    <div class="customer-invoice-item__icon ${isReturn ? 'return' : ''}">
                        <i class="fas fa-${isReturn ? 'undo-alt' : 'file-invoice'}"></i>
                    </div>
                    <div class="customer-invoice-item__info">
                        <div class="customer-invoice-item__number">
                            ${U.escape(inv.invoice_number || '---')}
                            ${isReturn ? '<span style="font-size:10px;color:var(--warning);font-weight:800;"> (مرتجع)</span>' : ''}
                        </div>
                        <div class="customer-invoice-item__date">${U.date(inv.date || inv.created_at)}</div>
                    </div>
                    <div class="customer-invoice-item__amount">${U.money(total)}</div>
                    <div class="customer-invoice-item__status ${statusClass}">${statusLabel}</div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.customer-invoice-item').forEach(el => {
            el.addEventListener('click', () => {
                window.location.href = `./invoices.html?invoice=${encodeURIComponent(el.dataset.invoiceId)}`;
            });
        });
    }

    /* ============================================
       Delete Customer
       ============================================ */
    function openDeleteConfirm(id) {
        const c = State.customers.find(x => x.id === id);
        if (!c) return;

        State.deletingId = id;
        const nameEl = $('#deleteCustomerName');
        if (nameEl) nameEl.textContent = c.name;

        openModal('confirmDeleteModal');
    }

    async function confirmDelete() {
        if (!State.deletingId) return;

        const btn = $('#confirmDeleteBtn');
        if (btn) btn.disabled = true;

        try {
            await DB.deleteParty(State.deletingId);
            showToast('تم حذف العميل', 'success');
            closeModal('confirmDeleteModal');
            State.deletingId = null;
            State._invoicesLoaded = false;
            await loadData();
        } catch (e) {
            console.error('Delete error:', e);
            showToast(translateError(e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Export — يستخدم State.filtered
       ============================================ */
    function exportCustomers() {
        if (!State.filtered.length) {
            showToast('لا توجد بيانات للتصدير', 'info');
            return;
        }

        const rows = [['الاسم', 'الهاتف', 'البريد', 'العنوان', 'الرصيد', 'حد الدين']];

        State.filtered.forEach(c => {
            rows.push([
                c.name || '',
                c.phone || '',
                c.email || '',
                c.address || '',
                c.balance || 0,
                c.credit_limit || 0
            ]);
        });

        const csv = rows.map(row =>
            row.map(cell => {
                const s = String(cell ?? '');
                return (s.includes(',') || s.includes('"') || s.includes('\n'))
                    ? '"' + s.replace(/"/g, '""') + '"'
                    : s;
            }).join(',')
        ).join('\r\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers-${U.today()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);

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
        const icon = btn.querySelector('i');
        if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    /* ============================================
       Skeleton
       ============================================ */
    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#customersGridView');
        const listView = $('#customersListView');
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
        const gridView = $('#customersGridView');
        const listView = $('#customersListView');

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
       Toast — يفضل window.Toast
       ============================================ */
    function showToast(msg, type = 'info') {
        if (window.Toast && typeof window.Toast.show === 'function') {
            try { window.Toast.show(msg, type); return; } catch (e) { /* fallthrough */ }
        }

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

        // ✅ [CUST-6] Refresh محمي
        const refreshBtn = $('#refreshBtn');
        refreshBtn?.addEventListener('click', async () => {
            if (State._refreshing) return;
            State._refreshing = true;
            refreshBtn.disabled = true;
            try {
                DB.clearCache();
                State._invoicesLoaded = false;
                const ok = await loadData();
                if (ok) showToast('تم التحديث', 'success');
                else showToast('فشل التحديث، تحقق من الاتصال', 'error');
            } finally {
                State._refreshing = false;
                refreshBtn.disabled = false;
            }
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportCustomers);

        // Add customer
        $('#addCustomerBtn')?.addEventListener('click', () => openCustomerModal());
        $('#fabAddBtn')?.addEventListener('click', () => openCustomerModal());

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
            const clearBtn = $('#clearSearchBtn');
            if (clearBtn) clearBtn.style.display = 'none';
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

        // Save
        $('#saveCustomerBtn')?.addEventListener('click', saveCustomer);

        // Delete
        $('#confirmDeleteBtn')?.addEventListener('click', confirmDelete);

        // Collect
        $$('#collectModal .method-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                setCollectMethod(btn.dataset.method);
            });
        });
        $('#confirmCollectBtn')?.addEventListener('click', confirmCollect);

        // Invoices filter pills
        $$('.filter-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                State.invoicesFilter = pill.dataset.filter;
                $$('.filter-pill').forEach(b => b.classList.toggle('active', b === pill));
                if (State.viewingId) renderCustomerInvoices(State.viewingId);
            });
        });

        // Go to all invoices
        $('#gotoAllInvoicesBtn')?.addEventListener('click', () => {
            if (State.viewingId) {
                window.location.href = `./invoices.html?party=${encodeURIComponent(State.viewingId)}`;
            }
        });

        // Modals close
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
