(() => {
    'use strict';

    const loadingBar = document.getElementById('loading-bar');
    const invoiceSearch = document.getElementById('invoiceSearch');
    const invoiceDropdown = document.getElementById('invoiceDropdown');
    const originalInvoiceId = document.getElementById('originalInvoiceId');
    const returnReason = document.getElementById('returnReason');
    const returnItemsTable = document.getElementById('returnItemsTable');
    const returnSubtotal = document.getElementById('returnSubtotal');
    const refundMethod = document.getElementById('refundMethod');
    const returnNotes = document.getElementById('returnNotes');
    const saveReturnBtn = document.getElementById('saveReturnBtn');
    const printReturnBtn = document.getElementById('printReturnBtn');
    const errorMsg = document.getElementById('errorMsg');
    const returnsTableBody = document.getElementById('returnsTableBody');
    const returnReceiptModal = document.getElementById('returnReceiptModal');
    const closeReturnReceiptModal = document.getElementById('closeReturnReceiptModal');
    const closeReturnReceiptBtn = document.getElementById('closeReturnReceiptBtn');
    const printReturnReceiptBtn = document.getElementById('printReturnReceiptBtn');
    const returnReceiptPreview = document.getElementById('returnReceiptPreview');
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const moreMenuBtn = document.getElementById('moreMenuBtn');
    const moreDropdown = document.getElementById('moreDropdown');
    const logoutBtn = document.getElementById('logoutBtn');

    let allInvoices = [];
    let allReturns = [];
    let returnItems = [];
    let selectedInvoice = null;
    let currentUser = null;
    let lastSavedReturn = null;

    function safeToast(message, type = 'success') {
        if (window.Toast && typeof window.Toast[type] === 'function') {
            window.Toast[type](message);
        } else if (window.Toast && typeof window.Toast.show === 'function') {
            window.Toast.show(message, type);
        } else {
            alert(message);
        }
    }

    function fmtMoney(v) {
        return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    }

    function waitForCore(timeoutMs = 8000) {
        return new Promise((resolve, reject) => {
            const start = Date.now();
            const check = () => {
                if (window.App && window.DB) resolve();
                else if (Date.now() - start > timeoutMs) reject(new Error('Core not loaded'));
                else setTimeout(check, 200);
            };
            check();
        });
    }

    async function loadData() {
        try {
            const [invoicesRes, returnsRes] = await Promise.allSettled([
                DB.getInvoices(),
                DB.getReturns('sale')
            ]);
            allInvoices = invoicesRes.status === 'fulfilled' ? invoicesRes.value : [];
            const returns = returnsRes.status === 'fulfilled' ? returnsRes.value : [];
            allReturns = returns;
            renderReturnsTable(allReturns);
        } catch (e) {
            console.error('Failed to load returns data:', e);
            returnsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">فشل تحميل المرتجعات</td></tr>';
        }
    }

    function renderReturnsTable(returns) {
        if (!returns.length) {
            returnsTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);">لا توجد مرتجعات</td></tr>';
            return;
        }
        returnsTableBody.innerHTML = returns.map(r => `
            <tr>
                <td>${r.date || ''}</td>
                <td>${r.original_invoice_number || r.original_invoice_id?.substring(0,8) || '-'}</td>
                <td>${r.customer_name || '-'}</td>
                <td>${r.reason || '-'}</td>
                <td>${fmtMoney(r.total)}</td>
            </tr>
        `).join('');
    }

    invoiceSearch.addEventListener('input', () => {
        const term = invoiceSearch.value.trim().toLowerCase();
        if (!term) {
            invoiceDropdown.classList.remove('show');
            return;
        }
        const filtered = allInvoices.filter(inv => inv.type === 'sale' && inv.status !== 'voided' && (
            (inv.invoice_number && inv.invoice_number.toLowerCase().includes(term)) ||
            (inv.customer_name && inv.customer_name.toLowerCase().includes(term))
        ));
        invoiceDropdown.innerHTML = filtered.length ? filtered.map(inv => `
            <div class="dropdown-item" data-id="${inv.id}">
                <span>${inv.invoice_number || inv.id?.substring(0,8)} - ${inv.customer_name || 'نقدي'}</span>
                <span style="font-weight:600;">${fmtMoney(inv.total)}</span>
            </div>
        `).join('') : '<div class="dropdown-item" style="color:var(--text-muted);">لا توجد فواتير مطابقة</div>';
        invoiceDropdown.classList.add('show');
    });

    invoiceDropdown.addEventListener('click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item && item.dataset.id) {
            const inv = allInvoices.find(i => i.id === item.dataset.id);
            if (inv) {
                selectedInvoice = inv;
                originalInvoiceId.value = inv.id;
                invoiceSearch.value = `${inv.invoice_number || ''} - ${inv.customer_name || 'نقدي'}`;
                invoiceDropdown.classList.remove('show');
                populateReturnItems(inv);
            }
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.form-group')) {
            invoiceDropdown.classList.remove('show');
        }
    });

    function populateReturnItems(inv) {
        const items = inv.items || [];
        if (!items.length) {
            returnItemsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">لا توجد منتجات في هذه الفاتورة</td></tr>';
            returnItems = [];
            updateReturnTotals();
            return;
        }
        returnItems = items.map(item => ({
            productId: item.productId,
            productName: item.productName,
            unitName: item.unitName,
            soldQty: Number(item.quantity) || 0,
            qty: Number(item.quantity) || 0,
            price: Number(item.price) || 0,
            total: (Number(item.quantity) || 0) * (Number(item.price) || 0)
        }));
        renderReturnItems();
    }

    function renderReturnItems() {
        if (!returnItems.length) {
            returnItemsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">اختر فاتورة أولاً</td></tr>';
            updateReturnTotals();
            return;
        }
        returnItemsTable.innerHTML = returnItems.map((item, idx) => `
            <tr>
                <td>${item.productName} - ${item.unitName}</td>
                <td>${item.soldQty}</td>
                <td><input type="number" class="return-qty" data-idx="${idx}" value="${item.qty}" min="0" max="${item.soldQty}" step="0.001"></td>
                <td>${fmtMoney(item.price)}</td>
                <td>${fmtMoney(item.total)}</td>
                <td><button class="remove-btn" data-idx="${idx}"><i class="fas fa-times"></i></button></td>
            </tr>
        `).join('');

        returnItemsTable.querySelectorAll('.return-qty').forEach(inp => {
            inp.addEventListener('input', (e) => {
                const idx = e.target.dataset.idx;
                const qty = parseFloat(e.target.value) || 0;
                if (qty < 0) { e.target.value = 0; return; }
                if (qty > returnItems[idx].soldQty) { e.target.value = returnItems[idx].soldQty; return; }
                returnItems[idx].qty = qty;
                returnItems[idx].total = qty * returnItems[idx].price;
                updateReturnTotals();
            });
        });

        returnItemsTable.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = e.target.closest('.remove-btn').dataset.idx;
                returnItems.splice(idx, 1);
                renderReturnItems();
            });
        });

        updateReturnTotals();
    }

    function updateReturnTotals() {
        const total = returnItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
        returnSubtotal.textContent = fmtMoney(total);
    }

    async function saveReturn() {
        errorMsg.textContent = '';
        if (!originalInvoiceId.value) {
            errorMsg.textContent = 'يرجى اختيار الفاتورة الأصلية';
            return;
        }
        const validItems = returnItems.filter(item => item.qty > 0);
        if (!validItems.length) {
            errorMsg.textContent = 'يرجى تحديد كمية مرتجعة واحدة على الأقل';
            return;
        }

        const total = validItems.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
        const returnObj = {
            id: crypto.randomUUID ? crypto.randomUUID() : 'ret-' + Date.now(),
            type: 'sale',
            date: new Date().toISOString().split('T')[0],
            original_invoice_id: originalInvoiceId.value,
            original_invoice_number: selectedInvoice?.invoice_number || '',
            customer_id: selectedInvoice?.customer_id || null,
            customer_name: selectedInvoice?.customer_name || 'نقدي',
            reason: returnReason.value,
            refund_method: refundMethod.value,
            items: validItems.map(i => ({...i})),
            total: total,
            notes: returnNotes.value.trim(),
            tenant_id: currentUser?.tenant_id,
            created_by: currentUser?.id
        };

        try {
            await DB.saveReturn(returnObj);
            lastSavedReturn = returnObj;
            safeToast('تم حفظ المرتجع');
            printReturnBtn.style.display = 'flex';

            // إضافة المرتجع للجدول المحلي فورًا
            allReturns.push(returnObj);
            renderReturnsTable(allReturns);

            // إعادة تعيين النموذج
            originalInvoiceId.value = '';
            invoiceSearch.value = '';
            returnReason.value = 'damaged';
            refundMethod.value = 'cash';
            returnNotes.value = '';
            returnItems = [];
            returnItemsTable.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">اختر فاتورة أولاً</td></tr>';
            returnSubtotal.textContent = '0.00 ج.م';
        } catch (e) {
            console.error('Save return failed:', e);
            errorMsg.textContent = e.message || 'فشل حفظ المرتجع';
        }
    }

    function showReturnReceipt(returnObj) {
        if (!returnObj) return;
        const items = returnObj.items || [];
        let itemsHtml = '';
        items.forEach(item => {
            itemsHtml += `<tr><td>${item.productName} - ${item.unitName}</td><td>${item.qty}</td><td>${fmtMoney(item.price)}</td><td>${fmtMoney(item.total)}</td></tr>`;
        });
        const html = `
            <div class="receipt-header">إيصال مرتجع</div>
            <div class="receipt-sub">رقم: ${returnObj.id.substring(0,8)}</div>
            <hr>
            <div class="receipt-row"><span>العميل:</span><span>${returnObj.customer_name || 'نقدي'}</span></div>
            <div class="receipt-row"><span>التاريخ:</span><span>${returnObj.date}</span></div>
            <div class="receipt-row"><span>السبب:</span><span>${returnObj.reason}</span></div>
            <hr>
            <table><thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr></thead><tbody>${itemsHtml}</tbody></table>
            <hr>
            <div class="receipt-row receipt-total"><span>الإجمالي:</span><span>${fmtMoney(returnObj.total)}</span></div>
        `;
        returnReceiptPreview.innerHTML = html;
        returnReceiptModal.classList.add('open');
    }

    printReturnBtn.addEventListener('click', () => showReturnReceipt(lastSavedReturn));
    closeReturnReceiptModal.addEventListener('click', () => returnReceiptModal.classList.remove('open'));
    closeReturnReceiptBtn.addEventListener('click', () => returnReceiptModal.classList.remove('open'));
    returnReceiptModal.addEventListener('click', (e) => {
        if (e.target === returnReceiptModal) returnReceiptModal.classList.remove('open');
    });

    printReturnReceiptBtn.addEventListener('click', () => {
        const content = returnReceiptPreview.innerHTML;
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
            printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl;text-align:right;background:white;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:5px;border-bottom:1px dashed #ccc}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${content}</body></html>`);
            printWindow.document.close();
            printWindow.focus();
            setTimeout(() => printWindow.print(), 300);
        }
    });

    saveReturnBtn.addEventListener('click', saveReturn);

    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
        sidebarOverlay.classList.toggle('show');
    });
    sidebarOverlay.addEventListener('click', () => {
        sidebar.classList.remove('open');
        sidebarOverlay.classList.remove('show');
    });
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
        });
    });
    moreMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        moreDropdown.classList.toggle('show');
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-actions')) moreDropdown.classList.remove('show');
    });
    logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        if (confirm('هل أنت متأكد من تسجيل الخروج؟')) await App.logout();
    });

    async function initReturnsPage() {
        loadingBar.style.width = '80%';
        try {
            await waitForCore();
            await App.requireAuth();
            App.initUserInterface();
            currentUser = await App.getCurrentUser();
            await loadData();
            loadingBar.style.width = '100%';
        } catch (e) {
            console.error('Returns page init failed:', e);
            loadingBar.style.background = 'var(--danger)';
        } finally {
            setTimeout(() => { loadingBar.style.width = '0%'; }, 300);
        }
    }

    initReturnsPage();
})();
