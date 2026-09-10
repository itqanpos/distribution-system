/* =============================================
   purchases.js - منطق صفحة المشتريات
   - إدارة كاملة للسلة والمنتجات والموردين
   - حفظ الفواتير في قاعدة البيانات
   - بدون مشاكل قيود supplierId
   ============================================= */
(function() {
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
    const supplierInfo = document.getElementById('supplierInfo');
    const productSearchInput = document.getElementById('productSearchInput');
    const productDropdown = document.getElementById('productDropdown');
    const tabletProductSearchInput = document.getElementById('tabletProductSearchInput');
    const productGrid = document.getElementById('productGrid');
    const cartItemsContainer = document.getElementById('cartItemsContainer');
    const subtotalEl = document.getElementById('subtotal');
    const netTotalEl = document.getElementById('netTotal');
    const itemTypesCount = document.getElementById('itemTypesCount');
    const totalPieces = document.getElementById('totalPieces');
    const discountValue = document.getElementById('discountValue');
    const discountType = document.getElementById('discountType');
    const payBtn = document.getElementById('payBtn');
    const profitDisplay = document.getElementById('profitDisplay');

    // Modal Elements
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
    const currentBalance = document.getElementById('currentBalance');
    const paymentMethod = document.getElementById('paymentMethod');
    const cashField = document.getElementById('cashField');
    const transferField = document.getElementById('transferField');
    const cashAmount = document.getElementById('cashAmount');
    const transferAmount = document.getElementById('transferAmount');
    const remainingDisplay = document.getElementById('remainingDisplay');
    const balanceAfterLabel = document.getElementById('balanceAfterLabel');
    const balanceAfter = document.getElementById('balanceAfter');
    const paymentNotes = document.getElementById('paymentNotes');
    const confirmAndSaveBtn = document.getElementById('confirmAndSaveBtn');
    const closePaymentModalBtn = document.getElementById('closePaymentModalBtn');

    const receiptModal = document.getElementById('receiptModal');
    const receiptPrintArea = document.getElementById('receiptPrintArea');
    const printReceiptBtn = document.getElementById('printReceiptBtn');
    const skipPrintBtn = document.getElementById('skipPrintBtn');
    const closeReceiptModalBtn = document.getElementById('closeReceiptModalBtn');

    // ========== الحالة ==========
    let allProducts = [];
    let allSuppliers = [];
    let cart = [];
    let selectedSupplierId = null;
    let selectedProduct = null;
    let selectedUnit = null;
    let currentUser = null;
    let addingItem = false;
    let discountAmount = 0;
    let discountTypeVal = 'amount';

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

    function escapeHTML(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str || ''));
        return div.innerHTML;
    }

    function showLoading() { loadingBar.style.width = '80%'; }
    function hideLoading() { loadingBar.style.width = '100%'; setTimeout(() => { loadingBar.style.width = '0%'; }, 300); }

    function showModal(el) { if (el) el.classList.add('open'); }
    function closeModal(el) { if (el) el.classList.remove('open'); }

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

    // ========== تحميل المستخدم ==========
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

    // ========== تحميل البيانات ==========
    async function loadProducts() {
        try {
            allProducts = await DB.getProducts() || [];
            renderProductGrid();
        } catch (e) {
            console.error('فشل تحميل المنتجات:', e);
            safeToast('تعذر تحميل المنتجات', 'error');
        }
    }

    async function loadSuppliers() {
        try {
            allSuppliers = await DB.getParties('supplier') || [];
        } catch (e) {
            console.error('فشل تحميل الموردين:', e);
            safeToast('تعذر تحميل الموردين', 'error');
        }
    }

    // ========== عرض شبكة المنتجات ==========
    function renderProductGrid(products = allProducts) {
        if (!productGrid) return;
        if (!products.length) {
            productGrid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">لا توجد منتجات</div>';
            return;
        }
        productGrid.innerHTML = products.map(p => {
            const stock = p.units?.[0]?.stock || 0;
            const price = p.units?.[0]?.price || 0;
            return `
                <div class="product-card" data-id="${p.id}">
                    <div style="font-weight:700;font-size:0.9rem;margin-bottom:4px;">${escapeHTML(p.name)}</div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);">${formatCurrency(price)}</div>
                    <div style="font-size:0.7rem;color:${stock > 0 ? 'var(--success)' : 'var(--danger)'};">${stock > 0 ? 'متوفر: ' + stock : 'نفذ'}</div>
                </div>
            `;
        }).join('');
        productGrid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => openUnitModal(card.dataset.id));
        });
    }

    // ========== فلترة المنتجات ==========
    function filterTabletProducts() {
        const term = (tabletProductSearchInput?.value || '').trim().toLowerCase();
        if (!term) return renderProductGrid();
        const filtered = allProducts.filter(p => p.name?.toLowerCase().includes(term) || (p.barcode && p.barcode.includes(term)));
        renderProductGrid(filtered);
    }

    function filterProductsDropdown(term) {
        if (!productDropdown) return;
        if (!term) { productDropdown.classList.remove('show'); return; }
        const filtered = allProducts.filter(p => p.name?.toLowerCase().includes(term.toLowerCase()) || (p.barcode && p.barcode.includes(term)));
        if (!filtered.length) {
            productDropdown.innerHTML = '<div class="dropdown-item" style="color:var(--text-muted);text-align:center;">لا توجد نتائج</div>';
            productDropdown.classList.add('show');
            return;
        }
        productDropdown.innerHTML = filtered.map(p => `
            <div class="dropdown-item" data-id="${p.id}">
                <div class="item-info"><h4>${escapeHTML(p.name)}</h4></div>
                <div class="item-price">${formatCurrency(p.units?.[0]?.price || 0)}</div>
            </div>
        `).join('');
        productDropdown.classList.add('show');
    }

    // ========== فلترة الموردين ==========
    function filterSuppliersDropdown(term) {
        if (!supplierDropdown) return;
        if (!term) { supplierDropdown.classList.remove('show'); return; }
        const filtered = allSuppliers.filter(s => s.name?.toLowerCase().includes(term.toLowerCase()) || (s.phone && s.phone.includes(term)));
        if (!filtered.length) {
            supplierDropdown.innerHTML = '<div class="dropdown-item" style="color:var(--text-muted);text-align:center;">لا توجد نتائج</div>';
            supplierDropdown.classList.add('show');
            return;
        }
        supplierDropdown.innerHTML = filtered.map(s => {
            const bal = s.balance || 0;
            const balText = bal > 0 ? `دائن ${formatCurrency(bal)}` : bal < 0 ? `مدين ${formatCurrency(-bal)}` : 'لا رصيد';
            const color = bal > 0 ? 'var(--success)' : bal < 0 ? 'var(--danger)' : 'var(--text-muted)';
            return `
                <div class="dropdown-item" data-id="${s.id}">
                    <div class="item-info">
                        <h4>${escapeHTML(s.name)}</h4>
                        <small style="color:${color};">${balText}</small>
                    </div>
                    <div class="item-price">${escapeHTML(s.phone || '')}</div>
                </div>
            `;
        }).join('');
        supplierDropdown.classList.add('show');
    }

    function selectSupplier(id) {
        selectedSupplierId = id || null;
        const supplier = allSuppliers.find(s => s.id === id);
        supplierSearchInput.value = supplier?.name || '';
        supplierDropdown.classList.remove('show');
        updateSupplierInfo();
    }

    function updateSupplierInfo() {
        if (!supplierInfo) return;
        if (!selectedSupplierId) { supplierInfo.innerHTML = ''; return; }
        const s = allSuppliers.find(x => x.id === selectedSupplierId);
        if (!s) return;
        const bal = s.balance || 0;
        const label = bal > 0 ? `دائن ${formatCurrency(bal)}` : bal < 0 ? `مدين ${formatCurrency(-bal)}` : 'لا رصيد';
        const color = bal > 0 ? 'var(--success)' : bal < 0 ? 'var(--danger)' : 'var(--text-muted)';
        supplierInfo.innerHTML = `<span style="color:${color};">${label}</span>`;
    }

    // ========== مودال الوحدة ==========
    function openUnitModal(productId) {
        const product = allProducts.find(p => p.id === productId);
        if (!product?.units?.length) {
            safeToast('المنتج غير موجود', 'info');
            return;
        }
        selectedProduct = product;
        selectedUnit = product.units[0];
        modalProductName.textContent = product.name;
        unitButtons.innerHTML = product.units.map((u, i) =>
            `<button class="unit-btn ${i === 0 ? 'active' : ''}" data-index="${i}">${escapeHTML(u.name)}</button>`
        ).join('');
        updateUnitInfo();
        showModal(unitQuantityModal);
    }

    function selectUnit(index) {
        if (!selectedProduct) return;
        selectedUnit = selectedProduct.units[index];
        unitButtons.querySelectorAll('.unit-btn').forEach((btn, i) => btn.classList.toggle('active', i === index));
        updateUnitInfo();
    }

    function updateUnitInfo() {
        if (!selectedProduct || !selectedUnit) return;
        const base = selectedProduct.units[0];
        const stock = base.stock || 0;
        const factor = selectedUnit.factor || 1;
        const max = selectedUnit === base ? stock : Math.floor(stock / factor);
        selectedPrice.value = selectedUnit.price || 0;
        selectedQuantity.max = Math.max(0, max);
        selectedQuantity.value = max > 0 ? 1 : 0;
        stockInfo.textContent = `المخزون الحالي: ${max} ${selectedUnit.name}`;
    }

    // ========== إضافة للسلة ==========
    function addToCart() {
        if (addingItem) return;
        addingItem = true;
        if (addToCartBtn) addToCartBtn.disabled = true;

        try {
            const qty = +selectedQuantity.value || 0;
            const max = +selectedQuantity.max || 0;
            if (qty <= 0) {
                safeToast('أدخل كمية صحيحة', 'warning');
                return;
            }
            const price = +selectedPrice.value || 0;
            const unitName = selectedUnit.name;
            const cost = selectedUnit.cost || 0;

            const existing = cart.find(item => item.productId === selectedProduct.id && item.unitName === unitName);
            if (existing) {
                existing.quantity = Math.round((existing.quantity + qty) * 1000) / 1000;
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
            closeModal(unitQuantityModal);
            productSearchInput.value = '';
            productSearchInput.focus();
        } finally {
            addingItem = false;
            if (addToCartBtn) addToCartBtn.disabled = false;
        }
    }

    // ========== عرض السلة ==========
    function renderCart() {
        if (!cartItemsContainer) return;
        if (!cart.length) {
            cartItemsContainer.innerHTML = '<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span></div><div class="empty-cart-message">السلة فارغة</div>';
            updateTotals();
            return;
        }
        let html = '<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span></div>';
        cart.forEach((item, idx) => {
            html += `
                <div class="cart-item-row">
                    <div>
                        <span class="cart-item-name">${escapeHTML(item.productName)}</span><br>
                        <span class="cart-item-unit">${escapeHTML(item.unitName)}</span>
                    </div>
                    <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}"></div>
                    <div><input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}"></div>
                    <div>${formatCurrency(item.price * item.quantity)}</div>
                    <div><i class="fas fa-trash" data-idx="${idx}"></i></div>
                </div>
            `;
        });
        cartItemsContainer.innerHTML = html;

        cartItemsContainer.querySelectorAll('.cart-qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const v = +e.target.value;
                if (isNaN(v) || v <= 0) cart.splice(idx, 1);
                else cart[idx].quantity = v;
                renderCart();
            });
        });
        cartItemsContainer.querySelectorAll('.cart-price-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const v = +e.target.value;
                if (!isNaN(v) && v >= 0) cart[idx].price = v;
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
        let sub = cart.reduce((sum, i) => sum + i.price * i.quantity, 0);
        sub = Math.round(sub * 100) / 100;
        let disc = 0;
        if (discountTypeVal === 'amount') disc = Math.min(discountAmount, sub);
        else disc = Math.round(sub * (discountAmount / 100) * 100) / 100;
        const net = Math.round((sub - disc) * 100) / 100;

        if (subtotalEl) subtotalEl.textContent = formatCurrency(sub);
        if (netTotalEl) netTotalEl.textContent = formatCurrency(net);
        if (itemTypesCount) itemTypesCount.textContent = cart.length;
        let pieces = 0;
        for (const i of cart) pieces += i.quantity * (i.factor || 1);
        if (totalPieces) totalPieces.textContent = Math.round(pieces);
    }

    // ========== المدفوعات ==========
    function openPayment() {
        if (!cart.length) { safeToast('السلة فارغة', 'info'); return; }
        if (!selectedSupplierId) { safeToast('يجب اختيار مورد أولاً', 'warning'); return; }

        const sub = cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const disc = discountTypeVal === 'amount' ? Math.min(discountAmount, sub) : Math.round(sub * (discountAmount / 100) * 100) / 100;
        const net = Math.round((sub - disc) * 100) / 100;

        paySubtotal.textContent = formatCurrency(sub);
        payDiscount.textContent = formatCurrency(disc);
        payNet.textContent = formatCurrency(net);

        const supplier = allSuppliers.find(s => s.id === selectedSupplierId);
        const bal = supplier?.balance || 0;
        currentBalance.textContent = formatCurrency(Math.abs(bal));

        cashAmount.value = '';
        transferAmount.value = '';
        paymentMethod.value = 'cash';
        togglePaymentFields();
        previewPayment();
        showModal(paymentModal);
    }

    function togglePaymentFields() {
        const m = paymentMethod.value || 'cash';
        cashField.style.display = (m === 'cash' || m === 'mixed') ? 'block' : 'none';
        transferField.style.display = (m === 'transfer' || m === 'mixed') ? 'block' : 'none';
        previewPayment();
    }

    function previewPayment() {
        const sub = cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const disc = discountTypeVal === 'amount' ? Math.min(discountAmount, sub) : Math.round(sub * (discountAmount / 100) * 100) / 100;
        const net = Math.round((sub - disc) * 100) / 100;
        const m = paymentMethod.value || 'cash';
        let cash = 0, trans = 0;
        if (m === 'cash') cash = +cashAmount.value || 0;
        else if (m === 'transfer') trans = +transferAmount.value || 0;
        else if (m === 'mixed') { cash = +cashAmount.value || 0; trans = +transferAmount.value || 0; }

        const supplier = allSuppliers.find(s => s.id === selectedSupplierId);
        const supplierBal = supplier?.balance || 0;

        const paid = m === 'credit' ? 0 : cash + trans;
        const diff = m === 'credit' ? net : Math.round((paid - net) * 100) / 100;

        // رصيد المورد بعد العملية (يُحسب عكس العملاء)
        // إذا دفعنا للمورد أكثر من قيمة الفاتورة، يصبح له رصيد دائن
        const newBal = m === 'credit' ? supplierBal + net : supplierBal + (net - paid);
        // ملاحظة: رصيد الموردين بنفس منطق العملاء في التطبيق (موجب = دائن لنا، سالب = علينا)

        remainingDisplay.textContent = diff >= 0 ? `متبقي ${formatCurrency(diff)}` : `فائض ${formatCurrency(-diff)}`;
        balanceAfterLabel.textContent = newBal >= 0 ? 'رصيد المورد بعد الشراء:' : 'رصيد المورد بعد الشراء:';
        balanceAfter.textContent = formatCurrency(Math.abs(newBal));
        balanceAfter.classList.toggle('text-success', newBal >= 0);
        balanceAfter.classList.toggle('text-danger', newBal < 0);
    }

    // ========== حفظ الفاتورة ==========
    async function completePurchase() {
        if (!cart.length) return;
        if (!selectedSupplierId) { safeToast('يجب اختيار مورد', 'warning'); return; }

        confirmAndSaveBtn.disabled = true;
        try {
            const sub = cart.reduce((s, i) => s + i.price * i.quantity, 0);
            const disc = discountTypeVal === 'amount' ? Math.min(discountAmount, sub) : Math.round(sub * (discountAmount / 100) * 100) / 100;
            const net = Math.round((sub - disc) * 100) / 100;

            const m = paymentMethod.value || 'cash';
            let cash = 0, trans = 0;
            if (m === 'cash') cash = +cashAmount.value || 0;
            else if (m === 'transfer') trans = +transferAmount.value || 0;
            else if (m === 'mixed') { cash = +cashAmount.value || 0; trans = +transferAmount.value || 0; }

            const paid = m === 'credit' ? 0 : cash + trans;
            const remaining = Math.max(0, net - paid);
            const status = m === 'credit' ? 'credit' : (remaining > 0 ? 'partial' : 'paid');

            // توليد رقم الفاتورة
            let invoiceNumber;
            try {
                invoiceNumber = await DB.generateInvoiceNumber();
            } catch (e) {
                console.warn('فشل توليد الرقم من السيرفر، استخدام توليد محلي');
                const y = new Date().getFullYear().toString().slice(-2);
                const k = `inv_purchase_${y}`;
                let n = (parseInt(localStorage.getItem(k) || '0', 10) + 1);
                localStorage.setItem(k, String(n));
                invoiceNumber = 'P' + y + '-' + String(n).padStart(4, '0');
            }

            const inv = {
                id: (crypto?.randomUUID ? crypto.randomUUID() : generateFallbackUUID()),
                invoice_number: invoiceNumber,
                type: 'purchase',
                date: new Date().toISOString().split('T')[0],
                supplierId: selectedSupplierId,
                // لا نرسل supplier_name إطلاقاً (غير موجود في جدول invoices)
                items: cart.map(i => ({ ...i })),
                subtotal: sub,
                discount: disc,
                total: net,
                cash_paid: cash,
                transfer_paid: trans,
                paid: paid,
                remaining: remaining,
                status: status,
                notes: paymentNotes.value || '',
                tenant_id: currentUser?.tenant_id,
                created_by: currentUser?.id
            };

            // استخدام saveInvoice (لا يمر عبر RPC) لتجنب مشاكل قيود المفاتيح الأجنبية
            await DB.saveInvoice(inv);

            // عرض الإيصال
            showReceipt(inv, allSuppliers.find(s => s.id === selectedSupplierId));

            // إعادة التهيئة
            closeModal(paymentModal);
            cart = [];
            selectedSupplierId = null;
            supplierSearchInput.value = '';
            supplierInfo.innerHTML = '';
            discountAmount = 0;
            discountValue.value = '0';
            renderCart();

            safeToast('تم حفظ فاتورة المشتريات بنجاح', 'success');
        } catch (e) {
            console.error('فشل الحفظ:', e);
            safeToast(e.message || 'فشل حفظ الفاتورة', 'error');
        } finally {
            confirmAndSaveBtn.disabled = false;
        }
    }

    function generateFallbackUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ========== الإيصال ==========
    function showReceipt(inv, supplier) {
        const s = JSON.parse(localStorage.getItem('app_settings') || '{}');
        const shopName = s?.company?.name || 'حسابي';
        const shopPhone = s?.company?.phone || '';
        const footerMsg = s?.print?.footer_message || 'شكراً لتعاملكم معنا';

        let itemsHtml = '';
        inv.items.forEach(item => {
            const lineTotal = item.price * item.quantity;
            itemsHtml += `
                <tr>
                    <td>${escapeHTML(item.productName)} - ${escapeHTML(item.unitName)}</td>
                    <td style="text-align:center;">${item.quantity}</td>
                    <td style="text-align:center;">${formatCurrency(item.price)}</td>
                    <td style="text-align:left;">${formatCurrency(lineTotal)}</td>
                </tr>
            `;
        });

        receiptPrintArea.innerHTML = `
            <div style="font-family:'Cairo',sans-serif;font-size:13px;line-height:1.6;text-align:right;direction:rtl;padding:10px;background:white;">
                <div style="text-align:center;font-weight:bold;font-size:16px;margin-bottom:5px;">${escapeHTML(shopName)}</div>
                ${shopPhone ? `<div style="text-align:center;font-size:12px;margin-bottom:10px;">هاتف: ${escapeHTML(shopPhone)}</div>` : ''}
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <div style="display:flex;justify-content:space-between;"><span>المورد:</span> <strong>${escapeHTML(supplier?.name || '-')}</strong></div>
                <div style="display:flex;justify-content:space-between;"><span>رقم الفاتورة:</span> <strong>${escapeHTML(inv.invoice_number)}</strong></div>
                <div style="display:flex;justify-content:space-between;"><span>التاريخ:</span> ${formatDate(inv.date)}</div>
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <table style="width:100%;border-collapse:collapse;font-size:12px;">
                    <thead>
                        <tr>
                            <th style="text-align:right;">الصنف</th>
                            <th style="text-align:center;">كمية</th>
                            <th style="text-align:center;">سعر</th>
                            <th style="text-align:left;">إجمالي</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <div style="display:flex;justify-content:space-between;"><span>الإجمالي:</span> ${formatCurrency(inv.subtotal)}</div>
                ${inv.discount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>الخصم:</span> ${formatCurrency(inv.discount)}</div>` : ''}
                <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;"><span>الصافي:</span> ${formatCurrency(inv.total)}</div>
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <div style="display:flex;justify-content:space-between;"><span>المدفوع:</span> ${formatCurrency(inv.paid)}</div>
                ${inv.remaining > 0 ? `<div style="display:flex;justify-content:space-between;color:red;"><span>المتبقي:</span> ${formatCurrency(inv.remaining)}</div>` : ''}
                <hr style="border-top:1px dashed #000;margin:10px 0;">
                <div style="text-align:center;font-weight:bold;">${escapeHTML(footerMsg)}</div>
            </div>
        `;
        showModal(receiptModal);
    }

    function printReceipt() {
        const content = receiptPrintArea.innerHTML;
        const win = window.open('', '_blank', 'width=400,height=600');
        if (win) {
            win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl;text-align:right;padding:10px;background:white;}@media print{body{padding:0;}}</style></head><body>${content}</body></html>`);
            win.document.close();
            win.focus();
            setTimeout(() => { win.print(); }, 300);
        } else {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            document.body.appendChild(iframe);
            iframe.contentDocument.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl;}</style></head><body>${content}</body></html>`);
            iframe.contentDocument.close();
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            setTimeout(() => { document.body.removeChild(iframe); }, 1000);
        }
    }

    // ========== ربط الأحداث ==========
    function bindEvents() {
        // القائمة الجانبية
        bindSidebar();

        // التحديث
        refreshBtn?.addEventListener('click', async () => {
            await Promise.all([loadProducts(), loadSuppliers()]);
            safeToast('تم التحديث', 'success');
        });

        // البحث في التابلت
        tabletProductSearchInput?.addEventListener('input', debounce(filterTabletProducts, 200));

        // البحث عن المنتجات في السلة
        productSearchInput?.addEventListener('input', debounce((e) => filterProductsDropdown(e.target.value), 200));
        productSearchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim();
                const product = allProducts.find(p => p.barcode === term || p.code === term || p.name === term);
                if (product) openUnitModal(product.id);
            }
        });
        productDropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                openUnitModal(item.dataset.id);
                productSearchInput.value = '';
                productDropdown.classList.remove('show');
            }
        });

        // البحث عن الموردين
        supplierSearchInput?.addEventListener('input', debounce((e) => filterSuppliersDropdown(e.target.value), 200));
        supplierDropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) selectSupplier(item.dataset.id);
        });

        // إغلاق القوائم عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-header')) {
                productDropdown?.classList.remove('show');
                supplierDropdown?.classList.remove('show');
            }
        });

        // الوحدة
        closeUnitModalBtn?.addEventListener('click', () => closeModal(unitQuantityModal));
        addToCartBtn?.addEventListener('click', addToCart);
        unitButtons?.addEventListener('click', (e) => {
            const btn = e.target.closest('.unit-btn');
            if (btn) selectUnit(+btn.dataset.index);
        });

        // الخصم
        discountValue?.addEventListener('input', (e) => {
            discountAmount = +e.target.value || 0;
            updateTotals();
        });
        discountType?.addEventListener('change', (e) => {
            discountTypeVal = e.target.value;
            updateTotals();
        });

        // الدفع
        payBtn?.addEventListener('click', openPayment);
        closePaymentModalBtn?.addEventListener('click', () => closeModal(paymentModal));
        paymentMethod?.addEventListener('change', togglePaymentFields);
        cashAmount?.addEventListener('input', previewPayment);
        transferAmount?.addEventListener('input', previewPayment);
        confirmAndSaveBtn?.addEventListener('click', completePurchase);

        // الإيصال
        closeReceiptModalBtn?.addEventListener('click', () => closeModal(receiptModal));
        skipPrintBtn?.addEventListener('click', () => closeModal(receiptModal));
        printReceiptBtn?.addEventListener('click', printReceipt);

        // إغلاق المودالات عند النقر على الخلفية
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        // اختصارات لوحة المفاتيح
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'F2') { e.preventDefault(); productSearchInput?.focus(); }
            if (e.key === 'F4') { e.preventDefault(); if (cart.length) openPayment(); }
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
            }
        });

        // حالة الاتصال
        window.addEventListener('online', () => {
            document.body.classList.remove('offline');
            loadProducts();
            loadSuppliers();
        });
        window.addEventListener('offline', () => {
            document.body.classList.add('offline');
        });

        // Realtime
        if (window.supabaseClient) {
            window.supabaseClient
                .channel('purchases-updates')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
                    loadProducts();
                })
                .on('postgres_changes', { event: '*', schema: 'public', table: 'parties' }, () => {
                    loadSuppliers();
                })
                .subscribe();
        }
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
            if (App.requireRole && !(await App.requireRole(['admin']))) return;

            showLoading();
            document.body.classList.toggle('offline', !navigator.onLine);

            await loadUserInfo();
            await Promise.all([loadProducts(), loadSuppliers()]);
            renderCart();
            bindEvents();

            hideLoading();
        } catch (e) {
            console.error('فشل التهيئة:', e);
            safeToast('تعذر تحميل الصفحة', 'error');
        }
    }

    init();
})();
