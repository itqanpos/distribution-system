/* =============================================
   pos.js - نقطة البيع (إصدار خبير 5.0.2)
   إصلاح: حساب المخزون للوحدات الفرعية
   إصلاح: استعلام محدود للفواتير المعلقة
   إصلاح: استخدام localDB.get بدلاً من getById
   ============================================= */
'use strict';

/* ---------- أدوات مساعدة ---------- */
const U = {
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    fmtDate: (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } },
    today: () => new Date().toISOString().split('T')[0],
    escape: (s) => { const div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; },
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    uuid: () => (crypto?.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
    dbReady: () => !!(window.DB && window.supabase),
    localReady: () => !!(window.localDB?.ready),
    cssVar: (name, fallback = '') => {
        const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        return v || fallback;
    }
};

const POS = {
    state: {
        products: [], customers: [], cart: [],
        selectedProduct: null, selectedUnit: null, selectedCustomerId: null,
        db: false, busy: false, addingItem: false,
        subtotal: 0, discount: 0, discountType: 'amount', discountValue: 0, net: 0,
        usedBalance: 0, editingInv: null
    },
    cache: { prods: new Map(), custs: new Map() },
    el: {},

    /* ---------- التهيئة ---------- */
    init() {
        this._cacheDOM();
        this._applySafeArea();
        this._bind();
        this._connStatus();
        window.addEventListener('online', () => this._connStatus());
        window.addEventListener('offline', () => this._connStatus());
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') this._saveCart(); });
        if (window.App) { App.requireAuth(); App.initUserInterface(); }
        this._loadData();
        this._sidebarUser();
    },

    _cacheDOM() {
        const requiredIds = [
            'menuToggle','sidebar','sidebarOverlay','moreMenuBtn','moreDropdown',
            'holdInvoiceBtn','heldInvoicesBtn','logoutBtn','returnSaleBtn',
            'productSearchInput','customerSearchInput','customerBalanceDisplay',
            'productDropdown','customerDropdown','barcodeScannerBtn',
            'cartItemsContainer','discountValue','discountType','itemTypesCount',
            'totalPieces','subtotal','netTotal','payBtn',
            'unitQuantityModal','modalProductName','unitButtons','selectedQuantity',
            'selectedPrice','stockInfo','addToCartBtn','closeUnitModalBtn','priceLimitMsg',
            'paymentModal','paySubtotal','payDiscount','payNet','currentBalance',
            'paymentMethod','cashField','transferField','cashAmount','transferAmount',
            'remainingDisplay','balanceAfterLabel','balanceAfter','paymentNotes',
            'confirmAndPrintBtn','closePaymentModalBtn',
            'heldInvoicesModal','heldInvoicesList','closeHeldModalBtn',
            'receiptModal','receiptPrintArea','printReceiptBtn','skipPrintBtn','closeReceiptModalBtn',
            'sidebarAvatar','sidebarUserName',
            'duplicateProductModal','duplicateProductMsg','duplicateIncreaseBtn','duplicateCancelBtn'
        ];
        requiredIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) this.el[id] = el;
            else console.warn(`Element with id "${id}" not found in DOM`);
        });
    },

    _applySafeArea() {
        const safeBottom = 'env(safe-area-inset-bottom, 0px)';
        const footer = document.querySelector('.cart-footer');
        if (footer) footer.style.paddingBottom = `calc(10px + ${safeBottom})`;
    },

    /* ---------- ربط الأحداث بشكل آمن ---------- */
    _bind() {
        const on = (id, event, handler) => {
            const el = this.el[id];
            if (el) el.addEventListener(event, handler);
        };
        const onDocClick = (selector, handler) => {
            document.addEventListener('click', (e) => {
                if (!e.target.closest(selector)) handler();
            });
        };

        // القائمة الجانبية
        on('menuToggle', 'click', () => { this.el.sidebar?.classList.toggle('open'); this.el.sidebarOverlay?.classList.toggle('show'); });
        on('sidebarOverlay', 'click', () => { this.el.sidebar?.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); });
        document.querySelectorAll('.menu-item').forEach(l => l.addEventListener('click', () => {
            this.el.sidebar?.classList.remove('open');
            this.el.sidebarOverlay?.classList.remove('show');
        }));

        // القائمة المنسدلة
        on('moreMenuBtn', 'click', (e) => { e.stopPropagation(); this.el.moreDropdown?.classList.toggle('show'); });
        onDocClick('.nav-actions', () => this.el.moreDropdown?.classList.remove('show'));

        // أزرار القائمة المنسدلة
        on('returnSaleBtn', 'click', (e) => { e.preventDefault(); this.openReturn(); this.el.moreDropdown?.classList.remove('show'); });
        on('holdInvoiceBtn', 'click', (e) => { e.preventDefault(); this.holdInvoice(); this.el.moreDropdown?.classList.remove('show'); });
        on('heldInvoicesBtn', 'click', (e) => { e.preventDefault(); this.loadHeld(); this.el.moreDropdown?.classList.remove('show'); });
        on('logoutBtn', 'click', (e) => { e.preventDefault(); if (confirm('هل أنت متأكد؟')) App.logout(); });

        // البحث
        on('productSearchInput', 'input', U.debounce(() => this._filterProducts(), 150));
        on('productDropdown', 'click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) { this._selectProduct(item.dataset.id); this._hideProdDropdown(); this.el.productSearchInput.value = ''; }
        });
        onDocClick('.search-header', () => this._hideProdDropdown());

        // كاميرا الباركود
        on('barcodeScannerBtn', 'click', () => this._scanBarcode());

        // بحث العملاء
        on('customerSearchInput', 'input', () => this._filterCustomers());
        on('customerSearchInput', 'focus', () => { if (!this.el.customerSearchInput.value.trim()) this._filterCustomers(); });
        on('customerDropdown', 'click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                if (item.dataset.id === 'cash') { this.state.selectedCustomerId = null; this.el.customerSearchInput.value = 'نقدي (بدون عميل)'; }
                else { this.state.selectedCustomerId = item.dataset.id; const c = this.cache.custs.get(item.dataset.id); this.el.customerSearchInput.value = c?.name || ''; }
                this._updateCustDisplay(); this._hideCustDropdown();
            }
        });
        onDocClick('.customer-box', () => this._hideCustDropdown());

        // الخصم
        on('discountValue', 'input', () => { this.state.discountValue = +this.el.discountValue.value || 0; this._updateTotals(); });
        on('discountType', 'change', () => { this.state.discountType = this.el.discountType.value; this._updateTotals(); });
        on('payBtn', 'click', () => this._openPayment());

        // مودال الوحدة
        on('addToCartBtn', 'click', () => this._addToCart());
        on('closeUnitModalBtn', 'click', () => this._closeModal('unitQuantityModal'));

        // مودال الدفع
        on('confirmAndPrintBtn', 'click', (e) => { e.preventDefault(); this._completePayment(); });
        on('closePaymentModalBtn', 'click', () => this._closeModal('paymentModal'));
        on('paymentMethod', 'change', () => this._togglePaymentFields());
        on('cashAmount', 'input', () => this._previewPayment());
        on('transferAmount', 'input', () => this._previewPayment());

        // الفواتير المعلقة
        on('closeHeldModalBtn', 'click', () => this._closeModal('heldInvoicesModal'));

        // الإيصال
        on('closeReceiptModalBtn', 'click', () => this._closeModal('receiptModal'));
        on('skipPrintBtn', 'click', () => this._closeModal('receiptModal'));
        on('printReceiptBtn', 'click', () => this._printReceipt());

        // تكرار المنتج
        on('duplicateIncreaseBtn', 'click', () => this._handleDuplicate(true));
        on('duplicateCancelBtn', 'click', () => this._closeModal('duplicateProductModal'));

        // أحداث السلة (تفويض)
        if (this.el.cartItemsContainer) {
            this.el.cartItemsContainer.addEventListener('change', e => this._onCartChange(e));
            this.el.cartItemsContainer.addEventListener('click', e => this._onCartClick(e));
        }
    },

    /* ---------- اتصال ---------- */
    _connStatus() { const n = document.getElementById('mainNavbar'); if (n) n.classList.toggle('offline', !navigator.onLine); },

    /* ---------- مستخدم ---------- */
    _sidebarUser() {
        window.App?.getCurrentUser?.().then(u => {
            if (u) {
                if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (u.fullName || 'U')[0].toUpperCase();
                if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = u.fullName || u.email || 'مدير';
            }
        }).catch(() => {});
    },

    /* ---------- تحميل البيانات ---------- */
    async _loadData() {
        this.state.db = U.dbReady();
        await this._fetchProdsAndCusts();
        this._buildCache();
        this._restoreCart();
        this._loadEditInvoice();
        if (!this.state.products.length) window.Toast?.info('لا توجد منتجات');
    },

    async _fetchProdsAndCusts() {
        try {
            let custs = [];
            if (this.state.db) {
                this.state.products = await DB.getProducts() || [];
                custs = await DB.getParties('customer') || [];
            } else if (U.localReady()) {
                this.state.products = await localDB.getAll('products') || [];
                custs = await localDB.getAll('parties') || [];
            } else { this.state.products = []; custs = []; }
            this.state.customers = custs.filter(c => c.type === 'customer');
            this.state.products.forEach(p => { if (typeof p.units === 'string') try { p.units = JSON.parse(p.units); } catch {} });
        } catch (e) { console.error(e); this.state.products = []; this.state.customers = []; window.Toast?.error('فشل تحميل البيانات'); }
    },

    _buildCache() {
        this.cache.prods.clear(); this.cache.custs.clear();
        this.state.products.forEach(p => { this.cache.prods.set(String(p.id), p); this.cache.prods.set(p.id, p); });
        this.state.customers.forEach(c => { this.cache.custs.set(String(c.id), c); this.cache.custs.set(c.id, c); });
    },

    _loadEditInvoice() {
        const id = localStorage.getItem('edit_invoice_id'); if (!id) return;
        localStorage.removeItem('edit_invoice_id');
        if (this.state.db && DB.getInvoiceById) {
            DB.getInvoiceById(id).then(inv => {
                if (inv?.type === 'sale' && inv.status !== 'voided') {
                    this.state.cart = (inv.items || []).map(i => ({...i}));
                    this.state.selectedCustomerId = inv.customer_id;
                    this.state.editingInv = inv.id;
                    if (inv.customer_id) { const c = this.cache.custs.get(String(inv.customer_id)); if (c) this.el.customerSearchInput.value = c.name || ''; this._updateCustDisplay(); }
                    else this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
                    this._renderCart();
                    window.Toast?.info('تم تحميل الفاتورة للتعديل');
                } else window.Toast?.error('الفاتورة غير قابلة للتعديل');
            }).catch(() => window.Toast?.error('فشل تحميل الفاتورة'));
        }
    },

    /* ---------- بحث العملاء ---------- */
    _filterCustomers() {
        const term = this.el.customerSearchInput?.value.trim().toLowerCase() || '';
        const dd = this.el.customerDropdown; if (!dd) return;
        let list = this.state.customers;
        if (term && term !== 'نقدي (بدون عميل)') list = list.filter(c => c.name?.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)));
        const safeSuccess = U.cssVar('--success', '#10b981');
        const safeDanger = U.cssVar('--danger', '#ef4444');
        const safeMuted = U.cssVar('--text-muted', '#94a3b8');
        let html = `<div class="dropdown-item" data-id="cash"><div class="item-info"><h4>نقدي (بدون عميل)</h4></div></div>`;
        list.forEach(c => {
            const bal = c.balance || 0;
            const col = bal > 0 ? safeSuccess : bal < 0 ? safeDanger : safeMuted;
            const sign = bal > 0 ? `دائن ${U.fmtMoney(bal)}` : bal < 0 ? `مدين ${U.fmtMoney(-bal)}` : 'لا رصيد';
            html += `<div class="dropdown-item" data-id="${c.id}"><div class="item-info"><h4>${U.escape(c.name)}</h4><small style="color:${col}; font-weight:600;">${sign}</small></div><div class="item-price">${c.phone||''}</div></div>`;
        });
        dd.innerHTML = html; dd.classList.add('show');
    },
    _hideCustDropdown() { this.el.customerDropdown?.classList.remove('show'); },
    _updateCustDisplay() {
        const el = this.el.customerBalanceDisplay; if (!el) return;
        if (!this.state.selectedCustomerId) { el.innerHTML = ''; el.className = 'customer-balance'; return; }
        const c = this.cache.custs.get(this.state.selectedCustomerId);
        if (c) {
            const bal = c.balance || 0;
            el.innerHTML = bal > 0 ? `دائن ${U.fmtMoney(bal)}` : bal < 0 ? `مدين ${U.fmtMoney(-bal)}` : 'لا رصيد';
            el.className = `customer-balance ${bal > 0 ? 'positive' : bal < 0 ? 'negative' : ''}`;
        }
    },

    /* ---------- بحث المنتجات ---------- */
    _filterProducts() {
        const term = this.el.productSearchInput?.value.trim().toLowerCase() || '';
        const dd = this.el.productDropdown; if (!dd) return;
        if (!term) { dd.classList.remove('show'); return; }
        if (!this.state.products.length) { dd.innerHTML = '<div class="dropdown-item" style="color:var(--danger);text-align:center;">⚠️ لا توجد منتجات</div>'; dd.classList.add('show'); return; }
        const filtered = this.state.products.filter(p => p.name?.toLowerCase().includes(term) || p.barcode === term || p.code === term);
        dd.innerHTML = filtered.length ? filtered.map(p => `<div class="dropdown-item" data-id="${p.id}"><div class="item-info"><h4>${U.escape(p.name)}</h4></div><div class="item-price">${U.fmtMoney(p.units[0]?.price||0)}</div></div>`).join('') : '<div class="dropdown-item" style="color:var(--text-muted);">لا نتائج</div>';
        dd.classList.add('show');
    },
    _hideProdDropdown() { this.el.productDropdown?.classList.remove('show'); },

    /* ---------- منتج مكرر ---------- */
    _selectProduct(id) {
        const p = this.cache.prods.get(String(id)); if (!p) return;
        const exist = this.state.cart.find(i => i.productId === p.id);
        if (exist) {
            this.el.duplicateProductMsg.textContent = `"${p.name}" موجود في السلة. زيادة الكمية؟`;
            this.el.duplicateProductModal.dataset.productId = p.id;
            this._showModal('duplicateProductModal');
        } else this._openUnitModal(p.id);
    },
    _handleDuplicate(inc) {
        const id = this.el.duplicateProductModal.dataset.productId;
        this._closeModal('duplicateProductModal');
        if (inc) this._openUnitModal(id);
    },

    /* ---------- باركود ---------- */
    _scanBarcode() {
        if (!('BarcodeDetector' in window)) { window.Toast?.error('المتصفح لا يدعم مسح الباركود'); return; }
        const video = document.createElement('video'); video.setAttribute('playsinline', ''); video.style.display = 'none';
        document.body.appendChild(video);
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(stream => {
            video.srcObject = stream; video.play();
            const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','code_128','qr_code'] });
            const scan = async () => {
                if (video.readyState >= 2) {
                    try { const barcodes = await detector.detect(video); if (barcodes.length) { stream.getTracks().forEach(t => t.stop()); video.remove(); this._searchBarcode(barcodes[0].rawValue); return; } } catch {}
                }
                requestAnimationFrame(scan);
            };
            requestAnimationFrame(scan);
            window.Toast?.info('وجّه الكاميرا نحو الباركود');
        }).catch(() => { window.Toast?.error('تعذر الوصول للكاميرا'); video.remove(); });
    },
    _searchBarcode(code) {
        this.el.productSearchInput.value = code;
        const found = this.state.products.find(p => p.barcode === code || p.code === code);
        if (found) { this._selectProduct(found.id); this.el.productSearchInput.value = ''; } else this._filterProducts();
    },

    /* ---------- مرتجع ---------- */
    openReturn() { window.location.href = './sales-returns.html'; },

    /* ---------- السلة ---------- */
    _calcTotals() {
        let sub = 0; for (const i of this.state.cart) sub += U.round(i.price * i.quantity);
        sub = U.round(sub, 2);
        let disc = this.state.discountType === 'amount' ? Math.min(this.state.discountValue, sub) : U.round(sub * this.state.discountValue / 100, 2);
        const net = U.round(sub - disc, 2);
        this.state.subtotal = sub; this.state.discount = disc; this.state.net = net;
        return { sub, disc, net };
    },
    _updateTotals() {
        const { sub, net } = this._calcTotals();
        if (this.el.subtotal) this.el.subtotal.textContent = U.fmtMoney(sub);
        if (this.el.netTotal) this.el.netTotal.textContent = U.fmtMoney(net);
        if (this.el.itemTypesCount) this.el.itemTypesCount.textContent = this.state.cart.length;
        let pcs = 0; for (const i of this.state.cart) pcs += i.quantity * (i.factor || 1);
        if (this.el.totalPieces) this.el.totalPieces.textContent = Math.round(pcs);
    },
    _renderCart() {
        const c = this.el.cartItemsContainer; if (!c) return;
        c.innerHTML = `<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span></div>`;
        if (!this.state.cart.length) { c.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>'); this._updateTotals(); return; }
        let rows = '';
        this.state.cart.forEach((item, idx) => {
            rows += `<div class="cart-item-row">
                <div><span class="cart-item-name">${U.escape(item.productName)}</span><br><span class="cart-item-unit">${U.escape(item.unitName)}</span></div>
                <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}"></div>
                <div><input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}"></div>
                <div>${U.fmtMoney(U.round(item.price * item.quantity, 2))}</div>
                <div><i class="fas fa-trash" style="color:var(--danger);cursor:pointer;" data-idx="${idx}"></i></div>
            </div>`;
        });
        c.insertAdjacentHTML('beforeend', rows);
        this._updateTotals();
    },

    _onCartChange(e) {
        if (e.target.classList.contains('cart-qty-input')) {
            const idx = +e.target.dataset.idx;
            const q = +e.target.value;
            if (isNaN(q) || q <= 0) this.state.cart.splice(idx, 1);
            else this.state.cart[idx].quantity = q;
            this._renderCart();
        } else if (e.target.classList.contains('cart-price-input')) {
            const idx = +e.target.dataset.idx;
            const p = +e.target.value;
            if (!isNaN(p) && p >= 0) this.state.cart[idx].price = p;
            this._renderCart();
        }
    },
    _onCartClick(e) {
        if (e.target.closest('.fa-trash')) {
            const idx = +e.target.closest('.fa-trash').dataset.idx;
            this.state.cart.splice(idx, 1);
            this._renderCart();
        }
    },

    /* ---------- مودال الوحدة ---------- */
    _openUnitModal(id) {
        const p = this.cache.prods.get(String(id)); if (!p?.units?.length) { window.Toast?.info('المنتج غير موجود'); return; }
        this.state.selectedProduct = p; this.state.selectedUnit = p.units[0];
        this.el.modalProductName.textContent = U.escape(p.name);
        this.el.unitButtons.innerHTML = p.units.map((u, i) => `<button class="unit-btn ${i===0?'active':''}" data-index="${i}">${U.escape(u.name)}</button>`).join('');
        this.el.unitButtons.querySelectorAll('.unit-btn').forEach(b => b.addEventListener('click', () => this._selectUnit(+b.dataset.index)));
        this._updateUnitInfo(); this._showModal('unitQuantityModal');
    },
    _selectUnit(i) { this.state.selectedUnit = this.state.selectedProduct.units[i]; this.el.unitButtons.querySelectorAll('.unit-btn').forEach((b, j) => b.classList.toggle('active', j===i)); this._updateUnitInfo(); },
    _updateUnitInfo() {
        const p = this.state.selectedProduct, u = this.state.selectedUnit; if (!p||!u) return;
        const base = p.units[0], stock = base.stock || 0, fac = u.factor || 1;
        const avail = u === base ? Math.floor(stock) : Math.floor(stock)*fac + Math.round((stock - Math.floor(stock))*fac);
        const max = Math.max(0, avail);
        this.el.selectedPrice.value = u.price || 0;
        this.el.selectedQuantity.max = max; this.el.selectedQuantity.value = max>0?1:0;
        this.el.stockInfo.textContent = `المخزون: ${max} ${u===base?base.name:u.name}`;
        this.el.priceLimitMsg.style.display = (u.minPrice||u.maxPrice) ? 'block' : 'none';
        if (u.minPrice||u.maxPrice) this.el.priceLimitMsg.textContent = `السعر بين ${u.minPrice||0} - ${u.maxPrice||'∞'} ج.م`;
    },
    _addToCart() {
        if (this.state.addingItem) return;
        this.state.addingItem = true;

        const q = +this.el.selectedQuantity?.value || 0, max = +this.el.selectedQuantity?.max || 0;
        if (q<=0||q>max) { window.Toast?.error('كمية غير متاحة'); this.state.addingItem = false; return; }
        const pr = +this.el.selectedPrice?.value || 0, u = this.state.selectedUnit;
        if (u) {
            if (u.minPrice>0 && pr < u.minPrice) { window.Toast?.error(`لا يمكن أقل من ${U.fmtMoney(u.minPrice)}`); this.state.addingItem = false; return; }
            if (u.maxPrice>0 && pr > u.maxPrice) { window.Toast?.error(`لا يمكن أعلى من ${U.fmtMoney(u.maxPrice)}`); this.state.addingItem = false; return; }
        }
        const exist = this.state.cart.find(i => i.productId===this.state.selectedProduct.id && i.unitName===u.name);
        if (exist) exist.quantity = U.round(exist.quantity + q, 3);
        else this.state.cart.push({ productId: this.state.selectedProduct.id, productName: this.state.selectedProduct.name, unitName: u.name, quantity: q, price: pr, factor: u.factor||1, isBase: u===this.state.selectedProduct.units[0] });
        this._renderCart(); this._closeModal('unitQuantityModal');
        this.state.addingItem = false;
    },

    /* ---------- دفع ---------- */
    _openPayment() {
        if (!this.state.cart.length) { window.Toast?.info('السلة فارغة'); return; }
        const { sub, disc, net } = this._calcTotals();
        this.el.paySubtotal.textContent = U.fmtMoney(sub); this.el.payDiscount.textContent = U.fmtMoney(disc); this.el.payNet.textContent = U.fmtMoney(net);
        const cust = this._getCust(), bal = cust?.balance || 0;
        this.el.currentBalance.textContent = U.fmtMoney(Math.abs(bal));
        this.el.currentBalance.classList.toggle('text-success', bal>=0); this.el.currentBalance.classList.toggle('text-danger', bal<0);
        this.el.cashAmount.value = ''; this.el.transferAmount.value = ''; this.el.paymentMethod.value = 'cash';
        this._togglePaymentFields(); this._previewPayment(); this._showModal('paymentModal');
    },
    _togglePaymentFields() {
        const m = this.el.paymentMethod?.value || 'cash';
        this.el.cashField.style.display = (m==='cash'||m==='mixed')?'block':'none';
        this.el.transferField.style.display = (m==='transfer'||m==='mixed')?'block':'none';
        this._previewPayment();
    },
    _previewPayment() {
        const net = this.state.net, m = this.el.paymentMethod?.value||'cash';
        let cash=0, trans=0;
        if (m==='cash') cash = +this.el.cashAmount?.value||0;
        else if (m==='transfer') trans = +this.el.transferAmount?.value||0;
        else if (m==='mixed') { cash = +this.el.cashAmount?.value||0; trans = +this.el.transferAmount?.value||0; }
        const cust = this._getCust();
        let used = 0; if (cust?.balance>0) used = Math.min(cust.balance, Math.max(0, net - cash - trans));
        this.state.usedBalance = used;
        const paid = U.round(cash+trans+used, 2), diff = U.round(paid-net, 2), newBal = U.round((cust?.balance||0)-used+diff, 2);
        this.el.remainingDisplay.textContent = diff>=0?`فائض ${U.fmtMoney(diff)}`:`متبقي ${U.fmtMoney(-diff)}`;
        this.el.balanceAfterLabel.textContent = newBal>=0?'رصيد للعميل بعد الدفع:':'رصيد على العميل بعد الدفع:';
        this.el.balanceAfter.textContent = U.fmtMoney(Math.abs(newBal));
        this.el.balanceAfter.classList.toggle('text-success', newBal>=0); this.el.balanceAfter.classList.toggle('text-danger', newBal<0);
    },
    async _completePayment() {
        if (this.state.busy) { window.Toast?.info('جاري المعالجة...'); return; }
        this.state.busy = true; this.el.confirmAndPrintBtn.disabled = true;
        try {
            const { sub, disc, net } = this._calcTotals(), m = this.el.paymentMethod?.value||'cash';
            let cash=0, trans=0;
            if (m==='cash') cash = +this.el.cashAmount?.value||0;
            else if (m==='transfer') trans = +this.el.transferAmount?.value||0;
            else if (m==='mixed') { cash = +this.el.cashAmount?.value||0; trans = +this.el.transferAmount?.value||0; }
            const used = this.state.usedBalance||0, paid = U.round(cash+trans+used,2), diff = U.round(paid-net,2);
            const cust = this._getCust(), oldBal = cust?.balance||0;
            const invNum = this.state.db ? await DB.generateInvoiceNumber() : this._localInvNum();
            const inv = {
                id: U.uuid(), invoice_number: invNum, date: U.today(),
                customer_id: this.state.selectedCustomerId||null, customer_name: cust?.name||'نقدي',
                items: this.state.cart.map(i=>({...i})),
                subtotal: sub, discount: disc, total: net,
                cash_paid: cash, transfer_paid: trans, used_customer_balance: used,
                paid: paid, remaining: diff>=0?0:-diff,
                status: diff>=0?'paid':'partial', notes: this.el.paymentNotes?.value||''
            };
            if (this.state.editingInv) inv.original_invoice_id = this.state.editingInv;

            let result;
            if (this.state.db) result = await DB.createSaleInvoice(inv);
            else throw new Error('غير متصل');
            if (!result?.success) throw new Error(result?.error||'فشل');

            this._closeModal('paymentModal'); this._updateStock(); this._buildCache();
            this._showReceipt({...inv, invoice_number: result.invoice_number||inv.invoice_number}, cust||{name:'نقدي',balance:0}, this.state.cart, {sub,disc,net}, oldBal, {cash,trans,used,diff});
            this._resetCart(); this.state.editingInv = null;
            window.Toast?.success('تم البيع');
        } catch(e) { console.error(e); window.Toast?.error(e.message); }
        finally { this.state.busy = false; this.el.confirmAndPrintBtn.disabled = false; }
    },
    _updateStock() {
        for (const i of this.state.cart) {
            const p = this.cache.prods.get(String(i.productId)); if (!p?.units) continue;
            const base = p.units[0];
            // ========== الإصلاح ==========
            let reduction;
            if (i.unitName === base.name) {
                reduction = i.quantity;
            } else {
                const unit = p.units.find(u => u.name === i.unitName);
                reduction = i.quantity * (unit?.factor || 1); // تم التصحيح من القسمة إلى الضرب
            }
            base.stock = Math.max(0, (base.stock || 0) - reduction);
        }
    },
    _localInvNum() {
        const y = new Date().getFullYear().toString().slice(-2);
        const k = `inv_counter_${y}`;
        let n = (parseInt(localStorage.getItem(k)||'0',10)+1);
        localStorage.setItem(k, String(n));
        return y+'-'+String(n).padStart(4,'0');
    },
    _resetCart() {
        this.state.cart=[]; this.state.selectedCustomerId=null; this.state.discountValue=0; this.state.discountType='amount'; this.state.usedBalance=0; this.state.editingInv=null;
        if (this.el.discountValue) this.el.discountValue.value=0;
        if (this.el.discountType) this.el.discountType.value='amount';
        if (this.el.customerSearchInput) { this.el.customerSearchInput.value=''; this._updateCustDisplay(); }
        if (this.el.paymentNotes) this.el.paymentNotes.value = '';
        this._renderCart();
    },
    _getCust() { return this.state.selectedCustomerId ? this.cache.custs.get(this.state.selectedCustomerId) : null; },

    /* ---------- تعليق واسترجاع ---------- */
    async holdInvoice() {
        if (!this.state.cart.length) { window.Toast?.info('السلة فارغة'); return; }
        const { sub, disc, net } = this._calcTotals();
        const inv = { id: U.uuid(), invoice_number: this.state.db?await DB.generateInvoiceNumber():this._localInvNum(), type:'sale', date:U.today(), customer_id:this.state.selectedCustomerId||null, customer_name:this._getCust()?.name||'نقدي', items:this.state.cart.map(i=>({...i})), subtotal:sub, discount:disc, total:net, paid:0, remaining:net, status:'held', notes:'معلقة' };
        try {
            if (this.state.db) await DB.saveInvoice(inv); else if (U.localReady()) await localDB.put('invoices', inv);
            window.Toast?.success(`تم تعليق ${inv.invoice_number}`); this._resetCart();
        } catch(e) { window.Toast?.error('فشل التعليق'); }
    },
    async loadHeld() {
        let invs = [];
        try {
            // ========== الإصلاح: استعلام محدود بدلاً من جلب الكل ==========
            if (this.state.db) {
                const { data } = await window.supabase
                    .from('invoices')
                    .select('*')
                    .eq('type', 'sale')
                    .eq('status', 'held')
                    .order('created_at', { ascending: false })
                    .limit(100);
                invs = data || [];
            } else if (U.localReady()) {
                const all = await localDB.getAll('invoices') || [];
                invs = all.filter(i => i.type === 'sale' && i.status === 'held').slice(0, 100);
            }
        } catch (e) { console.error('loadHeld:', e); }
        const c = this.el.heldInvoicesList; if (!c) return;
        const borderColor = U.cssVar('--border-light', '#e2e8f0');
        const textMuted = U.cssVar('--text-muted', '#94a3b8');
        c.innerHTML = invs.length ? invs.map(i => `<div class="held-invoice-item" data-id="${i.id}" style="padding:15px;border:1px solid ${borderColor};border-radius:12px;margin-bottom:10px;cursor:pointer;display:flex;justify-content:space-between;"><div><strong>${U.escape(i.invoice_number||i.id?.substring(0,8))}</strong><br>${U.escape(i.customer_name||'نقدي')} - ${U.fmtMoney(i.total)}</div><div><i class="fas fa-play"></i></div></div>`).join('') : '<p style="text-align:center;color:'+textMuted+';">لا توجد فواتير معلقة</p>';
        c.querySelectorAll('.held-invoice-item').forEach(el => el.addEventListener('click', () => this._resumeInvoice(el.dataset.id)));
        this._showModal('heldInvoicesModal');
    },
    async _resumeInvoice(id) {
        let inv;
        try {
            // ========== الإصلاح: استخدام localDB.get بدلاً من getById ==========
            if (this.state.db) {
                inv = await DB.getInvoiceById(id);
                if (inv && window.supabase) {
                    await window.supabase.from('invoices').delete().eq('id', id);
                }
            } else if (U.localReady()) {
                inv = await localDB.get('invoices', id); // تم التصحيح
                if (inv && localDB.delete) await localDB.delete('invoices', id).catch(() => {});
            }
        } catch (e) { console.error(e); }
        if (!inv) { window.Toast?.error('غير موجودة'); return; }
        this.state.cart = inv.items.map(i=>({...i})); this.state.selectedCustomerId = inv.customer_id;
        if (inv.customer_id) { const c = this.cache.custs.get(String(inv.customer_id)); if (c) this.el.customerSearchInput.value = c.name||''; this._updateCustDisplay(); }
        else { this.el.customerSearchInput.value = 'نقدي (بدون عميل)'; this._updateCustDisplay(); }
        this._renderCart(); this._closeModal('heldInvoicesModal'); window.Toast?.success('تم الاسترجاع');
    },

    /* ---------- إيصال كلاسيكي محسّن ---------- */
    _showReceipt(inv, cust, items, totals, oldBal, pay) {
        // ... (نفس الكود السابق للإيصال الكلاسيكي، لم يتغير) ...
        const s = JSON.parse(localStorage.getItem('app_settings') || '{}');
        const name = s?.company?.name || 'حسابي';
        const phone = s?.company?.phone || '';
        const website = s?.company?.website || 'www.hesaby.app';
        const support = s?.company?.support || '01000000000';
        const branch = s?.company?.branch || 'الفرع الرئيسي';
        const foot = s?.print?.footer_message || 'شكراً لتعاملكم معنا';
        const W = 40;

        const fmt = v => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const line = (char = '-') => char.repeat(W);
        const padRow = (label, value) => {
            const str = `  ${label}${' '.repeat(Math.max(1, W - label.length - String(value).length - 2))}${value}`;
            return str.substring(0, W);
        };
        const center = (text) => {
            const spaces = Math.max(0, W - text.length);
            const left = Math.floor(spaces / 2);
            return ' '.repeat(left) + text;
        };

        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        const sellerName = (() => {
            try { return JSON.parse(localStorage.getItem('app_session') || '{}').fullName || '—'; } catch { return '—'; }
        })();

        const L = [];
        L.push(line('='));
        L.push(center(name));
        L.push(center('نظام إدارة الأعمال الذكي'));
        L.push(line('='));
        L.push('  فاتورة مبيعات');
        L.push('');
        L.push(padRow('رقم الفاتورة :', inv.invoice_number || inv.id?.substring(0, 8)));
        L.push(padRow('التاريخ      :', U.fmtDate(inv.date)));
        L.push(padRow('الوقت        :', timeStr));
        L.push(padRow('الفرع        :', branch));
        L.push(padRow('البائع       :', sellerName));
        L.push(line('-'));

        L.push('  بيانات العميل');
        L.push('');
        L.push(padRow('الاسم        :', cust?.name || 'نقدي'));
        if (cust?.phone) L.push(padRow('الهاتف       :', cust.phone));
        L.push(line('-'));

        L.push('  الصنف          الكمية   سعر   إجمالي');
        L.push(line('-'));
        for (const it of items) {
            const name = U.escape(it.productName).substring(0, 14);
            const qty = String(it.quantity);
            const price = fmt(it.price);
            const total = fmt(U.round(it.quantity * it.price, 2));
            L.push(`  ${name.padEnd(14)} ${qty.padStart(5)} ${price.padStart(7)} ${total.padStart(8)}`);
        }
        L.push(line('-'));
        const itemCount = items.length;
        let totalPieces = 0;
        for (const it of items) totalPieces += it.quantity * (it.factor || 1);
        L.push(padRow('عدد الأصناف', `${itemCount} صنف`));
        L.push(padRow('عدد القطع', `${Math.round(totalPieces)} قطعة`));

        L.push(line('='));
        L.push('  ملخص الفاتورة');
        L.push('');
        L.push(padRow('إجمالي المنتجات', fmt(totals.sub) + ' ج.م'));
        if (totals.disc > 0) L.push(padRow('الخصومات', '-' + fmt(totals.disc) + ' ج.م'));
        L.push('  ' + line('-').substring(2));
        L.push(padRow('المستحق النهائي', fmt(totals.net) + ' ج.م'));

        L.push(line('='));
        const cash = pay.cash || 0, trans = pay.trans || 0, used = pay.used || 0;
        const paid = U.round(cash + trans + used, 2), diff = pay.diff || 0;
        L.push(padRow('المدفوع', fmt(paid) + ' ج.م'));
        if (diff > 0) L.push(padRow('الباقي', fmt(diff) + ' ج.م'));
        else if (diff < 0) L.push(padRow('المتبقي', fmt(-diff) + ' ج.م'));

        L.push(line('='));
        L.push(center(foot));
        L.push('');
        L.push(center(website));
        L.push(center('Support: ' + support));
        L.push(line('='));

        const receiptText = L.join('\n');
        this.el.receiptPrintArea.innerHTML = `<pre style="font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.3; text-align: left; direction: ltr; white-space: pre; margin: 0; padding: 8px; background: white; width: 80mm; max-width: 100%;">${U.escape(receiptText)}</pre>`;
        this._showModal('receiptModal');
    },

    _printReceipt() {
        const c = this.el.receiptPrintArea.innerHTML;
        const w = window.open('','_blank','width=400,height=600'); if (!w) { window.Toast?.error('اسمح بالنوافذ المنبثقة'); return; }
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;direction:rtl;text-align:right;background:white;display:flex;justify-content:center;padding:10px}pre{font-family:'Courier New',monospace;font-size:12px;line-height:1.3;text-align:left;direction:ltr;white-space:pre;width:80mm}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${c}</body></html>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    },

    _saveCart() { if (this.state.cart.length) localStorage.setItem('pos_cart', JSON.stringify({cart:this.state.cart, cust:this.state.selectedCustomerId, discType:this.state.discountType, discVal:this.state.discountValue, ts:Date.now()})); else localStorage.removeItem('pos_cart'); },
    _restoreCart() {
        const s = localStorage.getItem('pos_cart'); if (!s) return;
        try { const d = JSON.parse(s); if (d.ts && Date.now()-d.ts > 2*60*60*1000) { localStorage.removeItem('pos_cart'); return; } this.state.cart = d.cart||[]; this.state.selectedCustomerId = d.cust; this.state.discountType = d.discType||'amount'; this.state.discountValue = d.discVal||0; this._renderCart(); if (d.cust) { const c = this.cache.custs.get(String(d.cust)); if (c) this.el.customerSearchInput.value = c.name||''; this._updateCustDisplay(); } } catch {}
        localStorage.removeItem('pos_cart');
    },

    _showModal(id) { const m = this.el[id]; if (m) m.classList.add('open'); },
    _closeModal(id) { const m = this.el[id]; if (m) m.classList.remove('open'); }
};

window.POS = POS;
window.addEventListener('DOMContentLoaded', () => POS.init());
window.addEventListener('beforeunload', () => POS._saveCart());
