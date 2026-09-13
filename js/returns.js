/* =============================================
   returns.js - Returns Page Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ State ============ */
    const State = {
        returns: [],
        filtered: [],
        invoices: [],
        parties: [],
        currentUser: null,
        currentType: 'sale', // 'sale' | 'purchase'
        viewingId: null,
        draft: {
            type: null,
            originalInvoice: null,
            items: [], // {productId, productName, unitName, maxQty, quantity, price, selected}
            reason: '',
            notes: '',
            refundMethod: 'cash'
        },
        filters: {
            search: '',
            date: '',
            sort: 'recent'
        }
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Returns init...');

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

        await loadAllData();
        hideLoadingBar();
        console.log('✅ Returns ready');
    }

    /* ============================================
       Load Data
       ============================================ */
    async function loadAllData() {
        showSkeleton();
        try {
            const [invoices, parties] = await Promise.all([
                DB.getInvoices(true).catch(() => []),
                DB.getParties(null, true).catch(() => [])
            ]);

            State.invoices = invoices || [];
            State.parties = parties || [];

            // Filter returns (type return_sale or return_purchase)
            State.returns = State.invoices.filter(inv =>
                inv.type === 'return_sale' || inv.type === 'return_purchase'
            );

            console.log('🔄 Returns:', State.returns.length);

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
        const saleReturns = State.returns.filter(r => r.type === 'return_sale').length;
        const purchaseReturns = State.returns.filter(r => r.type === 'return_purchase').length;

        const saleEl = $('#saleReturnsCount');
        const purchEl = $('#purchaseReturnsCount');
        if (saleEl) saleEl.textContent = saleReturns;
        if (purchEl) purchEl.textContent = purchaseReturns;
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

        applyFilters();
    }

    /* ============================================
       Summary
       ============================================ */
    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const type = State.currentType;
        const typeKey = type === 'sale' ? 'return_sale' : 'return_purchase';
        const list = State.returns.filter(r => r.type === typeKey);

        const total = list.reduce((s, i) => s + (Number(i.total) || 0), 0);

        const today = U.today();
        const todayTotal = list
            .filter(i => (i.date === today || (i.created_at || '').startsWith(today)))
            .reduce((s, i) => s + (Number(i.total) || 0), 0);

        const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
        const monthTotal = list
            .filter(i => {
                const d = i.date || (i.created_at || '').slice(0, 10);
                return d >= monthStart;
            })
            .reduce((s, i) => s + (Number(i.total) || 0), 0);

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon blue">
                    <i class="fas fa-list"></i>
                </div>
                <div class="summary-card__info">
                    <label>عدد المرتجعات</label>
                    <span>${list.length}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon orange">
                    <i class="fas fa-calendar-day"></i>
                </div>
                <div class="summary-card__info">
                    <label>مرتجعات اليوم</label>
                    <span>${U.money(todayTotal)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green">
                    <i class="fas fa-calendar-alt"></i>
                </div>
                <div class="summary-card__info">
                    <label>مرتجعات الشهر</label>
                    <span>${U.money(monthTotal)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon red">
                    <i class="fas fa-coins"></i>
                </div>
                <div class="summary-card__info">
                    <label>إجمالي المرتجعات</label>
                    <span>${U.money(total)}</span>
                </div>
            </div>
        `;
    }

    /* ============================================
       Filters
       ============================================ */
    function applyFilters() {
        const typeKey = State.currentType === 'sale' ? 'return_sale' : 'return_purchase';
        let list = State.returns.filter(r => r.type === typeKey);

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(inv =>
                (inv.invoice_number || '').toLowerCase().includes(term) ||
                (inv.customer_name || '').toLowerCase().includes(term) ||
                (inv.supplier_name || '').toLowerCase().includes(term)
            );
        }

        if (State.filters.date) {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            const filterDate = State.filters.date;

            list = list.filter(inv => {
                const invDate = inv.date || (inv.created_at || '').slice(0, 10);
                if (filterDate === 'today') return invDate === today;
                if (filterDate === 'week') {
                    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    return invDate >= weekAgo;
                }
                if (filterDate === 'month') {
                    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    return invDate >= monthAgo;
                }
                if (filterDate === 'year') return invDate.startsWith(now.getFullYear().toString());
                return true;
            });
        }

        const sort = State.filters.sort;
        list.sort((a, b) => {
            if (sort === 'recent') return new Date(b.created_at || b.date) - new Date(a.created_at || a.date);
            if (sort === 'oldest') return new Date(a.created_at || a.date) - new Date(b.created_at || b.date);
            if (sort === 'amount-desc') return (Number(b.total) || 0) - (Number(a.total) || 0);
            if (sort === 'amount') return (Number(a.total) || 0) - (Number(b.total) || 0);
            return 0;
        });

        State.filtered = list;
        renderReturns();
        updateCount();
    }

    function updateCount() {
        const el = $('#returnsCount');
        if (el) {
            el.textContent = State.filtered.length === 1 ? '1 مرتجع' : `${State.filtered.length} مرتجع`;
        }
    }

    /* ============================================
       Render Returns
       ============================================ */
    function renderReturns() {
        const gridView = $('#returnsGridView');
        const listView = $('#returnsListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            showEmpty(true);
            return;
        }

        showEmpty(false);

        if (gridView) {
            gridView.innerHTML = State.filtered.map(inv => renderReturnCard(inv)).join('');
            gridView.querySelectorAll('.return-item').forEach(el => {
                el.addEventListener('click', () => openReturnDetails(el.dataset.id));
            });
        }

        if (listView) {
            listView.innerHTML = State.filtered.map(inv => renderReturnListItem(inv)).join('');
            listView.querySelectorAll('.return-list-item').forEach(el => {
                el.addEventListener('click', () => openReturnDetails(el.dataset.id));
            });
        }
    }

    function renderReturnCard(inv) {
        const isPurchase = inv.type === 'return_purchase';
        const iconClass = isPurchase ? 'purchase' : '';
        const badgeLabel = isPurchase ? 'مرتجع شراء' : 'مرتجع بيع';
        const partyLabel = isPurchase ? 'المورد' : 'العميل';
        const partyName = inv.supplier_name || inv.customer_name || (isPurchase ? 'مورد' : 'عميل');

        return `
            <div class="return-item" data-id="${inv.id}">
                <div class="return-item__badge">${badgeLabel}</div>
                <div class="return-item__head">
                    <div>
                        <div class="return-item__number">${U.escape(inv.invoice_number || '---')}</div>
                        <div class="return-item__date">${U.date(inv.date || inv.created_at)}</div>
                    </div>
                    <div class="return-item__icon ${iconClass}">
                        <i class="fas fa-${isPurchase ? 'shopping-cart' : 'undo-alt'}"></i>
                    </div>
                </div>
                <div class="return-item__body">
                    <div class="return-item__field">
                        <label>${partyLabel}</label>
                        <span>${U.escape(partyName)}</span>
                    </div>
                    <div class="return-item__field">
                        <label>عدد الأصناف</label>
                        <span>${(inv.items || []).length}</span>
                    </div>
                    <div class="return-item__total">
                        <label>المبلغ المرتجع</label>
                        <strong>${U.money(Number(inv.total) || 0)}</strong>
                    </div>
                </div>
            </div>
        `;
    }

    function renderReturnListItem(inv) {
        const isPurchase = inv.type === 'return_purchase';
        const iconClass = isPurchase ? 'purchase' : '';
        const partyName = inv.supplier_name || inv.customer_name || '---';

        return `
            <div class="return-list-item" data-id="${inv.id}">
                <div class="return-list-item__icon ${iconClass}">
                    <i class="fas fa-${isPurchase ? 'shopping-cart' : 'undo-alt'}"></i>
                </div>
                <div class="return-list-item__info">
                    <div class="return-list-item__number">${U.escape(inv.invoice_number || '---')}</div>
                    <div class="return-list-item__customer">${U.escape(partyName)} · ${U.date(inv.date || inv.created_at)}</div>
                </div>
                <div class="return-list-item__right">
                    <div class="return-list-item__total">${U.money(Number(inv.total) || 0)}</div>
                </div>
            </div>
        `;
    }

    function showEmpty(show) {
        const el = $('#emptyState');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    /* ============================================
       Return Details
       ============================================ */
    async function openReturnDetails(id) {
        State.viewingId = id;
        let inv = State.returns.find(r => r.id === id);
        if (!inv) inv = await DB.getInvoiceById(id);
        if (!inv) {
            showToast('المرتجع غير موجود', 'error');
            return;
        }

        const content = $('#returnDetailsContent');
        if (!content) return;

        const isPurchase = inv.type === 'return_purchase';
        const shopName = U.ls.get('settings', {})?.shopName || 'حسابي';
        const partyName = inv.supplier_name || inv.customer_name || '---';
        const partyLabel = isPurchase ? 'المورد' : 'العميل';

        let itemsHtml = '';
        (inv.items || []).forEach(item => {
            const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
            itemsHtml += `
                <tr>
                    <td>${U.escape(item.productName || '')}<br>
                        <small style="color:#666;font-size:10px;">${U.escape(item.unitName || '')}</small>
                    </td>
                    <td style="text-align:center;">${item.quantity || 0}</td>
                    <td style="text-align:center;">${(Number(item.price) || 0).toFixed(2)}</td>
                    <td style="text-align:left;">${lineTotal.toFixed(2)}</td>
                </tr>
            `;
        });

        const total = Number(inv.total) || 0;

        content.innerHTML = `
            <div class="receipt-center" style="font-size:16px;">${U.escape(shopName)}</div>
            <div class="receipt-center" style="font-size:11px;color:#666;">${isPurchase ? 'مرتجع مشتريات' : 'مرتجع مبيعات'}</div>
            <hr>
            <div class="receipt-row"><span>رقم المرتجع:</span><strong>${U.escape(inv.invoice_number || '---')}</strong></div>
            <div class="receipt-row"><span>التاريخ:</span><span>${U.date(inv.date || inv.created_at)}</span></div>
            <div class="receipt-row"><span>${partyLabel}:</span><strong>${U.escape(partyName)}</strong></div>
            ${inv.notes ? `<div class="receipt-row"><span>السبب:</span><span>${U.escape(inv.notes)}</span></div>` : ''}
            <hr>
            <table class="receipt-table">
                <thead>
                    <tr>
                        <th>الصنف</th>
                        <th style="text-align:center;">كمية</th>
                        <th style="text-align:center;">سعر</th>
                        <th style="text-align:left;">إجمالي</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <hr>
            <div class="receipt-row" style="font-weight:bold;font-size:15px;"><span>الإجمالي المرتجع:</span><span>${total.toFixed(2)}</span></div>
            <hr>
            <div class="receipt-center" style="font-weight:bold;">شكراً لتعاملكم معنا</div>
        `;

        openModal('returnDetailsModal');
    }

    /* ============================================
       Print
       ============================================ */
    function printReturn() {
        const content = $('#returnDetailsContent')?.innerHTML;
        if (!content) return;

        const win = window.open('', '_blank', 'width=400,height=700');
        win.document.write(`
            <!DOCTYPE html>
            <html dir="rtl"><head><meta charset="UTF-8">
            <title>طباعة المرتجع</title>
            <style>
                body { font-family: 'Cairo', Arial, sans-serif; padding: 10px; font-size: 13px; max-width: 80mm; margin: 0 auto; }
                hr { border: none; border-top: 1px dashed #999; margin: 10px 0; }
                .receipt-row { display: flex; justify-content: space-between; margin: 3px 0; }
                .receipt-center { text-align: center; font-weight: 700; }
                .receipt-table { width: 100%; border-collapse: collapse; }
                .receipt-table th, .receipt-table td {
                    padding: 4px 2px; border-bottom: 1px dashed #ddd; font-size: 12px; text-align: right;
                }
                .receipt-table th:last-child, .receipt-table td:last-child { text-align: left; }
                @media print { body { padding: 0; } }
            </style>
            </head><body>${content}</body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    /* ============================================
       Select Original Invoice
       ============================================ */
    function openSelectInvoiceModal(type) {
        State.draft.type = type;

        const title = $('#selectInvoiceTitle');
        if (title) {
            title.textContent = type === 'sale' 
                ? 'اختر فاتورة البيع الأصلية' 
                : 'اختر فاتورة الشراء الأصلية';
        }

        $('#invoiceSearchInput').value = '';
        renderInvoiceOptions('');

        openModal('selectInvoiceModal');
        setTimeout(() => $('#invoiceSearchInput')?.focus(), 200);
    }

    function renderInvoiceOptions(term) {
        const container = $('#invoicesListModal');
        if (!container) return;

        const type = State.draft.type;
        const typeKey = type === 'sale' ? 'sale' : 'purchase';

        let list = State.invoices.filter(inv => 
            inv.type === typeKey && inv.status !== 'voided'
        );

        if (term) {
            const t = term.toLowerCase();
            list = list.filter(inv =>
                (inv.invoice_number || '').toLowerCase().includes(t) ||
                (inv.customer_name || '').toLowerCase().includes(t) ||
                (inv.supplier_name || '').toLowerCase().includes(t)
            );
        }

        // Sort by recent
        list.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));

        if (!list.length) {
            container.innerHTML = `
                <div class="no-invoices">
                    <i class="fas fa-inbox"></i>
                    <p>لا توجد فواتير متاحة</p>
                </div>
            `;
            return;
        }

        container.innerHTML = list.slice(0, 50).map(inv => {
            const partyName = inv.customer_name || inv.supplier_name || '---';
            const statusClass = inv.status || 'paid';
            const statusLabel = {
                paid: 'مدفوعة',
                partial: 'جزئية',
                credit: 'آجلة',
                held: 'معلقة'
            }[inv.status] || 'مدفوعة';

            return `
                <div class="invoice-option" data-id="${inv.id}">
                    <div class="invoice-option__info">
                        <div class="invoice-option__number">${U.escape(inv.invoice_number || '---')}</div>
                        <div class="invoice-option__meta">${U.escape(partyName)} · ${U.date(inv.date || inv.created_at)}</div>
                    </div>
                    <div class="invoice-option__amount">${U.money(Number(inv.total) || 0)}</div>
                    <div class="invoice-option__status ${statusClass}">${statusLabel}</div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.invoice-option').forEach(el => {
            el.addEventListener('click', () => {
                const inv = State.invoices.find(i => i.id === el.dataset.id);
                if (inv) selectOriginalInvoice(inv);
            });
        });
    }

    function selectOriginalInvoice(inv) {
        State.draft.originalInvoice = inv;

        // Check if already has returns
        const existingReturns = State.returns.filter(r => 
            r.original_invoice_id === inv.id
        );

        // Calculate already returned quantities
        const returnedQtys = new Map();
        existingReturns.forEach(ret => {
            (ret.items || []).forEach(item => {
                const key = `${item.productId}|${item.unitName}`;
                const current = returnedQtys.get(key) || 0;
                returnedQtys.set(key, current + (Number(item.quantity) || 0));
            });
        });

        // Build draft items from invoice items
        State.draft.items = (inv.items || []).map(item => {
            const key = `${item.productId}|${item.unitName}`;
            const alreadyReturned = returnedQtys.get(key) || 0;
            const maxReturnable = Math.max(0, (Number(item.quantity) || 0) - alreadyReturned);

            return {
                productId: item.productId,
                productName: item.productName || '',
                unitName: item.unitName || '',
                originalQty: Number(item.quantity) || 0,
                returnedQty: alreadyReturned,
                maxQty: maxReturnable,
                quantity: 0,
                price: Number(item.price) || 0,
                cost: Number(item.cost) || 0,
                selected: false
            };
        });

        closeModal('selectInvoiceModal');
        openCreateReturnModal();
    }

    /* ============================================
       Create Return Modal
       ============================================ */
    function openCreateReturnModal() {
        const inv = State.draft.originalInvoice;
        if (!inv) return;

        const title = $('#createReturnTitle');
        const type = State.draft.type;
        if (title) {
            title.textContent = type === 'sale' 
                ? 'إنشاء مرتجع مبيعات' 
                : 'إنشاء مرتجع مشتريات';
        }

        $('#returnType').value = type;
        $('#originalInvoiceId').value = inv.id;

        // Original invoice info
        const partyName = inv.customer_name || inv.supplier_name || '---';
        const partyLabel = type === 'sale' ? 'العميل' : 'المورد';
        $('#originalInvoiceInfo').innerHTML = `
            <div class="original-invoice-info__row">
                <span>رقم الفاتورة الأصلي:</span>
                <strong>${U.escape(inv.invoice_number || '---')}</strong>
            </div>
            <div class="original-invoice-info__row">
                <span>${partyLabel}:</span>
                <strong>${U.escape(partyName)}</strong>
            </div>
            <div class="original-invoice-info__row">
                <span>التاريخ:</span>
                <strong>${U.date(inv.date || inv.created_at)}</strong>
            </div>
            <div class="original-invoice-info__row">
                <span>الإجمالي الأصلي:</span>
                <strong>${U.money(Number(inv.total) || 0)}</strong>
            </div>
        `;

        // Reset fields
        $('#returnReason').value = '';
        $('#returnNotes').value = '';
        setRefundMethod('cash');

        renderReturnItems();
        updateReturnTotals();

        openModal('createReturnModal');
    }

    function renderReturnItems() {
        const container = $('#returnItems');
        if (!container) return;

        if (!State.draft.items.length) {
            container.innerHTML = `
                <div class="return-empty">
                    <i class="fas fa-box-open"></i>
                    <p>لا توجد أصناف قابلة للإرجاع</p>
                </div>
            `;
            return;
        }

        // Check if all items are fully returned
        const anyAvailable = State.draft.items.some(i => i.maxQty > 0);
        if (!anyAvailable) {
            container.innerHTML = `
                <div class="return-empty">
                    <i class="fas fa-check-circle"></i>
                    <p>تم إرجاع جميع الأصناف بالكامل</p>
                </div>
            `;
            return;
        }

        container.innerHTML = State.draft.items.map((item, idx) => {
            const isAvailable = item.maxQty > 0;
            const isSelected = item.selected;

            return `
                <div class="return-item-row ${isSelected ? 'selected' : ''} ${!isAvailable ? 'disabled' : ''}" data-idx="${idx}">
                    <div class="return-item-row__check">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} ${!isAvailable ? 'disabled' : ''} data-action="select" data-idx="${idx}">
                    </div>
                    <div class="return-item-row__main">
                        <div class="return-item-row__name">${U.escape(item.productName)}</div>
                        <div class="return-item-row__meta">
                            <span><i class="fas fa-cube"></i> ${U.escape(item.unitName)}</span>
                            <span><i class="fas fa-tag"></i> ${U.money(item.price)}</span>
                            ${item.returnedQty > 0 ? `<span style="color:var(--warning);"><i class="fas fa-history"></i> مرتجع سابقاً: ${item.returnedQty}</span>` : ''}
                        </div>
                    </div>
                    <div class="return-item-row__controls">
                        <div class="return-item-row__qty-label">الكمية المرتجعة</div>
                        <input type="number" class="return-item-row__qty" 
                            value="${item.quantity}" 
                            min="0" 
                            max="${item.maxQty}" 
                            step="0.001" 
                            ${!isSelected || !isAvailable ? 'disabled' : ''}
                            data-action="qty" 
                            data-idx="${idx}"
                            inputmode="decimal">
                        <div class="return-item-row__qty-hint">
                            الحد الأقصى: ${item.maxQty}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Bind actions
        container.querySelectorAll('[data-action="select"]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const item = State.draft.items[idx];
                if (!item) return;

                item.selected = e.target.checked;
                item.quantity = e.target.checked ? item.maxQty : 0;

                renderReturnItems();
                updateReturnTotals();
            });
        });

        container.querySelectorAll('[data-action="qty"]').forEach(input => {
            input.addEventListener('input', (e) => {
                const idx = +e.target.dataset.idx;
                const item = State.draft.items[idx];
                if (!item) return;

                let v = +e.target.value || 0;

                // Enforce limits
                if (v < 0) v = 0;
                if (v > item.maxQty) {
                    v = item.maxQty;
                    e.target.value = v;
                    showToast(`الحد الأقصى ${item.maxQty}`, 'warning');
                }

                item.quantity = v;
                updateReturnTotals();
            });
        });
    }

    function updateReturnTotals() {
        const selectedItems = State.draft.items.filter(i => i.selected && i.quantity > 0);
        const totalQty = selectedItems.reduce((s, i) => s + i.quantity, 0);
        const totalAmount = selectedItems.reduce((s, i) => s + (i.quantity * i.price), 0);

        $('#returnItemsCount').textContent = selectedItems.length;
        $('#returnTotalQty').textContent = U.round(totalQty, 3);
        $('#returnTotalAmount').textContent = U.money(totalAmount);

        return { selectedItems, totalQty, totalAmount };
    }

    function setRefundMethod(method) {
        State.draft.refundMethod = method;
        $$('#createReturnModal .method-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.method === method);
        });
        $('#refundMethod').value = method;
    }

    /* ============================================
       Save Return
       ============================================ */
    async function saveReturn() {
        const inv = State.draft.originalInvoice;
        if (!inv) {
            showToast('لم يتم اختيار الفاتورة الأصلية', 'warning');
            return;
        }

        const { selectedItems, totalQty, totalAmount } = updateReturnTotals();

        if (!selectedItems.length) {
            showToast('اختر صنفاً واحداً على الأقل للإرجاع', 'warning');
            return;
        }

        const reason = $('#returnReason').value;
        const notes = $('#returnNotes').value.trim();
        const refundMethod = State.draft.refundMethod;
        const type = State.draft.type;

        const btn = $('#saveReturnBtn');
        if (btn) btn.disabled = true;

        try {
            const returnNumber = await DB.generateInvoiceNumber();

            // Build return invoice
            const returnInvoice = {
                id: U.uuid(),
                invoice_number: returnNumber,
                type: type === 'sale' ? 'return_sale' : 'return_purchase',
                date: U.today(),
                original_invoice_id: inv.id,
                customer_id: type === 'sale' ? inv.customer_id : null,
                customer_name: type === 'sale' ? (inv.customer_name || 'نقدي') : null,
                supplier_id: type === 'purchase' ? inv.supplier_id : null,
                supplier_name: type === 'purchase' ? (inv.supplier_name || null) : null,
                items: selectedItems.map(item => ({
                    productId: item.productId,
                    productName: item.productName,
                    unitName: item.unitName,
                    quantity: item.quantity,
                    price: item.price,
                    cost: item.cost,
                    factor: item.factor || 1
                })),
                subtotal: totalAmount,
                discount: 0,
                total: totalAmount,
                paid: refundMethod === 'cash' ? totalAmount : 0,
                remaining: 0,
                payment_method: refundMethod === 'cash' ? 'cash' : (refundMethod === 'balance' ? 'credit' : 'none'),
                status: 'paid',
                notes: `${reason ? 'السبب: ' + reason + ' - ' : ''}${notes}`.trim()
            };

            console.log('💾 Saving return:', returnInvoice);

            const result = await DB.createInvoice(returnInvoice);
            if (!result.success) throw new Error('فشل حفظ المرتجع');

            // ✅ تحديث المخزون ورصيد العميل/المورد حسب نوع المرتجع
            if (type === 'sale') {
                // مرتجع بيع: إعادة المخزون (يزيد)
                await addStockToItems(selectedItems);
                
                // إذا كان استرداد نقدي: رصيد العميل ما يتغير
                // إذا كان رصيد: يُضاف للرصيد الدائن (له رصيد)
                if (refundMethod === 'balance' && inv.customer_id) {
                    const cust = State.parties.find(p => p.id === inv.customer_id);
                    if (cust) {
                        const newBal = U.round((Number(cust.balance) || 0) + totalAmount);
                        await DB.updatePartyBalance(cust.id, newBal);
                    }
                }
            } else {
                // مرتجع مشتريات: خصم المخزون (يقل)
                await deductStockFromItems(selectedItems);
                
                // نستحق أقل من المورد
                if (inv.supplier_id) {
                    const sup = State.parties.find(p => p.id === inv.supplier_id);
                    if (sup) {
                        const newBal = U.round((Number(sup.balance) || 0) + totalAmount);
                        await DB.updatePartyBalance(sup.id, newBal);
                    }
                }
            }

            showToast('تم حفظ المرتجع بنجاح', 'success');
            closeModal('createReturnModal');

            // Reload
            await loadAllData();

        } catch (e) {
            console.error('Save return error:', e);
            showToast(e.message || 'فشل حفظ المرتجع', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Stock Helpers
       ============================================ */
    async function addStockToItems(items) {
        const products = await DB.getProducts(true) || [];
        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            if (!product?.units?.length) continue;

            const baseUnit = product.units[0];
            const unit = product.units.find(u => u.name === item.unitName) || baseUnit;
            const factor = unit.factor || 1;
            const addQty = item.unitName === baseUnit.name 
                ? item.quantity 
                : item.quantity * factor;

            baseUnit.stock = (Number(baseUnit.stock) || 0) + addQty;

            await DB.saveProduct(product);
        }
    }

    async function deductStockFromItems(items) {
        const products = await DB.getProducts(true) || [];
        for (const item of items) {
            const product = products.find(p => p.id === item.productId);
            if (!product?.units?.length) continue;

            const baseUnit = product.units[0];
            const unit = product.units.find(u => u.name === item.unitName) || baseUnit;
            const factor = unit.factor || 1;
            const deductQty = item.unitName === baseUnit.name 
                ? item.quantity 
                : item.quantity * factor;

            baseUnit.stock = Math.max(0, (Number(baseUnit.stock) || 0) - deductQty);

            await DB.saveProduct(product);
        }
    }

    /* ============================================
       Export
       ============================================ */
    function exportReturns() {
        if (!State.filtered.length) {
            showToast('لا توجد مرتجعات للتصدير', 'info');
            return;
        }

        const rows = [['رقم المرتجع', 'التاريخ', 'النوع', 'العميل/المورد', 'الإجمالي']];
        State.filtered.forEach(inv => {
            rows.push([
                inv.invoice_number || '',
                inv.date || (inv.created_at || '').slice(0, 10),
                inv.type === 'return_sale' ? 'مرتجع بيع' : 'مرتجع شراء',
                inv.customer_name || inv.supplier_name || '',
                Number(inv.total) || 0
            ]);
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
        a.download = `returns-${U.today()}.csv`;
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

    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#returnsGridView');
        const listView = $('#returnsListView');
        const empty = $('#emptyState');

        if (skeleton) {
            skeleton.innerHTML = Array(6).fill(`
                <div class="skeleton-card">
                    <div style="display:flex;justify-content:space-between;margin-bottom:16px;">
                        <div style="flex:1;">
                            <div style="height:16px;background:var(--bg-sunken);border-radius:6px;margin-bottom:8px;"></div>
                            <div style="height:12px;background:var(--bg-sunken);border-radius:6px;width:60%;"></div>
                        </div>
                        <div style="width:44px;height:44px;background:var(--bg-sunken);border-radius:12px;"></div>
                    </div>
                    <div style="height:60px;background:var(--bg-sunken);border-radius:10px;"></div>
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
        const gridView = $('#returnsGridView');
        const listView = $('#returnsListView');
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
            await loadAllData();
            showToast('تم التحديث', 'success');
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportReturns);

        // Tabs
        $$('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchTab(btn.dataset.type);
                renderSummary();
            });
        });

        // New return buttons
        $('#newSaleReturnBtn')?.addEventListener('click', () => openSelectInvoiceModal('sale'));
        $('#newPurchaseReturnBtn')?.addEventListener('click', () => openSelectInvoiceModal('purchase'));
        $('#fabAddBtn')?.addEventListener('click', () => openSelectInvoiceModal(State.currentType));

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
        $('#dateFilter')?.addEventListener('change', (e) => {
            State.filters.date = e.target.value;
            applyFilters();
        });
        $('#sortFilter')?.addEventListener('change', (e) => {
            State.filters.sort = e.target.value;
            applyFilters();
        });

        // Invoice search inside modal
        $('#invoiceSearchInput')?.addEventListener('input', U.debounce((e) => {
            renderInvoiceOptions(e.target.value.trim());
        }, 200));

        // Refund method
        $$('#createReturnModal .method-btn').forEach(btn => {
            btn.addEventListener('click', () => setRefundMethod(btn.dataset.method));
        });

        // Save return
        $('#saveReturnBtn')?.addEventListener('click', saveReturn);

        // Details modal
        $('#closeDetailsModalBtn')?.addEventListener('click', () => closeModal('returnDetailsModal'));
        $('#closeDetailsModalBtn2')?.addEventListener('click', () => closeModal('returnDetailsModal'));
        $('#printReturnBtn')?.addEventListener('click', printReturn);

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
