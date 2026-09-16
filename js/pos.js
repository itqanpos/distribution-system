/* =============================================
   pos.js - Point of Sale Logic
   Version: 5.4.1

   Changelog من v5.4.0:
   - [POS-16] printReceipt: opacity:0 بدل visibility:hidden (iOS fix)
   - [POS-17] printReceipt: print() متزامن (user gesture)
   - [POS-18] printReceipt: afterprint للتنظيف الآمن
   - [POS-19] printReceipt: try/catch شامل
   - [POS-20] completeSale: dedup لا يعرض رصيدًا وهميًا
   - [POS-21] توحيد formatBalance و balanceClass
   - [POS-22] reloadProductsLocal يستخدم force=false دائمًا
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    const DEBUG = window.APP_CONFIG?.DEBUG === true ||
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1';
    const log = (...a) => { if (DEBUG) console.log(...a); };

    const HELD_MAX = 20;
    const CURRENCY = (window.APP_CONFIG && window.APP_CONFIG.CURRENCY) || 'ج.م';

    const BUSINESS_MESSAGES = {
        'P0001': 'السجل غير موجود (قد يكون المنتج أو العميل محذوفًا)',
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
        return err?.message || 'فشل إتمام البيع';
    }

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
        searchTerm: ''
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (!window.DB?.client) {
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

        Auth.onChange((u) => {
            if (!u && State.currentUser) {
                State.currentUser = null;
                location.replace('./index.html');
            }
        });

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadData();
        restoreCart();
        updateHeldCount();

        hideLoadingBar();
    }

    /* ============================================
       Data
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
            renderCategories();
            renderProductGrid();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل البيانات', 'error');
        } finally {
            hideLoadingBar();
        }
    }

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

    /* ============================================
       Categories + Grid
       ============================================ */
    function renderCategories() {
        const el = $('#categoryTabs');
        if (!el) return;
        const cats = ['الكل', ...new Set(State.products.map(p => p.category).filter(Boolean))];
        el.innerHTML = cats.map(c =>
            `<button type="button" class="cat-tab ${c === State.currentCategory ? 'active' : ''}" data-cat="${U.escape(c)}">${U.escape(c)}</button>`
        ).join('');
        el.querySelectorAll('.cat-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                State.currentCategory = btn.dataset.cat;
                renderCategories();
                renderProductGrid();
            });
        });
    }

    function renderProductGrid() {
        const grid = $('#productsGrid');
        if (!grid) return;
        let list = State.products;
        if (State.currentCategory !== 'الكل')
            list = list.filter(p => p.category === State.currentCategory);
        if (State.searchTerm) {
            const term = State.searchTerm.toLowerCase();
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.barcode || '').includes(State.searchTerm) ||
                (p.code || '').includes(State.searchTerm)
            );
        }
        if (!list.length) {
            grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
                <i class="fas fa-box-open" style="font-size:50px;opacity:0.3;display:block;margin-bottom:12px;"></i>
                <p style="font-weight:700;">لا توجد منتجات</p></div>`;
            return;
        }
        grid.innerHTML = list.map(p => {
            const base = p.units?.[0] || { price: 0, stock: 0 };
            const stock = base.stock || 0;
            const stockClass = stock > 0 ? 'in' : 'out';
            const stockLabel = stock > 0 ? `متوفر: ${stock}` : 'نفذ';
            return `
                <div class="product-card" data-id="${U.escape(p.id)}">
                    <div class="product-card__icon"><i class="fas fa-cube"></i></div>
                    <div class="product-card__name">${U.escape(p.name)}</div>
                    <div class="product-card__price">${U.money(base.price)}</div>
                    <div class="product-card__stock ${stockClass}">
                        <i class="fas fa-circle" style="font-size:6px;"></i> ${stockLabel}
                    </div>
                </div>`;
        }).join('');
        grid.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', () => openUnitModal(card.dataset.id));
        });
    }

    /* ============================================
       Product Search
       ============================================ */
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
            dd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">لا توجد نتائج</div>`;
            dd.classList.add('show');
            return;
        }

        dd.innerHTML = filtered.map(p => {
            const base = p.units?.[0] || { price: 0, stock: 0 };
            const stock = base.stock || 0;
            const stockClass = stock > 0 ? 'in' : 'out';
            return `
                <div class="product-option" data-id="${U.escape(p.id)}">
                    <div class="product-option__info">
                        <div class="product-option__name">${U.escape(p.name)}</div>
                        <div class="product-option__meta">${U.money(base.price)} ${p.barcode ? '· ' + U.escape(p.barcode) : ''}</div>
                    </div>
                    <div class="product-option__stock ${stockClass}">${stock}</div>
                </div>`;
        }).join('');
        dd.classList.add('show');

        dd.querySelectorAll('.product-option').forEach(item => {
            item.addEventListener('click', () => {
                const input = $('#productSearchInput');
                if (input) input.value = '';
                dd.classList.remove('show');
                openUnitModal(item.dataset.id);
            });
        });
    }

    function clearProductSearch() {
        const input = $('#productSearchInput');
        if (input) input.value = '';
        $('#productDropdown')?.classList.remove('show');
    }

    function bindProductSearch() {
        const input = $('#productSearchInput');
        const clearBtn = $('#clearProductBtn');
        if (!input) return;

        input.addEventListener('input', U.debounce((e) => {
            renderProductDropdown(e.target.value.trim());
        }, 150));

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim();
                if (!term) return;
                let product = State.products.find(p => p.barcode === term || p.code === term);
                if (!product) {
                    const t = term.toLowerCase();
                    product = State.products.find(p => (p.name || '').toLowerCase().includes(t));
                }
                if (product) {
                    e.target.value = '';
                    $('#productDropdown')?.classList.remove('show');
                    openUnitModal(product.id);
                } else {
                    showToast('لم يتم العثور على المنتج', 'warning');
                }
            }
        });

        input.addEventListener('focus', (e) => {
            if (e.target.value.trim()) renderProductDropdown(e.target.value.trim());
        });

        clearBtn?.addEventListener('click', clearProductSearch);

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.product-input-wrap') && !e.target.closest('.product-dropdown')) {
                $('#productDropdown')?.classList.remove('show');
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
            `<button type="button" class="unit-chip ${i === 0 ? 'active' : ''}" data-index="${i}">${U.escape(u.name)}</button>`
        ).join('');

        updateUnitFields();

        if (window.innerWidth <= 900) $('#productsArea')?.classList.remove('show');
        openModal('unitModal');
        setTimeout(() => {
            const qty = $('#unitQty');
            if (qty) { qty.focus(); qty.select(); }
        }, 200);
    }

    function updateUnitFields() {
        const p = State.selectedProduct, u = State.selectedUnit;
        if (!p || !u) return;
        $('#unitPrice').value = u.price || 0;
        $('#unitQty').value = 1;

        const base = p.units.find(x => x.isBase) || p.units[0];
        const stock = Number(base.stock) || 0;
        const factor = Number(u.factor) || 1;
        const reservedInBase = getCartQtyInBase(p.id, -1);
        const availableInBase = Math.max(0, stock - reservedInBase);
        const max = u === base
            ? Math.floor(availableInBase)
            : Math.floor(availableInBase / factor);
        $('#stockInfo').textContent = `المخزون المتاح: ${max} ${u.name}`;
        updatePriceRangeHint(u);
    }

    function updatePriceRangeHint(unit) {
        const hint = $('#priceRangeHint');
        const errorEl = $('#priceLimitError');
        if (!hint) return;
        const hasMin = unit.minPrice > 0, hasMax = unit.maxPrice > 0;
        if (hasMin || hasMax) {
            const minLabel = hasMin ? U.money(unit.minPrice) : 'بدون حد';
            const maxLabel = hasMax ? U.money(unit.maxPrice) : 'بدون حد';
            hint.innerHTML = `<i class="fas fa-tags"></i>
                <span>نطاق السعر المسموح: <strong>${minLabel}</strong> إلى <strong>${maxLabel}</strong></span>`;
            hint.style.display = 'flex';
        } else hint.style.display = 'none';
        if (errorEl) errorEl.style.display = 'none';
    }

    function validatePrice(price, unit) {
        if (!unit) return { valid: true };
        if (unit.minPrice > 0 && price < unit.minPrice)
            return { valid: false, message: `لا يمكن أقل من ${U.money(unit.minPrice)}` };
        if (unit.maxPrice > 0 && price > unit.maxPrice)
            return { valid: false, message: `لا يمكن أعلى من ${U.money(unit.maxPrice)}` };
        return { valid: true };
    }

    /* ============================================
       Stock
       ============================================ */
    function getCartQtyInBase(productId, excludeIdx = -1) {
        const product = State.products.find(p => p.id === productId);
        if (!product?.units?.length) return 0;
        let total = 0;
        for (let i = 0; i < State.cart.length; i++) {
            if (i === excludeIdx) continue;
            const it = State.cart[i];
            if (it.productId !== productId) continue;
            const soldUnit = product.units.find(u => u.name === it.unitName);
            if (!soldUnit) continue;
            const factor = Number(soldUnit.factor) || 1;
            total += (Number(it.quantity) || 0) * factor;
        }
        return total;
    }

    function validateStock(product, unit, qty, excludeIdx = -1) {
        if (!product?.units?.length) {
            return { valid: false, message: 'المنتج غير متوفر' };
        }
        const base = product.units.find(u => u.isBase) || product.units[0];
        const stock = Number(base.stock) || 0;
        const factor = Number(unit.factor) || 1;

        const reservedBase = getCartQtyInBase(product.id, excludeIdx);
        const newBase = (Number(qty) || 0) * factor;
        const totalBase = reservedBase + newBase;

        if (totalBase > stock + 0.0001) {
            const availableBase = Math.max(0, stock - reservedBase);
            const availableInUnit = availableBase / factor;
            return {
                valid: false,
                message: `المخزون المتاح: ${availableInUnit.toFixed(3)} ${unit.name}`
            };
        }
        return { valid: true };
    }

    /* ============================================
       Cart
       ============================================ */
    function addToCart(productId, unitIndex, qty, price) {
        const product = State.products.find(p => p.id === productId);
        if (!product) return { ok: false };
        const unit = product.units[unitIndex];
        if (!unit) return { ok: false };

        const priceCheck = validatePrice(price, unit);
        if (!priceCheck.valid) { showToast(priceCheck.message, 'error'); return { ok: false }; }

        const stockCheck = validateStock(product, unit, qty);
        if (!stockCheck.valid) { showToast(stockCheck.message, 'error'); return { ok: false }; }

        const existing = State.cart.find(i =>
            i.productId === productId && i.unitName === unit.name);

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
                factor: unit.factor || 1,
                minPrice: unit.minPrice || 0,
                maxPrice: unit.maxPrice || 0
            });
        }

        renderCart();
        saveCart();
        return { ok: true };
    }

    function renderCart() {
        const container = $('#cartItems');
        if (!container) return;

        if (!State.cart.length) {
            container.innerHTML = `
                <div class="empty-cart">
                    <i class="fas fa-shopping-cart"></i>
                    <p>السلة فارغة</p>
                    <small>اختر منتجاً للبدء</small>
                </div>`;
            updateSummary();
            return;
        }

        container.innerHTML = State.cart.map((item, idx) => {
            const hasLimits = (item.minPrice > 0) || (item.maxPrice > 0);
            const rangeTitle = hasLimits
                ? `الحد: ${item.minPrice || 0} - ${item.maxPrice || '∞'}` : '';
            const lineTotal = U.round(item.price * item.quantity, 2);
            return `
                <div class="cart-item" data-idx="${idx}">
                    <div>
                        <div class="cart-item__name">${U.escape(item.productName)}</div>
                        <div class="cart-item__unit">${U.escape(item.unitName)}
                            ${hasLimits ? ` · <span style="color:var(--warning);font-weight:800;">${rangeTitle}</span>` : ''}
                        </div>
                        <div class="cart-item__controls">
                            <button type="button" class="qty-btn" data-action="dec" aria-label="تقليل"><i class="fas fa-minus"></i></button>
                            <input type="number" class="cart-item__qty" value="${item.quantity}" min="0.001" step="0.001" data-action="qty" inputmode="decimal">
                            <button type="button" class="qty-btn" data-action="inc" aria-label="زيادة"><i class="fas fa-plus"></i></button>
                            <input type="number" class="cart-item__price-input" value="${item.price}" step="0.01" min="0" data-action="price" inputmode="decimal" title="تعديل السعر">
                        </div>
                    </div>
                    <div class="cart-item__price">${U.money(lineTotal)}</div>
                    <button type="button" class="cart-item__remove" data-action="remove" aria-label="حذف"><i class="fas fa-times"></i></button>
                </div>`;
        }).join('');

        container.querySelectorAll('.cart-item').forEach(itemEl => {
            const idx = +itemEl.dataset.idx;

            itemEl.addEventListener('click', (e) => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (!action || action === 'qty' || action === 'price') return;
                const item = State.cart[idx];
                if (!item) return;

                if (action === 'inc') {
                    const product = State.products.find(p => p.id === item.productId);
                    const unit = product?.units?.find(u => u.name === item.unitName);
                    if (product && unit) {
                        const check = validateStock(product, unit, item.quantity + 1, idx);
                        if (!check.valid) { showToast(check.message, 'error'); return; }
                    }
                    item.quantity = U.round(item.quantity + 1, 3);
                } else if (action === 'dec') {
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
                const item = State.cart[idx];
                if (!item) return;
                if (!Number.isFinite(v) || v <= 0) { renderCart(); return; }
                const product = State.products.find(p => p.id === item.productId);
                const unit = product?.units?.find(u => u.name === item.unitName);
                if (product && unit) {
                    const check = validateStock(product, unit, v, idx);
                    if (!check.valid) { showToast(check.message, 'error'); renderCart(); return; }
                }
                item.quantity = v;
                renderCart();
                saveCart();
            });

            itemEl.querySelector('[data-action="price"]')?.addEventListener('change', (e) => {
                const input = e.target;
                const v = +input.value || 0;
                const item = State.cart[idx];
                if (!item) return;

                const validation = validatePrice(v, {
                    minPrice: item.minPrice || 0,
                    maxPrice: item.maxPrice || 0
                });
                if (!validation.valid) {
                    input.classList.add('invalid');
                    showToast(validation.message, 'error');
                    setTimeout(() => {
                        input.value = item.price;
                        input.classList.remove('invalid');
                    }, 1200);
                    return;
                }
                input.classList.remove('invalid');
                item.price = v;
                renderCart();
                saveCart();
            });
        });

        updateSummary();
    }

    function calculateTotals() {
        const subtotal = U.round(
            State.cart.reduce((s, i) => s + U.round(i.price * i.quantity, 2), 0),
            2
        );

        let disc = 0;
        if (State.discountType === 'amount') {
            disc = Math.min(Math.max(0, State.discount), subtotal);
        } else {
            const pct = Math.min(100, Math.max(0, State.discount));
            disc = U.round(subtotal * (pct / 100), 2);
        }
        const net = U.round(subtotal - disc, 2);
        return { subtotal, disc, net };
    }

    function updateSummary() {
        const { subtotal, disc, net } = calculateTotals();
        const s = $('#subtotal'); if (s) s.textContent = U.money(subtotal);
        const n = $('#netTotal'); if (n) n.textContent = U.money(net);
        const c = $('#itemsCount');
        if (c) c.textContent = U.round(
            State.cart.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0), 3);
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
        $('#customerInfo').style.color = '';
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
                (c.phone || '').includes(term));
        }
        let html = `
            <div class="cust-item" data-id="">
                <div><div class="cust-item__name">نقدي</div>
                <div class="cust-item__phone">بدون عميل</div></div>
                <div class="cust-item__balance zero">--</div>
            </div>`;
        if (list.length) {
            html += list.slice(0, 20).map(c => {
                const bal = c.balance || 0;
                const cls = bal > 0 ? 'pos' : bal < 0 ? 'neg' : 'zero';
                const label = bal > 0 ? `+${U.moneyRaw(bal)}` :
                              bal < 0 ? `-${U.moneyRaw(-bal)}` : '0';
                return `<div class="cust-item" data-id="${U.escape(c.id)}">
                    <div><div class="cust-item__name">${U.escape(c.name)}</div>
                    <div class="cust-item__phone">${U.escape(c.phone || '')}</div></div>
                    <div class="cust-item__balance ${cls}">${label}</div></div>`;
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
            let info = 'لا رصيد', color = 'var(--text-muted)';
            if (bal > 0) { info = `دائن: ${U.money(bal)}`; color = 'var(--success)'; }
            else if (bal < 0) { info = `مدين: ${U.money(-bal)}`; color = 'var(--danger)'; }
            $('#customerInfo').textContent = info;
            $('#customerInfo').style.color = color;
        }
        $('#customerDropdown').classList.remove('show');

        if ($('#paymentModal')?.classList.contains('open')) {
            renderPaymentCustomerBalance();
        }
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
        renderPaymentCustomerBalance();

        openModal('paymentModal');
        setTimeout(() => $('#cashInput')?.focus(), 200);
    }

    function setPaymentMethod(method) {
        State.paymentMethod = method;
        $$('.method').forEach(b => b.classList.toggle('active', b.dataset.method === method));
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
        $('#quickCash').innerHTML = uniq.map(v => `<button type="button" data-amount="${v}">${v}</button>`).join('');
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
        const remaining = U.round(net - paid);
        const display = $('#changeDisplay');
        const value = $('#changeValue');
        if (remaining > 0) {
            display?.classList.add('is-short');
            const span = display?.querySelector('span');
            if (span) span.textContent = 'المتبقي:';
            if (value) value.textContent = U.money(remaining);
        } else {
            display?.classList.remove('is-short');
            const span = display?.querySelector('span');
            if (span) span.textContent = 'الباقي للعميل:';
            if (value) value.textContent = U.money(Math.abs(remaining));
        }

        renderPaymentCustomerBalance();
    }

    function renderPaymentCustomerBalance() {
        const container = $('#paymentCustomerBalance');
        const prevEl = $('#pcbPrevious');
        const newEl = $('#pcbNew');
        const nameEl = $('#pcbCustomerName');
        if (!container || !prevEl || !newEl) return;

        if (!State.selectedCustomer) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';
        if (nameEl) nameEl.textContent = State.selectedCustomer.name || 'العميل';

        const oldBalance = Number(State.selectedCustomer.balance) || 0;
        const { net } = calculateTotals();
        const method = State.paymentMethod;
        const cash = +$('#cashInput')?.value || 0;
        const card = +$('#cardInput')?.value || 0;

        let rawPaid = 0;
        if (method === 'cash') rawPaid = cash;
        else if (method === 'card') rawPaid = card;
        else if (method === 'mixed') rawPaid = cash + card;

        const remaining = Math.max(0, U.round(net - rawPaid, 2));
        const usedBalance = 0;

        const newBalance = U.round(oldBalance - remaining - usedBalance, 3);

        prevEl.textContent = formatBalance(oldBalance);
        prevEl.className = 'pcb-value ' + balanceClass(oldBalance);

        newEl.textContent = formatBalance(newBalance);
        newEl.className = 'pcb-value ' + balanceClass(newBalance);

        if (newBalance < oldBalance - 0.001) {
            container.classList.add('pcb--increasing-debt');
        } else {
            container.classList.remove('pcb--increasing-debt');
        }
    }

    /* ============================================
       Balance helpers — ✅ [POS-21] موحّد
       ============================================ */
    function formatBalance(bal) {
        const n = Number(bal) || 0;
        if (Math.abs(n) < 0.001) return `0.00 ${CURRENCY}`;
        if (n < 0) return `مدين ${U.money(Math.abs(n))}`;
        return `دائن ${U.money(n)}`;
    }

    function balanceClass(bal) {
        const n = Number(bal) || 0;
        if (Math.abs(n) < 0.001) return 'pcb-value--zero';
        if (n < 0) return 'pcb-value--debit';
        return 'pcb-value--credit';
    }

    function receiptBalanceClass(bal) {
        const n = Number(bal) || 0;
        if (Math.abs(n) < 0.001) return 'receipt-balance-zero';
        if (n < 0) return 'receipt-balance-debit';
        return 'receipt-balance-credit';
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

        let rawPaid = 0;
        if (method === 'cash') rawPaid = cash;
        else if (method === 'card') rawPaid = card;
        else if (method === 'mixed') rawPaid = cash + card;

        const paid = Math.min(rawPaid, net);
        const change = U.round(Math.max(0, rawPaid - net));
        const remaining = U.round(Math.max(0, net - rawPaid));

        if (remaining > 0 && !State.selectedCustomer) {
            showToast('اختر عميلاً لتسجيل الدين', 'warning');
            $('#customerSearch')?.focus();
            return;
        }
        if (method === 'credit' && !State.selectedCustomer) {
            showToast('يجب اختيار عميل للدفع الآجل', 'warning');
            return;
        }
        if (remaining > 0 && method !== 'credit') {
            if (!confirm(`المتبقي ${U.money(remaining)}. سيتم تسجيله كدين على ${State.selectedCustomer.name}. متابعة؟`)) return;
        }
        if (method === 'credit' && State.selectedCustomer) {
            if (!confirm(`سيتم تسجيل ${U.money(net)} كدين على العميل. متابعة؟`)) return;
        }

        const btn = $('#confirmPayBtn');
        if (btn) btn.disabled = true;

        try {
            const customerOldBalance = State.selectedCustomer
                ? (Number(State.selectedCustomer.balance) || 0)
                : 0;

            const debtIncrease = method === 'credit' ? net : remaining;
            const customerNewBalance = State.selectedCustomer
                ? U.round(customerOldBalance - debtIncrease, 3)
                : 0;

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
                cash_paid: method === 'cash' || method === 'mixed' ? cash : 0,
                card_paid: method === 'card' || method === 'mixed' ? card : 0,
                transfer_paid: 0,
                used_balance: 0,
                paid: method === 'credit' ? 0 : paid,
                remaining: method === 'credit' ? net : remaining,
                change_amount: change,
                payment_method: method,
                status: method === 'credit' ? 'credit' : (remaining > 0 ? 'partial' : 'paid'),
                notes,
                _hasCustomer: !!State.selectedCustomer,
                _oldBalance: customerOldBalance,
                _newBalance: customerNewBalance
            };

            const result = await DB.createInvoice(invoice);
            if (!result.success) throw new Error('فشل حفظ الفاتورة');

            // ✅ [POS-20] عند dedup: الرصيد على السيرفر لم يتغير — أصلح العرض
            if (result.deduplicated) {
                invoice._newBalance = invoice._oldBalance;
                invoice._hasCustomer = false;
            }

            showReceipt(invoice);

            State.cart = [];
            State.discount = 0;
            State.discountType = 'amount';
            State.selectedCustomer = null;
            $('#discountValue').value = '0';
            $('#discountType').value = 'amount';
            $('#customerSearch').value = '';
            $('#customerInfo').textContent = '';
            $('#customerInfo').style.color = '';

            closeModal('paymentModal');
            renderCart();
            saveCart();
            updateHeldCount();

            await reloadProductsLocal();
            showToast(result.deduplicated ? 'الفاتورة كانت مسجلة مسبقًا' : 'تم البيع بنجاح', 'success');

        } catch (e) {
            console.error('Sale error:', e);
            showToast(translateError(e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ✅ [POS-22] force=false — الاعتماد على IDB (المُحدَّث محليًا بواسطة RPC)
    async function reloadProductsLocal() {
        try {
            const products = await DB.getProducts(false) || [];
            const customers = await DB.getParties('customer', false) || [];
            State.products = products;
            State.customers = customers;
            if (State.selectedCustomer) {
                const fresh = State.customers.find(c => c.id === State.selectedCustomer.id);
                if (fresh) State.selectedCustomer = fresh;
            }
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
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 0;
            const lineTotal = U.round(price * qty, 2);
            itemsHtml += `
                <tr>
                    <td>${U.escape(item.productName)}<br>
                        <small class="receipt-item-unit">${U.escape(item.unitName)}</small>
                    </td>
                    <td class="receipt-col-center">${qty}</td>
                    <td class="receipt-col-center">${price.toFixed(2)}</td>
                    <td class="receipt-col-total">${lineTotal.toFixed(2)}</td>
                </tr>`;
        });

        const hasCustomer = invoice._hasCustomer === true;
        const oldBal = Number(invoice._oldBalance) || 0;
        const newBal = Number(invoice._newBalance) || 0;

        let balanceHtml = '';
        if (hasCustomer && (Math.abs(oldBal) > 0.001 || Math.abs(newBal) > 0.001 || invoice.remaining > 0)) {
            balanceHtml = `
                <div class="receipt-balance">
                    <div class="receipt-row">
                        <span>الرصيد السابق:</span>
                        <strong class="${receiptBalanceClass(oldBal)}">${formatBalance(oldBal)}</strong>
                    </div>
                    <div class="receipt-row">
                        <span>الرصيد بعد الفاتورة:</span>
                        <strong class="${receiptBalanceClass(newBal)}">${formatBalance(newBal)}</strong>
                    </div>
                </div>
            `;
        }

        const preview = $('#receiptPreview');
        if (!preview) return;

        preview.innerHTML = `
            <div class="receipt-shop receipt-center">${U.escape(shopName)}</div>
            ${shopPhone ? `<div class="receipt-phone receipt-center">هاتف: ${U.escape(shopPhone)}</div>` : ''}
            <hr>
            <div class="receipt-row">
                <span>رقم الفاتورة:</span>
                <strong class="receipt-inv-num">${U.escape(invoice.invoice_number)}</strong>
            </div>
            <div class="receipt-row">
                <span>التاريخ:</span>
                <span>${U.date(invoice.date)} ${U.time(Date.now())}</span>
            </div>
            <div class="receipt-row">
                <span>العميل:</span>
                <strong>${U.escape(invoice.customer_name)}</strong>
            </div>
            <hr>
            <table class="receipt-table">
                <thead>
                    <tr>
                        <th>الصنف</th>
                        <th class="receipt-col-center">كمية</th>
                        <th class="receipt-col-center">سعر</th>
                        <th class="receipt-col-total">إجمالي</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <hr>
            <div class="receipt-row">
                <span>الإجمالي:</span>
                <span>${Number(invoice.subtotal).toFixed(2)}</span>
            </div>
            ${invoice.discount > 0 ? `
                <div class="receipt-row">
                    <span>الخصم:</span>
                    <span>-${Number(invoice.discount).toFixed(2)}</span>
                </div>` : ''}
            <div class="receipt-row receipt-total">
                <span>الصافي:</span>
                <span>${Number(invoice.total).toFixed(2)}</span>
            </div>
            <hr>
            <div class="receipt-row">
                <span>طريقة الدفع:</span>
                <span>${paymentLabel(invoice.payment_method)}</span>
            </div>
            ${invoice.cash_paid > 0 ? `
                <div class="receipt-row">
                    <span>نقدي:</span>
                    <span>${Number(invoice.cash_paid).toFixed(2)}</span>
                </div>` : ''}
            ${invoice.card_paid > 0 ? `
                <div class="receipt-row">
                    <span>بطاقة:</span>
                    <span>${Number(invoice.card_paid).toFixed(2)}</span>
                </div>` : ''}
            ${invoice.change_amount > 0 ? `
                <div class="receipt-row">
                    <span>الباقي:</span>
                    <span>${Number(invoice.change_amount).toFixed(2)}</span>
                </div>` : ''}
            ${invoice.remaining > 0 ? `
                <div class="receipt-row receipt-remaining">
                    <span>المتبقي:</span>
                    <span>${Number(invoice.remaining).toFixed(2)}</span>
                </div>` : ''}
            ${balanceHtml}
            <hr>
            <div class="receipt-footer receipt-center">${U.escape(footer)}</div>
        `;
        openModal('receiptModal');
    }

    function paymentLabel(m) {
        return { cash: 'نقدي', card: 'بطاقة', credit: 'آجل', mixed: 'مختلط' }[m] || m;
    }

    /* ============================================
       Print — ✅ [POS-16..19] متوافق مع iOS
       ============================================ */
    function printReceipt() {
        const preview = $('#receiptPreview');
        if (!preview) return;

        let iframe;
        try {
            iframe = document.createElement('iframe');
            iframe.setAttribute('aria-hidden', 'true');
            // ✅ opacity بدل visibility — visibility:hidden يُفشل الطباعة على iOS
            iframe.style.cssText =
                'position:fixed;right:0;bottom:0;width:0;height:0;border:0;' +
                'opacity:0;pointer-events:none;';
            document.body.appendChild(iframe);

            const doc = iframe.contentDocument || iframe.contentWindow?.document;
            if (!doc) throw new Error('Cannot access iframe document');

            doc.open();
            doc.write(`<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>طباعة الإيصال</title>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;700;800&display=swap" rel="stylesheet">
<style>
    @page { size: 80mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
        font-family: 'Cairo', Arial, sans-serif;
        padding: 6px; margin: 0; font-size: 12px;
        color: #000; background: #fff;
        max-width: 80mm; line-height: 1.5;
    }
    hr { border: none; border-top: 1px dashed #999; margin: 8px 0; }
    .receipt-row { display: flex; justify-content: space-between; margin: 3px 0; gap: 8px; }
    .receipt-center { text-align: center; }
    .receipt-shop { font-size: 17px; font-weight: 800; margin-bottom: 2px; }
    .receipt-phone { font-size: 10px; color: #666; margin-bottom: 4px; }
    .receipt-inv-num { font-family: 'Courier New', monospace; letter-spacing: 0.5px; }
    .receipt-total { font-weight: 800; font-size: 14px; margin-top: 4px; }
    .receipt-remaining { color: #d00; font-weight: 800; }
    .receipt-footer { font-weight: 700; margin-top: 8px; font-size: 12px; }
    .receipt-table { width: 100%; border-collapse: collapse; margin: 6px 0; }
    .receipt-table th, .receipt-table td {
        padding: 4px 2px; border-bottom: 1px dashed #ddd;
        font-size: 11px; text-align: right; vertical-align: top;
    }
    .receipt-table th { font-weight: 800; border-bottom: 1px solid #999; }
    .receipt-col-center { text-align: center; }
    .receipt-col-total { text-align: left; font-weight: 700; }
    .receipt-item-unit { color: #666; font-size: 9px; }
    .receipt-balance {
        background: #f5f5f5; padding: 6px 8px; border-radius: 4px;
        margin: 8px 0; border: 1px solid #eee;
    }
    .receipt-balance .receipt-row { font-weight: 700; font-size: 12px; }
    .receipt-balance-debit { color: #d00; }
    .receipt-balance-credit { color: #090; }
    .receipt-balance-zero { color: #666; }
</style>
</head>
<body>${preview.innerHTML}</body>
</html>`);
            doc.close();

            const doPrint = () => {
                try {
                    iframe.contentWindow.focus();
                    iframe.contentWindow.print();
                } catch (e) {
                    console.error('Print call failed:', e);
                    showToast('تعذر فتح حوار الطباعة', 'error');
                }
            };

            const cleanup = () => {
                setTimeout(() => {
                    if (iframe && iframe.parentNode) {
                        try { iframe.remove(); } catch {}
                    }
                }, 500);
            };

            try {
                iframe.contentWindow.addEventListener('afterprint', cleanup, { once: true });
            } catch {}

            // احتياطي: احذف بعد 30 ثانية
            setTimeout(cleanup, 30000);

            // ✅ [POS-17] اطبع متزامنًا إن أمكن — user gesture
            if (doc.readyState === 'complete') {
                doPrint();
            } else {
                iframe.contentWindow.addEventListener('load', doPrint, { once: true });
            }

        } catch (err) {
            console.error('Print setup failed:', err);
            showToast('تعذر الطباعة: ' + (err?.message || ''), 'error');
            if (iframe?.parentNode) {
                try { iframe.remove(); } catch {}
            }
        }
    }

    /* ============================================
       Hold / Resume
       ============================================ */
    function holdCurrentSale() {
        if (!State.cart.length) { showToast('السلة فارغة', 'info'); return; }
        const held = U.ls.get('heldInvoices', []) || [];
        if (held.length >= HELD_MAX) {
            showToast(`الحد الأقصى ${HELD_MAX} فاتورة معلقة. احذف واحدة أولاً.`, 'warning');
            return;
        }
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
        $('#customerInfo').style.color = '';
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
            container.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-muted);">
                <i class="fas fa-bookmark" style="font-size:40px;opacity:0.3;display:block;margin-bottom:12px;"></i>
                <p>لا توجد فواتير معلقة</p></div>`;
        } else {
            container.innerHTML = held.map(h => {
                const total = h.items.reduce((s, i) => s + ((Number(i.price) || 0) * (Number(i.quantity) || 0)), 0);
                return `<div class="held-item" data-id="${h.id}">
                    <div><strong>${U.escape(h.customerName)}</strong>
                    <small>${h.items.length} صنف · ${U.date(h.timestamp)}</small></div>
                    <div class="held-item__total">${U.money(total)}</div>
                </div>`;
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
        if (!data) { renderCart(); return; }
        State.cart = Array.isArray(data.cart) ? data.cart : [];
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
       Modals / Toast / Loading
       ============================================ */
    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    function showToast(msg, type = 'info') {
        if (window.Toast && typeof window.Toast.show === 'function') {
            try { window.Toast.show(msg, type); return; } catch (e) { /* fallthrough */ }
        }

        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.style.cssText = `position:fixed;bottom:calc(20px + env(safe-area-inset-bottom,0px));left:50%;
                transform:translateX(-50%);display:flex;flex-direction:column;gap:8px;z-index:99999;pointer-events:none;`;
            document.body.appendChild(stack);
        }
        const icons = { success:'check-circle', error:'times-circle', warning:'exclamation-triangle', info:'info-circle' };
        const colors = { success:'#10b981', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
        const toast = document.createElement('div');
        toast.style.cssText = `padding:12px 22px;background:${colors[type]||colors.info};color:#fff;
            border-radius:999px;font-weight:700;font-size:14px;box-shadow:0 12px 32px rgba(0,0,0,0.15);
            display:flex;align-items:center;gap:10px;`;
        toast.innerHTML = `<i class="fas fa-${icons[type]}"></i> <span>${U.escape(msg)}</span>`;
        stack.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    function showLoading() { const b = $('#loading-bar'); if (b) b.style.width = '70%'; }
    function hideLoadingBar() {
        const b = $('#loading-bar');
        if (b) { b.style.width = '100%'; setTimeout(() => { b.style.width = '0%'; }, 300); }
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

        $('#productSearch')?.addEventListener('input', U.debounce((e) => {
            State.searchTerm = e.target.value.trim();
            renderProductGrid();
        }, 200));

        $('#productSearch')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const term = e.target.value.trim();
                if (!term) return;
                const product = State.products.find(p => p.barcode === term || p.code === term);
                if (product) {
                    e.target.value = '';
                    State.searchTerm = '';
                    renderProductGrid();
                    openUnitModal(product.id);
                }
            }
        });

        bindProductSearch();

        $('#closeProductsBtn')?.addEventListener('click', () => {
            $('#productsArea')?.classList.remove('show');
        });

        $('#checkoutBtn')?.addEventListener('click', openPayment);
        $('#clearCartBtn')?.addEventListener('click', clearCart);

        $('#discountValue')?.addEventListener('input', (e) => {
            let v = +e.target.value || 0;
            if (State.discountType === 'percent') v = Math.min(100, Math.max(0, v));
            else v = Math.max(0, v);
            State.discount = v;
            updateSummary();
            saveCart();
        });
        $('#discountType')?.addEventListener('change', (e) => {
            State.discountType = e.target.value;
            if (State.discountType === 'percent') {
                State.discount = Math.min(100, Math.max(0, State.discount));
                $('#discountValue').value = State.discount;
            }
            updateSummary();
            saveCart();
        });

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

        $('#unitChips')?.addEventListener('click', (e) => {
            const chip = e.target.closest('.unit-chip');
            if (!chip) return;
            const idx = +chip.dataset.index;
            State.selectedUnit = State.selectedProduct.units[idx];
            $$('.unit-chip').forEach((c, i) => c.classList.toggle('active', i === idx));
            updateUnitFields();
        });

        $('#unitPrice')?.addEventListener('input', () => {
            const price = +$('#unitPrice')?.value || 0;
            const u = State.selectedUnit;
            const errorEl = $('#priceLimitError');
            if (!u || !errorEl) return;
            const validation = validatePrice(price, u);
            if (!validation.valid) {
                errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${validation.message}`;
                errorEl.style.display = 'flex';
            } else {
                errorEl.style.display = 'none';
            }
        });

        $('#unitAddBtn')?.addEventListener('click', () => {
            const product = State.selectedProduct;
            const unit = State.selectedUnit;
            if (!product || !unit) return;
            const idx = product.units.indexOf(unit);
            const qty = +$('#unitQty').value || 0;
            const price = +$('#unitPrice').value || 0;

            if (qty <= 0) { showToast('أدخل كمية صحيحة', 'warning'); return; }

            const priceCheck = validatePrice(price, unit);
            if (!priceCheck.valid) {
                const errorEl = $('#priceLimitError');
                if (errorEl) {
                    errorEl.innerHTML = `<i class="fas fa-exclamation-circle"></i> ${priceCheck.message}`;
                    errorEl.style.display = 'flex';
                }
                showToast(priceCheck.message, 'error');
                return;
            }

            const result = addToCart(product.id, idx, qty, price);
            if (!result.ok) return;

            closeModal('unitModal');
            showToast('تمت الإضافة للسلة', 'success');
        });

        $('#unitQty')?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') $('#unitAddBtn').click();
        });

        $$('.method').forEach(btn => {
            btn.addEventListener('click', () => setPaymentMethod(btn.dataset.method));
        });
        $('#cashInput')?.addEventListener('input', updateChange);
        $('#cardInput')?.addEventListener('input', updateChange);
        $('#confirmPayBtn')?.addEventListener('click', completeSale);

        $('#printReceiptBtn')?.addEventListener('click', printReceipt);
        $('#newSaleBtn')?.addEventListener('click', () => closeModal('receiptModal'));

        $('#holdBtn')?.addEventListener('click', holdCurrentSale);
        $('#heldBtn')?.addEventListener('click', showHeldInvoices);

        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });

        const protectedModals = new Set(['paymentModal', 'unitModal']);
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target !== modal) return;
                if (protectedModals.has(modal.id)) return;
                modal.classList.remove('open');
            });
        });

        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' && e.target.id !== 'productSearch') {
                if (e.key === 'Escape') e.target.blur();
                return;
            }
            if (e.key === 'F1') { e.preventDefault(); $('#customerSearch')?.focus(); }
            if (e.key === 'F2') { e.preventDefault(); $('#productSearch')?.focus(); }
            if (e.key === 'F3') { e.preventDefault(); $('#productSearchInput')?.focus(); }
            if (e.key === 'F4') { e.preventDefault(); if (State.cart.length) openPayment(); }
            if (e.key === 'F5' && State.cart.length) {
                e.preventDefault();
                holdCurrentSale();
            }
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => {
                    if (!protectedModals.has(m.id)) m.classList.remove('open');
                });
                $('#productsArea')?.classList.remove('show');
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
