
/* =============================================
   pos.js - نقطة البيع (إصدار نهائي 5.0.5)
   كامل – جميع الميزات، جميع الإصلاحات، والربط
   ============================================= */
'use strict';

/* ---------- أدوات مساعدة ---------- */
const U = {
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    fmtDate: (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return d; } },
    today: () => new Date().toISOString().split('T')[0],
    escape: (s) => { if(!s) return ''; const div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; },
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

    /* ---------- التهيئة العامة ---------- */
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
        const ids = [
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
            'duplicateProductModal','duplicateProductMsg','duplicateIncreaseBtn','duplicateCancelBtn',
            'tabletProductSearchInput','tabletBarcodeBtn','productGrid'
        ];
        ids.forEach(id => { this.el[id] = document.getElementById(id); });
    },

    _applySafeArea() {
        const safeBottom = 'env(safe-area-inset-bottom, 0px)';
        const footer = document.querySelector('.cart-footer');
        if (footer) footer.style.paddingBottom = `calc(10px + ${safeBottom})`;
    },

    /* ---------- ربط الأحداث ---------- */
    _bind() {
        // القائمة الجانبية
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar?.classList.toggle('open');
            this.el.sidebarOverlay?.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar?.classList.remove('open');
            this.el.sidebarOverlay?.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(l => {
            l.addEventListener('click', () => {
                this.el.sidebar?.classList.remove('open');
                this.el.sidebarOverlay?.classList.remove('show');
            });
        });

        // القائمة المنسدلة
        this.el.moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show');
        });

        // أزرار القائمة المنسدلة
        this.el.returnSaleBtn?.addEventListener('click', (e) => { e.preventDefault(); this.openReturn(); this.el.moreDropdown?.classList.remove('show'); });
        this.el.holdInvoiceBtn?.addEventListener('click', (e) => { e.preventDefault(); this.holdInvoice(); this.el.moreDropdown?.classList.remove('show'); });
        this.el.heldInvoicesBtn?.addEventListener('click', (e) => { e.preventDefault(); this.loadHeld(); this.el.moreDropdown?.classList.remove('show'); });
        this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (confirm('هل أنت متأكد من تسجيل الخروج؟')) App.logout(); this.el.moreDropdown?.classList.remove('show'); });

        // البحث (الهاتف)
        this.el.productSearchInput?.addEventListener('input', U.debounce(() => this._filterProducts(), 150));
        this.el.productDropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) { this._selectProduct(item.dataset.id); this._hideProdDropdown(); this.el.productSearchInput.value = ''; }
        });
        document.addEventListener('click', (e) => { if (!e.target.closest('.search-header')) this._hideProdDropdown(); });

        // البحث (اللوحي) + كروت المنتجات
        this.el.tabletProductSearchInput?.addEventListener('input', U.debounce(() => this._filterTabletProducts(), 200));
        this.el.tabletBarcodeBtn?.addEventListener('click', () => this._scanBarcode());
        this.el.productGrid?.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (card?.dataset.id) this._selectProduct(card.dataset.id);
        });

        // كاميرا الباركود (الهاتف)
        this.el.barcodeScannerBtn?.addEventListener('click', () => this._scanBarcode());

        // العملاء
        this.el.customerSearchInput?.addEventListener('input', () => this._filterCustomers());
        this.el.customerSearchInput?.addEventListener('focus', () => { if (!this.el.customerSearchInput.value.trim()) this._filterCustomers(); });
        this.el.customerDropdown?.addEventListener('click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                if (item.dataset.id === 'cash') { this.state.selectedCustomerId = null; this.el.customerSearchInput.value = 'نقدي (بدون عميل)'; }
                else { this.state.selectedCustomerId = item.dataset.id; const c = this.cache.custs.get(item.dataset.id); this.el.customerSearchInput.value = c?.name || ''; }
                this._updateCustDisplay(); this._hideCustDropdown();
            }
        });
        document.addEventListener('click', (e) => { if (!e.target.closest('.customer-box')) this._hideCustDropdown(); });

        // الخصم والدفع
        this.el.discountValue?.addEventListener('input', () => { this.state.discountValue = +this.el.discountValue.value || 0; this._updateTotals(); });
        this.el.discountType?.addEventListener('change', () => { this.state.discountType = this.el.discountType.value; this._updateTotals(); });
        this.el.payBtn?.addEventListener('click', () => this._openPayment());

        // مودال الوحدة
        this.el.addToCartBtn?.addEventListener('click', () => this._addToCart());
        this.el.closeUnitModalBtn?.addEventListener('click', () => this._closeModal('unitQuantityModal'));

        // مودال الدفع
        this.el.confirmAndPrintBtn?.addEventListener('click', (e) => { e.preventDefault(); this._completePayment(); });
        this.el.closePaymentModalBtn?.addEventListener('click', () => this._closeModal('paymentModal'));
        this.el.paymentMethod?.addEventListener('change', () => this._togglePaymentFields());
        this.el.cashAmount?.addEventListener('input', () => this._previewPayment());
        this.el.transferAmount?.addEventListener('input', () => this._previewPayment());

        // مودال الفواتير المعلقة
        this.el.closeHeldModalBtn?.addEventListener('click', () => this._closeModal('heldInvoicesModal'));

        // مودال الإيصال
        this.el.closeReceiptModalBtn?.addEventListener('click', () => this._closeModal('receiptModal'));
        this.el.skipPrintBtn?.addEventListener('click', () => { this._closeModal('receiptModal'); this._resetCart(); });
        this.el.printReceiptBtn?.addEventListener('click', () => this._printReceipt());

        // تكرار المنتج
        this.el.duplicateIncreaseBtn?.addEventListener('click', () => this._handleDuplicate(true));
        this.el.duplicateCancelBtn?.addEventListener('click', () => this._closeModal('duplicateProductModal'));

        // السلة (تفويض)
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
        this._renderProductGrid();
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
    _hideCustDropdown() { if (this.el.customerDropdown) this.el.customerDropdown.classList.remove('show'); },
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
    _hideProdDropdown() { if (this.el.productDropdown) this.el.productDropdown.classList.remove('show'); },

    /* ---------- كروت المنتجات (لوحي) ---------- */
    _renderProductGrid() {
        const grid = this.el.productGrid; if (!grid) return;
        const prods = this.state.products;
        if (!prods.length) { grid.innerHTML = '<p style="text-align:center;color:var(--text-muted);">لا توجد منتجات</p>'; return; }
        grid.innerHTML = prods.map(p => `
            <div class="product-card" data-id="${p.id}">
                <div class="card-img"><i class="fas fa-box"></i></div>
                <div class="card-name">${U.escape(p.name)}</div>
                <div class="card-price">${U.fmtMoney(p.units[0]?.price||0)}</div>
                <div class="card-stock">المخزون: ${p.units[0]?.stock||0}</div>
            </div>
        `).join('');
    },
    _filterTabletProducts() {
        const term = this.el.tabletProductSearchInput?.value.trim().toLowerCase() || '';
        const grid = this.el.productGrid; if (!grid) return;
        const prods = this.state.products;
        const filtered = term ? prods.filter(p => p.name?.toLowerCase().includes(term) || p.barcode === term || p.code === term) : prods;
        grid.innerHTML = filtered.length ? filtered.map(p => `
            <div class="product-card" data-id="${p.id}">
                <div class="card-img"><i class="fas fa-box"></i></div>
                <div class="card-name">${U.escape(p.name)}</div>
                <div class="card-price">${U.fmtMoney(p.units[0]?.price||0)}</div>
                <div class="card-stock">المخزون: ${p.units[0]?.stock||0}</div>
            </div>
        `).join('') : '<p style="text-align:center;color:var(--text-muted);">لا توجد نتائج</p>';
    },

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
            const idx = +e.target.dataset.idx; const q = +e.target.value;
            if (isNaN(q) || q <= 0) this.state.cart.splice(idx, 1);
            else this.state.cart[idx].quantity = q;
            this._renderCart();
        } else if (e.target.classList.contains('cart-price-input')) {
            const idx = +e.target.dataset.idx; const p = +e.target.value;
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
        if (!this.state.cart.length) { window.Toast?.error('السلة فارغة'); return; }
        this._updateTotals();
        const { sub, disc, net } = this._calcTotals();
        
        this.el.paySubtotal.textContent = U.fmtMoney(sub);
        this.el.payDiscount.textContent = U.fmtMoney(disc);
        this.el.payNet.textContent = U.fmtMoney(net);

        const cust = this._getCust();
        const bal = cust ? (cust.balance || 0) : 0;
        this.el.currentBalance.textContent = cust ? (bal > 0 ? `دائن ${U.fmtMoney(bal)}` : bal < 0 ? `مدين ${U.fmtMoney(-bal)}` : '0 ج.م') : 'لا يوجد عميل محدد';

        this.el.paymentMethod.value = 'cash';
        this.el.cashField.style.display = 'block';
        this.el.transferField.style.display = 'none';
        this.el.cashAmount.value = net;
        this.el.transferAmount.value = 0;
        this.el.paymentNotes.value = '';

        this._previewPayment();
        this._showModal('paymentModal');
    },

    _togglePaymentFields() {
        const method = this.el.paymentMethod.value;
        this.el.cashField.style.display = method === 'cash' ? 'block' : 'none';
        this.el.transferField.style.display = method === 'transfer' ? 'block' : 'none';
        if (method === 'cash') {
            this.el.cashAmount.value = this.state.net;
            this.el.transferAmount.value = 0;
        } else if (method === 'transfer') {
            this.el.transferAmount.value = this.state.net;
            this.el.cashAmount.value = 0;
        }
        this._previewPayment();
    },

    _previewPayment() {
        const net = this.state.net;
        const isCash = this.el.paymentMethod.value === 'cash';
        const paid = isCash ? (+this.el.cashAmount.value || 0) : (+this.el.transferAmount.value || 0);
        const remain = U.round(net - paid, 2);

        this.el.remainingDisplay.textContent = U.fmtMoney(remain);

        const cust = this._getCust();
        if (cust) {
            const oldBal = cust.balance || 0;
            const newBal = oldBal - remain;
            this.el.balanceAfterLabel.style.display = 'inline';
            this.el.balanceAfter.style.display = 'inline';
            this.el.balanceAfter.textContent = newBal > 0 ? `دائن ${U.fmtMoney(newBal)}` : newBal < 0 ? `مدين ${U.fmtMoney(-newBal)}` : '0 ج.م';
            this.el.balanceAfter.style.color = newBal > 0 ? 'var(--success)' : newBal < 0 ? 'var(--danger)' : 'var(--text-muted)';
        } else {
            this.el.balanceAfterLabel.style.display = 'none';
            this.el.balanceAfter.style.display = 'none';
        }
    },

    async _completePayment() {
        if (this.state.busy) return;
        this.state.busy = true;

        try {
            const net = this.state.net;
            const method = this.el.paymentMethod.value;
            const paid = method === 'cash' ? (+this.el.cashAmount.value || 0) : (+this.el.transferAmount.value || 0);
            const remain = U.round(net - paid, 2);
            const cust = this._getCust();

            if (remain > 0 && !cust) {
                window.Toast?.error('لا يمكن تسجيل مديونية بدون تحديد عميل');
                this.state.busy = false;
                return;
            }

            const invId = this.state.editingInv || U.uuid();
            const invNum = this.state.db && DB.generateInvoiceNumber ? await DB.generateInvoiceNumber() : this._localInvNum();
            const oldBal = cust ? (cust.balance || 0) : 0;
            const newBal = cust ? oldBal - remain : 0;

            const invoiceData = {
                id: invId,
                invoice_number: invNum,
                type: 'sale',
                date: U.today(),
                customer_id: cust ? cust.id : null,
                customer_name: cust ? cust.name : 'نقدي',
                subtotal: this.state.subtotal,
                discount: this.state.discount,
                total: net,
                paid: paid,
                remaining: remain,
                payment_method: method,
                notes: this.el.paymentNotes.value || '',
                items: this.state.cart.map(i => ({
                    product_id: i.productId,
                    product_name: i.productName,
                    unit_name: i.unitName,
                    quantity: i.quantity,
                    price: i.price,
                    total: U.round(i.quantity * i.price, 2)
                }))
            };

            if (this.state.db && DB.createSaleInvoice) {
                await DB.createSaleInvoice(invoiceData);
            } else if (U.localReady()) {
                await window.localDB.put('invoices', invoiceData);
                if (cust) {
                    cust.balance = newBal;
                    await window.localDB.put('parties', cust);
                }
                this._updateStock(invoiceData.items);
            }

            // تحديث العميل في الكاش
            if (cust) { cust.balance = newBal; this.cache.custs.set(cust.id, cust); this._updateCustDisplay(); }

            this._closeModal('paymentModal');
            this._showReceipt(invoiceData, cust, this.state.cart, { subtotal: this.state.subtotal, discount: this.state.discount, total: net }, oldBal, paid);
            window.Toast?.success('تم حفظ الفاتورة بنجاح');
            
            // إزالة التخزين المؤقت وحفظ الفاتورة الحالية
            localStorage.removeItem('pos_cart');
        } catch (err) {
            console.error('فشل إتمام الدفع:', err);
            window.Toast?.error(err.message || 'حدث خطأ أثناء حفظ الفاتورة');
        } finally {
            this.state.busy = false;
        }
    },

    _updateStock(items) {
        // تحديث المخزون المحلي في وضع الأوفلاين
        items.forEach(item => {
            const p = this.cache.prods.get(item.product_id);
            if (p && p.units) {
                const u = p.units.find(un => un.name === item.unit_name);
                if (u) {
                    const factor = u.factor || 1;
                    p.units[0].stock = Math.max(0, (p.units[0].stock || 0) - (item.quantity * factor));
                    if (U.localReady()) window.localDB.put('products', p);
                }
            }
        });
    },

    _localInvNum() {
        return `OFF-${Date.now().toString().slice(-6)}`;
    },

    _resetCart() {
        this.state.cart = [];
        this.state.selectedCustomerId = null;
        this.state.editingInv = null;
        if(this.el.customerSearchInput) this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
        if(this.el.discountValue) this.el.discountValue.value = 0;
        this.state.discountValue = 0;
        this._updateCustDisplay();
        this._renderCart();
        localStorage.removeItem('pos_cart');
    },

    _getCust() { 
        return this.state.selectedCustomerId ? this.cache.custs.get(String(this.state.selectedCustomerId)) : null; 
    },

    /* ---------- تعليق واسترجاع ---------- */
    async holdInvoice() {
        if (!this.state.cart.length) { window.Toast?.info('السلة فارغة، لا يوجد ما يمكن تعليقه'); return; }
        const heldName = prompt('أدخل اسماً أو ملاحظة للفاتورة المعلقة:', 'عميل في الانتظار');
        if (heldName === null) return;
        
        const heldData = {
            id: U.uuid(),
            name: heldName || 'بدون اسم',
            date: new Date().toISOString(),
            cart: this.state.cart,
            customerId: this.state.selectedCustomerId
        };

        const existing = JSON.parse(localStorage.getItem('held_invoices') || '[]');
        existing.push(heldData);
        localStorage.setItem('held_invoices', JSON.stringify(existing));
        
        window.Toast?.success('تم تعليق الفاتورة بنجاح');
        this._resetCart();
    },

    async loadHeld() {
        const existing = JSON.parse(localStorage.getItem('held_invoices') || '[]');
        const listEl = this.el.heldInvoicesList;
        if (!listEl) return;

        if (!existing.length) {
            listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding: 20px;">لا توجد فواتير معلقة</p>';
        } else {
            listEl.innerHTML = existing.map((h, i) => `
                <div class="held-item" style="display:flex; justify-content:space-between; align-items:center; padding: 15px; border-bottom: 1px solid var(--border-color);">
                    <div>
                        <strong>${U.escape(h.name)}</strong><br>
                        <small style="color:var(--text-muted);">${U.fmtDate(h.date)} | الأصناف: ${h.cart.length}</small>
                    </div>
                    <div style="display:flex; gap: 10px;">
                        <button class="btn btn-primary btn-sm" onclick="POS._resumeInvoice(${i})">استرجاع</button>
                        <button class="btn btn-danger btn-sm" onclick="POS._deleteHeld(${i})"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            `).join('');
        }
        this._showModal('heldInvoicesModal');
    },

    async _resumeInvoice(index) {
        const existing = JSON.parse(localStorage.getItem('held_invoices') || '[]');
        const held = existing[index];
        if (held) {
            if (this.state.cart.length > 0 && !confirm('السلة الحالية تحتوي على أصناف، هل تريد استبدالها؟')) return;
            this.state.cart = held.cart;
            this.state.selectedCustomerId = held.customerId;
            
            if (held.customerId) {
                const c = this.cache.custs.get(String(held.customerId));
                if (c) this.el.customerSearchInput.value = c.name || '';
                this._updateCustDisplay();
            } else {
                this.el.customerSearchInput.value = 'نقدي (بدون عميل)';
            }
            
            existing.splice(index, 1);
            localStorage.setItem('held_invoices', JSON.stringify(existing));
            this._renderCart();
            this._closeModal('heldInvoicesModal');
            window.Toast?.info('تم استرجاع الفاتورة');
        }
    },
    
    _deleteHeld(index) {
        if(!confirm('هل أنت متأكد من الحذف؟')) return;
        const existing = JSON.parse(localStorage.getItem('held_invoices') || '[]');
        existing.splice(index, 1);
        localStorage.setItem('held_invoices', JSON.stringify(existing));
        this.loadHeld(); // إعادة تحميل القائمة
    },

    /* ---------- إيصال ---------- */
    _showReceipt(inv, cust, items, totals, oldBal, pay) {
        const printArea = this.el.receiptPrintArea;
        if (!printArea) return;

        let itemsHtml = items.map(i => `
            <div class="receipt-item">
                <div class="receipt-item-name">${U.escape(i.productName)}</div>
                <div class="receipt-item-details">
                    <span>${i.quantity} ${U.escape(i.unitName)} × ${U.fmtMoney(i.price)}</span>
                    <span>${U.fmtMoney(i.quantity * i.price)}</span>
                </div>
            </div>
        `).join('');

        const newBal = cust ? oldBal - inv.remaining : 0;
        const balHtml = cust ? `
            <div class="receipt-balance-section" style="margin-top:15px; border-top:1px dashed #ccc; padding-top:10px;">
                <div class="receipt-row"><span>رصيد سابق:</span> <span>${oldBal > 0 ? 'دائن' : oldBal < 0 ? 'مدين' : ''} ${U.fmtMoney(Math.abs(oldBal))}</span></div>
                <div class="receipt-row" style="font-weight:bold;"><span>رصيد حالي:</span> <span>${newBal > 0 ? 'دائن' : newBal < 0 ? 'مدين' : ''} ${U.fmtMoney(Math.abs(newBal))}</span></div>
            </div>
        ` : '';

        const settings = window.SessionStore?._settings || {};
        const storeName = settings.storeName || 'نظام حسابي';
        const storePhone = settings.storePhone || '';

        printArea.innerHTML = `
            <div class="receipt-wrapper">
                <div class="receipt-header" style="text-align:center; margin-bottom:15px;">
                    <h2 style="margin:0; font-size:18px;">${U.escape(storeName)}</h2>
                    ${storePhone ? `<div style="font-size:12px;">ت: ${U.escape(storePhone)}</div>` : ''}
                    <div style="font-size:14px; margin-top:5px;">فاتورة مبيعات</div>
                    <div style="font-size:12px; color:#555;">رقم: ${inv.invoice_number}</div>
                    <div style="font-size:12px; color:#555;">التاريخ: ${U.fmtDate(inv.date)}</div>
                    <div style="font-size:12px; margin-top:5px; font-weight:bold;">العميل: ${cust ? U.escape(cust.name) : 'نقدي'}</div>
                </div>
                
                <div class="receipt-items-container" style="margin-bottom:15px; border-top:1px dashed #ccc; border-bottom:1px dashed #ccc; padding:10px 0;">
                    ${itemsHtml}
                </div>

                <div class="receipt-totals">
                    <div class="receipt-row"><span>الإجمالي الفرعي:</span> <span>${U.fmtMoney(totals.subtotal)}</span></div>
                    ${totals.discount > 0 ? `<div class="receipt-row"><span>الخصم:</span> <span>${U.fmtMoney(totals.discount)}</span></div>` : ''}
                    <div class="receipt-row" style="font-size:16px; font-weight:bold; margin-top:5px;"><span>الصافي:</span> <span>${U.fmtMoney(totals.total)}</span></div>
                    <div class="receipt-row"><span>المدفوع:</span> <span>${U.fmtMoney(pay)}</span></div>
                    <div class="receipt-row"><span>المتبقي:</span> <span>${U.fmtMoney(inv.remaining)}</span></div>
                </div>
                ${balHtml}
                <div class="receipt-footer" style="text-align:center; margin-top:20px; font-size:12px;">
                    <p>شكراً لزيارتكم</p>
                </div>
            </div>
        `;

        this._showModal('receiptModal');
    },

    _printReceipt() {
        const printArea = this.el.receiptPrintArea;
        if (!printArea) return;
        
        const originalContent = document.body.innerHTML;
        const printContent = printArea.innerHTML;
        
        document.body.innerHTML = printContent;
        window.print();
        document.body.innerHTML = originalContent;
        
        // إعادة تهيئة الواجهة بعد الطباعة
        window.location.reload(); 
    },

    /* ---------- حفظ واستعادة (التخزين المؤقت) ---------- */
    _saveCart() {
        if (this.state.cart.length > 0) {
            localStorage.setItem('pos_cart', JSON.stringify({
                cart: this.state.cart,
                customerId: this.state.selectedCustomerId,
                discountValue: this.state.discountValue,
                discountType: this.state.discountType
            }));
        } else {
            localStorage.removeItem('pos_cart');
        }
    },

    _restoreCart() {
        // لا تستعد السلة إذا كنا في وضع تعديل فاتورة
        if (localStorage.getItem('edit_invoice_id')) return;
        
        try {
            const saved = localStorage.getItem('pos_cart');
            if (saved) {
                const data = JSON.parse(saved);
                this.state.cart = data.cart || [];
                this.state.selectedCustomerId = data.customerId || null;
                this.state.discountValue = data.discountValue || 0;
                this.state.discountType = data.discountType || 'amount';
                
                if (this.el.discountValue) this.el.discountValue.value = this.state.discountValue;
                if (this.el.discountType) this.el.discountType.value = this.state.discountType;

                if (this.state.selectedCustomerId) {
                    const c = this.cache.custs.get(String(this.state.selectedCustomerId));
                    if (c && this.el.customerSearchInput) {
                        this.el.customerSearchInput.value = c.name;
                    }
                }
                this._updateCustDisplay();
                this._renderCart();
            }
        } catch (e) {
            console.error('خطأ في استعادة السلة:', e);
            localStorage.removeItem('pos_cart');
        }
    },

    _showModal(id) { const m = this.el[id]; if (m) m.classList.add('open'); },
    _closeModal(id) { const m = this.el[id]; if (m) m.classList.remove('open'); }
};

// تهيئة النظام عند تحميل الـ DOM
document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('posApp')) { // التأكد من أننا في صفحة الـ POS
        POS.init();
    }
});
