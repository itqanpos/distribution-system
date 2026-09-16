/* =============================================
   pos.js - Point of Sale Logic
   Version: 6.0.0

   Changelog من v5.6.0:
   - [POS-32] [BUG-1] إزالة صف "إجمالي الفاتورة" المكرر في الإيصال
   - [POS-33] [BUG-2] إعادة كتابة printReceipt:
              load event + readyState check + 2s fallback
              + الانتظار لتحميل الخطوط (document.fonts.ready)
   - [POS-34] [BUG-3] restoreCart يتحقق من وجود المنتجات والوحدات
              ويسقط العناصر التالفة مع تحذير للمستخدم
   - [POS-35] [BUG-4] clearCart يُعيد discountType إلى "amount"
   - [POS-36] [BUG-5] addToCart يُحدّث cost/factor/minPrice/maxPrice
              عند وجود العنصر مسبقًا (منع تكلفة قديمة)
   - [POS-37] [BUG-7] F1–F5 تُتجاهل أثناء الكتابة في أي input
              (كانت تُنفَّذ داخل productSearch)
   - [POS-38] [LOGIC-1] تسديد الدين يتطلب موافقة صريحة
              عبر checkbox #payDebtCheckbox
   - [POS-39] [LOGIC-3] استخدام invoice._saleTimestamp للطباعة
              (كانت تستخدم Date.now() = وقت العرض)
   - [POS-40] [INT-1] State.settings من DB.getSettings()
              (كانت من localStorage غير المتزامن مع DB)
   - [POS-41] [HTML-5] طباعة تلقائية بعد إتمام البيع
   - [POS-42] dedup: computePaymentBreakdown يُحسب مرة واحدة
              لكل تحديث ويُمرَّر إلى renderPaymentCustomerBalance
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
        searchTerm: '',
        settings: {},
        // ✅ [LOGIC-1] موافقة صريحة على تسديد دين سابق
        payDebtFromChange: false
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

        await loadSettings();
        await loadData();
        restoreCart();
        updateHeldCount();

        hideLoadingBar();
    }

    /* ============================================
       Data
       ============================================ */

    /**
     * ✅ [INT-1] الإعدادات من DB (المصدر الرسمي)
     * مع fallback إلى localStorage للتوافق مع تثبيتات قديمة
     */
    async function loadSettings() {
        try {
            const fromDb = await DB.getSettings();
            if (fromDb && Object.keys(fromDb).length > 0) {
                State.settings = fromDb;
                return;
            }
        } catch (e) {
            console.warn('DB.getSettings failed, falling back to localStorage', e);
        }
        State.settings = U.ls.get('settings', {}) || {};
    }

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
            // ✅ [BUG-5] حدّث الحقول التي قد تتغير على الخادم
            existing.cost = Number(unit.cost) || 0;
            existing.factor = Number(unit.factor) || 1;
            existing.minPrice = Number(unit.minPrice) || 0;
            existing.maxPrice = Number(unit.maxPrice) || 0;
            existing.productName = product.name;
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
        State.discountType = 'amount';        // ✅ [BUG-4]
        State.selectedCustomer = null;
        State.payDebtFromChange = false;      // ✅ [LOGIC-1]

        $('#discountValue').value = '0';
        $('#discountType').value = 'amount';
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

        // ✅ [LOGIC-1] عند تغيير العميل، ألغِ الموافقة القديمة
        State.payDebtFromChange = false;
        const cb = $('#payDebtCheckbox');
        if (cb) cb.checked = false;

        if ($('#paymentModal')?.classList.contains('open')) {
            updateChange();
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

        // ✅ [LOGIC-1] أعِد ضبط خيار تسديد الدين (الافتراضي: غير مُفعّل)
        State.payDebtFromChange = false;
        const debtCb = $('#payDebtCheckbox');
        if (debtCb) debtCb.checked = false;

        renderQuickCash(net);
        updateChange();

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

    function computePaymentBreakdown() {
        const { net } = calculateTotals();
        const method = State.paymentMethod;
        const cash = +$('#cashInput')?.value || 0;
        const card = +$('#cardInput')?.value || 0;

        let totalReceived = 0;
        if (method === 'cash') totalReceived = cash;
        else if (method === 'card') totalReceived = card;
        else if (method === 'mixed') totalReceived = cash + card;

        const extra = U.round(Math.max(0, totalReceived - net));
        const remaining = U.round(Math.max(0, net - totalReceived));
        const paidForInvoice = Math.min(totalReceived, net);

        const oldBalance = State.selectedCustomer
            ? (Number(State.selectedCustomer.balance) || 0)
            : 0;

        // ✅ [LOGIC-1] التسديد يتطلب: عميل + رصيد سالب + extra + موافقة صريحة
        const canPayDebt = !!State.selectedCustomer && oldBalance < 0 && extra > 0;
        const shouldPayDebt = canPayDebt && State.payDebtFromChange === true;
        const debtPayment = shouldPayDebt
            ? U.round(Math.min(extra, Math.abs(oldBalance)))
            : 0;

        const change = U.round(extra - debtPayment);

        let cashFinal = 0, cardFinal = 0;
        if (method === 'cash') cashFinal = cash;
        else if (method === 'card') cardFinal = card;
        else if (method === 'mixed') { cashFinal = cash; cardFinal = card; }

        // اخصم debtPayment من cash ثم card بالتسلسل
        let deduct = debtPayment;
        const d1 = Math.min(cashFinal, deduct); cashFinal -= d1; deduct -= d1;
        const d2 = Math.min(cardFinal, deduct); cardFinal -= d2; deduct -= d2;

        const newBalance = State.selectedCustomer
            ? U.round(oldBalance + debtPayment - remaining, 3)
            : 0;

        return {
            net,
            cash, card,
            totalReceived,
            extra,
            remaining,
            paidForInvoice,
            oldBalance,
            canPayDebt,
            shouldPayDebt,
            debtPayment,
            change,
            cashFinal,
            cardFinal,
            newBalance
        };
    }

    function updateChange() {
        const b = computePaymentBreakdown();

        // 1) display التغيير
        const display = $('#changeDisplay');
        const value = $('#changeValue');
        const span = display?.querySelector('span');

        if (b.remaining > 0) {
            display?.classList.add('is-short');
            if (span) span.textContent = 'المتبقي:';
            if (value) value.textContent = U.money(b.remaining);
        } else {
            display?.classList.remove('is-short');
            if (span) span.textContent = 'الباقي للعميل:';
            if (value) value.textContent = U.money(b.change);
        }

        // 2) ✅ [LOGIC-1] إظهار/إخفاء مجموعة تسديد الدين
        const group = $('#debtPaymentGroup');
        if (group) {
            if (b.canPayDebt) {
                group.style.display = 'block';
            } else {
                group.style.display = 'none';
                const cb = $('#payDebtCheckbox');
                if (cb && cb.checked) {
                    cb.checked = false;
                    State.payDebtFromChange = false;
                }
            }
        }

        // 3) ✅ [LOGIC-1] نص المبلغ الذي سيُسدَّد
        const hintEl = $('#debtPaymentHint');
        if (hintEl) {
            if (b.debtPayment > 0) {
                hintEl.textContent = `سيُسدَّد من الدين السابق: ${U.money(b.debtPayment)}`;
                hintEl.style.display = 'block';
            } else {
                hintEl.style.display = 'none';
            }
        }

        // 4) رصيد العميل
        renderPaymentCustomerBalance(b);
    }

    /**
     * ✅ [POS-42] يقبل breakdown محسوبًا مسبقًا من updateChange
     * (يمنع احتساب مزدوج)
     */
    function renderPaymentCustomerBalance(breakdown) {
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

        const b = breakdown || computePaymentBreakdown();

        prevEl.textContent = formatBalance(b.oldBalance);
        prevEl.className = 'pcb-value ' + balanceClass(b.oldBalance);

        newEl.textContent = formatBalance(b.newBalance);
        newEl.className = 'pcb-value ' + balanceClass(b.newBalance);

        if (b.newBalance < b.oldBalance - 0.001) {
            container.classList.add('pcb--increasing-debt');
        } else {
            container.classList.remove('pcb--increasing-debt');
        }
    }

    /* ============================================
       Balance helpers
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

        const b = computePaymentBreakdown();

        if (b.remaining > 0 && !State.selectedCustomer) {
            showToast('اختر عميلاً لتسجيل الدين', 'warning');
            $('#customerSearch')?.focus();
            return;
        }
        if (method === 'credit' && !State.selectedCustomer) {
            showToast('يجب اختيار عميل للدفع الآجل', 'warning');
            return;
        }
        if (b.remaining > 0 && method !== 'credit') {
            if (!confirm(`المتبقي ${U.money(b.remaining)}. سيتم تسجيله كدين على ${State.selectedCustomer.name}. متابعة؟`)) return;
        }
        if (method === 'credit' && State.selectedCustomer) {
            if (!confirm(`سيتم تسجيل ${U.money(net)} كدين على العميل. متابعة؟`)) return;
        }
        // ✅ [LOGIC-1] لا confirm لتسديد الدين —
        // المستخدم أشّر الـ checkbox صراحةً ورأى المبلغ في #debtPaymentHint

        const btn = $('#confirmPayBtn');
        if (btn) btn.disabled = true;

        try {
            const invoiceNumber = await DB.generateInvoiceNumber();

            const invoice = {
                id: U.uuid(),
                invoice_number: invoiceNumber,
                type: 'sale',
                date: U.today(),
                // ✅ [LOGIC-3] طابع وقت البيع الفعلي
                _saleTimestamp: Date.now(),
                customer_id: State.selectedCustomer?.id || null,
                customer_name: State.selectedCustomer?.name || 'نقدي',
                items: State.cart.map(i => ({ ...i })),
                subtotal,
                discount: disc,
                total: net,
                cash_paid: method === 'credit' ? 0 : b.cashFinal,
                card_paid: method === 'credit' ? 0 : b.cardFinal,
                transfer_paid: 0,
                used_balance: 0,
                paid: method === 'credit' ? 0 : b.paidForInvoice,
                remaining: method === 'credit' ? net : b.remaining,
                change_amount: b.change,
                payment_method: method,
                status: method === 'credit' ? 'credit' : (b.remaining > 0 ? 'partial' : 'paid'),
                notes,

                _hasCustomer: !!State.selectedCustomer,
                _oldBalance: b.oldBalance,
                _newBalance: b.newBalance,
                _debtPayment: b.debtPayment,
                _customerAddress: State.selectedCustomer?.address || null,
                _customerPhone: State.selectedCustomer?.phone || null
            };

            const result = await DB.createInvoice(invoice);
            if (!result.success) throw new Error('فشل حفظ الفاتورة');

            if (result.deduplicated) {
                invoice._newBalance = invoice._oldBalance;
                invoice._hasCustomer = false;
                invoice._debtPayment = 0;
            }

            if (!result.deduplicated && b.debtPayment > 0 && State.selectedCustomer?.id) {
                try {
                    await DB.addPayment({
                        party_id: State.selectedCustomer.id,
                        type: 'payment_in',
                        amount: b.debtPayment,
                        payment_method: 'cash',
                        reference: invoiceNumber,
                        notes: `تسديد دين سابق من فاتورة ${invoiceNumber}`
                    });
                } catch (e) {
                    console.error('Debt payment failed:', e);
                    showToast('تم حفظ الفاتورة، لكن فشل تسجيل تسديد الدين', 'warning');
                }
            }

            showReceipt(invoice);

            // ✅ [HTML-5] طباعة تلقائية بعد البيع (زر "تأكيد وطباعة")
            setTimeout(() => {
                if ($('#receiptModal')?.classList.contains('open')) {
                    try { printReceipt(); } catch (e) { console.warn('Auto-print failed', e); }
                }
            }, 400);

            // إعادة ضبط الحالة
            State.cart = [];
            State.discount = 0;
            State.discountType = 'amount';
            State.selectedCustomer = null;
            State.payDebtFromChange = false;
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
       Receipt — v6.0.0 (بدون صفوف مكررة)
       ============================================ */
    function showReceipt(invoice) {
        // ✅ [INT-1] الإعدادات من DB (مع fallback LS في loadSettings)
        const settings = State.settings || {};
        const shopName = settings.shopName || 'حسابي';
        const shopPhone = settings.phone || '';
        const shopAddress = settings.address || '';
        const footer = settings.footer || 'شكراً لتعاملكم معنا';

        let itemsHtml = '';
        invoice.items.forEach((item, i) => {
            const price = Number(item.price) || 0;
            const qty = Number(item.quantity) || 0;
            const lineTotal = U.round(price * qty, 2);
            itemsHtml += `
                <tr>
                    <td class="rc-num">${i + 1}</td>
                    <td class="rc-name">${U.escape(item.productName)}</td>
                    <td class="rc-qty">${qty} ${U.escape(item.unitName)}</td>
                    <td class="rc-price">${price.toFixed(2)}</td>
                    <td class="rc-total">${lineTotal.toFixed(2)}</td>
                </tr>`;
        });

        const oldBal = Number(invoice._oldBalance) || 0;
        const newBal = Number(invoice._newBalance) || 0;
        const debtPayment = Number(invoice._debtPayment) || 0;
        const paidNow = Number(invoice.paid) || 0;

        const customerAddress = invoice._customerAddress || invoice.customer_address || '-';

        // ✅ [LOGIC-3] وقت البيع (وليس وقت العرض)
        const saleTs = Number(invoice._saleTimestamp) ||
                       (invoice.created_at ? new Date(invoice.created_at).getTime() : Date.now());

        const preview = $('#receiptPreview');
        if (!preview) return;

        preview.innerHTML = `
            <div class="rc-header">
                <div class="rc-shop">${U.escape(shopName)}</div>
                ${shopPhone ? `<div class="rc-sub">هاتف: ${U.escape(shopPhone)}</div>` : ''}
                ${shopAddress ? `<div class="rc-sub">${U.escape(shopAddress)}</div>` : ''}
            </div>

            <table class="rc-info">
                <tr>
                    <td class="rc-info-label">رقم الفاتورة:</td>
                    <td class="rc-info-value">${U.escape(invoice.invoice_number)}</td>
                </tr>
                <tr>
                    <td class="rc-info-label">التاريخ:</td>
                    <td class="rc-info-value">${U.date(invoice.date)} ${U.time(saleTs)}</td>
                </tr>
                <tr>
                    <td class="rc-info-label">العميل:</td>
                    <td class="rc-info-value">${U.escape(invoice.customer_name)}</td>
                </tr>
                <tr>
                    <td class="rc-info-label">العنوان:</td>
                    <td class="rc-info-value">${U.escape(customerAddress)}</td>
                </tr>
            </table>

            <table class="rc-items">
                <thead>
                    <tr>
                        <th class="rc-num">م</th>
                        <th class="rc-name">الصنف</th>
                        <th class="rc-qty">الكمية</th>
                        <th class="rc-price">السعر</th>
                        <th class="rc-total">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml || '<tr><td colspan="5" class="rc-empty">لا توجد عناصر</td></tr>'}
                    <tr class="rc-subtotal-row">
                        <td colspan="4" class="rc-subtotal-label">المجموع الفرعي</td>
                        <td class="rc-total rc-subtotal-value">${Number(invoice.subtotal).toFixed(2)}</td>
                    </tr>
                </tbody>
            </table>

            <table class="rc-summary">
                ${invoice.discount > 0 ? `
                <tr>
                    <td class="rc-sum-label">الخصم:</td>
                    <td class="rc-sum-value">${Number(invoice.discount).toFixed(2)}</td>
                </tr>` : ''}
                <tr>
                    <td class="rc-sum-label">إجمالي الفاتورة:</td>
                    <td class="rc-sum-value">${Number(invoice.total).toFixed(2)}</td>
                </tr>
                <tr>
                    <td class="rc-sum-label">طريقة الدفع:</td>
                    <td class="rc-sum-value">${paymentLabel(invoice.payment_method)}</td>
                </tr>
                <tr>
                    <td class="rc-sum-label">صافي الرصيد السابق:</td>
                    <td class="rc-sum-value">${oldBal.toFixed(2)}</td>
                </tr>
                <tr>
                    <td class="rc-sum-label">صافي الرصيد بعد الفاتورة:</td>
                    <td class="rc-sum-value">${newBal.toFixed(2)}</td>
                </tr>
                ${debtPayment > 0 ? `
                <tr>
                    <td class="rc-sum-label">تسديد دين سابق:</td>
                    <td class="rc-sum-value">${debtPayment.toFixed(2)}</td>
                </tr>` : ''}
                <tr>
                    <td class="rc-sum-label">المدفوع الآن:</td>
                    <td class="rc-sum-value">${(paidNow + debtPayment).toFixed(2)}</td>
                </tr>
                ${Number(invoice.change_amount) > 0 ? `
                <tr>
                    <td class="rc-sum-label">الباقي:</td>
                    <td class="rc-sum-value">${Number(invoice.change_amount).toFixed(2)}</td>
                </tr>` : ''}
            </table>

            <div class="rc-footer">${U.escape(footer)}</div>
        `;

        openModal('receiptModal');
    }

    function paymentLabel(m) {
        return { cash: 'نقدي', card: 'بطاقة', credit: 'آجل', mixed: 'مختلط' }[m] || m;
    }

    /* ============================================
       Print — v6.0.0
       ✅ [BUG-2] ثلاث طبقات:
         1) load event بعد إضافة المستمع
         2) فحص readyState (cover load-fired-before)
         3) fallback 2s لو فشل الكل
       + الانتظار لتحميل الخطوط (document.fonts.ready)
       ============================================ */
    function printReceipt() {
        const preview = $('#receiptPreview');
        if (!preview) return;

        let iframe;
        try {
            iframe = document.createElement('iframe');
            iframe.setAttribute('aria-hidden', 'true');
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
        padding: 4px; margin: 0; font-size: 11px;
        color: #000; background: #fff;
        max-width: 80mm; line-height: 1.4;
    }

    .rc-header {
        text-align: center;
        padding: 6px 0 8px;
        border-bottom: 1px solid #000;
        margin-bottom: 6px;
    }
    .rc-shop { font-size: 16px; font-weight: 800; margin-bottom: 2px; }
    .rc-sub { font-size: 10px; color: #333; }

    .rc-info {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 6px;
    }
    .rc-info td {
        padding: 3px 6px;
        font-size: 11px;
        border: 1px solid #000;
    }
    .rc-info-label {
        font-weight: 700;
        width: 35%;
        text-align: right;
        background: #f5f5f5;
    }
    .rc-info-value {
        font-weight: 700;
        text-align: right;
    }

    .rc-items {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 6px;
        table-layout: fixed;
    }
    .rc-items th,
    .rc-items td {
        border: 1px solid #000;
        padding: 3px 4px;
        font-size: 10px;
        text-align: center;
        vertical-align: middle;
        word-wrap: break-word;
    }
    .rc-items th {
        background: #e8e8e8;
        font-weight: 800;
        font-size: 11px;
    }
    .rc-num { width: 8%; }
    .rc-name { width: 40%; text-align: right !important; font-weight: 700; }
    .rc-qty { width: 18%; }
    .rc-price { width: 16%; }
    .rc-total { width: 18%; font-weight: 800; }

    .rc-subtotal-row td {
        background: #f5f5f5;
        font-weight: 800;
    }
    .rc-subtotal-label { text-align: right !important; }
    .rc-subtotal-value { font-size: 12px !important; }

    .rc-empty {
        padding: 10px !important;
        text-align: center !important;
    }

    .rc-summary {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 6px;
    }
    .rc-summary td {
        border: 1px solid #000;
        padding: 4px 6px;
        font-size: 11px;
    }
    .rc-sum-label {
        font-weight: 700;
        text-align: right;
        background: #f5f5f5;
        width: 55%;
    }
    .rc-sum-value {
        font-weight: 800;
        text-align: right;
        width: 45%;
    }

    .rc-footer {
        text-align: center;
        font-weight: 700;
        font-size: 11px;
        padding-top: 6px;
        border-top: 1px solid #000;
        margin-top: 4px;
    }
</style>
</head>
<body>${preview.innerHTML}</body>
</html>`);
            doc.close();

            // ✅ [BUG-2] طبقة واحدة للتنفيذ (تضمن تشغيل print مرة واحدة فقط)
            let printed = false;
            const doPrint = async () => {
                if (printed) return;
                printed = true;

                // انتظر تحميل الخطوط (best-effort)
                try {
                    const docFonts = iframe.contentDocument?.fonts;
                    if (docFonts?.ready) await docFonts.ready;
                } catch { /* ignore */ }

                // مهلة صغيرة لاستقرار الـ layout بعد تحميل الخطوط
                setTimeout(() => {
                    try {
                        iframe.contentWindow.focus();
                        iframe.contentWindow.print();
                    } catch (e) {
                        console.error('Print call failed:', e);
                        showToast('تعذر فتح حوار الطباعة', 'error');
                    }
                }, 50);
            };

            // ✅ استمع لـ load أولًا (قبل فحص readyState)
            try {
                iframe.contentWindow.addEventListener('load', doPrint, { once: true });
            } catch (e) { /* ignore */ }

            // ✅ لو أن load قد اكتمل بالفعل
            if (doc.readyState === 'complete') {
                doPrint();
            }

            // ✅ [BUG-2] fallback أخير: إن لم يُنفَّذ أي مسار خلال 2 ثانية
            setTimeout(() => { if (!printed) doPrint(); }, 2000);

            // تنظيف بعد الطباعة
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

            // حد أقصى: 30 ثانية ثم نظّف
            setTimeout(cleanup, 30000);

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
        State.discountType = 'amount';
        State.selectedCustomer = null;
        State.payDebtFromChange = false;
        $('#discountValue').value = '0';
        $('#discountType').value = 'amount';
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
        State.payDebtFromChange = false;
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

    /**
     * ✅ [BUG-3] يتحقق من صحة كل عنصر مقابل State.products:
     * - يحذف المنتجات المحذوفة
     * - يحذف الوحدات المحذوفة
     * - يُحدّث الحقول (cost, factor, min/max price) من المنتج الحالي
     */
    function restoreCart() {
        const data = U.ls.get('posCart');
        if (!data) { renderCart(); return; }

        const rawCart = Array.isArray(data.cart) ? data.cart : [];
        const productsById = new Map(State.products.map(p => [p.id, p]));

        const validCart = [];
        const dropped = [];

        for (const item of rawCart) {
            if (!item || !item.productId) continue;

            const product = productsById.get(item.productId);
            if (!product) {
                dropped.push(item.productName || item.productId);
                continue;
            }
            const unit = product.units?.find(u => u.name === item.unitName);
            if (!unit) {
                dropped.push(`${item.productName || product.name} (${item.unitName})`);
                continue;
            }
            const qty = Number(item.quantity) || 0;
            if (qty <= 0) continue;

            // ✅ حدّث الحقول من المنتج الحالي
            validCart.push({
                productId: item.productId,
                productName: product.name,
                unitName: item.unitName,
                quantity: qty,
                price: Number(item.price) || 0,
                cost: Number(unit.cost) || 0,
                factor: Number(unit.factor) || 1,
                minPrice: Number(unit.minPrice) || 0,
                maxPrice: Number(unit.maxPrice) || 0
            });
        }

        State.cart = validCart;
        State.discount = Number(data.discount) || 0;
        State.discountType = data.discountType === 'percent' ? 'percent' : 'amount';
        State.payDebtFromChange = false;

        if (data.customerId) {
            const c = State.customers.find(x => x.id === data.customerId);
            if (c) State.selectedCustomer = c;
        }

        $('#discountValue').value = State.discount;
        $('#discountType').value = State.discountType;
        renderCart();

        if (dropped.length) {
            console.warn('Dropped stale cart items:', dropped);
            // defer toast حتى ينتهي init
            setTimeout(() => {
                showToast(`تم حذف ${dropped.length} صنف غير متوفر من السلة`, 'warning');
            }, 500);
        }
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

        // ✅ [LOGIC-1] ربط checkbox تسديد الدين
        $('#payDebtCheckbox')?.addEventListener('change', (e) => {
            State.payDebtFromChange = e.target.checked === true;
            updateChange();
        });

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

        // ✅ [BUG-7] F1–F5 لا تعمل أثناء الكتابة في أي input/textarea/select
        document.addEventListener('keydown', (e) => {
            const t = e.target;
            const isEditable = t.tagName === 'INPUT' ||
                               t.tagName === 'TEXTAREA' ||
                               t.tagName === 'SELECT' ||
                               t.isContentEditable;

            if (isEditable) {
                if (e.key === 'Escape') t.blur();
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
