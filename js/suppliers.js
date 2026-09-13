/* =============================================
   suppliers.js - Suppliers Page Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    const State = {
        parties: [],
        filtered: [],
        invoices: [],
        currentUser: null,
        editingId: null,
        deletingId: null,
        viewingId: null,
        filters: { search: '', balance: '', sort: 'name' }
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Suppliers init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (!window.DB?.client) return;

        await new Promise(r => setTimeout(r, 300));

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) { return; }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadData();
        hideLoadingBar();
    }

    async function loadData() {
        showSkeleton();
        try {
            const [parties, invoices] = await Promise.all([
                DB.getParties('supplier', true).catch(() => []),
                DB.getInvoices(true).catch(() => [])
            ]);

            State.parties = parties || [];
            State.invoices = invoices || [];

            renderSummary();
            applyFilters();
        } catch (e) {
            showToast('تعذر تحميل البيانات', 'error');
        } finally {
            hideSkeleton();
        }
    }

    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const totalDebit = State.parties.filter(p => (p.balance || 0) < 0)
            .reduce((s, p) => s + Math.abs(p.balance || 0), 0);
        const totalCredit = State.parties.filter(p => (p.balance || 0) > 0)
            .reduce((s, p) => s + (p.balance || 0), 0);

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon blue"><i class="fas fa-truck"></i></div>
                <div class="summary-card__info">
                    <label>عدد الموردين</label>
                    <span>${State.parties.length}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon red"><i class="fas fa-arrow-up"></i></div>
                <div class="summary-card__info">
                    <label>مستحق لهم</label>
                    <span>${U.money(totalCredit)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green"><i class="fas fa-arrow-down"></i></div>
                <div class="summary-card__info">
                    <label>مدفوع مقدماً</label>
                    <span>${U.money(totalDebit)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon purple"><i class="fas fa-balance-scale"></i></div>
                <div class="summary-card__info">
                    <label>الصافي</label>
                    <span>${U.money(totalCredit - totalDebit)}</span>
                </div>
            </div>
        `;
    }

    function applyFilters() {
        let list = [...State.parties];

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.phone || '').includes(term)
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
        render();
        updateCount();
    }

    function updateCount() {
        const el = $('#partiesCount');
        if (el) el.textContent = State.filtered.length === 1 ? '1 مورد' : `${State.filtered.length} مورد`;
    }

    function render() {
        const gridView = $('#partiesGridView');
        const listView = $('#partiesListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            $('#emptyState').style.display = 'block';
            return;
        }

        $('#emptyState').style.display = 'none';

        if (gridView) {
            gridView.innerHTML = State.filtered.map(p => renderCard(p)).join('');
            gridView.querySelectorAll('.party-item').forEach(el => bindActions(el));
        }
        if (listView) {
            listView.innerHTML = State.filtered.map(p => renderListItem(p)).join('');
            listView.querySelectorAll('.party-list-item').forEach(el => bindActions(el));
        }
    }

    function renderCard(p) {
        const bal = p.balance || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? `لنا عنده: ${U.money(-bal)}` : bal > 0 ? `له عندنا: ${U.money(bal)}` : 'لا رصيد';
        const initials = (p.name || '?').trim()[0] || '?';

        return `
            <div class="party-item" data-id="${p.id}">
                <div class="party-item__actions">
                    <button class="icon-action" data-action="payment" title="سداد"><i class="fas fa-hand-holding-usd"></i></button>
                    <button class="icon-action" data-action="edit" title="تعديل"><i class="fas fa-edit"></i></button>
                    <button class="icon-action danger" data-action="delete" title="حذف"><i class="fas fa-trash"></i></button>
                </div>
                <div class="party-item__head">
                    <div class="party-item__avatar supplier">${U.escape(initials)}</div>
                    <div class="party-item__title">
                        <div class="party-item__name">${U.escape(p.name || '')}</div>
                        <span class="party-item__type supplier">مورد</span>
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

    function renderListItem(p) {
        const bal = p.balance || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? `${U.moneyRaw(-bal)}-` : bal > 0 ? `+${U.moneyRaw(bal)}` : '0';
        const initials = (p.name || '?').trim()[0] || '?';

        return `
            <div class="party-list-item" data-id="${p.id}">
                <div class="party-list-item__avatar supplier">${U.escape(initials)}</div>
                <div class="party-list-item__info">
                    <div class="party-list-item__name">${U.escape(p.name || '')}</div>
                    <div class="party-list-item__meta">${U.escape(p.phone || p.email || '-')}</div>
                </div>
                <div class="party-list-item__balance ${balClass}">${balLabel}</div>
            </div>
        `;
    }

    function bindActions(el) {
        const id = el.dataset.id;
        el.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'edit') { e.stopPropagation(); openPartyModal(id); }
            else if (action === 'delete') { e.stopPropagation(); openDeleteConfirm(id); }
            else if (action === 'payment') { e.stopPropagation(); openPaymentModal(id); }
            else { openViewModal(id); }
        });
    }

    /* ============================================
       Add/Edit Modal
       ============================================ */
    function openPartyModal(id = null) {
        State.editingId = id;
        const form = $('#partyForm');
        if (form) form.reset();

        if (id) {
            const p = State.parties.find(x => x.id === id);
            if (!p) return;
            $('#partyModalTitle').textContent = 'تعديل بيانات المورد';
            $('#partyId').value = id;
            $('#partyName').value = p.name || '';
            $('#partyPhone').value = p.phone || '';
            $('#partyEmail').value = p.email || '';
            $('#partyAddress').value = p.address || '';
            $('#partyBalance').value = p.balance || 0;
            $('#partyNotes').value = p.notes || '';
        } else {
            $('#partyModalTitle').textContent = 'إضافة مورد جديد';
            $('#partyId').value = '';
            $('#partyBalance').value = 0;
        }

        openModal('partyModal');
        setTimeout(() => $('#partyName')?.focus(), 200);
    }

    async function saveParty() {
        const name = $('#partyName')?.value.trim();
        if (!name) { showToast('الاسم مطلوب', 'warning'); return; }

        const btn = $('#savePartyBtn');
        if (btn) btn.disabled = true;

        try {
            const data = {
                id: State.editingId || undefined,
                name,
                type: 'supplier',
                phone: $('#partyPhone')?.value.trim() || '',
                email: $('#partyEmail')?.value.trim() || '',
                address: $('#partyAddress')?.value.trim() || '',
                balance: +$('#partyBalance')?.value || 0,
                notes: $('#partyNotes')?.value.trim() || ''
            };

            await DB.saveParty(data);
            showToast(State.editingId ? 'تم التحديث' : 'تمت الإضافة', 'success');
            closeModal('partyModal');
            await loadData();
        } catch (e) {
            showToast(e.message || 'فشل الحفظ', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       View
       ============================================ */
    function openViewModal(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;
        State.viewingId = id;

        const bal = p.balance || 0;
        const balClass = bal < 0 ? 'debit' : bal > 0 ? 'credit' : 'zero';
        const balLabel = bal < 0 ? 'لنا عنده' : bal > 0 ? 'له عندنا' : 'لا رصيد';
        const initials = (p.name || '?').trim()[0] || '?';

        $('#viewPartyBody').innerHTML = `
            <div class="view-party__header">
                <div class="view-party__avatar supplier">${U.escape(initials)}</div>
                <div class="view-party__title">
                    <h3>${U.escape(p.name || '')}</h3>
                    <p>مورد · ${U.date(p.created_at || new Date())}</p>
                </div>
            </div>
            <div class="view-party__balance ${balClass}">
                <label>${balLabel}</label>
                <strong>${U.money(Math.abs(bal))}</strong>
            </div>
            <div class="view-party__grid">
                ${p.phone ? `<div class="view-party__item"><label>الهاتف</label><span><a href="tel:${U.escape(p.phone)}">${U.escape(p.phone)}</a></span></div>` : ''}
                ${p.email ? `<div class="view-party__item"><label>البريد</label><span><a href="mailto:${U.escape(p.email)}">${U.escape(p.email)}</a></span></div>` : ''}
                ${p.address ? `<div class="view-party__item" style="grid-column:1/-1;"><label>العنوان</label><span>${U.escape(p.address)}</span></div>` : ''}
                ${p.notes ? `<div class="view-party__item" style="grid-column:1/-1;"><label>ملاحظات</label><span>${U.escape(p.notes)}</span></div>` : ''}
            </div>
        `;

        // Bind buttons
        ['viewPaymentBtn', 'viewEditBtn', 'viewInvoicesBtn'].forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (!btn) return;
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
        });

        $('#viewPaymentBtn')?.addEventListener('click', () => {
            closeModal('viewPartyModal');
            setTimeout(() => openPaymentModal(id), 200);
        });
        $('#viewEditBtn')?.addEventListener('click', () => {
            closeModal('viewPartyModal');
            setTimeout(() => openPartyModal(id), 200);
        });
        $('#viewInvoicesBtn')?.addEventListener('click', () => {
            closeModal('viewPartyModal');
            setTimeout(() => openPartyInvoices(id), 200);
        });

        openModal('viewPartyModal');
    }

    /* ============================================
       Payment
       ============================================ */
    function openPaymentModal(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;

        $('#paymentPartyId').value = id;
        $('#paymentAvatar').textContent = (p.name || 'S')[0].toUpperCase();
        $('#paymentPartyName').textContent = p.name;

        const bal = p.balance || 0;
        const balLabel = bal < 0 ? `لنا عنده: ${U.money(-bal)}` : bal > 0 ? `له عندنا: ${U.money(bal)}` : 'لا رصيد';
        $('#paymentCurrentBalance').textContent = balLabel;

        $('#paymentAmount').value = '';
        $('#paymentReference').value = '';
        $('#paymentNotesInput').value = '';
        setPaymentMethod('cash');

        // Quick amounts
        const opts = [];
        const absBal = Math.abs(bal);
        if (absBal > 0) {
            opts.push(Math.round(absBal));
            if (absBal >= 100) { opts.push(Math.round(absBal / 2)); opts.push(100); }
            opts.push(500);
        }
        const uniq = [...new Set(opts.filter(v => v > 0))].slice(0, 4);
        $('#quickAmounts').innerHTML = uniq.map(v => `<button type="button" data-amount="${v}">${v}</button>`).join('');
        $('#quickAmounts').querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => {
                $('#paymentAmount').value = b.dataset.amount;
                updatePreview();
            });
        });

        updatePreview();
        openModal('paymentModal');
        setTimeout(() => $('#paymentAmount')?.focus(), 200);

        // Bind amount input
        const amountInput = $('#paymentAmount');
        const newInput = amountInput.cloneNode(true);
        amountInput.parentNode.replaceChild(newInput, amountInput);
        newInput.addEventListener('input', updatePreview);
    }

    function setPaymentMethod(method) {
        $$('#paymentModal .method-btn').forEach(b => b.classList.toggle('active', b.dataset.method === method));
        $('#paymentMethod').value = method;
    }

    function updatePreview() {
        const p = State.parties.find(x => x.id === $('#paymentPartyId').value);
        if (!p) return;

        const amount = +$('#paymentAmount').value || 0;
        const bal = Number(p.balance) || 0;
        // سداد لمورد: يُخصم من الرصيد (له عندنا يقل، أو لنا عنده يزيد)
        const newBal = bal - amount;

        const el = $('#newBalanceDisplay');
        if (el) el.textContent = U.money(Math.abs(newBal));

        const box = $('#balancePreview');
        if (box) {
            box.classList.remove('positive', 'negative');
            if (newBal < 0) box.classList.add('negative');
            else if (newBal > 0) box.classList.add('positive');
        }
    }

    async function submitPayment() {
        const partyId = $('#paymentPartyId').value;
        const amount = +$('#paymentAmount').value || 0;
        const method = $('#paymentMethod').value;
        const reference = $('#paymentReference').value.trim();
        const notes = $('#paymentNotesInput').value.trim();

        if (!partyId || amount <= 0) { showToast('أدخل مبلغاً صحيحاً', 'warning'); return; }

        const btn = $('#confirmPaymentBtn');
        if (btn) btn.disabled = true;

        try {
            await DB.addPayment({
                party_id: partyId,
                type: 'payment_out',
                amount,
                payment_method: method,
                reference,
                notes
            });
            showToast('تم السداد بنجاح', 'success');
            closeModal('paymentModal');
            await loadData();
        } catch (e) {
            showToast(e.message || 'فشل السداد', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Party Invoices
       ============================================ */
    function openPartyInvoices(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;

        $('#partyInvoicesTitle').textContent = `فواتير - ${p.name}`;

        const partyInvoices = State.invoices.filter(inv =>
            inv.supplier_id === id
        ).sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at));

        const container = $('#partyInvoicesList');

        if (!partyInvoices.length) {
            container.innerHTML = `
                <div class="party-invoices-empty">
                    <i class="fas fa-file-invoice"></i>
                    <p>لا توجد فواتير</p>
                </div>
            `;
        } else {
            container.innerHTML = partyInvoices.map(inv => {
                const statusClass = inv.status || 'paid';
                const statusLabel = { paid: 'مدفوعة', partial: 'جزئية', credit: 'آجلة', held: 'معلقة' }[inv.status] || 'مدفوعة';
                const isPurchase = inv.type === 'purchase';
                const iconClass = isPurchase ? 'purchase' : '';

                return `
                    <div class="party-invoice-item" data-id="${inv.id}" style="cursor:pointer;">
                        <div class="party-invoice-item__icon ${iconClass}">
                            <i class="fas fa-${isPurchase ? 'shopping-cart' : 'file-invoice'}"></i>
                        </div>
                        <div class="party-invoice-item__info">
                            <div class="party-invoice-item__number">${U.escape(inv.invoice_number || '---')}</div>
                            <div class="party-invoice-item__date">${U.date(inv.date || inv.created_at)}</div>
                        </div>
                        <div class="party-invoice-item__amount">${U.money(Number(inv.total) || 0)}</div>
                        <div class="party-invoice-item__status ${statusClass}">${statusLabel}</div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.party-invoice-item').forEach(el => {
                el.addEventListener('click', () => {
                    window.location.href = `./purchases.html?invoice=${el.dataset.id}`;
                });
            });
        }

        openModal('partyInvoicesModal');
    }

    /* ============================================
       Delete
       ============================================ */
    function openDeleteConfirm(id) {
        const p = State.parties.find(x => x.id === id);
        if (!p) return;
        State.deletingId = id;
        $('#deletePartyName').textContent = p.name;
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
            showToast('فشل الحذف', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Export
       ============================================ */
    function exportSuppliers() {
        if (!State.filtered.length) { showToast('لا توجد بيانات', 'info'); return; }

        const rows = [['الاسم', 'الهاتف', 'البريد', 'العنوان', 'الرصيد']];
        State.filtered.forEach(p => {
            rows.push([p.name || '', p.phone || '', p.email || '', p.address || '', p.balance || 0]);
        });

        const csv = rows.map(r => r.map(c => {
            const s = String(c ?? '');
            return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(',')).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `suppliers-${U.today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('تم التصدير', 'success');
    }

    /* ============================================
       Helpers
       ============================================ */
    function updateUserUI() {
        if (State.currentUser) {
            const avatar = $('#userAvatar');
            const name = $('#sidebarUserName');
            if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
            if (name) name.textContent = State.currentUser.fullName || 'مدير';
        }
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

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#partiesGridView');
        const listView = $('#partiesListView');
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

    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }
        const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 12px 22px; background: ${colors[type] || colors.info}; color: #fff;
            border-radius: 999px; font-weight: 700; font-size: 14px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 10px;
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

    function bindEvents() {
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

        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            DB.clearCache();
            await loadData();
            showToast('تم التحديث', 'success');
        });

        $('#exportBtn')?.addEventListener('click', exportSuppliers);
        $('#addPartyBtn')?.addEventListener('click', () => openPartyModal());
        $('#fabAddBtn')?.addEventListener('click', () => openPartyModal());

        $('#searchInput')?.addEventListener('input', U.debounce((e) => {
            State.filters.search = e.target.value.trim();
            const clearBtn = $('#clearSearchBtn');
            if (clearBtn) clearBtn.style.display = e.target.value ? 'grid' : 'none';
            applyFilters();
        }, 200));

        $('#clearSearchBtn')?.addEventListener('click', () => {
            $('#searchInput').value = '';
            State.filters.search = '';
            $('#clearSearchBtn').style.display = 'none';
            applyFilters();
        });

        $('#balanceFilter')?.addEventListener('change', (e) => {
            State.filters.balance = e.target.value;
            applyFilters();
        });
        $('#sortFilter')?.addEventListener('change', (e) => {
            State.filters.sort = e.target.value;
            applyFilters();
        });

        $('#savePartyBtn')?.addEventListener('click', saveParty);
        $('#confirmDeleteBtn')?.addEventListener('click', confirmDelete);
        $('#confirmPaymentBtn')?.addEventListener('click', submitPayment);

        $$('#paymentModal .method-btn').forEach(btn => {
            btn.addEventListener('click', () => setPaymentMethod(btn.dataset.method));
        });

        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
            }
        });

        window.addEventListener('online', () => { updateConnStatus(); showToast('عاد الاتصال', 'success'); });
        window.addEventListener('offline', () => { updateConnStatus(); showToast('انقطع الاتصال', 'warning'); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
