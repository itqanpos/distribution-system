/* =============================================
   invoices.js - Invoices Page Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ State ============ */
    const State = {
        invoices: [],
        filtered: [],
        currentUser: null,
        viewingId: null,
        filters: {
            search: '',
            type: '',
            status: '',
            date: '',
            sort: 'recent'
        }
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Invoices init...');

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

        await loadInvoices();
        hideLoadingBar();
        console.log('✅ Invoices ready');
    }

    /* ============================================
       Load Data
       ============================================ */
    async function loadInvoices() {
        showSkeleton();
        try {
            State.invoices = await DB.getInvoices(true) || [];
            console.log('📄 Invoices:', State.invoices.length);

            renderSummary();
            applyFilters();

            // Handle URL params (from customers page)
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
            // Open specific invoice
            setTimeout(() => openInvoiceDetails(invoiceId), 600);
            // Clean URL
            window.history.replaceState({}, '', './invoices.html');
        } else if (partyId) {
            // Filter by party
            State.filtered = State.invoices.filter(inv =>
                inv.customer_id === partyId || inv.supplier_id === partyId
            );
            renderInvoices();
            updateCount();
            window.history.replaceState({}, '', './invoices.html');
        }
    }

    /* ============================================
       Summary
       ============================================ */
    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const sales = State.invoices.filter(i => i.type === 'sale');
        const purchases = State.invoices.filter(i => i.type === 'purchase');
        const credit = State.invoices.filter(i => i.status === 'credit' || i.status === 'partial');

        const totalSales = sales.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const totalPurchases = purchases.reduce((s, i) => s + (Number(i.total) || 0), 0);
        const totalCredit = credit.reduce((s, i) => s + (Number(i.remaining) || 0), 0);

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
       Filters & Sorting
       ============================================ */
    function applyFilters() {
        let list = [...State.invoices];

        // Search
        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(inv =>
                (inv.invoice_number || '').toLowerCase().includes(term) ||
                (inv.customer_name || '').toLowerCase().includes(term) ||
                (inv.supplier_name || '').toLowerCase().includes(term)
            );
        }

        // Type
        if (State.filters.type) {
            list = list.filter(inv => inv.type === State.filters.type);
        }

        // Status
        if (State.filters.status) {
            list = list.filter(inv => inv.status === State.filters.status);
        }

        // Date
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
                
                if (filterDate === 'year') {
                    return invDate.startsWith(now.getFullYear().toString());
                }
                
                return true;
            });
        }

        // Sort
        const sort = State.filters.sort;
        list.sort((a, b) => {
            if (sort === 'recent') return new Date(b.created_at || b.date) - new Date(a.created_at || a.date);
            if (sort === 'oldest') return new Date(a.created_at || a.date) - new Date(b.created_at || b.date);
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
       Render Invoices
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
        const isReturn = inv.type?.startsWith('return');
        const iconClass = isReturn ? 'return' : isPurchase ? 'purchase' : '';
        const statusClass = inv.status || 'paid';
        const statusLabel = getStatusLabel(inv.status);
        const typeLabel = getTypeLabel(inv.type);

        const customerName = inv.customer_name || inv.supplier_name || 'نقدي';
        const total = Number(inv.total) || 0;
        const paid = Number(inv.paid) || 0;
        const remaining = Number(inv.remaining) || 0;

        return `
            <div class="invoice-item" data-id="${inv.id}">
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
                    ${remaining > 0 ? `
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
        const isReturn = inv.type?.startsWith('return');
        const iconClass = isReturn ? 'return' : isPurchase ? 'purchase' : '';
        const statusClass = inv.status || 'paid';
        const statusLabel = getStatusLabel(inv.status);

        const customerName = inv.customer_name || inv.supplier_name || 'نقدي';

        return `
            <div class="invoice-list-item" data-id="${inv.id}">
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
        return {
            paid: 'مدفوعة',
            partial: 'جزئية',
            credit: 'آجلة',
            held: 'معلقة',
            voided: 'ملغية',
            pending: 'قيد الانتظار'
        }[status] || 'مدفوعة';
    }

    function getTypeLabel(type) {
        return {
            sale: 'بيع',
            purchase: 'شراء',
            return_sale: 'مرتجع بيع',
            return_purchase: 'مرتجع شراء'
        }[type] || 'بيع';
    }

    function bindInvoiceActions(el) {
        const id = el.dataset.id;
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
            invoice = await DB.getInvoiceById(id);
        }

        if (!invoice) {
            showToast('الفاتورة غير موجودة', 'error');
            return;
        }

        renderInvoiceReceipt(invoice);
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
        const isReturn = inv.type?.startsWith('return');
        const customerName = inv.customer_name || inv.supplier_name || 'نقدي';
        const partyLabel = isPurchase ? 'المورد' : 'العميل';

        let itemsHtml = '';
        (inv.items || []).forEach(item => {
            const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 0);
            itemsHtml += `
                <tr>
                    <td>${U.escape(item.productName || item.name || '')}<br>
                        <small style="color:#666;font-size:10px;">${U.escape(item.unitName || item.unit || '')}</small>
                    </td>
                    <td style="text-align:center;">${item.quantity || 0}</td>
                    <td style="text-align:center;">${(Number(item.price) || 0).toFixed(2)}</td>
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
        win.document.write(`
            <!DOCTYPE html>
            <html dir="rtl"><head><meta charset="UTF-8">
            <title>طباعة الفاتورة</title>
            <style>
                body {
                    font-family: 'Cairo', Arial, sans-serif;
                    padding: 10px;
                    font-size: 13px;
                    max-width: 80mm;
                    margin: 0 auto;
                }
                hr { border: none; border-top: 1px dashed #999; margin: 10px 0; }
                .receipt-row { display: flex; justify-content: space-between; margin: 3px 0; }
                .receipt-center { text-align: center; font-weight: 700; }
                .receipt-table { width: 100%; border-collapse: collapse; }
                .receipt-table th,
                .receipt-table td {
                    padding: 4px 2px;
                    border-bottom: 1px dashed #ddd;
                    font-size: 12px;
                    text-align: right;
                }
                .receipt-table th:last-child,
                .receipt-table td:last-child { text-align: left; }
                @media print { body { padding: 0; } }
            </style>
            </head><body>${content}</body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    /* ============================================
       Edit Invoice
       ============================================ */
    function editInvoice() {
        if (!State.viewingId) return;
        
        // Store invoice ID and navigate to POS
        localStorage.setItem('edit_invoice_id', State.viewingId);
        window.location.href = './pos.html';
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
        ).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `invoices-${U.today()}.csv`;
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
            await loadInvoices();
            showToast('تم التحديث', 'success');
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportInvoices);

        // New invoice
        $('#newInvoiceBtn')?.addEventListener('click', () => {
            window.location.href = './pos.html';
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

        // Filters
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

        // Details modal
        $('#closeDetailsModalBtn')?.addEventListener('click', () => closeModal('invoiceDetailsModal'));
        $('#closeDetailsModalBtn2')?.addEventListener('click', () => closeModal('invoiceDetailsModal'));
        $('#printInvoiceBtn')?.addEventListener('click', printInvoice);
        $('#editInvoiceBtn')?.addEventListener('click', editInvoice);

        // Modals close on backdrop
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
