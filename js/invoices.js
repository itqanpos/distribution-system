/* =============================================
   invoices.js - Invoices Page Logic
   Version: 2.1.0

   Changelog من v2.0.0:
   - [INV-10] ربط زر إلغاء الفاتورة (DB.voidInvoice)
   - [INV-11] إظهار زر الإلغاء للمدير فقط + فقط للفواتير غير الملغاة
   - [INV-12] تحديث الحالة محليًا بعد الإلغاء + إعادة الرسم
   - [INV-13] ترجمة أخطاء RPC إلى رسائل عربية
   - [INV-14] مؤشر بصري "ملغية" على الفاتورة في القائمة
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);

    const DEBUG = window.APP_CONFIG?.DEBUG === true ||
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1';
    const log = (...a) => { if (DEBUG) console.log(...a); };

    const BUSINESS_MESSAGES = {
        'P0001': 'السجل غير موجود',
        'P0002': 'المخزون غير كافٍ',
        'P0003': 'هذه العملية تتطلب صلاحيات مدير',
        'P0004': 'بيانات غير صالحة',
        'P0005': 'عنصر غير صالح في الفاتورة',
        'P0006': 'عدم تطابق في الحسابات المالية',
        'NO_TENANT': 'لا يوجد مستأجر مرتبط بالحساب',
        '42501': 'ليس لديك صلاحية لهذه العملية',
        '23505': 'الفاتورة مسجلة مسبقاً'
    };

    function translateError(err) {
        const code = err?.code || '';
        if (BUSINESS_MESSAGES[code]) return BUSINESS_MESSAGES[code];
        return err?.message || 'فشل العملية';
    }

    // ✅ [INV-1] تاريخ محلي
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
        invoices: [],
        filtered: [],
        currentUser: null,
        viewingId: null,
        _voiding: false,
        filters: {
            search: '',
            type: '',
            status: '',
            date: '',
            sort: 'recent'
        }
    };

    function isAdmin() {
        return State.currentUser?.role === 'admin' ||
               State.currentUser?.role === 'super_admin';
    }

    /* ============================================
       Init
       ============================================ */
    async function init() {
        log('🚀 Invoices init...');

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

        // ✅ [INV-4] مراقبة الجلسة
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

        await loadInvoices();
        hideLoadingBar();
        log('✅ Invoices ready');
    }

    /* ============================================
       Load Data
       ============================================ */
    async function loadInvoices() {
        showSkeleton();
        try {
            State.invoices = await DB.getInvoices(true) || [];
            log('📄 Invoices:', State.invoices.length);

            renderSummary();
            applyFilters();

            handleUrlParams();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل الفواتير', 'error');
            showEmpty(true);
        } finally {
            hideSkeleton();
        }
    }

    function handleUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const invoiceId = params.get('invoice');
        const partyId = params.get('party');

        if (invoiceId) {
            const found = State.invoices.find(i => i.id === invoiceId);
            if (found) {
                setTimeout(() => openInvoiceDetails(invoiceId), 100);
            } else {
                DB.getInvoiceById(invoiceId).then(inv => {
                    if (inv) {
                        State.invoices.push(inv);
                        renderInvoiceReceipt(inv);
                        openModal('invoiceDetailsModal');
                    }
                }).catch(() => {});
            }
            window.history.replaceState({}, '', './invoices.html');
        } else if (partyId) {
            State.filtered = State.invoices.filter(inv =>
                inv.customer_id === partyId || inv.supplier_id === partyId
            );
            renderInvoices();
            updateCount();
            window.history.replaceState({}, '', './invoices.html');
        }
    }

    /* ============================================
       Summary — ✅ استبعاد voided وheld
       ============================================ */
    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        let totalSales = 0, totalPurchases = 0, totalCredit = 0;

        for (const inv of State.invoices) {
            if (!inv) continue;
            if (inv.status === 'voided') continue;

            const total = Number(inv.total) || 0;
            const remaining = Number(inv.remaining) || 0;

            if (inv.type === 'sale' && inv.status !== 'held') {
                totalSales += total;
            } else if (inv.type === 'purchase' && inv.status !== 'held') {
                totalPurchases += total;
            }

            if ((inv.status === 'credit' || inv.status === 'partial') && remaining > 0) {
                totalCredit += remaining;
            }
        }

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon blue">
                    <i class="fas fa-file-invoice"></i>
                </div>
                <div class="summary-card__info">
                    <label>إجمالي الفواتير</label>
                    <span>${State.invoices.length}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green">
                    <i class="fas fa-arrow-up"></i>
                </div>
                <div class="summary-card__info">
                    <label>إجمالي المبيعات</label>
                    <span>${U.money(totalSales)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon orange">
                    <i class="fas fa-arrow-down"></i>
                </div>
                <div class="summary-card__info">
                    <label>إجمالي المشتريات</label>
                    <span>${U.money(totalPurchases)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon red">
                    <i class="fas fa-exclamation-circle"></i>
                </div>
                <div class="summary-card__info">
                    <label>إجمالي الآجل</label>
                    <span>${U.money(totalCredit)}</span>
                </div>
            </div>
        `;
    }

    /* ============================================
       Filters
       ============================================ */
    function applyFilters() {
        let list = [...State.invoices];

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(inv =>
                (inv.invoice_number || '').toLowerCase().includes(term) ||
                (inv.customer_name || '').toLowerCase().includes(term) ||
                (inv.supplier_name || '').toLowerCase().includes(term)
            );
        }

        if (State.filters.type) {
            list = list.filter(inv => inv.type === State.filters.type);
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
        renderInvoices();
        updateCount();
    }

    function updateCount() {
        const el = $('#invoicesCount');
        if (el) {
            const total = State.filtered.length;
            el.textContent = total === 1 ? '1 فاتورة' : `${total} فاتورة`;
        }
    }

    /* ============================================
       Render Invoices — ✅ [INV-14] مؤشر ملغية
       ============================================ */
    function renderInvoices() {
        const gridView = $('#invoicesGridView');
        const listView = $('#invoicesListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            showEmpty(true);
            return;
        }

        showEmpty(false);

        if (gridView) {
            gridView.innerHTML = State.filtered.map(inv => renderInvoiceCard(inv)).join('');
            gridView.querySelectorAll('.invoice-item').forEach(el => bindInvoiceActions(el));
        }

        if (listView) {
            listView.innerHTML = State.filtered.map(inv => renderInvoiceListItem(inv)).join('');
            listView.querySelectorAll('.invoice-list-item').forEach(el => bindInvoiceActions(el));
        }
    }

    function renderInvoiceCard(inv) {
        const isPurchase = inv.type === 'purchase';
        const isReturn = String(inv.type || '').startsWith('return');
        const isVoided = inv.status === 'voided';
        const iconClass = isReturn ? 'return' : isPurchase ? 'purchase' : '';
        const statusClass = inv.status || 'paid';
        const statusLabel = getStatusLabel(inv.status);
        const typeLabel = getTypeLabel(inv.type);

        const customerName = inv.customer_name || inv.supplier_name || 'نقدي';
        const total = Number(inv.total) || 0;
        const paid = Number(inv.paid) || 0;
        const remaining = Number(inv.remaining) || 0;

        const cardStyle = isVoided
            ? 'opacity:0.65;text-decoration:line-through;'
            : '';

        return `
            <div class="invoice-item" data-id="${U.escape(inv.id)}" style="${cardStyle}">
                <div class="invoice-item__status ${statusClass}">${statusLabel}</div>

                <div class="invoice-item__head">
                    <div>
                        <div class="invoice-item__number">${U.escape(inv.invoice_number || '---')}</div>
                        <div class="invoice-item__date">${U.date(inv.date || inv.created_at)} · ${typeLabel}</div>
                    </div>
                    <div class="invoice-item__icon ${iconClass}">
                        <i class="fas fa-${isPurchase ? 'shopping-cart' : isReturn ? 'undo-alt' : 'file-invoice'}"></i>
                    </div>
                </div>

                <div class="invoice-item__body">
                    <div class="invoice-item__field">
                        <label>${isPurchase ? 'المورد' : 'العميل'}</label>
                        <span>${U.escape(customerName)}</span>
                    </div>
                    <div class="invoice-item__field">
                        <label>المدفوع</label>
                        <span>${U.money(paid)}</span>
                    </div>
                    ${remaining > 0 && !isVoided ? `
                        <div class="invoice-item__total" style="background:rgba(239,68,68,0.1);">
                            <label style="color:var(--danger);">المتبقي</label>
                            <strong style="color:var(--danger);">${U.money(remaining)}</strong>
                        </div>
                    ` : `
                        <div class="invoice-item__total">
                            <label>الإجمالي</label>
                            <strong>${U.money(total)}</strong>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    function renderInvoiceListItem(inv) {
        const isPurchase = inv.type === 'purchase';
        const isReturn = String(inv.type || '').startsWith('return');
        const isVoided = inv.status === 'voided';
        const iconClass = isReturn ? 'return' : isPurchase ? 'purchase' : '';
        const statusClass = inv.status || 'paid';
        const statusLabel = getStatusLabel(inv.status);

        const customerName = inv.customer_name || inv.supplier_name || 'نقدي';

        const itemStyle = isVoided
            ? 'opacity:0.65;text-decoration:line-through;'
            : '';

        return `
            <div class="invoice-list-item" data-id="${U.escape(inv.id)}" style="${itemStyle}">
                <div class="invoice-list-item__icon ${iconClass}">
                    <i class="fas fa-${isPurchase ? 'shopping-cart' : isReturn ? 'undo-alt' : 'file-invoice'}"></i>
                </div>
                <div class="invoice-list-item__info">
                    <div class="invoice-list-item__number">${U.escape(inv.invoice_number || '---')}</div>
                    <div class="invoice-list-item__customer">${U.escape(customerName)} · ${U.date(inv.date || inv.created_at)}</div>
                </div>
                <div class="invoice-list-item__right">
                    <div class="invoice-list-item__total">${U.money(Number(inv.total) || 0)}</div>
                    <div class="invoice-list-item__status ${statusClass}">${statusLabel}</div>
                </div>
            </div>
        `;
    }

    function getStatusLabel(status) {
        if (!status) return '—';
        return {
            paid: 'مدفوعة',
            partial: 'جزئية',
            credit: 'آجلة',
            held: 'معلقة',
            voided: 'ملغية',
            pending: 'قيد الانتظار'
        }[status] || '—';
    }

    function getTypeLabel(type) {
        return {
            sale: 'بيع',
            purchase: 'شراء',
            return_sale: 'مرتجع بيع',
            return_purchase: 'مرتجع شراء',
            adjustment: 'تسوية'
        }[type] || 'غير معروف';
    }

    function bindInvoiceActions(el) {
        const id = el.dataset.id;
        if (!id) return;
        el.addEventListener('click', () => openInvoiceDetails(id));
    }

    function showEmpty(show) {
        const el = $('#emptyState');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    /* ============================================
       Invoice Details
       ============================================ */
    async function openInvoiceDetails(id) {
        State.viewingId = id;

        let invoice = State.invoices.find(i => i.id === id);
        if (!invoice) {
            try { invoice = await DB.getInvoiceById(id); }
            catch (e) { console.error('getInvoiceById failed', e); }
        }

        if (!invoice) {
            showToast('الفاتورة غير موجودة', 'error');
            return;
        }

        renderInvoiceReceipt(invoice);

        // ✅ [INV-11] إظهار زر الإلغاء للمدير فقط، وغير الملغاة فقط
        const voidBtn = $('#voidInvoiceBtn');
        if (voidBtn) {
            const canVoid = isAdmin() && invoice.status !== 'voided';
            voidBtn.style.display = canVoid ? 'inline-flex' : 'none';
            voidBtn.disabled = false;
        }

        openModal('invoiceDetailsModal');
    }

    function renderInvoiceReceipt(inv) {
        const content = $('#invoiceDetailsContent');
        if (!content) return;

        const settings = U.ls.get('settings', {}) || {};
        const shopName = settings.shopName || 'حسابي';
        const shopPhone = settings.phone || '';
        const footer = settings.footer || 'شكراً لتعاملكم معنا';

        const isPurchase = inv.type === 'purchase';
        const partyLabel = isPurchase ? 'المورد' : 'العميل';
        const customerName = inv.customer_name || inv.supplier_name || 'نقدي';

        let itemsHtml = '';
        (inv.items || []).forEach(item => {
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 0;
            const lineTotal = price * qty;
            itemsHtml += `
                <tr>
                    <td>${U.escape(item.productName || item.name || '')}<br>
                        <small style="color:#666;font-size:10px;">${U.escape(item.unitName || item.unit || '')}</small>
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
        const changeAmount = Number(inv.change_amount) || 0;
        const statusLabel = getStatusLabel(inv.status);

        content.innerHTML = `
            <div class="receipt-center" style="font-size:16px;">${U.escape(shopName)}</div>
            ${shopPhone ? `<div class="receipt-center" style="font-size:11px;color:#666;">هاتف: ${U.escape(shopPhone)}</div>` : ''}
            <hr>
            <div class="receipt-row"><span>رقم الفاتورة:</span><strong>${U.escape(inv.invoice_number || '---')}</strong></div>
            <div class="receipt-row"><span>التاريخ:</span><span>${U.date(inv.date || inv.created_at)}</span></div>
            <div class="receipt-row"><span>النوع:</span><span>${getTypeLabel(inv.type)}</span></div>
            <div class="receipt-row"><span>${partyLabel}:</span><strong>${U.escape(customerName)}</strong></div>
            <div class="receipt-row"><span>الحالة:</span><strong>${statusLabel}</strong></div>
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
            ${inv.payment_method ? `<div class="receipt-row"><span>طريقة الدفع:</span><span>${getPaymentLabel(inv.payment_method)}</span></div>` : ''}
            <div class="receipt-row"><span>المدفوع:</span><span>${paid.toFixed(2)}</span></div>
            ${changeAmount > 0 ? `<div class="receipt-row"><span>الباقي:</span><span>${changeAmount.toFixed(2)}</span></div>` : ''}
            ${remaining > 0 ? `<div class="receipt-row" style="color:red;"><span>المتبقي:</span><span>${remaining.toFixed(2)}</span></div>` : ''}
            ${inv.notes ? `<hr><div style="font-size:12px;"><strong>ملاحظات:</strong> ${U.escape(inv.notes)}</div>` : ''}
            ${inv.voided_at ? `<hr><div style="font-size:12px;color:var(--danger);"><strong>أُلغيت في:</strong> ${U.dateTime(inv.voided_at)}</div>` : ''}
            <hr>
            <div class="receipt-center" style="font-weight:bold;">${U.escape(footer)}</div>
        `;
    }

    function getPaymentLabel(method) {
        return {
            cash: 'نقدي',
            card: 'بطاقة',
            transfer: 'تحويل',
            credit: 'آجل',
            mixed: 'مختلط'
        }[method] || method;
    }

    /* ============================================
       Print
       ============================================ */
    function printInvoice() {
        const content = $('#invoiceDetailsContent')?.innerHTML;
        if (!content) return;

        const win = window.open('', '_blank', 'width=400,height=700');
        if (!win) {
            showToast('تعذر فتح نافذة الطباعة — اسمح بالنوافذ المنبثقة', 'warning');
            return;
        }
        win.document.write(`<!DOCTYPE html>
            <html dir="rtl"><head><meta charset="UTF-8">
            <title>طباعة الفاتورة</title>
            <style>
                body { font-family:'Cairo',Arial,sans-serif;padding:10px;font-size:13px;max-width:80mm;margin:0 auto; }
                hr { border:none;border-top:1px dashed #999;margin:10px 0; }
                .receipt-row { display:flex;justify-content:space-between;margin:3px 0; }
                .receipt-center { text-align:center;font-weight:700; }
                .receipt-table { width:100%;border-collapse:collapse; }
                .receipt-table th,.receipt-table td { padding:4px 2px;border-bottom:1px dashed #ddd;font-size:12px;text-align:right; }
                .receipt-table th:last-child,.receipt-table td:last-child { text-align:left; }
                @media print { body { padding:0; } }
            </style></head><body>${content}</body></html>`);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    /* ============================================
       Edit — تنبيه بدل سلوك مكسور
       ============================================ */
    function editInvoice() {
        showToast(
            'لا يمكن تعديل فاتورة صادرة. استخدم "إلغاء الفاتورة" لإنشاء واحدة جديدة.',
            'info'
        );
    }

    /* ============================================
       Void Invoice — ✅ [INV-10..13]
       ============================================ */
    async function voidInvoice() {
        if (State._voiding) return;

        if (!isAdmin()) {
            showToast('هذه العملية تتطلب صلاحيات مدير', 'error');
            return;
        }

        const id = State.viewingId;
        if (!id) return;

        const invoice = State.invoices.find(i => i.id === id);
        if (!invoice) {
            showToast('الفاتورة غير موجودة', 'error');
            return;
        }

        if (invoice.status === 'voided') {
            showToast('الفاتورة ملغاة مسبقًا', 'info');
            return;
        }

        const invoiceNumber = invoice.invoice_number || '---';
        const confirmed = confirm(
            `هل أنت متأكد من إلغاء الفاتورة ${invoiceNumber}؟\n\n` +
            `سيتم:\n` +
            `- إعادة المخزون للمنتجات\n` +
            `- عكس تأثير الرصيد على العميل/المورد\n\n` +
            `لا يمكن التراجع عن هذه العملية.`
        );
        if (!confirmed) return;

        State._voiding = true;
        const btn = $('#voidInvoiceBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري الإلغاء...';
        }

        try {
            const result = await DB.voidInvoice(id);

            // ✅ [INV-12] تحديث محليًا
            const localInv = State.invoices.find(i => i.id === id);
            if (localInv) {
                localInv.status = 'voided';
                localInv.updated_at = new Date().toISOString();
                if (!localInv.voided_at) localInv.voided_at = new Date().toISOString();
            }

            // إعادة رسم الشاشة
            renderSummary();
            applyFilters();

            // إغلاق المودال
            closeModal('invoiceDetailsModal');

            if (result?.alreadyVoided) {
                showToast('الفاتورة كانت ملغاة مسبقًا', 'info');
            } else {
                showToast(`تم إلغاء الفاتورة ${invoiceNumber} بنجاح`, 'success');
            }

        } catch (e) {
            console.error('Void error:', e);
            showToast(translateError(e), 'error');
        } finally {
            State._voiding = false;
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-ban"></i> إلغاء الفاتورة';
            }
        }
    }

    /* ============================================
       Export CSV
       ============================================ */
    function exportInvoices() {
        if (!State.filtered.length) {
            showToast('لا توجد فواتير للتصدير', 'info');
            return;
        }

        const rows = [
            ['رقم الفاتورة', 'التاريخ', 'النوع', 'العميل/المورد', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة']
        ];

        State.filtered.forEach(inv => {
            rows.push([
                inv.invoice_number || '',
                inv.date || (inv.created_at || '').slice(0, 10),
                getTypeLabel(inv.type),
                inv.customer_name || inv.supplier_name || 'نقدي',
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
        a.download = `invoices-${U.today()}.csv`;
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
        const gridView = $('#invoicesGridView');
        const listView = $('#invoicesListView');
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
        const gridView = $('#invoicesGridView');
        const listView = $('#invoicesListView');

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

        const refreshBtn = $('#refreshBtn');
        let refreshing = false;
        refreshBtn?.addEventListener('click', async () => {
            if (refreshing) return;
            refreshing = true;
            refreshBtn.disabled = true;
            try {
                DB.clearCache();
                await loadInvoices();
                showToast('تم التحديث', 'success');
            } finally {
                refreshing = false;
                refreshBtn.disabled = false;
            }
        });

        $('#exportBtn')?.addEventListener('click', exportInvoices);

        $('#newInvoiceBtn')?.addEventListener('click', () => {
            window.location.href = './pos.html';
        });

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

        $('#typeFilter')?.addEventListener('change', (e) => {
            State.filters.type = e.target.value;
            applyFilters();
        });
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

        $('#closeDetailsModalBtn')?.addEventListener('click', () => closeModal('invoiceDetailsModal'));
        $('#closeDetailsModalBtn2')?.addEventListener('click', () => closeModal('invoiceDetailsModal'));
        $('#printInvoiceBtn')?.addEventListener('click', printInvoice);
        $('#editInvoiceBtn')?.addEventListener('click', editInvoice);
        $('#voidInvoiceBtn')?.addEventListener('click', voidInvoice);

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
