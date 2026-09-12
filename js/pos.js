/* =============================================
   pos.js - Point of Sale Logic
   Works with: config.js, utils.js, db.js, auth.js
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ State ============ */
    const State = {
        products: [],
        customers: [],
        cart: [],
        selectedProduct: null,
        selectedUnit: null,
        selectedCustomerId: null,
        discount: 0,
        discountType: 'amount',
        paymentMethod: 'cash',
        currentUser: null,
        currentCategory: 'الكل',
        searchTerm: '',
        _duplicateCallback: null,
        _addingItem: false
    };

    /* ============ Init ============ */
    async function init() {
        console.log('🚀 POS init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (!window.DB?.client) {
            console.error('❌ Supabase غير محمّل');
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

        console.log('👤 User:', State.currentUser.email);

        updateUserUI();
        updateConnStatus();
        bindEvents();
        updateHeldCount();

        await loadData();
        restoreCart();
        restoreTheme();

        hideLoadingBar();
        console.log('✅ POS ready');
    }

    /* ============ Load Data ============ */
    async function loadData() {
        showLoading();
        try {
            const [products, customers] = await Promise.all([
                DB.getProducts(true).catch(() => []),
                DB.getParties('customer', true).catch(() => [])
            ]);

            State.products = products || [];
            State.customers = customers || [];

            console.log('📦 Products:', State.products.length);
            console.log('👥 Customers:', State.customers.length);

            renderCategories();
            renderProductGrid();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
        } finally {
            hideLoadingBar();
        }
    }

    /* ============ User UI ============ */
    function updateUserUI() {
        const avatar = $('#sidebarAvatar');
        const name = $('#sidebarUserName');
        if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
        if (name) name.textContent = State.currentUser.fullName || 'مدير';
    }

    function updateConnStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('offline', !online);
        const navbar = $('#mainNavbar');
        if (navbar) navbar.classList.toggle('offline', !online);
    }

    /* ============ Theme ============ */
    function restoreTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    function updateThemeIcon() {
        const btn = $('#themeToggleBtn');
        if (!btn) return;
        const isDark = document.documentElement.dataset.theme === 'dark';
        btn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    /* ============ Categories ============ */
    function renderCategories() {
        const el = $('#categoryTabs');
        if (!el) return;

        const cats = ['الكل', ...new Set(State.products.map(p => p.category).filter(Boolean))];

        el.innerHTML = cats.map(c =>
            `<button class="cat-tab ${c === State.currentCategory ? 'active' : ''}" data-cat="${U.escape(c)}">${U.escape(c)}</button>`
        ).join('');

        el.querySelectorAll('.cat-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                State.currentCategory = btn.dataset.cat;
                renderCategories();
                renderProductGrid();
            });
        });
    }

    /* ============ Products Grid ============ */
    function renderProductGrid() {
        const grid = $('#productGrid');
        if (!grid) return;

        let list = State.products;

        if (State.currentCategory !== 'الكل') {
            list = list.filter(p => p.category === State.currentCategory);
        }

        if (State.searchTerm) {
            const term = State.searchTerm.toLowerCase();
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.barcode || '').includes(State.searchTerm) ||
                (p.code || '').includes(State.searchTerm)
            );
        }

        if (!list.length) {
            grid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
                    <i class="fas fa-box-open" style="font-size:50px;opacity:0.3;display:block;margin-bottom:12px;"></i>
                    <p style="font-weight:700;">لا توجد منتجات</p>
                </div>
            `;
            return;
        }

        grid.innerHTML = list.map(p => {
            const base = p.units?.[0] || { price: 0, stock: 0 };
            const stock = base.stock || 0;
            const stockClass = stock > 0 ? 'in' : 'out';
            const stockLabel = stock > 0 ? `متوفر: ${stock}` : 'نفذ';

            return `
                <div class="product-card" data-id="${p.id}">
                    <div class="name">${U.escape(p.name)}</div>
                    <div class="price">${U.money(base.price)}</div>
                    <div class="stock ${stockClass}">${stockLabel}</div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => openUnitModal(card.dataset.id));
        });
    }

    /* ============ Mobile Products Panel ============ */
    function openProductsPanel() {
        $('#productsPanel')?.classList.add('show');
        $('#productsOverlay')?.classList.add('show');
    }

    function closeProductsPanel() {
        $('#productsPanel')?.classList.remove('show');
        $('#productsOverlay')?.classList.remove('show');
    }

    /* ============ Product Search Dropdown (mobile cart) ============ */
    function renderProductDropdown(term) {
        const dd = $('#productDropdown');
        if (!dd) return;
        if (!term || term.length < 1) { dd.classList.remove('show'); return; }

        const t = term.toLowerCase();
        const filtered = State.products.filter(p =>
            (p.name || '').toLowerCase().includes(t) ||
            (p.barcode || '').includes(term) ||
            (p.code || '').includes(term)
        ).slice(0, 20);

        if (!filtered.length) {
            dd.innerHTML = `<div class="dropdown-item" style="justify-content:center;color:var(--text-muted);">لا توجد نتائج</div>`;
            dd.classList.add('show');
            return;
        }

        dd.innerHTML = filtered.map(p => `
            <div class="dropdown-item" data-id="${p.id}">
                <div class="item-info"><h4>${U.escape(p.name)}</h4></div>
                <div class="item-price">${U.money(p.units?.[0]?.price || 0)}</div>
            </div>
        `).join('');
        dd.classList.add('show');

        dd.querySelectorAll('.dropdown-item[data-id]').forEach(item => {
            item.addEventListener('click', () => {
                const productId = item.dataset.id;
                const exact = State.products.find(p => p.barcode === term || p.code === term);
                if (exact && exact.id === productId) {
                    $('#productSearchInput').value = '';
                    $('#productDropdown')?.classList.remove('show');
                }
                openUnitModal(productId);
            });
        });
    }

    /* ============ Customer Search ============ */
    function renderCustomerDropdown(term = '') {
        const dd = $('#customerDropdown');
        if (!dd) return;

        let list = State.customers;
        if (term) {
            const t = term.toLowerCase();
            list = list.filter(c =>
                (c.name || '').toLowerCase().includes(t) ||
                (c.phone || '').includes(term)
            );
        }

        let html = `
            <div class="dropdown-item" data-id="cash">
                <div class="item-info"><h4>نقدي (بدون عميل)</h4></div>
            </div>
        `;

        if (list.length) {
            html += list.slice(0, 20).map(c => {
                const bal = c.balance || 0;
                const cls = bal > 0 ? 'positive' : bal < 0 ? 'negative' : '';
                const label = bal > 0 ? `دائن ${U.money(bal)}` : bal < 0 ? `مدين ${U.money(-bal)}` : 'لا رصيد';
                return `
                    <div class="dropdown-item" data-id="${c.id}">
                        <div class="item-info">
                            <h4>${U.escape(c.name)}</h4>
                            <small class="${cls}">${label}</small>
                        </div>
                        <div class="item-price">${U.escape(c.phone || '')}</div>
                    </div>
                `;
            }).join('');
        }

        dd.innerHTML = html;
        dd.classList.add('show');

        dd.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', () => selectCustomer(item.dataset.id === 'cash' ? null : item.dataset.id));
        });
    }

    function selectCustomer(id) {
        if (!id) {
            State.selectedCustomerId = null;
            $('#customerSearchInput').value = 'نقدي (بدون عميل)';
        } else {
            const c = State.customers.find(x => x.id === id);
            if (!c) return;
            State.selectedCustomerId = id;
            $('#customerSearchInput').value = c.name;
        }
        updateCustomerDisplay();
        $('#customerDropdown')?.classList.remove('show');
        saveCart();
    }

    function updateCustomerDisplay() {
        const el = $('#customerBalanceDisplay');
        if (!el) return;

        if (!State.selectedCustomerId) {
            el.innerHTML = '';
            el.className = 'customer-balance';
            return;
        }

        const c = State.customers.find(x => x.id === State.selectedCustomerId);
        if (!c) return;

        const bal = c.balance || 0;
        const cls = bal > 0 ? 'positive' : bal < 0 ? 'negative' : '';
        el.textContent = bal > 0 ? `دائن: ${U.money(bal)}` : bal < 0 ? `مدين: ${U.money(-bal)}` : 'لا رصيد';
        el.className = `customer-balance ${cls}`;
    }

    /* ============ Unit Modal ============ */
    function openUnitModal(productId) {
        const product = State.products.find(p => p.id === productId);
        if (!product?.units?.length) {
            showToast('المنتج غير متوفر', 'warning');
            return;
        }

        State.selectedProduct = product;
        State.selectedUnit = product.units[0];

        $('#modalProductName').textContent = product.name;
        $('#unitButtons').innerHTML = product.units.map((u, i) =>
            `<button class="unit-btn ${i === 0 ? 'active' : ''}" data-index="${i}">${U.escape(u.name)}</button>`
        ).join('');

        updateUnitInfo();

        // إغلاق لوحة المنتجات على الجوال
        if (window.innerWidth <= 900) closeProductsPanel();

        openModal('unitQuantityModal');

        setTimeout(() => {
            const qty = $('#selectedQuantity');
            if (qty) { qty.focus(); qty.select(); }
        }, 200);
    }

    function updateUnitInfo() {
        const p = State.selectedProduct;
        const u = State.selectedUnit;
        if (!p || !u) return;

        $('#selectedPrice').value = u.price || 0;
        $('#selectedQuantity').value = 1;

        const base = p.units[0];
        const stock = base.stock || 0;
        const factor = u.factor || 1;
        const max = u === base ? stock : Math.floor(stock / factor);

        $('#stockInfo').textContent = `المخزون: ${max} ${u.name}`;

        // Price limits
        const limitEl = $('#priceLimitMsg');
        if (limitEl) {
            if (u.minPrice || u.maxPrice) {
                limitEl.style.display = 'block';
                limitEl.textContent = `السعر بين ${u.minPrice || 0} - ${u.maxPrice || '∞'} ج.م`;
            } else {
                limitEl.style.display = 'none';
            }
        }
    }

    /* ============ Add to Cart ============ */
    function addToCart() {
        if (State._addingItem) return;
        State._addingItem = true;

        try {
            const qty = +$('#selectedQuantity')?.value || 0;
            const max = +$('#selectedQuantity')?.max || 0;
            if (qty <= 0 || qty > max) {
                showToast('كمية غير متاحة', 'error');
                return;
            }

            const u = State.selectedUnit;
            const price = +$('#selectedPrice')?.value || 0;

            if (u.minPrice > 0 && price < u.minPrice) {
                showToast(`لا يمكن أقل من ${U.money(u.minPrice)}`, 'error');
                return;
            }
            if (u.maxPrice > 0 && price > u.maxPrice) {
                showToast(`لا يمكن أعلى من ${U.money(u.maxPrice)}`, 'error');
                return;
            }

            const product = State.selectedProduct;
            const unitName = u.name;
            const cost = u.cost || 0;

            const existing = State.cart.find(i => i.productId === product.id && i.unitName === unitName);

            if (existing) {
                // Show duplicate modal
                $('#duplicateProductMsg').textContent = `الصنف "${product.name}" موجود بالكمية ${existing.quantity}. هل تريد زيادة الكمية؟`;
                State._duplicateCallback = (confirmed) => {
                    if (confirmed) {
                        existing.quantity = U.round(existing.quantity + qty, 3);
                        existing.price = price;
                        renderCart();
                        saveCart();
                    }
                    closeModal('unitQuantityModal');
                };
                openModal('duplicateProductModal');
                return;
            }

            State.cart.push({
                productId: product.id,
                productName: product.name,
                unitName,
                quantity: qty,
                price: price,
                cost,
                factor: u.factor || 1
            });

            renderCart();
            saveCart();
            closeModal('unitQuantityModal');

            // Focus search again
            const search = $('#productSearchInput');
            if (search) { search.focus(); search.select(); }

        } finally {
            State._addingItem = false;
        }
    }

    /* ============ Cart Rendering ============ */
    function renderCart() {
        const container = $('#cartItemsContainer');
        if (!container) return;

        // Remove old rows
        container.querySelectorAll('.cart-item-row').forEach(r => r.remove());
        const emptyMsg = container.querySelector('.empty-cart-message');
        if (emptyMsg) emptyMsg.remove();

        if (!State.cart.length) {
            container.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>');
            updateTotals();
            return;
        }

        let rows = '';
        State.cart.forEach((item, idx) => {
            rows += `
                <div class="cart-item-row">
                    <div>
                        <span class="cart-item-name">${U.escape(item.productName)}</span><br>
                        <span class="cart-item-unit">${U.escape(item.unitName)}</span>
                    </div>
                    <div>
                        <input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}" inputmode="decimal">
                    </div>
                    <div>
                        <input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}" inputmode="decimal">
                    </div>
                    <div>${U.money(item.price * item.quantity)}</div>
                    <div><i class="fas fa-trash" data-idx="${idx}"></i></div>
                </div>
            `;
        });
        container.insertAdjacentHTML('beforeend', rows);

        // Bind inputs
        container.querySelectorAll('.cart-qty-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const v = +e.target.value;
                if (isNaN(v) || v <= 0) State.cart.splice(idx, 1);
                else State.cart[idx].quantity = v;
                renderCart();
                saveCart();
            });
        });
        container.querySelectorAll('.cart-price-input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = +e.target.dataset.idx;
                const v = +e.target.value;
                if (!isNaN(v) && v >= 0) State.cart[idx].price = v;
                renderCart();
                saveCart();
            });
        });
        container.querySelectorAll('.fa-trash').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const idx = +e.target.dataset.idx;
                State.cart.splice(idx, 1);
                renderCart();
                saveCart();
            });
        });

        updateTotals();
    }

    function updateTotals() {
        let subtotal = State.cart.reduce((s, i) => s + i.price * i.quantity, 0);
        subtotal = U.round(subtotal);

        let disc = 0;
        if (State.discountType === 'amount') {
            disc = Math.min(State.discount, subtotal);
        } else {
            disc = U.round(subtotal * (State.discount / 100));
        }
        const net = U.round(subtotal - disc);

        $('#subtotal').textContent = U.money(subtotal);
        $('#netTotal').textContent = U.money(net);
        $('#itemTypesCount').textContent = State.cart.length;

        const pieces = State.cart.reduce((s, i) => s + i.quantity, 0);
        $('#totalPieces').textContent = Math.round(pieces);

        const payBtn = $('#payBtn');
        if (payBtn) payBtn.disabled = !State.cart.length;

        // Profit display (for admin)
        const profit = $('#profitDisplay');
        if (profit && State.currentUser?.role === 'admin' && State.cart.length) {
            const totalCost = State.cart.reduce((s, i) => s + (i.cost || 0) * i.quantity, 0);
            profit.style.display = 'block';
            profit.textContent = `الربح المتوقع: ${U.money(subtotal - totalCost)}`;
        } else if (profit) {
            profit.style.display = 'none';
        }
    }

    /* ============ Payment ============ */
    function openPayment() {
        if (!State.cart.length) {
            showToast('السلة فارغة', 'info');
            return;
        }

        const { subtotal, disc, net } = calculateTotals();

        $('#paySubtotal').textContent = U.money(subtotal);
        $('#payDiscount').textContent = U.money(disc);
        $('#payNet').textContent = U.money(net);

        const customer = State.selectedCustomerId ? State.customers.find(x => x.id === State.selectedCustomerId) : null;
        const bal = customer?.balance || 0;
        $('#currentBalance').textContent = U.money(Math.abs(bal));
        $('#currentBalance').style.color = bal >= 0 ? 'var(--success)' : 'var(--danger)';

        setPaymentMethod('cash');
        $('#cashAmount').value = '';
        $('#transferAmount').value = '';
        $('#paymentNotes').value = '';

        updatePaymentPreview();
        openModal('paymentModal');
        setTimeout(() => $('#cashAmount')?.focus(), 200);
    }

    function calculateTotals() {
        let subtotal = State.cart.reduce((s, i) => s + i.price * i.quantity, 0);
        subtotal = U.round(subtotal);

        let disc = State.discountType === 'amount'
            ? Math.min(State.discount, subtotal)
            : U.round(subtotal * (State.discount / 100));

        const net = U.round(subtotal - disc);
        return { subtotal, disc, net };
    }

    function setPaymentMethod(method) {
        State.paymentMethod = method;
        $$('.method').forEach(b => b.classList.toggle('active', b.dataset.method === method));

        $('#cashField').style.display = (method === 'cash' || method === 'mixed') ? 'block' : 'none';
        $('#transferField').style.display = (method === 'transfer' || method === 'mixed') ? 'block' : 'none';

        updatePaymentPreview();
    }

    function updatePaymentPreview() {
        const { net } = calculateTotals();
        const method = State.paymentMethod;

        const cash = +$('#cashAmount')?.value || 0;
        const trans = +$('#transferAmount')?.value || 0;

        let paid = 0;
        if (method === 'cash') paid = cash;
        else if (method === 'transfer') paid = trans;
        else if (method === 'mixed') paid = cash + trans;
        else if (method === 'credit') paid = 0;

        const diff = U.round(paid - net);
        const customer = State.selectedCustomerId ? State.customers.find(x => x.id === State.selectedCustomerId) : null;
        const oldBal = customer?.balance || 0;
        const newBal = oldBal + (method === 'credit' ? -net : diff);

        const remainBox = $('#remainingBox');
        const remainEl = $('#remainingDisplay');

        if (diff >= 0) {
            remainBox?.classList.remove('short');
            remainEl.textContent = `فائض ${U.money(diff)}`;
        } else {
            remainBox?.classList.add('short');
            remainEl.textContent = `متبقي ${U.money(-diff)}`;
        }

        $('#balanceAfterLabel').textContent = newBal >= 0 ? 'رصيد للعميل بعد الدفع:' : 'رصيد على العميل بعد الدفع:';
        $('#balanceAfter').textContent = U.money(Math.abs(newBal));
        $('#balanceAfter').style.color = newBal >= 0 ? 'var(--success)' : 'var(--danger)';
    }

    /* ============ Complete Payment ============ */
    async function completePayment() {
        if (!State.cart.length) return;

        const { subtotal, disc, net } = calculateTotals();
        const method = State.paymentMethod;

        const cash = +$('#cashAmount')?.value || 0;
        const trans = +$('#transferAmount')?.value || 0;

        let paid = 0;
        if (method === 'cash') paid = cash;
        else if (method === 'transfer') paid = trans;
        else if (method === 'mixed') paid = cash + trans;

        const diff = U.round(paid - net);
        const customer = State.selectedCustomerId ? State.customers.find(x => x.id === State.selectedCustomerId) : null;

        if (method === 'credit' && !customer) {
            showToast('يجب اختيار عميل للدفع الآجل', 'warning');
            return;
        }

        if (diff > 0 && customer && !confirm(`سيتم إضافة ${U.money(diff)} إلى رصيد العميل. متابعة؟`)) {
            return;
        }

        if (method === 'credit' && customer && !confirm(`سيتم تسجيل ${U.money(net)} كدين على العميل. متابعة؟`)) {
            return;
        }

        const btn = $('#confirmAndPrintBtn');
        btn.disabled = true;

        try {
            const invoiceNumber = await DB.generateInvoiceNumber();

            const invoice = {
                id: U.uuid(),
                invoice_number: invoiceNumber,
                type: 'sale',
                date: U.today(),
                customer_id: State.selectedCustomerId || null,
                customer_name: customer?.name || 'نقدي',
                items: State.cart.map(i => ({ ...i })),
                subtotal,
                discount: disc,
                total: net,
                cash_paid: cash,
                transfer_paid: trans,
                paid: method === 'credit' ? 0 : paid,
                remaining: method === 'credit' ? net : Math.max(0, -diff),
                change_amount: diff > 0 ? diff : 0,
                payment_method: method,
                status: method === 'credit' ? 'credit' : (diff >= 0 ? 'paid' : 'partial'),
                notes: $('#paymentNotes')?.value.trim() || ''
            };

            const result = await DB.createInvoice(invoice);
            if (!result.success) throw new Error('فشل حفظ الفاتورة');

            closeModal('paymentModal');
            showReceipt(invoice);

            // Reset
            State.cart = [];
            State.discount = 0;
            State.selectedCustomerId = null;
            $('#discountValue').value = '0';
            $('#customerSearchInput').value = '';
            $('#customerBalanceDisplay').textContent = '';

            renderCart();
            saveCart();
            updateHeldCount();

            // Reload products
            State.products = await DB.getProducts(true) || [];
            renderCategories();
            renderProductGrid();
            State.customers = await DB.getParties('customer', true) || [];

            showToast('تم البيع بنجاح', 'success');

        } catch (e) {
            console.error('Payment error:', e);
            showToast(e.message || 'فشل إتمام البيع', 'error');
        } finally {
            btn.disabled = false;
        }
    }

    /* ============ Receipt ============ */
    function showReceipt(invoice) {
        let itemsHtml = '';
        invoice.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${U.escape(item.productName)} - ${U.escape(item.unitName)}</td>
                    <td style="text-align:center;">${item.quantity}</td>
                    <td style="text-align:center;">${item.price.toFixed(2)}</td>
                    <td style="text-align:left;">${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
            `;
        });

        const customer = invoice.customer_name || 'نقدي';

        $('#receiptPrintArea').innerHTML = `
            <div class="receipt-center" style="font-size:16px;font-weight:bold;">حسابي</div>
            <div class="receipt-center" style="font-size:11px;color:#666;">نظام نقاط البيع</div>
            <hr>
            <div class="receipt-row"><span>رقم الفاتورة:</span><strong>${U.escape(invoice.invoice_number)}</strong></div>
            <div class="receipt-row"><span>التاريخ:</span><span>${U.date(invoice.date)}</span></div>
            <div class="receipt-row"><span>العميل:</span><strong>${U.escape(customer)}</strong></div>
            <hr>
            <table class="receipt-table">
                <thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>إجمالي</th></tr></thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <hr>
            <div class="receipt-row"><span>الإجمالي:</span><span>${invoice.subtotal.toFixed(2)}</span></div>
            ${invoice.discount > 0 ? `<div class="receipt-row"><span>الخصم:</span><span>-${invoice.discount.toFixed(2)}</span></div>` : ''}
            <div class="receipt-row" style="font-weight:bold;font-size:14px;"><span>الصافي:</span><span>${invoice.total.toFixed(2)}</span></div>
            <hr>
            <div class="receipt-row"><span>الدفع:</span><span>${paymentLabel(invoice.payment_method)}</span></div>
            ${invoice.cash_paid > 0 ? `<div class="receipt-row"><span>نقدي:</span><span>${invoice.cash_paid.toFixed(2)}</span></div>` : ''}
            ${invoice.transfer_paid > 0 ? `<div class="receipt-row"><span>تحويل:</span><span>${invoice.transfer_paid.toFixed(2)}</span></div>` : ''}
            ${invoice.change_amount > 0 ? `<div class="receipt-row"><span>الباقي:</span><span>${invoice.change_amount.toFixed(2)}</span></div>` : ''}
            ${invoice.remaining > 0 ? `<div class="receipt-row" style="color:red;"><span>المتبقي:</span><span>${invoice.remaining.toFixed(2)}</span></div>` : ''}
            <hr>
            <div class="receipt-center" style="font-weight:bold;">شكراً لتعاملكم معنا</div>
        `;

        openModal('receiptModal');
    }

    function paymentLabel(m) {
        return { cash: 'نقدي', transfer: 'تحويل', credit: 'آجل', mixed: 'مختلط' }[m] || m;
    }

    function printReceipt() {
        const content = $('#receiptPrintArea').innerHTML;
        const win = window.open('', '_blank', 'width=400,height=700');
        win.document.write(`
            <!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8"><title>طباعة</title>
            <style>
                body{font-family:'Cairo',Arial,sans-serif;padding:10px;font-size:13px;max-width:80mm;margin:0 auto;}
                hr{border:none;border-top:1px dashed #999;margin:10px 0;}
                .receipt-row{display:flex;justify-content:space-between;margin:3px 0;}
                .receipt-center{text-align:center;font-weight:700;}
                .receipt-table{width:100%;border-collapse:collapse;font-size:12px;}
                .receipt-table th,.receipt-table td{padding:4px 2px;border-bottom:1px dashed #ddd;text-align:right;}
                .receipt-table th:last-child,.receipt-table td:last-child{text-align:left;}
                @media print{body{padding:0;}}
            </style></head><body>${content}</body></html>
        `);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
    }

    /* ============ Hold / Resume ============ */
    function holdInvoice() {
        if (!State.cart.length) { showToast('السلة فارغة', 'info'); return; }

        const held = U.ls.get('heldInvoices', []) || [];
        held.push({
            id: U.uuid(),
            customerId: State.selectedCustomerId,
            customerName: State.selectedCustomerId ? (State.customers.find(x => x.id === State.selectedCustomerId)?.name || 'عميل') : 'نقدي',
            items: State.cart.map(i => ({ ...i })),
            discount: State.discount,
            discountType: State.discountType,
            timestamp: Date.now()
        });
        U.ls.set('heldInvoices', held);

        resetSale();
        updateHeldCount();
        showToast('تم تعليق الفاتورة', 'success');
    }

    function loadHeld() {
        const held = U.ls.get('heldInvoices', []) || [];
        const container = $('#heldInvoicesList');

        if (!held.length) {
            container.innerHTML = `
                <div style="text-align:center;padding:40px 20px;color:var(--text-muted);">
                    <i class="fas fa-bookmark" style="font-size:40px;opacity:0.3;display:block;margin-bottom:12px;"></i>
                    <p>لا توجد فواتير معلقة</p>
                </div>
            `;
        } else {
            container.innerHTML = held.map(h => {
                const total = h.items.reduce((s, i) => s + i.price * i.quantity, 0);
                return `
                    <div class="held-invoice-item" data-id="${h.id}">
                        <div>
                            <strong>${U.escape(h.customerName)}</strong>
                            <small>${h.items.length} صنف · ${U.date(h.timestamp)}</small>
                        </div>
                        <div class="total">${U.money(total)}</div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.held-invoice-item').forEach(el => {
                el.addEventListener('click', () => resumeHeld(el.dataset.id));
            });
        }

        openModal('heldInvoicesModal');
    }

    function resumeHeld(id) {
        const held = U.ls.get('heldInvoices', []) || [];
        const item = held.find(h => h.id === id);
        if (!item) return;

        State.cart = item.items.map(i => ({ ...i }));
        State.discount = item.discount || 0;
        State.discountType = item.discountType || 'amount';
        State.selectedCustomerId = item.customerId;

        $('#discountValue').value = State.discount;
        $('#discountType').value = State.discountType;

        if (item.customerId) {
            const c = State.customers.find(x => x.id === item.customerId);
            if (c) $('#customerSearchInput').value = c.name;
        }
        updateCustomerDisplay();

        // Remove from held
        U.ls.set('heldInvoices', held.filter(h => h.id !== id));

        renderCart();
        saveCart();
        updateHeldCount();
        closeModal('heldInvoicesModal');
        showToast('تم استرجاع الفاتورة', 'success');
    }

    function updateHeldCount() {
        const held = U.ls.get('heldInvoices', []) || [];
        const menu = $('#heldInvoicesBtn');
        if (menu) {
            const base = menu.innerHTML.replace(/<span[^>]*>.*?<\/span>/, '');
            menu.innerHTML = held.length 
                ? `${base}<span style="background:var(--danger);color:white;font-size:0.7rem;padding:1px 6px;border-radius:99px;margin-right:auto;">${held.length}</span>`
                : base;
        }
    }

    function resetSale() {
        State.cart = [];
        State.discount = 0;
        State.selectedCustomerId = null;
        $('#discountValue').value = '0';
        $('#customerSearchInput').value = '';
        $('#customerBalanceDisplay').textContent = '';
        renderCart();
        saveCart();
    }

    /* ============ Persistence ============ */
    function saveCart() {
        U.ls.set('posCart', {
            cart: State.cart,
            customerId: State.selectedCustomerId,
            discount: State.discount,
            discountType: State.discountType
        });
    }

    function restoreCart() {
        const data = U.ls.get('posCart');
        if (!data) return;

        State.cart = data.cart || [];
        State.discount = data.discount || 0;
        State.discountType = data.discountType || 'amount';
        State.selectedCustomerId = data.customerId || null;

        $('#discountValue').value = State.discount;
        $('#discountType').value = State.discountType;

        if (State.selectedCustomerId) {
            const c = State.customers.find(x => x.id === State.selectedCustomerId);
            if (c) $('#customerSearchInput').value = c.name;
        }
        updateCustomerDisplay();
        renderCart();
    }

    /* ============ Modals ============ */
    function openModal(id) {
        document.getElementById(id)?.classList.add('open');
    }
    function closeModal(id) {
        document.getElementById(id)?.classList.remove('open');
    }

    /* ============ Toast ============ */
    function showToast(msg, type = 'info') {
        const toast = $('#toastContainer');
        if (!toast) { console.log(msg); return; }

        toast.textContent = msg;
        toast.className = `toast ${type} show`;

        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    }

    /* ============ Loading ============ */
    function showLoading() {
        const bar = $('#loading-bar');
        if (bar) bar.style.width = '70%';
    }
    function hideLoadingBar() {
        const bar = $('#loading-bar');
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        }
    }

    /* ============ Events ============ */
    function bindEvents() {
        // Sidebar
        $('#menuToggle')?.addEventListener('click', () => {
            $('#sidebar')?.classList.add('open');
            $('#sidebarOverlay')?.classList.add('show');
        });
        $('#sidebarOverlay')?.addEventListener('click', () => {
            $('#sidebar')?.classList.remove('open');
            $('#sidebarOverlay')?.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                $('#sidebar')?.classList.remove('open');
                $('#sidebarOverlay')?.classList.remove('show');
            });
        });

        // Theme
        $('#themeToggleBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        // More menu
        $('#moreMenuBtn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            $('#moreDropdown')?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) $('#moreDropdown')?.classList.remove('show');
        });

        // Menu actions
        $('#returnSaleBtn')?.addEventListener('click', (e) => { e.preventDefault(); showToast('قريباً', 'info'); });
        $('#holdInvoiceBtn')?.addEventListener('click', (e) => { e.preventDefault(); holdInvoice(); $('#moreDropdown')?.classList.remove('show'); });
        $('#heldInvoicesBtn')?.addEventListener('click', (e) => { e.preventDefault(); loadHeld(); $('#moreDropdown')?.classList.remove('show'); });
        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        // Product search (tablet)
        $('#tabletProductSearchInput')?.addEventListener('input', U.debounce((e) => {
            State.searchTerm = e.target.value.trim();
            renderProductGrid();
        }, 200));

        // Product search (mobile - cart)
        $('#productSearchInput')?.addEventListener('input', U.debounce((e) => {
            renderProductDropdown(e.target.value.trim());
        }, 200));

        $('#productSearchInput')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim();
                if (!term) return;
                const product = State.products.find(p => p.barcode === term || p.code === term);
                if (product) {
                    e.target.value = '';
                    $('#productDropdown')?.classList.remove('show');
                    openUnitModal(product.id);
                }
            }
        });

        // Customer search
        $('#customerSearchInput')?.addEventListener('focus', (e) => {
            renderCustomerDropdown(e.target.value.trim() === 'نقدي (بدون عميل)' ? '' : e.target.value);
        });
        $('#customerSearchInput')?.addEventListener('input', U.debounce((e) => {
            renderCustomerDropdown(e.target.value.trim());
        }, 200));

        // Close dropdowns
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-header') && !e.target.closest('.search-dropdown')) {
                $('#customerDropdown')?.classList.remove('show');
                $('#productDropdown')?.classList.remove('show');
            }
        });

        // Discount
        $('#discountValue')?.addEventListener('input', (e) => {
            State.discount = +e.target.value || 0;
            updateTotals();
            saveCart();
        });
        $('#discountType')?.addEventListener('change', (e) => {
            State.discountType = e.target.value;
            updateTotals();
            saveCart();
        });

        // Pay
        $('#payBtn')?.addEventListener('click', openPayment);

        // Unit modal
        $('#unitButtons')?.addEventListener('click', (e) => {
            const chip = e.target.closest('.unit-btn');
            if (!chip) return;
            const idx = +chip.dataset.index;
            State.selectedUnit = State.selectedProduct.units[idx];
            $$('.unit-btn').forEach((c, i) => c.classList.toggle('active', i === idx));
            updateUnitInfo();
        });
        $('#addToCartBtn')?.addEventListener('click', addToCart);
        $('#closeUnitModalBtn')?.addEventListener('click', () => closeModal('unitQuantityModal'));
        $('#selectedQuantity')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addToCart();
        });

        // Payment
        $$('.method').forEach(btn => {
            btn.addEventListener('click', () => setPaymentMethod(btn.dataset.method));
        });
        $('#cashAmount')?.addEventListener('input', updatePaymentPreview);
        $('#transferAmount')?.addEventListener('input', updatePaymentPreview);
        $('#confirmAndPrintBtn')?.addEventListener('click', completePayment);
        $('#closePaymentModalBtn')?.addEventListener('click', () => closeModal('paymentModal'));

        // Held invoices
        $('#closeHeldModalBtn')?.addEventListener('click', () => closeModal('heldInvoicesModal'));

        // Receipt
        $('#closeReceiptModalBtn')?.addEventListener('click', () => closeModal('receiptModal'));
        $('#skipPrintBtn')?.addEventListener('click', () => closeModal('receiptModal'));
        $('#printReceiptBtn')?.addEventListener('click', printReceipt);

        // Duplicate modal
        $('#duplicateIncreaseBtn')?.addEventListener('click', () => {
            if (State._duplicateCallback) State._duplicateCallback(true);
            State._duplicateCallback = null;
            closeModal('duplicateProductModal');
        });
        $('#duplicateCancelBtn')?.addEventListener('click', () => {
            if (State._duplicateCallback) State._duplicateCallback(false);
            State._duplicateCallback = null;
            closeModal('duplicateProductModal');
        });

        // Mobile products panel
        $('#fabProductsBtn')?.addEventListener('click', openProductsPanel);
        $('#productsOverlay')?.addEventListener('click', closeProductsPanel);

        // Close modal on backdrop
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        // Keyboard shortcuts (desktop)
        document.addEventListener('keydown', (e) => {
            if (window.innerWidth <= 900) return;
            const inInput = ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName);
            if (inInput && e.key !== 'Escape') return;

            if (e.key === 'F1') { e.preventDefault(); $('#customerSearchInput')?.focus(); }
            if (e.key === 'F2') { e.preventDefault(); $('#tabletProductSearchInput')?.focus(); }
            if (e.key === 'F4') { e.preventDefault(); if (State.cart.length) openPayment(); }
            if (e.key === 'F5') { e.preventDefault(); holdInvoice(); }
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
                closeProductsPanel();
            }
        });

        // Online/offline
        window.addEventListener('online', () => { updateConnStatus(); showToast('عاد الاتصال', 'success'); });
        window.addEventListener('offline', () => { updateConnStatus(); showToast('انقطع الاتصال', 'warning'); });

        // Init customer search field
        setTimeout(() => {
            const input = $('#customerSearchInput');
            if (input && !input.value) input.value = 'نقدي (بدون عميل)';
        }, 500);
    }

    /* ============ Start ============ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
