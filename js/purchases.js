/* =============================================
   purchases.js - Purchases Page Logic
   Version: 2.1.0

   Changelog من v2.0:
   - [PUR-1] حذف مضاعفة المخزون — createInvoice يكفي
   - [PUR-2] حذف DB.updatePartyBalance — غير موجود، و RPC يتولى الأمر
   - [PUR-3] updateProductPrices: تحديث cost/price فقط (بدون stock)
   - [PUR-4] confirmPaySupplier: لا UPDATE مباشر، لا window.localDB
   - [PUR-5] تواريخ محلية في renderSummary + applyFilters
   - [PUR-6] getPurchases بدل getInvoices(true)
   - [PUR-7] Auth.onChange — توجيه عند الخروج من تبويب آخر
   - [PUR-8] _saving guard على savePurchase
   - [PUR-9] _refreshing guard على refreshBtn
   - [PUR-10] showToast يفضل window.Toast
   - [PUR-11] translateError للأخطاء
   - [PUR-12] console gated by DEBUG
   - [PUR-13] عملة من APP_CONFIG
   - [PUR-14] escape لـ id في data-attributes
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);

    const DEBUG = window.APP_CONFIG?.DEBUG === true ||
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1';
    const log = (...a) => { if (DEBUG) console.log(...a); };
    const CURRENCY = (window.APP_CONFIG && window.APP_CONFIG.CURRENCY) || 'ج.م';

    const DB_ERROR_MESSAGES = {
        '23505': 'قيمة مكررة (رقم الفاتورة أو الباركود)',
        '23514': 'قيمة خارج النطاق المسموح',
        '23503': 'مرجع غير موجود',
        'P0001': 'السجل غير موجود',
        'P0002': 'المخزون غير كافٍ',
        'P0003': 'هذه العملية تتطلب صلاحيات مدير',
        'P0004': 'بيانات غير صالحة',
        'P0005': 'عنصر غير صالح في الفاتورة',
        'P0006': 'عدم تطابق في الحسابات المالية',
        'NO_TENANT': 'لا يوجد مستأجر مرتبط بالحساب',
        '42501': 'ليس لديك صلاحية لهذه العملية'
    };

    function translateError(err) {
        const code = err?.code || '';
        if (DB_ERROR_MESSAGES[code]) return DB_ERROR_MESSAGES[code];
        return err?.message || 'فشل العملية';
    }

    // ✅ [PUR-5] تاريخ محلي
    function localDateStr(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function invoiceLocalDate(inv) {
        if (!inv) return '';
        if (inv.date) return inv.date;
        if (inv.created_at) return localDateStr(new Date(inv.created_at));
        return '';
    }

    /* ============ State ============ */
    const State = {
        purchases: [],
        filtered: [],
        suppliers: [],
        products: [],
        currentUser: null,
        viewingId: null,
        editingId: null,
        _saving: false,
        _refreshing: false,
        _paySupplierId: null,
        _payInvoiceId: null,
        _payInvoiceRemaining: 0,
        draft: {
            supplierId: null,
            items: [],
            discount: 0,
            discountType: 'amount',
            notes: ''
        },
        selectedProduct: null,
        selectedUnit: null,
        filters: {
            search: '',
            status: '',
            date: '',
            sort: 'recent'
        }
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        log('🚀 Purchases init...');

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

        // ✅ [PUR-7]
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

        await loadAllData();
        hideLoadingBar();
        log('✅ Purchases ready');
    }

    /* ============================================
       Load Data — ✅ [PUR-6] getPurchases بدل getInvoices(true)
       ============================================ */
    async function loadAllData() {
        showSkeleton();
        try {
            const [suppliers, products, purchases] = await Promise.all([
                DB.getParties('supplier', true).catch(() => []),
                DB.getProducts(true).catch(() => []),
                DB.getPurchases(true).catch(() => [])
            ]);

            State.suppliers = suppliers || [];
            State.products = products || [];
            State.purchases = purchases || [];

            log('🚚 Suppliers:', State.suppliers.length);
            log('📦 Products:', State.products.length);
            log('🛒 Purchases:', State.purchases.length);

            renderSummary();
            applyFilters();

            handleUrlParams();
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

    function handleUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const id = params.get('invoice');
        if (id) {
            setTimeout(() => openPurchaseDetails(id), 200);
            window.history.replaceState({}, '', './purchases.html');
        }
    }

    /* ============================================
       Summary — ✅ [PUR-5] تواريخ محلية
       ============================================ */
    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const now = new Date();
        const today = localDateStr(now);
        const monthStart = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));

        let totalPurchases = 0;
        let todayPurchases = 0;
        let monthPurchases = 0;
        let creditTotal = 0;

        for (const inv of State.purchases) {
            if (!inv) continue;
            if (inv.status === 'voided') continue;

            const total = Number(inv.total) || 0;
            const remaining = Number(inv.remaining) || 0;
            const invDate = invoiceLocalDate(inv);

            totalPurchases += total;
            if (invDate === today) todayPurchases += total;
            if (invDate >= monthStart) monthPurchases += total;

            if ((inv.status === 'credit' || inv.status === 'partial') && remaining > 0) {
                creditTotal += remaining;
            }
        }

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon blue"><i class="fas fa-shopping-cart"></i></div>
                <div class="summary-card__info">
                    <label>إجمالي المشتريات</label>
                    <span>${U.money(totalPurchases)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon orange"><i class="fas fa-calendar-day"></i></div>
                <div class="summary-card__info">
                    <label>مشتريات اليوم</label>
                    <span>${U.money(todayPurchases)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green"><i class="fas fa-calendar-alt"></i></div>
                <div class="summary-card__info">
                    <label>مشتريات الشهر</label>
                    <span>${U.money(monthPurchases)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon red"><i class="fas fa-exclamation-circle"></i></div>
                <div class="summary-card__info">
                    <label>مستحق للموردين</label>
                    <span>${U.money(creditTotal)}</span>
                </div>
            </div>
        `;
    }

    /* ============================================
       Filters — ✅ [PUR-5] تواريخ محلية
       ============================================ */
    function applyFilters() {
        let list = [...State.purchases];

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(inv =>
                (inv.invoice_number || '').toLowerCase().includes(term) ||
                (inv.supplier_name || '').toLowerCase().includes(term)
            );
        }

        if (State.filters.status) {
            list = list.filter(inv => inv.status === State.filters.status);
        }

        if (State.filters.date) {
            const now = new Date();
            const today = localDateStr(now);
            const filterDate = State.filters.date;
            const weekAgo = localDateStr(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
            const monthAgo = localDateStr(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));
            const yearStr = String(now.getFullYear());

            list = list.filter(inv => {
                const invDate = invoiceLocalDate(inv);
                if (!invDate) return false;
                if (filterDate === 'today') return invDate === today;
                if (filterDate === 'week') return invDate >= weekAgo;
                if (filterDate === 'month') return invDate >= monthAgo;
                if (filterDate === 'year') return invDate.startsWith(yearStr);
                return true;
            });
        }

        const sort = State.filters.sort;
        list.sort((a, b) => {
            const aTime = new Date(a.created_at || a.date || 0).getTime();
            const bTime = new Date(b.created_at || b.date || 0).getTime();
            if (sort === 'recent') return bTime - aTime;
            if (sort === 'oldest') return aTime - bTime;
            if (sort === 'amount-desc') return (Number(b.total) || 0) - (Number(a.total) || 0);
            if (sort === 'amount') return (Number(a.total) || 0) - (Number(b.total) || 0);
            return 0;
        });

        State.filtered = list;
        renderPurchases();
        updateCount();
    }

    function updateCount() {
        const el = $('#purchasesCount');
        if (el) {
            const n = State.filtered.length;
            el.textContent = n === 1 ? '1 فاتورة شراء' : `${n} فاتورة شراء`;
        }
    }

    /* ============================================
       Render List
       ============================================ */
    function renderPurchases() {
        const gridView = $('#purchasesGridView');
        const listView = $('#purchasesListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            showEmpty(true);
            return;
        }

        showEmpty(false);

        if (gridView) {
            gridView.innerHTML = State.filtered.map(inv => renderPurchaseCard(inv)).join('');
            gridView.querySelectorAll('.purchase-item').forEach(el => {
                el.addEventListener('click', () => openPurchaseDetails(el.dataset.id));
            });
        }

        if (listView) {
            listView.innerHTML = State.filtered.map(inv => renderPurchaseListItem(inv)).join('');
            listView.querySelectorAll('.purchase-list-item').forEach(el => {
                el.addEventListener('click', () => openPurchaseDetails(el.dataset.id));
            });
        }
    }

    function renderPurchaseCard(inv) {
        const statusClass = inv.status || 'paid';
        const statusLabel = getStatusLabel(inv.status);
        const total = Number(inv.total) || 0;
        const paid = Number(inv.paid) || 0;
        const remaining = Number(inv.remaining) || 0;
        const isVoided = inv.status === 'voided';

        return `
            <div class="purchase-item" data-id="${U.escape(inv.id)}" ${isVoided ? 'style="opacity:0.65;"' : ''}>
                <div class="purchase-item__status ${statusClass}">${statusLabel}</div>
                <div class="purchase-item__head">
                    <div>
                        <div class="purchase-item__number">${U.escape(inv.invoice_number || '---')}</div>
                        <div class="purchase-item__date">${U.date(inv.date || inv.created_at)}</div>
                    </div>
                    <div class="purchase-item__icon"><i class="fas fa-shopping-cart"></i></div>
                </div>
                <div class="purchase-item__body">
                    <div class="purchase-item__field">
                        <label>المورد</label>
                        <span>${U.escape(inv.supplier_name || 'غير محدد')}</span>
                    </div>
                    <div class="purchase-item__field">
                        <label>المدفوع</label>
                        <span>${U.money(paid)}</span>
                    </div>
                    ${remaining > 0 ? `
                        <div class="purchase-item__total" style="background:rgba(239,68,68,0.1);">
                            <label style="color:var(--danger);">المتبقي</label>
                            <strong style="color:var(--danger);">${U.money(remaining)}</strong>
                        </div>
                    ` : `
                        <div class="purchase-item__total">
                            <label>الإجمالي</label>
                            <strong>${U.money(total)}</strong>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    function renderPurchaseListItem(inv) {
        const statusClass = inv.status || 'paid';
        const statusLabel = getStatusLabel(inv.status);
        const isVoided = inv.status === 'voided';

        return `
            <div class="purchase-list-item" data-id="${U.escape(inv.id)}" ${isVoided ? 'style="opacity:0.65;"' : ''}>
                <div class="purchase-list-item__icon"><i class="fas fa-shopping-cart"></i></div>
                <div class="purchase-list-item__info">
                    <div class="purchase-list-item__number">${U.escape(inv.invoice_number || '---')}</div>
                    <div class="purchase-list-item__supplier">${U.escape(inv.supplier_name || 'غير محدد')} · ${U.date(inv.date || inv.created_at)}</div>
                </div>
                <div class="purchase-list-item__right">
                    <div class="purchase-list-item__total">${U.money(Number(inv.total) || 0)}</div>
                    <div class="purchase-list-item__status ${statusClass}">${statusLabel}</div>
                </div>
            </div>
        `;
    }

    function getStatusLabel(status) {
        return {
            paid: 'مدفوعة',
            partial: 'جزئية',
            credit: 'آجلة',
            voided: 'ملغية'
        }[status] || 'مدفوعة';
    }

    function showEmpty(show) {
        const el = $('#emptyState');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    /* ============================================
       Details
       ============================================ */
    async function openPurchaseDetails(id) {
        State.viewingId = id;
        let inv = State.purchases.find(p => p.id === id);
        if (!inv) inv = await DB.getInvoiceById(id);
        if (!inv) {
            showToast('الفاتورة غير موجودة', 'error');
            return;
        }

        const content = $('#purchaseDetailsContent');
        if (!content) return;

        const settings = U.ls.get('settings', {}) || {};
        const shopName = settings.shopName || 'حسابي';

        let itemsHtml = '';
        (inv.items || []).forEach(item => {
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 0;
            const lineTotal = price * qty;
            itemsHtml += `
                <tr>
                    <td>${U.escape(item.productName || '')}<br>
                        <small style="color:#666;font-size:10px;">${U.escape(item.unitName || '')}</small>
                    </td>
                    <td style="text-align:center;">${qty}</td>
                    <td style="text-align:center;">${price.toFixed(2)}</td>
                    <td style="text-align:left;">${lineTotal.toFixed(2)}</td>
                </tr>
            `;
        });

        const total = Number(inv.total) || 0;
        const subtotal = Number(inv.subtotal) || 0;
        const discount = Number(inv.discount) || 0;
        const paid = Number(inv.paid) || 0;
        const remaining = Number(inv.remaining) || 0;

        content.innerHTML = `
            <div class="receipt-center" style="font-size:16px;">${U.escape(shopName)}</div>
            <div class="receipt-center" style="font-size:11px;color:#666;">فاتورة مشتريات</div>
            <hr>
            <div class="receipt-row"><span>رقم الفاتورة:</span><strong>${U.escape(inv.invoice_number || '---')}</strong></div>
            <div class="receipt-row"><span>التاريخ:</span><span>${U.date(inv.date || inv.created_at)}</span></div>
            <div class="receipt-row"><span>المورد:</span><strong>${U.escape(inv.supplier_name || 'غير محدد')}</strong></div>
            <div class="receipt-row"><span>الحالة:</span><strong>${getStatusLabel(inv.status)}</strong></div>
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
                <tbody>${itemsHtml || '<tr><td colspan="4" style="text-align:center;">لا توجد عناصر</td></tr>'}</tbody>
            </table>
            <hr>
            <div class="receipt-row"><span>الإجمالي:</span><span>${subtotal.toFixed(2)}</span></div>
            ${discount > 0 ? `<div class="receipt-row"><span>الخصم:</span><span>-${discount.toFixed(2)}</span></div>` : ''}
            <div class="receipt-row" style="font-weight:bold;font-size:15px;"><span>الصافي:</span><span>${total.toFixed(2)}</span></div>
            <hr>
            <div class="receipt-row"><span>المدفوع:</span><span>${paid.toFixed(2)}</span></div>
            ${remaining > 0 ? `<div class="receipt-row" style="color:red;"><span>المتبقي:</span><span>${remaining.toFixed(2)}</span></div>` : ''}
            ${inv.notes ? `<hr><div style="font-size:12px;"><strong>ملاحظات:</strong> ${U.escape(inv.notes)}</div>` : ''}
        `;

        const payBtn = $('#payPurchaseBtn');
        if (payBtn) {
            payBtn.style.display = (remaining > 0 && inv.status !== 'voided') ? 'flex' : 'none';
        }

        openModal('purchaseDetailsModal');
    }

    /* ============================================
       Print
       ============================================ */
    function printPurchase() {
        const content = $('#purchaseDetailsContent')?.innerHTML;
        if (!content) return;

        const win = window.open('', '_blank', 'width=400,height=700');
        if (!win) {
            showToast('تعذر فتح نافذة الطباعة', 'warning');
            return;
        }
        win.document.write(`<!DOCTYPE html>
            <html dir="rtl"><head><meta charset="UTF-8">
            <title>طباعة فاتورة المشتريات</title>
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
            </head><body>${content}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    /* ============================================
       Open New Purchase Modal
       ============================================ */
    function openPurchaseModal(id = null) {
        State.editingId = id;
        State.draft = {
            supplierId: null,
            items: [],
            discount: 0,
            discountType: 'amount',
            notes: ''
        };

        const title = $('#purchaseModalTitle');
        if (title) title.textContent = id ? 'تعديل الفاتورة' : 'فاتورة شراء جديدة';

        $('#purchaseId').value = id || '';
        $('#purchaseSupplierId').value = '';
        $('#supplierSearchInput').value = '';
        $('#selectedSupplier').style.display = 'none';
        $('#purchaseDiscount').value = '0';
        $('#purchaseDiscountType').value = 'amount';
        $('#purchaseNotes').value = '';

        if (id) {
            const inv = State.purchases.find(p => p.id === id);
            if (inv) {
                State.draft.supplierId = inv.supplier_id;
                State.draft.items = (inv.items || []).map(i => ({ ...i }));
                State.draft.discount = Number(inv.discount) || 0;
                State.draft.notes = inv.notes || '';

                if (inv.supplier_id) {
                    const s = State.suppliers.find(x => x.id === inv.supplier_id);
                    if (s) setSupplier(s);
                }

                $('#purchaseDiscount').value = State.draft.discount;
                $('#purchaseNotes').value = State.draft.notes;
            }
        }

        renderPurchaseItems();
        updatePurchaseTotals();
        openModal('purchaseModal');
    }

    /* ============================================
       Supplier Selection
       ============================================ */
    function filterSuppliers(term) {
        const dd = $('#supplierDropdown');
        if (!dd) return;

        let list = State.suppliers;
        if (term) {
            const t = term.toLowerCase();
            list = list.filter(s =>
                (s.name || '').toLowerCase().includes(t) ||
                (s.phone || '').includes(term)
            );
        }

        if (!list.length) {
            dd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">لا توجد نتائج</div>`;
        } else {
            dd.innerHTML = list.slice(0, 15).map(s => {
                const bal = Number(s.balance) || 0;
                const cls = bal > 0 ? 'pos' : bal < 0 ? 'neg' : 'zero';
                const label = bal > 0 ? `+${U.moneyRaw(bal)}` : bal < 0 ? `-${U.moneyRaw(-bal)}` : '0';
                return `
                    <div class="supplier-option" data-id="${U.escape(s.id)}">
                        <div class="supplier-option__info">
                            <h4>${U.escape(s.name)}</h4>
                            ${s.phone ? `<small>${U.escape(s.phone)}</small>` : ''}
                        </div>
                        <div class="supplier-option__balance ${cls}">${label}</div>
                    </div>
                `;
            }).join('');
        }

        dd.classList.add('show');

        dd.querySelectorAll('.supplier-option').forEach(el => {
            el.addEventListener('click', () => {
                const s = State.suppliers.find(x => x.id === el.dataset.id);
                if (s) setSupplier(s);
                dd.classList.remove('show');
                $('#supplierSearchInput').value = '';
            });
        });
    }

    function setSupplier(supplier) {
        State.draft.supplierId = supplier.id;
        $('#purchaseSupplierId').value = supplier.id;

        const el = $('#selectedSupplier');
        if (el) {
            const bal = Number(supplier.balance) || 0;
            const balLabel = bal > 0 ? `مستحق له: ${U.money(bal)}` : bal < 0 ? `مستحق عليه: ${U.money(-bal)}` : 'لا رصيد';
            el.innerHTML = `
                <div class="selected-supplier__info">
                    <strong>${U.escape(supplier.name)}</strong>
                    <small>${balLabel}</small>
                </div>
                <button type="button" class="selected-supplier__remove" title="إزالة">
                    <i class="fas fa-times"></i>
                </button>
            `;
            el.style.display = 'flex';

            el.querySelector('.selected-supplier__remove')?.addEventListener('click', () => {
                State.draft.supplierId = null;
                $('#purchaseSupplierId').value = '';
                el.style.display = 'none';
            });
        }
    }

    /* ============================================
       Add Item Modal
       ============================================ */
    function openAddItemModal() {
        State.selectedProduct = null;
        State.selectedUnit = null;

        $('#productSearchInput').value = '';
        $('#selectedProduct').style.display = 'none';
        $('#unitSelectionGroup').style.display = 'none';
        $('#itemDetailsGroup').style.display = 'none';
        $('#confirmAddItemBtn').disabled = true;
        $('#itemQuantity').value = '1';
        $('#itemCost').value = '0';
        $('#itemPrice').value = '0';

        openModal('addItemModal');
        setTimeout(() => $('#productSearchInput')?.focus(), 200);
    }

    function filterProducts(term) {
        const dd = $('#productDropdown');
        if (!dd) return;

        if (!term) {
            dd.classList.remove('show');
            return;
        }

        const t = term.toLowerCase();
        const list = State.products.filter(p =>
            (p.name || '').toLowerCase().includes(t) ||
            (p.barcode || '').includes(term) ||
            (p.code || '').includes(term)
        ).slice(0, 15);

        if (!list.length) {
            dd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">لا توجد نتائج</div>`;
        } else {
            dd.innerHTML = list.map(p => {
                const base = p.units?.[0] || { price: 0, cost: 0, stock: 0 };
                return `
                    <div class="product-option" data-id="${U.escape(p.id)}">
                        <div class="product-option__info">
                            <h4>${U.escape(p.name)}</h4>
                            <small>${p.barcode ? U.escape(p.barcode) + ' · ' : ''}مخزون: ${base.stock || 0}</small>
                        </div>
                        <div class="product-option__price">تكلفة: ${U.moneyRaw(base.cost || 0)}</div>
                    </div>
                `;
            }).join('');
        }

        dd.classList.add('show');

        dd.querySelectorAll('.product-option').forEach(el => {
            el.addEventListener('click', () => {
                const p = State.products.find(x => x.id === el.dataset.id);
                if (p) selectProduct(p);
                dd.classList.remove('show');
            });
        });
    }

    function selectProduct(product) {
        State.selectedProduct = product;
        State.selectedUnit = product.units?.[0] || null;

        const el = $('#selectedProduct');
        if (el) {
            el.innerHTML = `
                <div class="selected-product__info">
                    <strong>${U.escape(product.name)}</strong>
                    <button type="button" title="تغيير"><i class="fas fa-times"></i></button>
                </div>
            `;
            el.style.display = 'block';
            el.querySelector('button')?.addEventListener('click', () => {
                State.selectedProduct = null;
                State.selectedUnit = null;
                el.style.display = 'none';
                $('#unitSelectionGroup').style.display = 'none';
                $('#itemDetailsGroup').style.display = 'none';
                $('#confirmAddItemBtn').disabled = true;
                $('#productSearchInput').value = '';
                $('#productSearchInput').focus();
            });
        }

        $('#productSearchInput').value = product.name;

        const units = product.units || [];
        const chipsEl = $('#unitChips');
        chipsEl.innerHTML = units.map((u, i) =>
            `<button type="button" class="unit-chip ${i === 0 ? 'active' : ''}" data-index="${i}">${U.escape(u.name)}</button>`
        ).join('');

        chipsEl.querySelectorAll('.unit-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = +btn.dataset.index;
                State.selectedUnit = units[idx];
                chipsEl.querySelectorAll('.unit-chip').forEach((b, i) => b.classList.toggle('active', i === idx));
                updateItemCostFields();
            });
        });

        $('#unitSelectionGroup').style.display = 'block';
        $('#itemDetailsGroup').style.display = 'block';
        updateItemCostFields();
        $('#confirmAddItemBtn').disabled = false;
    }

    function updateItemCostFields() {
        const u = State.selectedUnit;
        if (!u) return;
        $('#itemCost').value = u.cost || 0;
        $('#itemPrice').value = u.price || 0;
        $('#itemQuantity').value = '1';
        setTimeout(() => $('#itemQuantity')?.select(), 100);
    }

    function confirmAddItem() {
        const product = State.selectedProduct;
        const unit = State.selectedUnit;
        if (!product || !unit) return;

        const qty = +$('#itemQuantity').value || 0;
        const cost = +$('#itemCost').value || 0;
        const price = +$('#itemPrice').value || 0;

        if (qty <= 0) { showToast('أدخل كمية صحيحة', 'warning'); return; }
        if (cost < 0) { showToast('سعر الشراء غير صالح', 'warning'); return; }
        if (price < 0) { showToast('سعر البيع غير صالح', 'warning'); return; }

        const existing = State.draft.items.find(i =>
            i.productId === product.id && i.unitName === unit.name
        );

        if (existing) {
            existing.quantity = U.round(existing.quantity + qty, 3);
            existing.price = cost;
            if (price > 0) existing.sellPrice = price;
        } else {
            State.draft.items.push({
                productId: product.id,
                productName: product.name,
                unitName: unit.name,
                quantity: qty,
                price: cost,         // سعر الشراء
                sellPrice: price,     // سعر البيع الجديد (لتحديث المنتج)
                factor: unit.factor || 1
            });
        }

        closeModal('addItemModal');
        renderPurchaseItems();
        updatePurchaseTotals();
        showToast('تمت إضافة المنتج', 'success');
    }

    /* ============================================
       Render Items
       ============================================ */
    function renderPurchaseItems() {
        const container = $('#purchaseItems');
        if (!container) return;

        if (!State.draft.items.length) {
            container.innerHTML = `
                <div class="purchase-empty">
                    <i class="fas fa-cube"></i>
                    <p>لم تُضف أي منتجات بعد</p>
                </div>
            `;
            return;
        }

        container.innerHTML = State.draft.items.map((item, idx) => {
            const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
            return `
                <div class="purchase-item-row" data-idx="${idx}">
                    <div class="purchase-item-row__main">
                        <div class="purchase-item-row__name">${U.escape(item.productName)}</div>
                        <div class="purchase-item-row__meta">
                            <span><i class="fas fa-cube"></i> ${U.escape(item.unitName)}</span>
                            ${item.sellPrice > 0 ? `<span><i class="fas fa-tag"></i> بيع: ${U.moneyRaw(item.sellPrice)}</span>` : ''}
                        </div>
                    </div>
                    <div class="purchase-item-row__actions">
                        <input type="number" class="purchase-item-row__qty-input" value="${item.quantity}" min="0.001" step="0.001" data-action="qty" data-idx="${idx}" title="الكمية" inputmode="decimal">
                        <input type="number" class="purchase-item-row__cost-input" value="${item.price}" min="0" step="0.01" data-action="cost" data-idx="${idx}" title="سعر الشراء" inputmode="decimal">
                        <div class="purchase-item-row__total">${U.money(lineTotal)}</div>
                        <button class="purchase-item-row__remove" data-action="remove" data-idx="${idx}" title="حذف" type="button">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('[data-action]').forEach(el => {
            const action = el.dataset.action;
            const idx = +el.dataset.idx;

            if (action === 'remove') {
                el.addEventListener('click', () => {
                    State.draft.items.splice(idx, 1);
                    renderPurchaseItems();
                    updatePurchaseTotals();
                });
            } else if (action === 'qty' || action === 'cost') {
                el.addEventListener('change', (e) => {
                    const v = +e.target.value || 0;
                    if (action === 'qty') {
                        if (v <= 0) State.draft.items.splice(idx, 1);
                        else State.draft.items[idx].quantity = v;
                    } else {
                        State.draft.items[idx].price = v;
                    }
                    renderPurchaseItems();
                    updatePurchaseTotals();
                });
            }
        });
    }

    /* ============================================
       Update Totals
       ============================================ */
    function updatePurchaseTotals() {
        const subtotal = State.draft.items.reduce((s, i) =>
            s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0
        );

        const discountValue = +$('#purchaseDiscount')?.value || 0;
        const discountType = $('#purchaseDiscountType')?.value || 'amount';

        let discount;
        if (discountType === 'amount') {
            discount = Math.min(Math.max(0, discountValue), subtotal);
        } else {
            const pct = Math.min(100, Math.max(0, discountValue));
            discount = U.round(subtotal * (pct / 100), 2);
        }

        const net = U.round(subtotal - discount, 2);

        $('#purchaseSubtotal').textContent = U.moneyRaw(subtotal);
        $('#purchaseDiscountDisplay').textContent = U.moneyRaw(discount);
        $('#purchaseNetTotal').textContent = U.moneyRaw(net);
    }

    /* ============================================
       Save Purchase — ✅ [PUR-1, PUR-2] لا مضاعفة
       ============================================ */
    async function savePurchase() {
        if (State._saving) return;  // ✅ [PUR-8]

        if (!State.draft.supplierId) {
            showToast('يجب اختيار مورد', 'warning');
            return;
        }

        if (!State.draft.items.length) {
            showToast('يجب إضافة منتج واحد على الأقل', 'warning');
            return;
        }

        State._saving = true;
        const saveBtn = $('#savePurchaseBtn');
        if (saveBtn) saveBtn.disabled = true;

        try {
            const subtotal = State.draft.items.reduce((s, i) =>
                s + (Number(i.price) || 0) * (Number(i.quantity) || 0), 0
            );

            const discountValue = +$('#purchaseDiscount')?.value || 0;
            const discountType = $('#purchaseDiscountType')?.value || 'amount';
            const discount = discountType === 'amount'
                ? Math.min(Math.max(0, discountValue), subtotal)
                : U.round(subtotal * (Math.min(100, Math.max(0, discountValue)) / 100), 2);

            const net = U.round(subtotal - discount, 2);

            const supplier = State.suppliers.find(s => s.id === State.draft.supplierId);
            const invoiceNumber = await DB.generateInvoiceNumber();

            const invoice = {
                id: State.editingId || U.uuid(),
                invoice_number: invoiceNumber,
                type: 'purchase',
                date: U.today(),
                supplier_id: State.draft.supplierId,
                supplier_name: supplier?.name || 'مورد',
                customer_id: null,
                customer_name: null,
                items: State.draft.items.map(i => ({
                    productId: i.productId,
                    productName: i.productName,
                    unitName: i.unitName,
                    quantity: i.quantity,
                    price: i.price,
                    cost: i.price,
                    factor: i.factor || 1,
                    sellPrice: i.sellPrice || 0
                })),
                subtotal,
                discount,
                total: net,
                cash_paid: 0,
                transfer_paid: 0,
                card_paid: 0,
                used_balance: 0,
                paid: 0,
                remaining: net,
                change_amount: 0,
                payment_method: 'credit',
                status: 'credit',
                notes: $('#purchaseNotes')?.value.trim() || ''
            };

            log('💾 Saving purchase:', invoice);

            // ✅ [PUR-1] RPC واحد يضيف المخزون ويُحدّث رصيد المورد + يحفظ الفاتورة
            const result = await DB.createInvoice(invoice);
            if (!result.success) throw new Error('فشل حفظ الفاتورة');

            // ✅ [PUR-3] تحديث أسعار المنتجات (cost + sellPrice فقط، بدون stock)
            await updateProductPrices(State.draft.items);

            showToast(State.editingId ? 'تم تحديث الفاتورة' : 'تم حفظ فاتورة الشراء', 'success');
            closeModal('purchaseModal');

            await loadAllData();

        } catch (e) {
            console.error('Save error:', e);
            showToast(translateError(e), 'error');
        } finally {
            State._saving = false;
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    /* ============================================
       ✅ [PUR-3] تحديث أسعار المنتجات — بدون stock
       ============================================ */
    async function updateProductPrices(items) {
        if (!items.length) return;

        // اقرأ المنتجات الحديثة (بعد أن حدّث RPC المخزون)
        const products = await DB.getProducts(false) || [];

        for (const item of items) {
            try {
                const product = products.find(p => p.id === item.productId);
                if (!product?.units?.length) continue;

                const unit = product.units.find(u => u.name === item.unitName);
                if (!unit) continue;

                let changed = false;
                if (item.price > 0 && unit.cost !== item.price) {
                    unit.cost = item.price;
                    changed = true;
                }
                if (item.sellPrice && item.sellPrice > 0 && unit.price !== item.sellPrice) {
                    unit.price = item.sellPrice;
                    changed = true;
                }

                if (changed) {
                    // saveProduct يحفظ stock الحالي (من IDB بعد RPC) مع cost/price الجديدة
                    await DB.saveProduct(product);
                    log('✅ Product prices updated:', product.name);
                }
            } catch (e) {
                console.warn('Failed to update product prices:', item.productName, e);
            }
        }
    }

    /* ============================================
       Pay Supplier — ✅ [PUR-4] مُبسَّط
       ============================================ */
    function openPaySupplierModal(supplierId = null) {
        const inv = State.viewingId ? State.purchases.find(p => p.id === State.viewingId) : null;
        const sid = supplierId || inv?.supplier_id;

        if (!sid) {
            showToast('لا يوجد مورد محدد', 'warning');
            return;
        }

        const supplier = State.suppliers.find(s => s.id === sid);
        if (!supplier) {
            showToast('المورد غير موجود', 'error');
            return;
        }

        State._paySupplierId = sid;
        State._payInvoiceId = inv?.id || null;
        State._payInvoiceRemaining = Number(inv?.remaining) || 0;

        $('#paySupplierId').value = sid;
        $('#paySupplierAvatar').textContent = (supplier.name || 'S')[0].toUpperCase();
        $('#paySupplierName').textContent = supplier.name;

        const bal = Number(supplier.balance) || 0;
        const balLabel = bal > 0 ? `مستحق له: ${U.money(bal)}` : bal < 0 ? `مستحق عليه: ${U.money(-bal)}` : 'لا رصيد';
        $('#paySupplierBalance').textContent = balLabel;

        const defaultAmount = State._payInvoiceRemaining > 0
            ? State._payInvoiceRemaining
            : Math.abs(bal);

        $('#payAmount').value = defaultAmount > 0 ? defaultAmount : '';
        $('#payReference').value = '';
        $('#payNotes').value = '';
        setPayMethod('cash');

        const quick = $('#payQuickAmounts');
        if (defaultAmount > 0) {
            const opts = [
                Math.round(defaultAmount),
                Math.round(defaultAmount / 2),
                100,
                500
            ];
            const uniq = [...new Set(opts.filter(v => v > 0))].slice(0, 4);
            quick.innerHTML = uniq.map(v => `<button type="button" data-amount="${v}">${v}</button>`).join('');
            quick.querySelectorAll('button').forEach(b => {
                b.addEventListener('click', () => {
                    $('#payAmount').value = b.dataset.amount;
                });
            });
        } else {
            quick.innerHTML = '';
        }

        openModal('paySupplierModal');
        setTimeout(() => $('#payAmount')?.focus(), 200);
    }

    function setPayMethod(method) {
        document.querySelectorAll('#paySupplierModal .method-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.method === method);
        });
        $('#payMethod').value = method;
    }

    async function confirmPaySupplier() {
        const sid = $('#paySupplierId').value;
        const amount = +$('#payAmount').value || 0;
        const method = $('#payMethod').value || 'cash';
        const reference = $('#payReference').value.trim();
        const notes = $('#payNotes').value.trim();

        if (!sid || amount <= 0) {
            showToast('أدخل مبلغاً صحيحاً', 'warning');
            return;
        }

        const btn = $('#confirmPaySupplierBtn');
        if (btn) btn.disabled = true;

        try {
            // ✅ [PUR-4] دفع على مستوى المورد — الرصيد يُحدَّث تلقائيًا عبر RPC
            // ملاحظة معمارية: add_payment_atomic لا يقبل invoice_id، لذا لا نُحدّث
            // paid/remaining للفاتورة الفردية. هذا قيد schema v5.2.0.
            await DB.addPayment({
                party_id: sid,
                type: 'payment_out',
                amount,
                payment_method: method,
                reference,
                notes
            });

            showToast('تم السداد بنجاح', 'success');
            closeModal('paySupplierModal');
            closeModal('purchaseDetailsModal');

            await loadAllData();
        } catch (e) {
            console.error('Payment error:', e);
            showToast(translateError(e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Export
       ============================================ */
    function exportPurchases() {
        if (!State.filtered.length) {
            showToast('لا توجد فواتير للتصدير', 'info');
            return;
        }

        const rows = [['رقم الفاتورة', 'التاريخ', 'المورد', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة']];
        State.filtered.forEach(inv => {
            rows.push([
                inv.invoice_number || '',
                inv.date || (inv.created_at || '').slice(0, 10),
                inv.supplier_name || '',
                Number(inv.total) || 0,
                Number(inv.paid) || 0,
                Number(inv.remaining) || 0,
                getStatusLabel(inv.status)
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
        a.download = `purchases-${U.today()}.csv`;
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

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#purchasesGridView');
        const listView = $('#purchasesListView');
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
        const gridView = $('#purchasesGridView');
        const listView = $('#purchasesListView');
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
       Toast — ✅ [PUR-10] يفضل window.Toast
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

        const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };

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

        // ✅ [PUR-9] Refresh محمي
        const refreshBtn = $('#refreshBtn');
        refreshBtn?.addEventListener('click', async () => {
            if (State._refreshing) return;
            State._refreshing = true;
            refreshBtn.disabled = true;
            try {
                DB.clearCache();
                const ok = await loadAllData();
                if (ok) showToast('تم التحديث', 'success');
                else showToast('فشل التحديث، تحقق من الاتصال', 'error');
            } finally {
                State._refreshing = false;
                refreshBtn.disabled = false;
            }
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportPurchases);

        // New purchase
        $('#newPurchaseBtn')?.addEventListener('click', () => openPurchaseModal());
        $('#fabAddBtn')?.addEventListener('click', () => openPurchaseModal());

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
        $('#statusFilter')?.addEventListener('change', (e) => {
            State.filters.status = e.target.value;
            applyFilters();
        });
        $('#dateFilter')?.addEventListener('change', (e) => {
            State.filters.date = e.target.value;
            applyFilters();
        });
        $('#sortFilter')?.addEventListener('change', (e) => {
            State.filters.sort = e.target.value;
            applyFilters();
        });

        // Add item modal
        $('#addItemBtn')?.addEventListener('click', openAddItemModal);
        $('#confirmAddItemBtn')?.addEventListener('click', confirmAddItem);

        // Product search
        $('#productSearchInput')?.addEventListener('input', U.debounce((e) => {
            filterProducts(e.target.value.trim());
        }, 200));

        $('#productSearchInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim();
                if (!term) return;
                const p = State.products.find(x => x.barcode === term || x.code === term);
                if (p) selectProduct(p);
            }
        });

        // Supplier search
        $('#supplierSearchInput')?.addEventListener('focus', (e) => {
            filterSuppliers(e.target.value.trim());
        });
        $('#supplierSearchInput')?.addEventListener('input', U.debounce((e) => {
            filterSuppliers(e.target.value.trim());
        }, 200));

        // Close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#supplierSearchInput') && !e.target.closest('#supplierDropdown')) {
                $('#supplierDropdown')?.classList.remove('show');
            }
            if (!e.target.closest('#productSearchInput') && !e.target.closest('#productDropdown')) {
                $('#productDropdown')?.classList.remove('show');
            }
        });

        // Discount
        $('#purchaseDiscount')?.addEventListener('input', updatePurchaseTotals);
        $('#purchaseDiscountType')?.addEventListener('change', updatePurchaseTotals);

        // Save
        $('#savePurchaseBtn')?.addEventListener('click', savePurchase);

        // Details modal
        $('#closeDetailsModalBtn')?.addEventListener('click', () => closeModal('purchaseDetailsModal'));
        $('#closeDetailsModalBtn2')?.addEventListener('click', () => closeModal('purchaseDetailsModal'));
        $('#printPurchaseBtn')?.addEventListener('click', printPurchase);
        $('#payPurchaseBtn')?.addEventListener('click', () => {
            closeModal('purchaseDetailsModal');
            openPaySupplierModal();
        });

        // Pay supplier
        document.querySelectorAll('#paySupplierModal .method-btn').forEach(btn => {
            btn.addEventListener('click', () => setPayMethod(btn.dataset.method));
        });
        $('#confirmPaySupplierBtn')?.addEventListener('click', confirmPaySupplier);

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
