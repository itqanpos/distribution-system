/* =============================================
   pos.js - Point of Sale Logic
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
        selectedCustomer: null,
        discount: 0,
        discountType: 'amount',
        paymentMethod: 'cash',
        currentUser: null,
        currentCategory: 'الكل',
        searchTerm: '',
        _addingItem: false
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 POS init...');

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

        console.log('👤 User:', State.currentUser.email);

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadData();
        restoreCart();
        updateHeldCount();
        initQuickSearch();

        hideLoadingBar();
        console.log('✅ POS ready');
    }

    /* ============================================
       Load Data
       ============================================ */
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

    /* ============================================
       User UI
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

    /* ============================================
       Theme
       ============================================ */
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

    /* ============================================
       Categories
       ============================================ */
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

    /* ============================================
       Products Grid
       ============================================ */
    function renderProductGrid() {
        const grid = $('#productsGrid');
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
                    <div class="product-card__icon"><i class="fas fa-cube"></i></div>
                    <div class="product-card__name">${U.escape(p.name)}</div>
                    <div class="product-card__price">${U.money(base.price)}</div>
                    <div class="product-card__stock ${stockClass}">
                        <i class="fas fa-circle" style="font-size:6px;"></i> ${stockLabel}
                    </div>
                </div>
            `;
        }).join('');

        grid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => openUnitModal(card.dataset.id));
        });
    }

    /* ============================================
       Quick Search
       ============================================ */
    function initQuickSearch() {
        const openBtn = $('#openProductSearchBtn');
        const modal = $('#quickSearchModal');
        const overlay = $('#quickSearchOverlay');
        const closeBtn = $('#closeQuickSearch');
        const input = $('#quickSearchInput');
        const results = $('#quickSearchResults');

        if (!openBtn || !modal) return;

        function renderEmpty() {
            if (!results) return;
            results.innerHTML = `
                <div class="quick-search-empty">
                    <i class="fas fa-search"></i>
                    <p>ابدأ الكتابة للبحث...</p>
                </div>
            `;
        }

        function openSearch() {
            modal.classList.add('show');
            setTimeout(() => input?.focus(), 150);
        }

        function closeSearch() {
            modal.classList.remove('show');
            if (input) input.value = '';
            renderEmpty();
        }

        function renderResults(term) {
            if (!term) { renderEmpty(); return; }
            if (!results) return;

            const t = term.toLowerCase();
            const filtered = State.products.filter(p =>
                (p.name || '').toLowerCase().includes(t) ||
                (p.barcode || '').includes(term) ||
                (p.code || '').includes(term)
            ).slice(0, 30);

            if (!filtered.length) {
                results.innerHTML = `
                    <div class="quick-search-empty">
                        <i class="fas fa-box-open"></i>
                        <p>لا توجد نتائج</p>
                    </div>
                `;
                return;
            }

            results.innerHTML = filtered.map(p => {
                const base = p.units?.[0] || { price: 0, stock: 0 };
                const stock = base.stock || 0;
                const stockClass = stock > 0 ? 'in' : 'out';

                return `
                    <div class="quick-search-item" data-id="${p.id}">
                        <div class="quick-search-item__info">
                            <div class="quick-search-item__name">${U.escape(p.name)}</div>
                            <div class="quick-search-item__price">${U.money(base.price)}</div>
                        </div>
                        <div class="quick-search-item__stock ${stockClass}">${stock}</div>
                    </div>
                `;
            }).join('');

            results.querySelectorAll('.quick-search-item').forEach(item => {
                item.addEventListener('click', () => {
                    const productId = item.dataset.id;
                    closeSearch();
                    setTimeout(() => openUnitModal(productId), 200);
                });
            });
        }

        openBtn.addEventListener('click', openSearch);
        overlay?.addEventListener('click', closeSearch);
        closeBtn?.addEventListener('click', closeSearch);

        input?.addEventListener('input', U.debounce((e) => {
            renderResults(e.target.value.trim());
        }, 150));

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('show')) {
                closeSearch();
            }
        });

        // اختصار F3
        document.addEventListener('keydown', (e) => {
            if (e.key === 'F3') {
                e.preventDefault();
                openSearch();
            }
        });
    }

    /* ============================================
       Unit Modal
       ============================================ */
    function openUnitModal(productId) {
        const product = State.products.find(p => p.id === productId);
        if (!product?.units?.length) {
            showToast('المنتج غير متوفر', 'warning');
            return;
        }

        State.selectedProduct = product;
        State.selectedUnit = product.units[0];

        $('#unitProductName').textContent = product.name;
        $('#unitChips').innerHTML = product.units.map((u, i) =>
            `<button class="unit-chip ${i === 0 ? 'active' : ''}" data-index="${i}">${U.escape(u.name)}</button>`
        ).join('');

        updateUnitFields();
        openModal('unitModal');

        setTimeout(() => {
            const qty = $('#unitQty');
            if (qty) { qty.focus(); qty.select(); }
        }, 200);
    }

    function updateUnitFields() {
        const p = State.selectedProduct;
        const u = State.selectedUnit;
        if (!p || !u) return;

        $('#unitPrice').value = u.price || 0;
        $('#unitQty').value = 1;

        const base = p.units[0];
        const stock = base.stock || 0;
        const factor = u.factor || 1;
        const max = u === base ? stock : Math.floor(stock / factor);

        $('#stockInfo').textContent = `المخزون المتاح: ${max} ${u.name}`;
    }

    /* ============================================
       Cart - Add
       ============================================ */
    function addToCart(productId, unitIndex, qty, price) {
        const product = State.products.find(p => p.id === productId);
        if (!product) return;

        const unit = product.units[unitIndex];
        if (!unit) return;

        const existing = State.cart.find(i =>
            i.productId === productId && i.unitName === unit.name
        );

        if (existing) {
            existing.quantity = U.round(existing.quantity + qty, 3);
            existing.price = price;
        } else {
            State.cart.push({
                productId,
                productName: product.name,
                unitName: unit.name,
                quantity: qty,
                price: price,
                cost: unit.cost || 0,
                factor: unit.factor || 1
            });
        }

        renderCart();
        saveCart();
    }

    /* ============================================
       Cart - Render
       ============================================ */
    function renderCart() {
        const container = $('#cartItems');
        if (!container) return;

        if (!State.cart.length) {
            container.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>السلة فارغة</p>
                    <small>اختر منتجاً للبدء</small>
                </div>
            `;
            updateSummary();
            return;
        }

        container.innerHTML = State.cart.map((item, idx) => `
            <div class="cart-item" data-idx="${idx}">
                <div>
                    <div class="cart-item__name">${U.escape(item.productName)}</div>
                    <div class="cart-item__unit">${U.escape(item.unitName)} · ${U.money(item.price)}</div>
                    <div class="cart-item__controls">
                        <button class="qty-btn" data-action="dec"><i class="fas fa-minus"></i></button>
                        <input type="number" class="cart-item__qty" value="${item.quantity}" min="0.001" step="0.001" data-action="qty" inputmode="decimal">
                        <button class="qty-btn" data-action="inc"><i class="fas fa-plus"></i></button>
                    </div>
                </div>
                <div class="cart-item__price">${U.money(item.price * item.quantity)}</div>
                <button class="cart-item__remove" data-action="remove"><i class="fas fa-times"></i></button>
            </div>
        `).join('');

        container.querySelectorAll('.cart-item').forEach(itemEl => {
            const idx = +itemEl.dataset.idx;

            itemEl.addEventListener('click', (e) => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (!action || action === 'qty') return;

                const item = State.cart[idx];
                if (!item) return;

                if (action === 'inc') item.quantity = U.round(item.quantity + 1, 3);
                else if (action === 'dec') {
                    item.quantity = U.round(item.quantity - 1, 3);
                    if (item.quantity <= 0) State.cart.splice(idx, 1);
                } else if (action === 'remove') {
                    State.cart.splice(idx, 1);
                }

                renderCart();
                saveCart();
            });

            itemEl.querySelector('[data-action="qty"]')?.addEventListener('change', (e) => {
                const v = +e.target.value;
                if (!isNaN(v) && v > 0) {
                    State.cart[idx].quantity = v;
                    renderCart();
                    saveCart();
                }
            });
        });

        updateSummary();
    }

    function updateSummary() {
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
        $('#itemsCount').textContent = State.cart.reduce((s, i) => s + i.quantity, 0);

        const checkout = $('#checkoutBtn');
        if (checkout) checkout.disabled = !State.cart.length;
    }

    function clearCart() {
        if (!State.cart.length) return;
        if (!confirm('هل تريد إلغاء الفاتورة الحالية؟')) return;

        State.cart = [];
        State.discount = 0;
        State.selectedCustomer = null;
        $('#discountValue').value = '0';
        $('#customerSearch').value = '';
        $('#customerInfo').textContent = '';
        renderCart();
        saveCart();
    }

    /* ============================================
       Customer
       ============================================ */
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
            <div class="cust-item" data-id="">
                <div>
                    <div class="cust-item__name">نقدي</div>
                    <div class="cust-item__phone">بدون عميل</div>
                </div>
                <div class="cust-item__balance zero">--</div>
            </div>
        `;

        if (list.length) {
            html += list.slice(0, 20).map(c => {
                const bal = c.balance || 0;
                const cls = bal > 0 ? 'pos' : bal < 0 ? 'neg' : 'zero';
                const label = bal > 0 ? `+${U.moneyRaw(bal)}` : bal < 0 ? `-${U.moneyRaw(-bal)}` : '0';
                return `
                    <div class="cust-item" data-id="${c.id}">
                        <div>
                            <div class="cust-item__name">${U.escape(c.name)}</div>
                            <div class="cust-item__phone">${U.escape(c.phone || '')}</div>
                        </div>
                        <div class="cust-item__balance ${cls}">${label}</div>
                    </div>
                `;
            }).join('');
        } else if (term) {
            html += `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">لا توجد نتائج</div>`;
        }

        dd.innerHTML = html;
        dd.classList.add('show');

        dd.querySelectorAll('.cust-item').forEach(el => {
            el.addEventListener('click', () => selectCustomer(el.dataset.id));
        });
    }

    function selectCustomer(id) {
        if (!id) {
            State.selectedCustomer = null;
            $('#customerSearch').value = '';
            $('#customerInfo').textContent = '';
            $('#customerInfo').style.color = '';
        } else {
            const c = State.customers.find(x => x.id === id);
            if (!c) return;
            State.selectedCustomer = c;
            $('#customerSearch').value = c.name;

            const bal = c.balance || 0;
            let info = 'لا رصيد';
            let color = 'var(--text-muted)';
            if (bal > 0) { info = `دائن: ${U.money(bal)}`; color = 'var(--success)'; }
            else if (bal < 0) { info = `مدين: ${U.money(-bal)}`; color = 'var(--danger)'; }

            $('#customerInfo').textContent = info;
            $('#customerInfo').style.color = color;
        }

        $('#customerDropdown').classList.remove('show');
    }

    /* ============================================
       Payment
       ============================================ */
    function openPayment() {
        if (!State.cart.length) return;

        const { subtotal, disc, net } = calculateTotals();

        $('#paySubtotal').textContent = U.moneyRaw(subtotal);
        $('#payDiscount').textContent = U.moneyRaw(disc);
        $('#payNet').textContent = U.moneyRaw(net);

        setPaymentMethod('cash');
        $('#cashInput').value = '';
        $('#cardInput').value = '';
        $('#paymentNotes').value = '';
        renderQuickCash(net);
        updateChange();

        openModal('paymentModal');
        setTimeout(() => $('#cashInput')?.focus(), 200);
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

        $$('.method').forEach(b =>
            b.classList.toggle('active', b.dataset.method === method)
        );

        $('#cashGroup').style.display = (method === 'cash' || method === 'mixed') ? 'block' : 'none';
        $('#cardGroup').style.display = (method === 'card' || method === 'mixed') ? 'block' : 'none';

        updateChange();
    }

    function renderQuickCash(net) {
        const opts = [
            Math.ceil(net),
            Math.ceil(net / 10) * 10,
            Math.ceil(net / 50) * 50,
            Math.ceil(net / 100) * 100
        ];
        const uniq = [...new Set(opts.map(v => Math.round(v)).filter(v => v > 0))];

        $('#quickCash').innerHTML = uniq.map(v =>
            `<button data-amount="${v}">${v}</button>`
        ).join('');

        $('#quickCash').querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => {
                $('#cashInput').value = b.dataset.amount;
                updateChange();
            });
        });
    }

    function updateChange() {
        const { net } = calculateTotals();
        const method = State.paymentMethod;

        const cash = +$('#cashInput')?.value || 0;
        const card = +$('#cardInput')?.value || 0;

        let paid = 0;
        if (method === 'cash') paid = cash;
        else if (method === 'card') paid = card;
        else if (method === 'mixed') paid = cash + card;
        else if (method === 'credit') paid = 0;

        const remaining = U.round(net - paid);
        const display = $('#changeDisplay');
        const value = $('#changeValue');

        if (remaining > 0) {
            display?.classList.add('is-short');
            if (display?.querySelector('span')) display.querySelector('span').textContent = 'المتبقي:';
            if (value) value.textContent = U.money(remaining);
        } else {
            display?.classList.remove('is-short');
            if (display?.querySelector('span')) display.querySelector('span').textContent = 'الباقي للعميل:';
            if (value) value.textContent = U.money(Math.abs(remaining));
        }
    }

    /* ============================================
       Complete Sale
       ============================================ */
    async function completeSale() {
        if (!State.cart.length) return;

        const { subtotal, disc, net } = calculateTotals();
        const method = State.paymentMethod;

        const cash = +$('#cashInput')?.value || 0;
        const card = +$('#cardInput')?.value || 0;
        const notes = $('#paymentNotes')?.value.trim() || '';

        let paid = 0;
        if (method === 'cash') paid = cash;
        else if (method === 'card') paid = card;
        else if (method === 'mixed') paid = cash + card;

        const remaining = U.round(net - paid);

        if (method === 'credit' && !State.selectedCustomer) {
            showToast('يجب اختيار عميل للدفع الآجل', 'warning');
            return;
        }

        if (remaining > 0 && method !== 'credit') {
            if (!confirm(`المتبقي ${U.money(remaining)}. سيتم تسجيله كدين على العميل. متابعة؟`)) return;
        }

        if (method === 'credit' && State.selectedCustomer) {
            if (!confirm(`سيتم تسجيل ${U.money(net)} كدين على العميل. متابعة؟`)) return;
        }

        const btn = $('#confirmPayBtn');
        if (btn) btn.disabled = true;

        try {
            const invoiceNumber = await DB.generateInvoiceNumber();

            const invoice = {
                id: U.uuid(),
                invoice_number: invoiceNumber,
                type: 'sale',
                date: U.today(),
                customer_id: State.selectedCustomer?.id || null,
                customer_name: State.selectedCustomer?.name || 'نقدي',
                items: State.cart.map(i => ({ ...i })),
                subtotal,
                discount: disc,
                total: net,
                cash_paid: cash,
                card_paid: card,
                paid: method === 'credit' ? 0 : paid,
                remaining: method === 'credit' ? net : Math.max(0, remaining),
                change_amount: remaining < 0 ? Math.abs(remaining) : 0,
                payment_method: method,
                status: method === 'credit' ? 'credit' : (remaining > 0 ? 'partial' : 'paid'),
                notes
            };

            const result = await DB.createInvoice(invoice);
            if (!result.success) throw new Error('فشل حفظ الفاتورة');

            showReceipt(invoice);

            State.cart = [];
            State.discount = 0;
            State.selectedCustomer = null;
            $('#discountValue').value = '0';
            $('#customerSearch').value = '';
            $('#customerInfo').textContent = '';

            closeModal('paymentModal');
            renderCart();
            saveCart();
            updateHeldCount();

            await reloadProducts();

            showToast('تم البيع بنجاح', 'success');

        } catch (e) {
            console.error('Sale error:', e);
            showToast(e.message || 'فشل إتمام البيع', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    async function reloadProducts() {
        try {
            State.products = await DB.getProducts(true) || [];
            State.customers = await DB.getParties('customer', true) || [];
            renderCategories();
            renderProductGrid();
        } catch (e) {
            console.error('Reload error:', e);
        }
    }

    /* ============================================
       Receipt
       ============================================ */
    function showReceipt(invoice) {
        const settings = U.ls.get('settings', {}) || {};
        const shopName = settings.shopName || 'حسابي';
        const shopPhone = settings.phone || '';
        const footer = settings.footer || 'شكراً لتعاملكم معنا';

        let itemsHtml = '';
        invoice.items.forEach(item => {
            itemsHtml += `
                <tr>
                    <td>${U.escape(item.productName)}<br><small style="color:#666;font-size:10px;">${U.escape(item.unitName)}</small></td>
                    <td style="text-align:center;">${item.quantity}</td>
                    <td style="text-align:center;">${item.price.toFixed(2)}</td>
                    <td style="text-align:left;">${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
            `;
        });

        const preview = $('#receiptPreview');
        if (!preview) return;

        preview.innerHTML = `
            <div class="receipt-center" style="font-size:16px;">${U.escape(shopName)}</div>
            ${shopPhone ? `<div class="receipt-center" style="font-size:11px;color:#666;">هاتف: ${U.escape(shopPhone)}</div>` : ''}
            <hr>
            <div class="receipt-row"><span>رقم الفاتورة:</span><strong>${U.escape(invoice.invoice_number)}</strong></div>
            <div class="receipt-row"><span>التاريخ:</span><span>${U.date(invoice.date)} ${U.time(Date.now())}</span></div>
            <div class="receipt-row"><span>العميل:</span><strong>${U.escape(invoice.customer_name)}</strong></div>
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
            <div class="receipt-row"><span>الإجمالي:</span><span>${invoice.subtotal.toFixed(2)}</span></div>
            ${invoice.discount > 0 ? `<div class="receipt-row"><span>الخصم:</span><span>-${invoice.discount.toFixed(2)}</span></div>` : ''}
            <div class="receipt-row" style="font-weight:bold;font-size:15px;margin-top:6px;"><span>الصافي:</span><span>${invoice.total.toFixed(2)}</span></div>
            <hr>
            <div class="receipt-row"><span>طريقة الدفع:</span><span>${paymentLabel(invoice.payment_method)}</span></div>
            ${invoice.cash_paid > 0 ? `<div class="receipt-row"><span>نقدي:</span><span>${invoice.cash_paid.toFixed(2)}</span></div>` : ''}
            ${invoice.card_paid > 0 ? `<div class="receipt-row"><span>بطاقة:</span><span>${invoice.card_paid.toFixed(2)}</span></div>` : ''}
            ${invoice.change_amount > 0 ? `<div class="receipt-row"><span>الباقي:</span><span>${invoice.change_amount.toFixed(2)}</span></div>` : ''}
            ${invoice.remaining > 0 ? `<div class="receipt-row" style="color:red;"><span>المتبقي:</span><span>${invoice.remaining.toFixed(2)}</span></div>` : ''}
            <hr>
            <div class="receipt-center" style="font-weight:bold;">${U.escape(footer)}</div>
        `;

        openModal('receiptModal');
    }

    function paymentLabel(m) {
        return {
            cash: 'نقدي',
            card: 'بطاقة',
            credit: 'آجل',
            mixed: 'مختلط'
        }[m] || m;
    }

    function printReceipt() {
        const preview = $('#receiptPreview');
        if (!preview) return;
        const content = preview.innerHTML;

        const win = window.open('', '_blank', 'width=400,height=700');
        win.document.write(`
            <!DOCTYPE html>
            <html dir="rtl"><head><meta charset="UTF-8">
            <title>طباعة الإيصال</title>
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
        setTimeout(() => { win.print(); }, 300);
    }

    /* ============================================
       Hold / Resume
       ============================================ */
    function holdCurrentSale() {
        if (!State.cart.length) {
            showToast('السلة فارغة', 'info');
            return;
        }

        const held = U.ls.get('heldInvoices', []) || [];
        held.push({
            id: U.uuid(),
            customerId: State.selectedCustomer?.id || null,
            customerName: State.selectedCustomer?.name || 'نقدي',
            items: State.cart.map(i => ({ ...i })),
            discount: State.discount,
            discountType: State.discountType,
            timestamp: Date.now()
        });
        U.ls.set('heldInvoices', held);

        State.cart = [];
        State.discount = 0;
        State.selectedCustomer = null;
        $('#discountValue').value = '0';
        $('#customerSearch').value = '';
        $('#customerInfo').textContent = '';

        renderCart();
        saveCart();
        updateHeldCount();
        showToast('تم تعليق الفاتورة', 'success');
    }

    function updateHeldCount() {
        const held = U.ls.get('heldInvoices', []) || [];
        const badge = $('#heldCount');
        if (badge) {
            badge.textContent = held.length;
            badge.style.display = held.length ? 'grid' : 'none';
        }
    }

    function showHeldInvoices() {
        const held = U.ls.get('heldInvoices', []) || [];
        const container = $('#heldList');
        if (!container) return;

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
                    <div class="held-item" data-id="${h.id}">
                        <div>
                            <strong>${U.escape(h.customerName)}</strong>
                            <small>${h.items.length} صنف · ${U.date(h.timestamp)}</small>
                        </div>
                        <div class="held-item__total">${U.money(total)}</div>
                    </div>
                `;
            }).join('');

            container.querySelectorAll('.held-item').forEach(el => {
                el.addEventListener('click', () => resumeHeld(el.dataset.id));
            });
        }

        openModal('heldModal');
    }

    function resumeHeld(id) {
        const held = U.ls.get('heldInvoices', []) || [];
        const item = held.find(h => h.id === id);
        if (!item) return;

        State.cart = item.items.map(i => ({ ...i }));
        State.discount = item.discount || 0;
        State.discountType = item.discountType || 'amount';

        if (item.customerId) {
            const c = State.customers.find(x => x.id === item.customerId);
            if (c) selectCustomer(c.id);
        }

        $('#discountValue').value = State.discount;
        $('#discountType').value = State.discountType;

        const updated = held.filter(h => h.id !== id);
        U.ls.set('heldInvoices', updated);

        renderCart();
        saveCart();
        updateHeldCount();
        closeModal('heldModal');
        showToast('تم استرجاع الفاتورة', 'success');
    }

    /* ============================================
       Persistence
       ============================================ */
    function saveCart() {
        U.ls.set('posCart', {
            cart: State.cart,
            customerId: State.selectedCustomer?.id || null,
            discount: State.discount,
            discountType: State.discountType
        });
    }

    function restoreCart() {
        const data = U.ls.get('posCart');
        if (!data) {
            renderCart();
            return;
        }

        State.cart = data.cart || [];
        State.discount = data.discount || 0;
        State.discountType = data.discountType || 'amount';

        if (data.customerId) {
            const c = State.customers.find(x => x.id === data.customerId);
            if (c) State.selectedCustomer = c;
        }

        $('#discountValue').value = State.discount;
        $('#discountType').value = State.discountType;

        renderCart();
    }

    /* ============================================
       Modals
       ============================================ */
    function openModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.add('open');
    }
    function closeModal(id) {
        const m = document.getElementById(id);
        if (m) m.classList.remove('open');
    }

    /* ============================================
       Toast
       ============================================ */
    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.style.cssText = `
                position: fixed;
                bottom: calc(20px + env(safe-area-inset-bottom, 0px));
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                flex-direction: column;
                gap: 8px;
                z-index: 99999;
                pointer-events: none;
            `;
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
       Loading
       ============================================ */
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

        // Desktop product search
        $('#productSearch')?.addEventListener('input', U.debounce((e) => {
            State.searchTerm = e.target.value.trim();
            renderProductGrid();
        }, 200));

        $('#productSearch')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim();
                if (!term) return;
                const product = State.products.find(p =>
                    p.barcode === term || p.code === term
                );
                if (product) {
                    e.target.value = '';
                    State.searchTerm = '';
                    renderProductGrid();
                    openUnitModal(product.id);
                }
            }
        });

        // Mobile products panel (close button)
        $('#closeProductsBtn')?.addEventListener('click', () => {
            $('#productsArea')?.classList.remove('show');
        });

        // Checkout
        $('#checkoutBtn')?.addEventListener('click', openPayment);
        $('#clearCartBtn')?.addEventListener('click', clearCart);

        // Discount
        $('#discountValue')?.addEventListener('input', (e) => {
            State.discount = +e.target.value || 0;
            updateSummary();
            saveCart();
        });
        $('#discountType')?.addEventListener('change', (e) => {
            State.discountType = e.target.value;
            updateSummary();
            saveCart();
        });

        // Customer search
        $('#customerSearch')?.addEventListener('focus', (e) => {
            renderCustomerDropdown(e.target.value);
        });
        $('#customerSearch')?.addEventListener('input', U.debounce((e) => {
            renderCustomerDropdown(e.target.value);
        }, 200));
        $('#clearCustomerBtn')?.addEventListener('click', () => selectCustomer(null));

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.customer-input-wrap') && !e.target.closest('.customer-dropdown')) {
                $('#customerDropdown')?.classList.remove('show');
            }
        });

        // Unit modal
        $('#unitChips')?.addEventListener('click', (e) => {
            const chip = e.target.closest('.unit-chip');
            if (!chip) return;
            const idx = +chip.dataset.index;
            State.selectedUnit = State.selectedProduct.units[idx];
            $$('.unit-chip').forEach((c, i) => c.classList.toggle('active', i === idx));
            updateUnitFields();
        });

        $('#unitAddBtn')?.addEventListener('click', () => {
            const idx = State.selectedProduct.units.indexOf(State.selectedUnit);
            const qty = +$('#unitQty').value || 0;
            const price = +$('#unitPrice').value || 0;

            if (qty <= 0) {
                showToast('أدخل كمية صحيحة', 'warning');
                return;
            }

            addToCart(State.selectedProduct.id, idx, qty, price);
            closeModal('unitModal');
            showToast('تمت الإضافة للسلة', 'success');
        });

        $('#unitQty')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') $('#unitAddBtn').click();
        });

        // Payment methods
        $$('.method').forEach(btn => {
            btn.addEventListener('click', () => setPaymentMethod(btn.dataset.method));
        });
        $('#cashInput')?.addEventListener('input', updateChange);
        $('#cardInput')?.addEventListener('input', updateChange);
        $('#confirmPayBtn')?.addEventListener('click', completeSale);

        // Receipt
        $('#printReceiptBtn')?.addEventListener('click', printReceipt);
        $('#newSaleBtn')?.addEventListener('click', () => closeModal('receiptModal'));

        // Hold
        $('#holdBtn')?.addEventListener('click', holdCurrentSale);
        $('#heldBtn')?.addEventListener('click', showHeldInvoices);

        // Modals close
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        // Keyboard shortcuts (desktop only)
        document.addEventListener('keydown', (e) => {
            if (window.innerWidth <= 900) return;
            if (e.target.tagName === 'INPUT' && e.target.id !== 'productSearch' && e.target.id !== 'quickSearchInput') {
                if (e.key === 'Escape') e.target.blur();
                return;
            }
            if (e.key === 'F1') { e.preventDefault(); $('#customerSearch')?.focus(); }
            if (e.key === 'F2') { e.preventDefault(); $('#productSearch')?.focus(); }
            if (e.key === 'F4') { e.preventDefault(); if (State.cart.length) openPayment(); }
            if (e.key === 'F5') { e.preventDefault(); holdCurrentSale(); }
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
                $('#productsArea')?.classList.remove('show');
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
