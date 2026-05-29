/* =============================================
   pos.js - نقطة البيع (إصدار 4.1 - بعد الصيانة)
   يجمع كل الخبرات: باركود، تكرار صنف، حدود سعر،
   ألوان رصيد، مرتجع، إيصال 80mm، Light/Dark،
   Offline، مبيعات، تعليق، استرجاع، أداء عالي
   ============================================= */
'use strict';

/* ---------- أدوات مساعدة (محسّنة) ---------- */
const U = {
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    fmtDate: (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } },
    today: () => new Date().toISOString().split('T')[0],
    escape: (s) => { const div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; },
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    uuid: () => (crypto?.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
    dbReady: () => !!(window.DB && window.supabase),
    localReady: () => !!(window.localDB?.ready)
};

const POS = {
    state: {
        products: [], customers: [], cart: [],
        selectedProduct: null, selectedUnit: null, selectedCustomerId: null,
        db: false, busy: false,
        subtotal: 0, discount: 0, discountType: 'amount', discountValue: 0, net: 0,
        usedBalance: 0, editingInv: null
    },
    cache: { prods: new Map(), custs: new Map() },
    el: {},

    /* ---------- التهيئة ---------- */
    init() {
        this._cacheDOM();
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
        ['menuToggle','sidebar','sidebarOverlay','moreMenuBtn','moreDropdown',
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
         'duplicateProductModal','duplicateProductMsg','duplicateIncreaseBtn','duplicateCancelBtn']
        .forEach(id => this.el[id] = document.getElementById(id));
        
        // ربط مستمع الحدث لتفويض السلة مرة واحدة فقط
        this._bindCartDelegation();
    },

    /* ---------- تفويض أحداث السلة ---------- */
    _bindCartDelegation() {
        const container = this.el.cartItemsContainer;
        if (!container) return;

        // إزالة المستمعين القدامى إن أمكن (للتأكد من عدم التراكم)
        container.removeEventListener('change', this._cartChangeHandler);
        container.removeEventListener('click', this._cartClickHandler);

        this._cartChangeHandler = (e) => {
            const target = e.target;
            if (target.classList.contains('cart-qty-input')) {
                const idx = +target.dataset.idx;
                const qty = +target.value;
                if (isNaN(qty) || qty <= 0) {
                    this.state.cart.splice(idx, 1);
                } else {
                    this.state.cart[idx].quantity = qty;
                }
                this._renderCart();
            } else if (target.classList.contains('cart-price-input')) {
                const idx = +target.dataset.idx;
                const price = +target.value;
                if (!isNaN(price) && price >= 0) {
                    this.state.cart[idx].price = price;
                }
                this._renderCart();
            }
        };

        this._cartClickHandler = (e) => {
            const trashIcon = e.target.closest('.fa-trash');
            if (trashIcon) {
                const idx = +trashIcon.dataset.idx;
                this.state.cart.splice(idx, 1);
                this._renderCart();
            }
        };

        container.addEventListener('change', this._cartChangeHandler);
        container.addEventListener('click', this._cartClickHandler);
    },

    /* ---------- الأحداث ---------- */
    _bind() {
        this.el.menuToggle?.addEventListener('click', () => { this.el.sidebar.classList.toggle('open'); this.el.sidebarOverlay?.classList.toggle('show'); });
        this.el.sidebarOverlay?.addEventListener('click', () => { this.el.sidebar.classList.remove('open'); this.el.sidebarOverlay.classList.remove('show'); });
        document.querySelectorAll('.menu-item').forEach(l => l.addEventListener('click', () => { this.el.sidebar.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); }));

        this.el.moreMenuBtn?.addEventListener('click', e => { e.stopPropagation(); this.el.moreDropdown?.classList.toggle('show'); });
        document.addEventListener('click', e => { if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show'); });
        this.el.holdInvoiceBtn?.addEventListener('click', e => { e.preventDefault(); this.holdInvoice(); this.el.moreDropdown?.classList.remove('show'); });
        this.el.heldInvoicesBtn?.addEventListener('click', e => { e.preventDefault(); this.loadHeld(); this.el.moreDropdown?.classList.remove('show'); });
        this.el.returnSaleBtn?.addEventListener('click', e => { e.preventDefault(); this.openReturn(); this.el.moreDropdown?.classList.remove('show'); });
        this.el.logoutBtn?.addEventListener('click', e => { e.preventDefault(); if (confirm('هل أنت متأكد من تسجيل الخروج؟')) App.logout(); });

        this.el.productSearchInput?.addEventListener('input', U.debounce(() => this._filterProducts(), 150));
        this.el.productDropdown?.addEventListener('click', e => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) { this._selectProduct(item.dataset.id); this._hideProdDropdown(); this.el.productSearchInput.value = ''; }
        });
        document.addEventListener('click', e => { if (!e.target.closest('.search-header')) this._hideProdDropdown(); });
        this.el.barcodeScannerBtn?.addEventListener('click', () => this._scanBarcode());

        this.el.customerSearchInput?.addEventListener('input', () => this._filterCustomers());
        this.el.customerDropdown?.addEventListener('click', e => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                if (item.dataset.id === 'cash') { this.state.selectedCustomerId = null; this.el.customerSearchInput.value = 'نقدي (بدون عميل)'; }
                else { this.state.selectedCustomerId = item.dataset.id; const c = this.cache.custs.get(item.dataset.id); this.el.customerSearchInput.value = c?.name || ''; }
                this._updateCustDisplay(); this._hideCustDropdown();
            }
        });
        document.addEventListener('click', e => { if (!e.target.closest('.customer-box')) this._hideCustDropdown(); });
        this.el.customerSearchInput?.addEventListener('focus', () => { if (!this.el.customerSearchInput.value.trim()) this._filterCustomers(); });

        this.el.discountValue?.addEventListener('input', () => { this.state.discountValue = +this.el.discountValue.value || 0; this._updateTotals(); });
        this.el.discountType?.addEventListener('change', () => { this.state.discountType = this.el.discountType.value; this._updateTotals(); });
        this.el.payBtn?.addEventListener('click', () => this._openPayment());

        this.el.addToCartBtn?.addEventListener('click', () => this._addToCart());
        this.el.closeUnitModalBtn?.addEventListener('click', () => this._closeModal('unitQuantityModal'));
        this.el.confirmAndPrintBtn?.addEventListener('click', async e => { e.preventDefault(); await this._completePayment(); });
        this.el.closePaymentModalBtn?.addEventListener('click', () => this._closeModal('paymentModal'));
        this.el.paymentMethod?.addEventListener('change', () => this._togglePaymentFields());
        this.el.cashAmount?.addEventListener('input', () => this._previewPayment());
        this.el.transferAmount?.addEventListener('input', () => this._previewPayment());

        this.el.closeHeldModalBtn?.addEventListener('click', () => this._closeModal('heldInvoicesModal'));
        this.el.closeReceiptModalBtn?.addEventListener('click', () => this._closeModal('receiptModal'));
        this.el.skipPrintBtn?.addEventListener('click', () => this._closeModal('receiptModal'));
        this.el.printReceiptBtn?.addEventListener('click', () => this._printReceipt());

        this.el.duplicateIncreaseBtn?.addEventListener('click', () => this._handleDuplicate(true));
        this.el.duplicateCancelBtn?.addEventListener('click', () => this._closeModal('duplicateProductModal'));
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

    _buildCache() { this.cache.prods.clear(); this.cache.custs.clear(); this.state.products.forEach(p => { this.cache.prods.set(String(p.id), p); this.cache.prods.set(p.id, p); }); this.state.customers.forEach(c => { this.cache.custs.set(String(c.id), c); this.cache.custs.set(c.id, c); }); },

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
        let html = `<div class="dropdown-item" data-id="cash"><div class="item-info"><h4>نقدي (بدون عميل)</h4></div></div>`;
        list.forEach(c => {
            const bal = c.balance || 0;
            const col = bal > 0 ? '#10b981' : bal < 0 ? '#ef4444' : '#64748b'; // ألوان ثابتة
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
        if (!this.state.products.length) { dd.innerHTML = '<div class="dropdown-item" style="color:#ef4444;text-align:center;">⚠️ لا توجد منتجات</div>'; dd.classList.add('show'); return; }
        const filtered = this.state.products.filter(p => p.name?.toLowerCase().includes(term) || p.barcode === term || p.code === term);
        dd.innerHTML = filtered.length ? filtered.map(p => `<div class="dropdown-item" data-id="${p.id}"><div class="item-info"><h4>${U.escape(p.name)}</h4></div><div class="item-price">${U.fmtMoney(p.units[0]?.price||0)}</div></div>`).join('') : '<div class="dropdown-item" style="color:#64748b;">لا نتائج</div>';
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
        const q = +this.el.selectedQuantity?.value || 0, max = +this.el.selectedQuantity?.max || 0;
        if (q<=0||q>max) { window.Toast?.error('كمية غير متاحة'); return; }
        const pr = +this.el.selectedPrice?.value || 0, u = this.state.selectedUnit;
        if (u) {
            if (u.minPrice>0 && pr < u.minPrice) { window.Toast?.error(`لا يمكن أقل من ${U.fmtMoney(u.minPrice)}`); return; }
            if (u.maxPrice>0 && pr > u.maxPrice) { window.Toast?.error(`لا يمكن أعلى من ${U.fmtMoney(u.maxPrice)}`); return; }
        }
        const exist = this.state.cart.find(i => i.productId===this.state.selectedProduct.id && i.unitName===u.name);
        if (exist) exist.quantity = U.round(exist.quantity + q, 3);
        else this.state.cart.push({ productId: this.state.selectedProduct.id, productName: this.state.selectedProduct.name, unitName: u.name, quantity: q, price: pr, factor: u.factor||1, isBase: u===this.state.selectedProduct.units[0] });
        this._renderCart(); this._closeModal('unitQuantityModal');
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
            const p = this.cache.prods.get(String(i.productId));
            if (!p?.units) continue;
            const base = p.units[0];
            const reduction = i.unitName === base.name ? i.quantity : i.quantity / (p.units.find(u => u.name === i.unitName)?.factor || 1);
            base.stock = Math.max(0, (base.stock || 0) - reduction);
        }
    },
    _localInvNum() {
        const y = new Date().getFullYear().toString().slice(-2);
        const k = `inv_counter_${y}`; // تم إصلاح اسم المفتاح ليتوافق مع الإصدارات السابقة
        let n = (parseInt(localStorage.getItem(k) || '0', 10) + 1);
        localStorage.setItem(k, String(n));
        return y + '-' + String(n).padStart(4, '0');
    },
    _resetCart() {
        this.state.cart=[]; this.state.selectedCustomerId=null; this.state.discountValue=0; this.state.discountType='amount'; this.state.usedBalance=0; this.state.editingInv=null;
        if (this.el.discountValue) this.el.discountValue.value=0;
        if (this.el.discountType) this.el.discountType.value='amount';
        if (this.el.customerSearchInput) { this.el.customerSearchInput.value=''; this._updateCustDisplay(); }
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
        try { invs = this.state.db ? (await DB.getInvoices()).filter(i=>i.type==='sale'&&i.status==='held') : U.localReady() ? (await localDB.getAll('invoices')).filter(i=>i.type==='sale'&&i.status==='held') : []; } catch {}
        const c = this.el.heldInvoicesList; if (!c) return;
        c.innerHTML = invs.length ? invs.map(i => `<div class="held-invoice-item" data-id="${i.id}" style="padding:15px;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:10px;cursor:pointer;display:flex;justify-content:space-between;"><div><strong>${U.escape(i.invoice_number||i.id?.substring(0,8))}</strong><br>${U.escape(i.customer_name||'نقدي')} - ${U.fmtMoney(i.total)}</div><div><i class="fas fa-play"></i></div></div>`).join('') : '<p style="text-align:center;color:#94a3b8;">لا توجد فواتير معلقة</p>';
        c.querySelectorAll('.held-invoice-item').forEach(el => el.addEventListener('click', () => this._resumeInvoice(el.dataset.id)));
        this._showModal('heldInvoicesModal');
    },
    async _resumeInvoice(id) {
        let inv;
        try {
            if (this.state.db) {
                inv = await DB.getInvoiceById(id);
                if (inv) {
                    // استخدام دالة الحذف المناسبة من DB أو supabase مباشرة مع التحقق
                    try { await window.DB.deleteInvoice?.(id); } catch { await window.supabase?.from('invoices').delete().eq('id', id); }
                }
            } else if (U.localReady()) {
                inv = await localDB.getById('invoices', id); // تم إصلاح استدعاء الدالة
                if (inv) await localDB.delete('invoices', id);
            }
        } catch (e) { console.warn('خطأ أثناء حذف الفاتورة المعلقة', e); }

        if (!inv) { window.Toast?.error('غير موجودة'); return; }
        this.state.cart = inv.items.map(i=>({...i})); this.state.selectedCustomerId = inv.customer_id;
        if (inv.customer_id) { const c = this.cache.custs.get(String(inv.customer_id)); if (c) this.el.customerSearchInput.value = c.name||''; this._updateCustDisplay(); }
        else { this.el.customerSearchInput.value = 'نقدي (بدون عميل)'; this._updateCustDisplay(); }
        this._renderCart(); this._closeModal('heldInvoicesModal'); window.Toast?.success('تم الاسترجاع');
    },

    /* ---------- إيصال ---------- */
    _showReceipt(inv, cust, items, totals, oldBal, pay) {
        const s = JSON.parse(localStorage.getItem('app_settings')||'{}'), name = s?.company?.name||'حسابي', phone = s?.company?.phone||'', foot = s?.print?.footer_message||'شكراً لتعاملكم معنا';
        const fmt = v => Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
        let itemsH = ''; for (const i of items) itemsH += `<div class="receipt-item-row"><div class="receipt-item-name">${U.escape(i.productName)} - ${U.escape(i.unitName)}</div><div class="receipt-item-details"><span>${i.quantity} x ${fmt(i.price)}</span><span class="receipt-item-total">${fmt(U.round(i.price*i.quantity,2))}</span></div></div>`;
        let payH = `<div class="receipt-row"><span>نقدى</span><span>${fmt(pay.cash||0)}</span></div><div class="receipt-row"><span>تحويل</span><span>${fmt(pay.trans||0)}</span></div>`;
        if (pay.used>0) payH += `<div class="receipt-row"><span>من رصيد</span><span>${fmt(pay.used)}</span></div>`;
        payH += `<div class="receipt-row total"><span>المدفوع</span><span>${fmt(U.round((pay.cash||0)+(pay.trans||0)+(pay.used||0),2))}</span></div>`;
        if (pay.diff>0) payH += `<div class="receipt-row"><span>فائض</span><span>${fmt(pay.diff)}</span></div>`;
        else if (pay.diff<0) payH += `<div class="receipt-row"><span>متبقى</span><span>${fmt(-pay.diff)}</span></div>`;
        let balH = ''; if (cust.name!=='نقدي') { const nb = cust.balance||0; balH = `<div class="receipt-row"><span>الرصيد السابق</span><span>${fmt(oldBal)}</span></div>${pay.used>0?`<div class="receipt-row"><span>خصم</span><span>-${fmt(pay.used)}</span></div>`:''}${pay.diff>0?`<div class="receipt-row"><span>اضافة</span><span>+${fmt(pay.diff)}</span></div>`:''}<div class="receipt-row total"><span>الرصيد الحالى</span><span>${fmt(nb)}</span></div>`; }
        this.el.receiptPrintArea.innerHTML = `<div class="thermal-receipt"><div class="receipt-header"><div class="company-name">${U.escape(name)}</div>${phone?`<div>هاتف: ${U.escape(phone)}</div>`:''}</div><hr class="receipt-divider"><div class="receipt-row"><span>العميل</span><span>${U.escape(cust.name||'نقدى')}</span></div><div class="receipt-row"><span>رقم الفاتورة</span><span>${U.escape(inv.invoice_number||inv.id?.substring(0,8))}</span></div><div class="receipt-row"><span>التاريخ</span><span>${U.fmtDate(inv.date)}</span></div><hr class="receipt-divider"><div>${itemsH}</div><hr class="receipt-divider"><div class="receipt-row"><span>الاجمالى</span><span>${fmt(totals.sub)}</span></div>${totals.disc>0?`<div class="receipt-row"><span>الخصم</span><span>${fmt(totals.disc)}</span></div>`:''}<div class="receipt-row total"><span>الصافى</span><span>${fmt(totals.net)}</span></div><hr class="receipt-divider"><div>${payH}</div>${balH?`<hr class="receipt-divider"><div>${balH}</div>`:''}<hr class="receipt-divider"><div class="receipt-footer">${U.escape(foot)}</div></div>`;
        this._showModal('receiptModal');
    },
    _printReceipt() {
        const c = this.el.receiptPrintArea.innerHTML;
        const w = window.open('','_blank','width=400,height=600'); if (!w) { window.Toast?.error('اسمح بالنوافذ المنبثقة'); return; }
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Cairo',sans-serif;direction:rtl;text-align:right;background:white;display:flex;justify-content:center;padding:10px}.thermal-receipt{width:80mm;max-width:80mm;font-size:12px;color:#000;line-height:1.6}.receipt-header{text-align:center;margin-bottom:10px}.company-name{font-size:16px;font-weight:bold}.receipt-divider{border:none;border-top:1px dashed #000;margin:8px 0}.receipt-row{display:flex;justify-content:space-between;margin:2px 0}.receipt-row.total{font-weight:bold;font-size:13px}.receipt-item-row{margin:4px 0}.receipt-item-name{font-weight:bold;font-size:11px}.receipt-item-details{display:flex;justify-content:space-between;font-size:10px;color:#444}.receipt-item-total{font-weight:bold}.receipt-footer{text-align:center;margin-top:10px;font-weight:bold}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${c}</body></html>`);
        w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
    },

    /* ---------- حفظ/استعادة ---------- */
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
