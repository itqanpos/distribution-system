/* =============================================
   purchases.js - فاتورة المشتريات (مصحح)
   - يعالج قيد المفتاح الأجنبي supplierId
   - لا يرسل supplier_name (غير موجود في الجدول)
   ============================================= */
(async function() {
    'use strict';

    // ========== عناصر DOM ==========
    const loadingBar = document.getElementById('loading-bar');
    const refreshBtn = document.getElementById('refreshBtn');
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const supplierSearchInput = document.getElementById('supplierSearchInput');
    const supplierDropdown = document.getElementById('supplierDropdown');
    const productSearchInput = document.getElementById('productSearchInput');
    const productDropdown = document.getElementById('productDropdown');
    const cartItemsContainer = document.getElementById('cartItemsContainer');
    const subtotalEl = document.getElementById('subtotal');
    const netTotalEl = document.getElementById('netTotal');
    const discountValue = document.getElementById('discountValue');
    const discountType = document.getElementById('discountType');
    const payBtn = document.getElementById('payBtn');
    const unitQuantityModal = document.getElementById('unitQuantityModal');
    const modalProductName = document.getElementById('modalProductName');
    const unitButtons = document.getElementById('unitButtons');
    const selectedQuantity = document.getElementById('selectedQuantity');
    const selectedPrice = document.getElementById('selectedPrice');
    const stockInfo = document.getElementById('stockInfo');
    const addToCartBtn = document.getElementById('addToCartBtn');
    const closeUnitModalBtn = document.getElementById('closeUnitModalBtn');
    const paymentModal = document.getElementById('paymentModal');
    const paySubtotal = document.getElementById('paySubtotal');
    const payDiscount = document.getElementById('payDiscount');
    const payNet = document.getElementById('payNet');
    const paymentMethod = document.getElementById('paymentMethod');
    const cashAmount = document.getElementById('cashAmount');
    const transferAmount = document.getElementById('transferAmount');
    const remainingDisplay = document.getElementById('remainingDisplay');
    const confirmAndPrintBtn = document.getElementById('confirmAndPrintBtn');
    const closePaymentModalBtn = document.getElementById('closePaymentModalBtn');
    const receiptModal = document.getElementById('receiptModal');
    const receiptPrintArea = document.getElementById('receiptPrintArea');
    const printReceiptBtn = document.getElementById('printReceiptBtn');
    const skipPrintBtn = document.getElementById('skipPrintBtn');
    const closeReceiptModalBtn = document.getElementById('closeReceiptModalBtn');

    // ========== الحالة ==========
    let allSuppliers = [];
    let selectedSupplierId = null;
    let cart = [];
    let currentUser = null;
    let selectedProduct = null;
    let selectedUnit = null;
    let addingItem = false;
    let discount = 0;
    let discountTypeValue = 'amount';

    // ========== دوال مساعدة ==========
    function debounce(fn, ms) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    function safeToast(msg, type = 'error') {
        if (window.Toast && typeof window.Toast[type] === 'function') {
            window.Toast[type](msg);
        } else if (window.Toast && typeof window.Toast.show === 'function') {
            window.Toast.show(msg, type);
        } else {
            alert(msg);
        }
    }

    function formatCurrency(v) {
        return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    }

    function formatDate(d) {
        if (!d) return '';
        try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; }
    }

    function showLoading() { loadingBar.style.width = '80%'; }
    function hideLoading() { loadingBar.style.width = '100%'; setTimeout(() => { loadingBar.style.width = '0%'; }, 300); }

    function showModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
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
            currentUser = await App.getCurrentUser();
            if (currentUser) {
                sidebarAvatar.textContent = (currentUser.fullName || 'U')[0].toUpperCase();
                sidebarUserName.textContent = currentUser.fullName || currentUser.email || 'مدير';
            }
        } catch (e) { /* silent */ }
    }

    // ========== جلب الموردين ==========
    async function loadSuppliers() {
        try {
            allSuppliers = await DB.getParties('supplier') || [];
        } catch (e) {
            console.error('فشل جلب الموردين:', e);
            safeToast('تعذر تحميل الموردين', 'error');
        }
    }

    // ========== البحث عن مورد ==========
    function filterSuppliers(term) {
        const dd = supplierDropdown;
        if (!dd) return;
        if (!term) { dd.classList.remove('show'); return; }
        const filtered = allSuppliers.filter(s => s.name.toLowerCase().includes(term.toLowerCase()) || (s.phone && s.phone.includes(term)));
        if (!filtered.length) {
            dd.innerHTML = '<div class="dropdown-item" style="color:var(--text-muted);">لا توجد نتائج</div>';
            dd.classList.add('show');
            return;
        }
        dd.innerHTML = filtered.map(s => `
            <div class="dropdown-item" data-id="${s.id}">
                <div class="item-info"><h4>${escapeHTML(s.name)}</h4><small>${escapeHTML(s.phone || '')}</small></div>
            </div>
        `).join('');
        dd.classList.add('show');
    }

    // ========== اختيار مورد ==========
    function selectSupplier(id) {
        selectedSupplierId = id || null;
        supplierSearchInput.value = id ? (allSuppliers.find(s => s.id === id)?.name || '') : '';
        supplierDropdown.classList.remove('show');
    }

    // ========== البحث عن منتج ==========
    let allProducts = [];
    async function loadProducts() {
        try {
            allProducts = await DB.getProducts() || [];
        } catch (e) {
            console.error('فشل جلب المنتجات:', e);
            safeToast('تعذر تحميل المنتجات', 'error');
        }
    }

    function filterProducts(term) {
        const dd = productDropdown;
        if (!dd) return;
        if (!term) { dd.classList.remove('show'); return; }
        const filtered = allProducts.filter(p => p.name.toLowerCase().includes(term.toLowerCase()) || (p.barcode && p.barcode.includes(term)));
        if (!filtered.length) {
            dd.innerHTML = '<div class="dropdown-item" style="color:var(--text-muted);">لا توجد نتائج</div>';
            dd.classList.add('show');
            return;
        }
        dd.innerHTML = filtered.map(p => `
            <div class="dropdown-item" data-id="${p.id}">
                <div class="item-info"><h4>${escapeHTML(p.name)}</h4></div>
                <div class="item-price">${formatCurrency(p.units?.[0]?.price || 0)}</div>
            </div>
        `).join('');
        dd.classList.add('show');
    }

    // ========== فتح مودال الوحدة ==========
    function openUnitModal(productId) {
        const product = allProducts.find(p => p.id === productId);
        if (!product?.units?.length) {
            safeToast('المنتج غير موجود', 'info');
            return;
        }
        selectedProduct = product;
        selectedUnit = product.units[0];
        modalProductName.textContent = product.name;
        unitButtons.innerHTML = product.units.map((u, i) => `
            <button class="unit-btn ${i === 0 ? 'active' : ''}" data-index="${i}">${escapeHTML(u.name)}</button>
        `).join('');
        updateUnitInfo();
        showModal('unitQuantityModal');
    }

    function selectUnit(index) {
        selectedUnit = selectedProduct.units[index];
        unitButtons.querySelectorAll('.unit-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
        updateUnitInfo();
    }

    function updateUnitInfo() {
        const u = selectedUnit;
        const base = selectedProduct.units[0];
        const stock = base.stock || 0;
        const factor = u.factor || 1;
        const max = u === base ? stock : Math.floor(stock / factor);
        selectedPrice.value = u.price || 0;
        selectedQuantity.max = max;
        selectedQuantity.value = max > 0 ? 1 : 0;
        stockInfo.textContent = `المخزون: ${max} ${u.name}`;
    }

    // ========== إضافة إلى السلة ==========
    function addToCart() {
        if (addingItem) return;
        const qty = +selectedQuantity.value || 0;
        const max = +selectedQuantity.max || 0;
        if (qty <= 0 || qty > max) {
            safeToast('كمية غير متاحة', 'error');
            return;
        }
        const price = +selectedPrice.value || 0;
        const unitName = selectedUnit.name;
        const cost = selectedUnit.cost || 0;

        const existing = cart.find(item => item.productId === selectedProduct.id && item.unitName === unitName);
        if (existing) {
            existing.quantity += qty;
            existing.price = price;
        } else {
            cart.push({
                productId: selectedProduct.id,
                productName: selectedProduct.name,
                unitName,
                quantity: qty,
                price,
                cost,
                factor: selectedUnit.factor || 1,
                isBase: selectedUnit === selectedProduct.units[0]
            });
        }
        renderCart();
        closeModal('unitQuantityModal');
        productSearchInput.value = '';
        productSearchInput.focus();
    }

    // ========== عرض السلة ==========
    function renderCart() {
        cartItemsContainer.innerHTML = '';
        if (!cart.length) {
            cartItemsContainer.innerHTML = '<div class="empty-cart-message">السلة فارغة</div>';
            updateTotals();
            return;
        }
        let html = `<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span></div>`;
        cart.forEach((item, idx) => {
            html += `
                <div class="cart-item-row">
                    <div><span class="cart-item-name">${escapeHTML(item.productName)}</span><br><span class="cart-item-unit">${escapeHTML(item.unitName)}</span></div>
                    <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}"></div>
                    <div><input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}"></div>
                    <div>${formatCurrency(item.price * item.quantity)}</div>
                    <div><i class="fas fa-trash" style="color:var(--danger);cursor:pointer;" data-idx="${idx}"></i></div>
                </div>`;
        });
        cartItemsContainer.innerHTML = html;
        cartItemsContainer.querySelectorAll('.cart-qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const val = +e.target.value;
                if (isNaN(val) || val <= 0) cart.splice(idx, 1);
                else cart[idx].quantity = val;
                renderCart();
            });
        });
        cartItemsContainer.querySelectorAll('.cart-price-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const val = +e.target.value;
                if (!isNaN(val) && val >= 0) cart[idx].price = val;
                renderCart();
            });
        });
        cartItemsContainer.querySelectorAll('.fa-trash').forEach(trash => {
            trash.addEventListener('click', (e) => {
                const idx = +e.target.dataset.idx;
                cart.splice(idx, 1);
                renderCart();
            });
        });
        updateTotals();
    }

    function updateTotals() {
        let subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        subtotal = Math.round(subtotal * 100) / 100;
        let disc = discountTypeValue === 'amount' ? Math.min(discount, subtotal) : Math.round(subtotal * discount / 100 * 100) / 100;
        const net = Math.round((subtotal - disc) * 100) / 100;
        subtotalEl.textContent = formatCurrency(subtotal);
        netTotalEl.textContent = formatCurrency(net);
        paySubtotal.textContent = formatCurrency(subtotal);
        payDiscount.textContent = formatCurrency(disc);
        payNet.textContent = formatCurrency(net);
    }

    // ========== فتح مودال الدفع ==========
    function openPayment() {
        if (!cart.length) {
            safeToast('السلة فارغة', 'info');
            return;
        }
        updateTotals();
        cashAmount.value = '';
        transferAmount.value = '';
        paymentMethod.value = 'cash';
        remainingDisplay.textContent = '';
        showModal('paymentModal');
    }

    // ========== إتمام الدفع وحفظ الفاتورة ==========
    async function completePayment() {
        if (!cart.length) return;
        if (!selectedSupplierId) {
            safeToast('يجب اختيار مورد', 'warning');
            return;
        }
        confirmAndPrintBtn.disabled = true;
        try {
            const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
            const disc = discountTypeValue === 'amount' ? Math.min(discount, subtotal) : Math.round(subtotal * discount / 100 * 100) / 100;
            const net = Math.round((subtotal - disc) * 100) / 100;
            const method = paymentMethod.value;
            let cash = 0, transfer = 0;
            if (method === 'cash') cash = +cashAmount.value || 0;
            else if (method === 'transfer') transfer = +transferAmount.value || 0;
            else if (method === 'mixed') {
                cash = +cashAmount.value || 0;
                transfer = +transferAmount.value || 0;
            }
            const paid = cash + transfer;
            const remaining = Math.max(0, net - paid);
            const status = remaining > 0 ? 'partial' : 'paid';

            // بناء كائن الفاتورة (مصحح)
            const invoice = {
                id: window.generateUUID ? generateUUID() : crypto.randomUUID(),
                invoice_number: await DB.generateInvoiceNumber(),
                date: new Date().toISOString().split('T')[0],
                type: 'purchase',
                supplierId: selectedSupplierId,      // ✅ استخدام العمود الصحيح (camelCase)
                // لا نرسل supplier_name إطلاقاً
                items: cart.map(item => ({ ...item })),
                subtotal,
                discount: disc,
                total: net,
                cash_paid: cash,
                transfer_paid: transfer,
                paid,
                remaining,
                status,
                notes: document.getElementById('paymentNotes')?.value || '',
                tenant_id: currentUser?.tenant_id,
                created_by: currentUser?.id
            };

            // حفظ الفاتورة (استخدم دالة DB المناسبة)
            const result = await DB.createPurchaseInvoice(invoice);
            if (!result?.success) throw new Error(result?.error || 'فشل الحفظ');

            // عرض الإيصال
            showReceipt(invoice);
            closeModal('paymentModal');
            cart = [];
            renderCart();
            safeToast('تم الحفظ بنجاح', 'success');
        } catch (e) {
            console.error(e);
            safeToast(e.message || 'فشل إنشاء الفاتورة', 'error');
        } finally {
            confirmAndPrintBtn.disabled = false;
        }
    }

    // ========== عرض إيصال ==========
    function showReceipt(inv) {
        const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
        const shopName = settings?.company?.name || 'حسابي';
        const footer = settings?.print?.footer_message || 'شكراً لتعاملكم معنا';
        let itemsHtml = '';
        inv.items.forEach(item => {
            itemsHtml += `<tr><td>${escapeHTML(item.productName)} - ${escapeHTML(item.unitName)}</td><td style="text-align:center;">${item.quantity}</td><td style="text-align:center;">${formatCurrency(item.price)}</td><td style="text-align:left;">${formatCurrency(item.price * item.quantity)}</td></tr>`;
        });
        receiptPrintArea.innerHTML = `
            <div style="font-family:'Cairo',sans-serif;font-size:13px;line-height:1.5;text-align:right;direction:rtl;padding:10px;width:80mm;max-width:100%;margin:0 auto;background:white;">
                <div style="text-align:center;font-weight:bold;font-size:16px;">${escapeHTML(shopName)}</div>
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <div>رقم الفاتورة: <strong>${escapeHTML(inv.invoice_number)}</strong></div>
                <div>التاريخ: ${formatDate(inv.date)}</div>
                <div>المورد: <strong>${escapeHTML(allSuppliers.find(s => s.id === selectedSupplierId)?.name || '')}</strong></div>
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <div>الإجمالي: ${formatCurrency(inv.subtotal)}</div>
                ${inv.discount > 0 ? `<div>الخصم: ${formatCurrency(inv.discount)}</div>` : ''}
                <div>الصافي: ${formatCurrency(inv.total)}</div>
                <div>المدفوع: ${formatCurrency(inv.paid)}</div>
                <div>المتبقي: ${formatCurrency(inv.remaining)}</div>
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <div style="text-align:center;font-weight:bold;">${escapeHTML(footer)}</div>
            </div>
        `;
        showModal('receiptModal');
    }

    // ========== تهيئة الصفحة ==========
    async function init() {
        try {
            if (!window.App || !window.DB) {
                safeToast('النواة غير محملة', 'error');
                return;
            }
            const authorized = await App.requireAuth();
            if (!authorized) return;
            if (!App.requireRole || !(await App.requireRole(['admin']))) return;

            bindSidebar();
            await loadUserInfo();
            await Promise.all([loadSuppliers(), loadProducts()]);
            renderCart();

            // الأحداث
            refreshBtn?.addEventListener('click', () => {
                loadSuppliers();
                loadProducts();
            });
            supplierSearchInput?.addEventListener('input', debounce((e) => filterSuppliers(e.target.value), 300));
            supplierDropdown?.addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (item?.dataset.id) selectSupplier(item.dataset.id);
            });
            productSearchInput?.addEventListener('input', debounce((e) => filterProducts(e.target.value), 300));
            productSearchInput?.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const term = e.target.value.trim();
                    const product = allProducts.find(p => p.barcode === term || p.name === term);
                    if (product) openUnitModal(product.id);
                }
            });
            productDropdown?.addEventListener('click', (e) => {
                const item = e.target.closest('.dropdown-item');
                if (item?.dataset.id) openUnitModal(item.dataset.id);
            });
            discountValue?.addEventListener('input', (e) => {
                discount = +e.target.value || 0;
                renderCart();
            });
            discountType?.addEventListener('change', (e) => {
                discountTypeValue = e.target.value;
                renderCart();
            });
            payBtn?.addEventListener('click', openPayment);
            addToCartBtn?.addEventListener('click', addToCart);
            closeUnitModalBtn?.addEventListener('click', () => closeModal('unitQuantityModal'));
            unitButtons?.addEventListener('click', (e) => {
                const btn = e.target.closest('.unit-btn');
                if (btn) selectUnit(+btn.dataset.index);
            });
            confirmAndPrintBtn?.addEventListener('click', completePayment);
            closePaymentModalBtn?.addEventListener('click', () => closeModal('paymentModal'));
            printReceiptBtn?.addEventListener('click', () => {
                const content = receiptPrintArea.innerHTML;
                const printWindow = window.open('', '_blank', 'width=400,height=600');
                if (printWindow) {
                    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl;text-align:right;padding:10px;}</style></head><body>${content}</body></html>`);
                    printWindow.document.close();
                    printWindow.focus();
                    printWindow.print();
                }
            });
            skipPrintBtn?.addEventListener('click', () => closeModal('receiptModal'));
            closeReceiptModalBtn?.addEventListener('click', () => closeModal('receiptModal'));

            // إغلاق المودالات عند النقر على الخلفية
            document.querySelectorAll('.modal').forEach(modal => {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal) modal.classList.remove('open');
                });
            });

        } catch (e) {
            console.error('فشل التهيئة:', e);
            safeToast('تعذر تحميل الصفحة', 'error');
        }
    }

    init();
})();
