/* =============================================
   invoices.js - منطق صفحة الفواتير
   ============================================= */
(async function() {
    'use strict';

    // عناصر DOM
    const loadingBar = document.getElementById('loading-bar');
    const refreshBtn = document.getElementById('refreshBtn');
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    const typeFilter = document.getElementById('typeFilter');
    const dateFilter = document.getElementById('dateFilter');
    const invoicesTableBody = document.getElementById('invoicesTableBody');
    const invoicesCards = document.getElementById('invoicesCards');
    const emptyState = document.getElementById('emptyState');
    const invoiceDetailsModal = document.getElementById('invoiceDetailsModal');
    const invoiceDetailsContent = document.getElementById('invoiceDetailsContent');
    const closeDetailsModalBtn = document.getElementById('closeDetailsModalBtn');
    const newInvoiceBtn = document.getElementById('newInvoiceBtn');
    const exportBtn = document.getElementById('exportBtn');

    let allInvoices = [];

    // ========== دوال مساعدة ==========
    function safeToast(msg, type = 'error') {
        if (window.Toast && typeof window.Toast[type] === 'function') {
            window.Toast[type](msg);
        } else if (window.Toast && typeof window.Toast.show === 'function') {
            window.Toast.show(msg, type);
        } else {
            alert(msg);
        }
    }

    function formatCurrency(value) {
        return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch { return dateStr; }
    }

    function showLoading() { loadingBar.style.width = '80%'; }
    function hideLoading() {
        loadingBar.style.width = '100%';
        setTimeout(() => { loadingBar.style.width = '0%'; }, 300);
    }

    function getStatusBadge(status) {
        const map = {
            paid: { class: 'status-paid', label: 'مدفوعة' },
            partial: { class: 'status-partial', label: 'جزئية' },
            credit: { class: 'status-credit', label: 'آجلة' },
            held: { class: 'status-held', label: 'معلقة' },
            voided: { class: 'status-voided', label: 'ملغية' },
            pending: { class: 'status-partial', label: 'قيد الانتظار' }
        };
        const s = map[status] || { class: 'status-paid', label: status || 'مدفوعة' };
        return `<span class="status-badge ${s.class}">${s.label}</span>`;
    }

    function getTypeLabel(type) {
        return { sale: 'بيع', purchase: 'شراء', return: 'مرتجع' }[type] || type || 'بيع';
    }

    // ========== ربط القائمة الجانبية ==========
    function bindSidebar() {
        menuToggle?.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('show');
        });
        sidebarOverlay?.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
            });
        });
    }

    // ========== تحميل بيانات المستخدم ==========
    async function loadUserInfo() {
        if (!window.App?.getCurrentUser) return;
        try {
            const user = await App.getCurrentUser();
            if (user) {
                sidebarAvatar.textContent = (user.fullName || 'U')[0].toUpperCase();
                sidebarUserName.textContent = user.fullName || user.email || 'مدير';
            }
        } catch (e) { /* silent */ }
    }

    // ========== جلب الفواتير ==========
    async function loadInvoices() {
        showLoading();
        try {
            allInvoices = await DB.getInvoices() || [];
            applyFilters();
        } catch (e) {
            console.error('فشل جلب الفواتير:', e);
            safeToast('تعذر تحميل الفواتير', 'error');
            showEmptyState(true);
        } finally {
            hideLoading();
        }
    }

    // ========== تطبيق الفلاتر والبحث ==========
    function applyFilters() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const status = statusFilter.value;
        const type = typeFilter.value;
        const date = dateFilter.value;

        let filtered = [...allInvoices];

        if (searchTerm) {
            filtered = filtered.filter(inv =>
                (inv.invoice_number || '').toLowerCase().includes(searchTerm) ||
                (inv.customer_name || '').toLowerCase().includes(searchTerm) ||
                (inv.id || '').toLowerCase().includes(searchTerm)
            );
        }
        if (status) filtered = filtered.filter(inv => inv.status === status);
        if (type) filtered = filtered.filter(inv => inv.type === type);
        if (date) {
            const now = new Date();
            const today = now.toISOString().split('T')[0];
            if (date === 'today') {
                filtered = filtered.filter(inv => inv.date === today);
            } else if (date === 'week') {
                const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                filtered = filtered.filter(inv => inv.date >= weekAgo);
            } else if (date === 'month') {
                const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                filtered = filtered.filter(inv => inv.date >= monthAgo);
            }
        }

        if (!filtered.length) {
            showEmptyState(true);
            invoicesTableBody.innerHTML = '';
            invoicesCards.innerHTML = '';
            return;
        }

        showEmptyState(false);
        renderTable(filtered);
        renderCards(filtered);
    }

    function showEmptyState(show) {
        emptyState.style.display = show ? 'block' : 'none';
    }

    // ========== عرض الجدول (للشاشات الكبيرة) ==========
    function renderTable(invoices) {
        invoicesTableBody.innerHTML = invoices.map(inv => `
            <tr>
                <td class="invoice-number">${inv.invoice_number || inv.id?.substring(0, 8)}</td>
                <td>${formatDate(inv.date)}</td>
                <td>${inv.customer_name || 'نقدي'}</td>
                <td>${getTypeLabel(inv.type)}</td>
                <td>${formatCurrency(inv.total)}</td>
                <td>${formatCurrency(inv.paid)}</td>
                <td>${formatCurrency(inv.remaining)}</td>
                <td>${getStatusBadge(inv.status)}</td>
                <td>
                    <button class="btn-sm btn-outline view-btn" data-id="${inv.id}">
                        <i class="fas fa-eye"></i> عرض
                    </button>
                    ${inv.status === 'held' || inv.status === 'partial' || inv.status === 'credit' ? `
                        <button class="btn-sm btn-outline edit-pos-btn" data-id="${inv.id}" title="فتح في نقطة البيع">
                            <i class="fas fa-edit"></i> تعديل
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');

        // ربط أزرار العرض والتعديل
        invoicesTableBody.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => openInvoiceDetails(btn.dataset.id));
        });
        invoicesTableBody.querySelectorAll('.edit-pos-btn').forEach(btn => {
            btn.addEventListener('click', () => editInPOS(btn.dataset.id));
        });
    }

    // ========== عرض البطاقات (للشاشات الصغيرة) ==========
    function renderCards(invoices) {
        invoicesCards.innerHTML = invoices.map(inv => `
            <div class="invoice-card">
                <div class="invoice-card-header">
                    <span class="invoice-number">${inv.invoice_number || inv.id?.substring(0, 8)}</span>
                    ${getStatusBadge(inv.status)}
                </div>
                <div class="invoice-card-body">
                    <div>
                        <div class="label">العميل</div>
                        <div class="value">${inv.customer_name || 'نقدي'}</div>
                    </div>
                    <div>
                        <div class="label">الإجمالي</div>
                        <div class="value">${formatCurrency(inv.total)}</div>
                    </div>
                    <div>
                        <div class="label">التاريخ</div>
                        <div class="value">${formatDate(inv.date)}</div>
                    </div>
                </div>
                <div class="invoice-card-footer">
                    <button class="btn-sm btn-outline view-btn" data-id="${inv.id}">
                        <i class="fas fa-eye"></i> عرض
                    </button>
                    ${inv.status === 'held' || inv.status === 'partial' || inv.status === 'credit' ? `
                        <button class="btn-sm btn-outline edit-pos-btn" data-id="${inv.id}">
                            <i class="fas fa-edit"></i> تعديل
                        </button>
                    ` : ''}
                </div>
            </div>
        `).join('');

        invoicesCards.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => openInvoiceDetails(btn.dataset.id));
        });
        invoicesCards.querySelectorAll('.edit-pos-btn').forEach(btn => {
            btn.addEventListener('click', () => editInPOS(btn.dataset.id));
        });
    }

    // ========== فتح تفاصيل الفاتورة ==========
    async function openInvoiceDetails(id) {
        try {
            const invoice = await DB.getInvoiceById(id);
            if (!invoice) {
                safeToast('الفاتورة غير موجودة', 'error');
                return;
            }
            renderInvoiceDetails(invoice);
            invoiceDetailsModal.classList.add('open');
        } catch (e) {
            console.error(e);
            safeToast('تعذر تحميل تفاصيل الفاتورة', 'error');
        }
    }

    function renderInvoiceDetails(inv) {
        invoiceDetailsContent.innerHTML = `
            <div class="detail-row"><span class="label">رقم الفاتورة:</span><span class="value">${inv.invoice_number || inv.id?.substring(0, 8)}</span></div>
            <div class="detail-row"><span class="label">التاريخ:</span><span class="value">${formatDate(inv.date)}</span></div>
            <div class="detail-row"><span class="label">العميل:</span><span class="value">${inv.customer_name || 'نقدي'}</span></div>
            <div class="detail-row"><span class="label">النوع:</span><span class="value">${getTypeLabel(inv.type)}</span></div>
            <div class="detail-row"><span class="label">الإجمالي:</span><span class="value">${formatCurrency(inv.total)}</span></div>
            <div class="detail-row"><span class="label">الخصم:</span><span class="value">${formatCurrency(inv.discount)}</span></div>
            <div class="detail-row"><span class="label">الصافي:</span><span class="value">${formatCurrency(inv.total - inv.discount)}</span></div>
            <div class="detail-row"><span class="label">المدفوع:</span><span class="value">${formatCurrency(inv.paid)}</span></div>
            <div class="detail-row"><span class="label">المتبقي:</span><span class="value">${formatCurrency(inv.remaining)}</span></div>
            <div class="detail-row"><span class="label">الحالة:</span><span class="value">${getStatusBadge(inv.status)}</span></div>
            ${inv.items && inv.items.length ? `
                <div style="margin-top: 16px;">
                    <h4 style="margin-bottom: 8px;">المنتجات:</h4>
                    ${inv.items.map(item => `
                        <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dashed var(--border-light);">
                            <span>${item.productName} - ${item.unitName}</span>
                            <span>${item.quantity} × ${formatCurrency(item.price)}</span>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        `;
    }

    // ========== التعديل في نقطة البيع ==========
    function editInPOS(id) {
        // تخزين معرف الفاتورة في localStorage لتلتقطه نقطة البيع
        localStorage.setItem('edit_invoice_id', id);
        window.location.href = './pos.html';
    }

    // ========== إنشاء فاتورة جديدة ==========
    function createNewInvoice() {
        window.location.href = './pos.html';
    }

    // ========== تصدير البيانات ==========
    function exportInvoices() {
        if (!allInvoices.length) {
            safeToast('لا توجد بيانات للتصدير', 'info');
            return;
        }
        const csv = [
            ['رقم الفاتورة', 'التاريخ', 'العميل', 'النوع', 'الإجمالي', 'المدفوع', 'المتبقي', 'الحالة'],
            ...allInvoices.map(inv => [
                inv.invoice_number || inv.id?.substring(0, 8),
                inv.date,
                inv.customer_name || 'نقدي',
                getTypeLabel(inv.type),
                inv.total,
                inv.paid,
                inv.remaining,
                inv.status
            ])
        ].map(row => row.join(',')).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'invoices.csv';
        link.click();
        URL.revokeObjectURL(link.href);
    }

    // ========== إعداد Realtime ==========
    function setupRealtimeSync() {
        if (!window.supabaseClient) return;
        window.supabaseClient
            .channel('invoices-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, () => {
                loadInvoices();
            })
            .subscribe();
    }

    // ========== التهيئة ==========
    async function init() {
        try {
            if (!window.App || !window.DB) {
                safeToast('النواة غير محملة', 'error');
                return;
            }
            const authorized = await App.requireAuth();
            if (!authorized) return;
            if (!App.requireRole || !(await App.requireRole(['admin', 'rep']))) return;

            bindSidebar();
            await loadUserInfo();
            await loadInvoices();
            setupRealtimeSync();

            // الأحداث
            refreshBtn?.addEventListener('click', loadInvoices);
            searchInput?.addEventListener('input', U.debounce(applyFilters, 300));
            statusFilter?.addEventListener('change', applyFilters);
            typeFilter?.addEventListener('change', applyFilters);
            dateFilter?.addEventListener('change', applyFilters);
            closeDetailsModalBtn?.addEventListener('click', () => invoiceDetailsModal.classList.remove('open'));
            newInvoiceBtn?.addEventListener('click', createNewInvoice);
            exportBtn?.addEventListener('click', exportInvoices);

            // إغلاق المودال عند النقر خارج المحتوى
            invoiceDetailsModal.addEventListener('click', (e) => {
                if (e.target === invoiceDetailsModal) invoiceDetailsModal.classList.remove('open');
            });

            window.addEventListener('online', loadInvoices);

        } catch (e) {
            console.error('فشل التهيئة:', e);
            safeToast('تعذر تحميل صفحة الفواتير', 'error');
        }
    }

    init();
})();
