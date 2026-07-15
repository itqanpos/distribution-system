/* =============================================
   pos.js - نقطة البيع (إصدار 8.3 - تعديلات حرجة)
   ============================================= */
'use strict';

// ---------- ثوابت النصوص المتكررة ----------
const CASH_CUSTOMER_LABEL = 'نقدي (بدون عميل)';
const CASH_CUSTOMER_STORED = 'نقدي';

const U = {
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    fmtDate: (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return d; } },
    today: () => new Date().toISOString().split('T')[0],
    escape: (s) => { const div = document.createElement('div'); div.appendChild(document.createTextNode(s)); return div.innerHTML; },
    debounce: (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    round: (v, d = 2) => Number(Math.round(v + 'e' + d) + 'e-' + d),
    uuid: () => (crypto?.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }),
    dbReady: () => !!(window.DB && window.supabaseClient),
    localReady: () => !!(window.localDB?.ready),
    cssVar: (name, fallback = '') => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
};

const POS = {
    state: {
        products: [], customers: [], cart: [],
        selectedProduct: null, selectedUnit: null, selectedCustomerId: null,
        db: false, busy: false, addingItem: false,
        subtotal: 0, discount: 0, discountType: 'amount', discountValue: 0, net: 0,
        usedBalance: 0, editingInv: null,
        currentUser: null,
        resumedInvoiceId: null,
        _unitButtonsBound: false,
        _barcodeStream: null,
        _barcodeAnimFrame: null,
        _barcodeBuffer: '',
        _barcodeTimer: null,
        _lastKeyTime: 0,
        _observer: null,
        _offlineSales: [],
        _activityLog: []
    },
    cache: {
        prods: new Map(),
        custs: new Map(),
        barcode: new Map(),
        _maxCacheSize: 500,
        _setWithLimit(map, key, value) {
            if (map.size >= this._maxCacheSize) {
                const firstKey = map.keys().next().value;
                map.delete(firstKey);
            }
            map.set(key, value);
        }
    },
    el: {},

    async init() {
        this._cacheDOM();
        this._applySafeArea();
        this._bindKeyboardShortcuts();
        this._bind();
        this._connStatus();
        this._setupErrorMonitoring();
        this._setupBarcodeBuffer();
        this._setupRealtimeSync();
        window.addEventListener('online', () => { this._connStatus(); this._syncOfflineSales(); });
        window.addEventListener('offline', () => this._connStatus());
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                this._saveCart();
                this._savePaymentDraft();
                this._stopBarcodeScan();
            }
        });
        await this._loadData();
        await this._sidebarUser();
        this._restorePaymentDraft();
        window.addEventListener('beforeunload', () => { this._stopBarcodeScan(); this._saveCart(); this._savePaymentDraft(); });
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
            'receiptModal','receiptPrintArea','printReceiptBtn','thermalPrintBtn','skipPrintBtn','closeReceiptModalBtn',
            'sidebarAvatar','sidebarUserName',
            'tabletProductSearchInput','productGrid','tabletBarcodeBtn',
            'profitDisplay',
            'duplicateProductModal','duplicateProductMsg','duplicateIncreaseBtn','duplicateCancelBtn'
        ];
        ids.forEach(id => { const el = document.getElementById(id); if (el) this.el[id] = el; });
    },

    _applySafeArea() {
        const safeBottom = 'env(safe-area-inset-bottom, 0px)';
        const footer = document.querySelector('.cart-footer');
        if (footer) footer.style.paddingBottom = `calc(10px + ${safeBottom})`;
    },

    /* ---------- Error Monitoring ---------- */
    _setupErrorMonitoring() {
        window.addEventListener('error', (event) => {
            console.error('Global Error:', event.error);
            this._logErrorToServer(event.error);
        });
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled Rejection:', event.reason);
            this._logErrorToServer(event.reason);
        });
    },
    async _logErrorToServer(error) {
        try {
            if (window.supabaseClient) {
                await window.supabaseClient.from('system_logs').insert({
                    message: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString(),
                    tenant_id: this.state.currentUser?.tenant_id
                });
            }
        } catch (e) { /* صامت */ }
    },

    /* ---------- Realtime Sync ---------- */
    _setupRealtimeSync() {
        if (!window.supabaseClient) return;
        window.supabaseClient
            .channel('products-realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const deletedId = payload.old?.id;
                    if (deletedId) {
                        this.state.products = this.state.products.filter(p => p.id !== deletedId);
                        this._buildCache();
                        this._debouncedRenderGrid();
                    }
                    return;
                }
                const updatedProduct = payload.new;
                if (updatedProduct) {
                    const existingIndex = this.state.products.findIndex(p => p.id === updatedProduct.id);
                    if (existingIndex !== -1) {
                        this.state.products[existingIndex] = updatedProduct;
                    } else {
                        this.state.products.push(updatedProduct);
                    }
                    this._updateProductInCache(updatedProduct);
                    this._debouncedRenderGrid();
                }
            })
            .subscribe();
    },
    _updateProductInCache(product) {
        if (!product) return;
        // إزالة مفاتيح الباركود القديمة
        const old = this.cache.prods.get(String(product.id));
        if (old) {
            if (old.barcode) this.cache.barcode.delete(old.barcode);
            if (old.code) this.cache.barcode.delete(old.code);
        }
        const id = String(product.id);
        this.cache._setWithLimit(this.cache.prods, id, product);
        this.cache._setWithLimit(this.cache.prods, product.id, product);
        if (product.barcode) this.cache._setWithLimit(this.cache.barcode, product.barcode, product);
        if (product.code) this.cache._setWithLimit(this.cache.barcode, product.code, product);
    },
    _debouncedRenderGrid: U.debounce(function() {
        this._renderProductGrid();
    }, 200),

    /* ---------- Barcode Buffer (محسّن للماسحات HID) ---------- */
    _setupBarcodeBuffer() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
            const now = Date.now();
            if (e.key === 'Enter') {
                if (this.state._barcodeBuffer.length > 5) {
                    this._searchBarcode(this.state._barcodeBuffer);
                }
                this.state._barcodeBuffer = '';
                this.state._lastKeyTime = 0;
                return;
            }
            if (e.key.length === 1) {
                // إذا كانت المدة بين ضغطات المفاتيح أقل من 30ms فهي ماسحة ضوئية
                if (this.state._lastKeyTime && (now - this.state._lastKeyTime > 30)) {
                    this.state._barcodeBuffer = ''; // بداية جديدة
                }
                this.state._lastKeyTime = now;
                this.state._barcodeBuffer += e.key;
                clearTimeout(this.state._barcodeTimer);
                this.state._barcodeTimer = setTimeout(() => {
                    if (this.state._barcodeBuffer.length > 5) {
                        this._searchBarcode(this.state._barcodeBuffer);
                    }
                    this.state._barcodeBuffer = '';
                    this.state._lastKeyTime = 0;
                }, 150);
            }
        });
    },

    _bindKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'F1') { e.preventDefault(); this.el.customerSearchInput?.focus(); }
            if (e.key === 'F2') { e.preventDefault(); this.el.productSearchInput?.focus(); }
            if (e.key === 'F4') { e.preventDefault(); if (this.state.cart.length) this._openPayment(); }
            if (e.key === 'F5') { e.preventDefault(); this.holdInvoice(); }
            if (e.key === 'Escape') { this._closeAllModals(); }
        });
    },

    _bind() {
        const on = (id, ev, fn) => { if (this.el[id]) this.el[id].addEventListener(ev, fn); };

        on('menuToggle', 'click', () => { this.el.sidebar?.classList.toggle('open'); this.el.sidebarOverlay?.classList.toggle('show'); });
        on('sidebarOverlay', 'click', () => { this.el.sidebar?.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); });
        document.querySelectorAll('.menu-item').forEach(l => l.addEventListener('click', () => { this.el.sidebar?.classList.remove('open'); this.el.sidebarOverlay?.classList.remove('show'); }));

        on('moreMenuBtn', 'click', (e) => { e.stopPropagation(); this.el.moreDropdown?.classList.toggle('show'); });
        document.addEventListener('click', (e) => { if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show'); });
        on('returnSaleBtn', 'click', (e) => { e.preventDefault(); this.openReturn(); this.el.moreDropdown?.classList.remove('show'); });
        on('holdInvoiceBtn', 'click', (e) => { e.preventDefault(); this.holdInvoice(); this.el.moreDropdown?.classList.remove('show'); });
        on('heldInvoicesBtn', 'click', (e) => { e.preventDefault(); this.loadHeld(); this.el.moreDropdown?.classList.remove('show'); });
        on('logoutBtn', 'click', (e) => { e.preventDefault(); if (confirm('هل أنت متأكد؟')) App.logout(); });

        on('tabletProductSearchInput', 'input', U.debounce(() => this._filterTabletProducts(), 150));
        on('tabletBarcodeBtn', 'click', () => this._scanBarcode());
        if (this.el.productGrid) {
            this.el.productGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.product-card');
                if (card?.dataset.id) this._openUnitModal(card.dataset.id);
            });
        }

        on('productSearchInput', 'input', U.debounce(() => this._filterProducts(), 150));
        on('productDropdown', 'click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) { this._openUnitModal(item.dataset.id); this._hideProdDropdown(); this.el.productSearchInput.value = ''; }
        });
        document.addEventListener('click', (e) => { if (!e.target.closest('.search-header')) this._hideProdDropdown(); });
        on('barcodeScannerBtn', 'click', () => this._scanBarcode());

        on('customerSearchInput', 'input', U.debounce(() => this._filterCustomers(), 150));
        on('customerDropdown', 'click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                if (item.dataset.id === 'cash') { 
                    this.state.selectedCustomerId = null; 
                    this.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
                } else { 
                    this.state.selectedCustomerId = item.dataset.id; 
                    const c = this.cache.custs.get(item.dataset.id); 
                    this.el.customerSearchInput.value = c?.name || ''; 
                }
                this._updateCustDisplay(); this._hideCustDropdown(); this._saveCart();
            }
        });
        document.addEventListener('click', (e) => { if (!e.target.closest('.customer-box')) this._hideCustDropdown(); });

        on('discountValue', 'input', () => { this.state.discountValue = +this.el.discountValue.value || 0; this._updateTotals(); this._saveCart(); });
        on('discountType', 'change', () => { this.state.discountType = this.el.discountType.value; this._updateTotals(); this._saveCart(); });
        on('payBtn', 'click', () => this._openPayment());

        on('addToCartBtn', 'click', () => this._addToCart());
        on('closeUnitModalBtn', 'click', () => { this._stopBarcodeScan(); this._closeModal('unitQuantityModal'); });

        on('confirmAndPrintBtn', 'click', (e) => { e.preventDefault(); this._completePayment(); });
        on('closePaymentModalBtn', 'click', () => this._closeModal('paymentModal'));
        on('paymentMethod', 'change', () => this._togglePaymentFields());
        on('cashAmount', 'input', () => this._previewPayment());
        on('transferAmount', 'input', () => this._previewPayment());

        on('closeHeldModalBtn', 'click', () => this._closeModal('heldInvoicesModal'));

        on('closeReceiptModalBtn', 'click', () => this._closeModal('receiptModal'));
        on('skipPrintBtn', 'click', () => this._closeModal('receiptModal'));
        on('printReceiptBtn', 'click', () => this._printReceipt());
        on('thermalPrintBtn', 'click', () => this._printThermal());

        if (this.el.cartItemsContainer) {
            this.el.cartItemsContainer.addEventListener('change', e => this._onCartChange(e));
            this.el.cartItemsContainer.addEventListener('click', e => this._onCartClick(e));
        }

        if (this.el.unitButtons && !this.state._unitButtonsBound) {
            this.el.unitButtons.addEventListener('click', (e) => {
                const btn = e.target.closest('.unit-btn');
                if (btn) this._selectUnit(+btn.dataset.index);
            });
            this.state._unitButtonsBound = true;
        }

        // ربط مودال تكرار الصنف
        on('duplicateIncreaseBtn', 'click', () => {
            if (this._duplicateCallback) {
                this._duplicateCallback(true);
                this._duplicateCallback = null;
            }
            this._closeModal('duplicateProductModal');
        });
        on('duplicateCancelBtn', 'click', () => {
            if (this._duplicateCallback) {
                this._duplicateCallback(false);
                this._duplicateCallback = null;
            }
            this._closeModal('duplicateProductModal');
        });
    },

    _connStatus() {
        const n = document.getElementById('mainNavbar');
        if (n) n.classList.toggle('offline', !navigator.onLine);
        document.body.classList.toggle('offline', !navigator.onLine);
    },

    async _sidebarUser() {
        if (window.App?.getCurrentUser) {
            try {
                const u = await window.App.getCurrentUser();
                this.state.currentUser = u;
                if (u) {
                    if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (u.fullName || 'U')[0].toUpperCase();
                    if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = u.fullName || u.email || 'مدير';
                }
            } catch (e) { /* silent */ }
        }
    },

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
            } else {
                this.state.products = [];
                custs = [];
            }
            this.state.customers = custs.filter(c => c.type === 'customer');
            this.state.products.forEach(p => {
                if (typeof p.units === 'string') try { p.units = JSON.parse(p.units); } catch (e) { p.units = []; }
            });
        } catch (e) {
            console.error('فشل تحميل البيانات:', e);
            this.state.products = [];
            this.state.customers = [];
            window.Toast?.error('فشل تحميل البيانات');
        }
    },

    _buildCache() {
        this.cache.prods.clear(); this.cache.custs.clear(); this.cache.barcode.clear();
        this.state.products.forEach(p => {
            this._updateProductInCache(p);
        });
        this.state.customers.forEach(c => {
            this.cache._setWithLimit(this.cache.custs, String(c.id), c);
            this.cache._setWithLimit(this.cache.custs, c.id, c);
        });
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
                    else this.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
                    this._renderCart();
                    window.Toast?.info('تم تحميل الفاتورة للتعديل');
                }
            }).catch(() => {});
        }
    },

    /* ---------- Virtual Scrolling ---------- */
    _renderProductGrid(products = this.state.products) {
        const grid = this.el.productGrid;
        if (!grid) return;
        if (!products.length) {
            grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">لا توجد منتجات</div>';
            return;
        }
        if (this.state._observer) this.state._observer.disconnect();
        grid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const cardsPerBatch = 20;
        let currentBatch = 0;

        const renderBatch = () => {
            const start = currentBatch * cardsPerBatch;
            const end = Math.min(start + cardsPerBatch, products.length);
            for (let i = start; i < end; i++) {
                const p = products[i];
                const stock = p.units?.[0]?.stock || 0;
                const price = p.units?.[0]?.price || 0;
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.id = p.id;
                card.innerHTML = `<div style="font-weight:700;font-size:0.9rem;margin-bottom:4px;">${U.escape(p.name)}</div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);">${U.fmtMoney(price)}</div>
                    <div style="font-size:0.7rem;color:${stock > 0 ? 'var(--success)' : 'var(--danger)'};">${stock > 0 ? 'متوفر: ' + stock : 'نفذ'}</div>`;
                fragment.appendChild(card);
            }
            grid.appendChild(fragment);
            currentBatch++;
            if (end < products.length) {
                const sentinel = document.createElement('div');
                sentinel.className = 'scroll-sentinel';
                grid.appendChild(sentinel);
                this.state._observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        this.state._observer.disconnect();
                        grid.removeChild(sentinel);
                        renderBatch();
                    }
                }, { root: grid, rootMargin: '100px' });
                this.state._observer.observe(sentinel);
            }
        };
        renderBatch();
    },

    _filterTabletProducts() {
        const term = (this.el.tabletProductSearchInput?.value || '').trim().toLowerCase();
        if (!term) { this._renderProductGrid(); return; }
        const filtered = this.state.products.filter(p => p.name?.toLowerCase().includes(term) || p.barcode === term || p.code === term);
        this._renderProductGrid(filtered);
    },

    _filterCustomers() {
        const term = this.el.customerSearchInput?.value.trim().toLowerCase() || '';
        const dd = this.el.customerDropdown; if (!dd) return;
        let list = this.state.customers;
        if (term && term !== CASH_CUSTOMER_LABEL) list = list.filter(c => c.name?.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)));
        let html = `<div class="dropdown-item" data-id="cash"><div class="item-info"><h4>${CASH_CUSTOMER_LABEL}</h4></div></div>`;
        list.forEach(c => {
            const bal = c.balance || 0;
            const col = bal > 0 ? U.cssVar('--success', '#10b981') : bal < 0 ? U.cssVar('--danger', '#ef4444') : U.cssVar('--text-muted', '#94a3b8');
            const sign = bal > 0 ? `دائن ${U.fmtMoney(bal)}` : bal < 0 ? `مدين ${U.fmtMoney(-bal)}` : 'لا رصيد';
            html += `<div class="dropdown-item" data-id="${c.id}"><div class="item-info"><h4>${U.escape(c.name)}</h4><small style="color:${col};">${sign}</small></div><div class="item-price">${c.phone||''}</div></div>`;
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

    _filterProducts() {
        const term = this.el.productSearchInput?.value.trim().toLowerCase() || '';
        const dd = this.el.productDropdown; if (!dd) return;
        if (!term) { dd.classList.remove('show'); return; }
        if (!this.state.products.length) {
            dd.innerHTML = '<div class="dropdown-item" style="color:var(--danger);text-align:center;">⚠️ لا توجد منتجات</div>';
            dd.classList.add('show');
            return;
        }
        const filtered = this.state.products.filter(p => p.name?.toLowerCase().includes(term) || p.barcode === term || p.code === term);
        dd.innerHTML = filtered.length ? filtered.map(p => `<div class="dropdown-item" data-id="${p.id}"><div class="item-info"><h4>${U.escape(p.name)}</h4></div><div class="item-price">${U.fmtMoney(p.units[0]?.price||0)}</div></div>`).join('') : '<div class="dropdown-item" style="color:var(--text-muted);">لا توجد نتائج</div>';
        dd.classList.add('show');
    },
    _hideProdDropdown() { this.el.productDropdown?.classList.remove('show'); },

    /* ---------- Barcode Scanner (كاميرا + Buffer) ---------- */
    _stopBarcodeScan() {
        if (this.state._barcodeStream) {
            this.state._barcodeStream.getTracks().forEach(t => t.stop());
            this.state._barcodeStream = null;
        }
        if (this.state._barcodeAnimFrame) {
            cancelAnimationFrame(this.state._barcodeAnimFrame);
            this.state._barcodeAnimFrame = null;
        }
        if (this._barcodeVideo) {
            this._barcodeVideo.remove();
            this._barcodeVideo = null;
        }
    },
    _scanBarcode() {
        this._stopBarcodeScan();
        if (!('BarcodeDetector' in window)) { window.Toast?.error('المتصفح لا يدعم مسح الباركود'); return; }
        const video = document.createElement('video'); 
        video.setAttribute('playsinline', ''); 
        video.style.display = 'none';
        document.body.appendChild(video);
        this._barcodeVideo = video;

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(stream => {
            this.state._barcodeStream = stream;
            video.srcObject = stream; 
            video.play();
            const detector = new BarcodeDetector({ formats: ['ean_13','ean_8','code_128','qr_code'] });
            const scan = async () => {
                if (video.readyState >= 2) {
                    try {
                        const barcodes = await detector.detect(video);
                        if (barcodes.length) {
                            this._stopBarcodeScan();
                            this._searchBarcode(barcodes[0].rawValue);
                            return;
                        }
                    } catch {}
                }
                this.state._barcodeAnimFrame = requestAnimationFrame(scan);
            };
            this.state._barcodeAnimFrame = requestAnimationFrame(scan);
            window.Toast?.info('وجّه الكاميرا نحو الباركود');
        }).catch(() => { 
            window.Toast?.error('تعذر الوصول للكاميرا'); 
            this._stopBarcodeScan();
        });
    },
    _searchBarcode(code) {
        const found = this.cache.barcode.get(code);
        if (found) {
            this._openUnitModal(found.id);
        } else {
            this.el.productSearchInput.value = code;
            this._filterProducts();
        }
    },

    openReturn() {
        window.location.href = './sales-returns.html';
    },

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
        if (this.el.profitDisplay) {
            if (this.state.currentUser?.role === 'admin' && this.state.cart.length > 0) {
                let totalCost = 0;
                for (const i of this.state.cart) totalCost += (i.cost || 0) * i.quantity;
                const profit = sub - totalCost;
                this.el.profitDisplay.style.display = 'block';
                this.el.profitDisplay.textContent = `الربح المتوقع: ${U.fmtMoney(profit)}`;
            } else {
                this.el.profitDisplay.style.display = 'none';
            }
        }
    },
    _renderCart() {
        const c = this.el.cartItemsContainer; if (!c) return;
        if (!this._cartRendered) {
            c.innerHTML = `<div class="cart-header-row"><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span></span></div>`;
            this._cartRendered = true;
        }
        const existingRows = c.querySelectorAll('.cart-item-row');
        existingRows.forEach(r => r.remove());
        const emptyMsg = c.querySelector('.empty-cart-message');
        if (emptyMsg) emptyMsg.remove();

        if (!this.state.cart.length) {
            c.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>');
            this._updateTotals(); return;
        }
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
    _resetCartRender() { this._cartRendered = false; },

    _canChangePrice() {
        return this.state.currentUser?.role === 'admin';
    },

    _onCartChange(e) {
        if (e.target.classList.contains('cart-price-input')) {
            if (!this._canChangePrice()) { window.Toast?.error('ليس لديك صلاحية لتعديل السعر'); this._renderCart(); return; }
            const idx = +e.target.dataset.idx, p = +e.target.value;
            if (!isNaN(p) && p >= 0) {
                const oldPrice = this.state.cart[idx].price;
                this.state.cart[idx].price = p;
                this._logActivity('تعديل سعر', `${this.state.cart[idx].productName} من ${oldPrice} إلى ${p}`);
            }
            this._renderCart(); this._saveCart();
        } else if (e.target.classList.contains('cart-qty-input')) {
            const idx = +e.target.dataset.idx, q = +e.target.value;
            if (isNaN(q) || q <= 0) this.state.cart.splice(idx, 1);
            else this.state.cart[idx].quantity = q;
            this._renderCart(); this._saveCart();
        }
    },
    _onCartClick(e) {
        if (e.target.closest('.fa-trash')) {
            const idx = +e.target.closest('.fa-trash').dataset.idx;
            const removed = this.state.cart[idx];
            this.state.cart.splice(idx, 1);
            this._logActivity('حذف صنف', `${removed.productName} من السلة`);
            this._renderCart(); this._saveCart();
        }
    },

    /* ---------- Modal الوحدات (مع مودال التكرار) ---------- */
    _openUnitModal(id) {
        const p = this.cache.prods.get(String(id)); if (!p?.units?.length) { window.Toast?.info('المنتج غير موجود'); return; }
        this.state.selectedProduct = p; this.state.selectedUnit = p.units[0];
        this.el.modalProductName.textContent = p.name;
        this.el.unitButtons.innerHTML = p.units.map((u, i) => `<button class="unit-btn ${i===0?'active':''}" data-index="${i}">${U.escape(u.name)}</button>`).join('');
        this._updateUnitInfo(); this._showModal('unitQuantityModal');
    },
    _selectUnit(i) {
        this.state.selectedUnit = this.state.selectedProduct.units[i];
        this.el.unitButtons.querySelectorAll('.unit-btn').forEach((b, j) => b.classList.toggle('active', j===i));
        this._updateUnitInfo();
    },
    _updateUnitInfo() {
        const p = this.state.selectedProduct, u = this.state.selectedUnit; if (!p||!u) return;
        const base = p.units[0], stock = base.stock || 0, fac = u.factor || 1;
        const avail = u === base ? stock : Math.floor(stock / fac);
        const max = Math.max(0, avail);
        this.el.selectedPrice.value = u.price || 0;
        this.el.selectedQuantity.max = max; this.el.selectedQuantity.value = max > 0 ? 1 : 0;
        this.el.stockInfo.textContent = `المخزون: ${max} ${u.name}`;
        this.el.priceLimitMsg.style.display = (u.minPrice || u.maxPrice) ? 'block' : 'none';
        if (u.minPrice || u.maxPrice) this.el.priceLimitMsg.textContent = `السعر بين ${u.minPrice || 0} - ${u.maxPrice || '∞'} ج.م`;
    },
    _addToCart() {
        if (this.state.addingItem) return;
        this.state.addingItem = true;
        try {
            const q = +this.el.selectedQuantity?.value || 0, max = +this.el.selectedQuantity?.max || 0;
            if (q <= 0 || q > max) { window.Toast?.error('كمية غير متاحة'); return; }
            const u = this.state.selectedUnit;
            let pr = +this.el.selectedPrice?.value || 0;
            if (!this._canChangePrice()) pr = u?.price || 0;
            if (u) {
                if (u.minPrice > 0 && pr < u.minPrice) { window.Toast?.error(`لا يمكن أقل من ${U.fmtMoney(u.minPrice)}`); return; }
                if (u.maxPrice > 0 && pr > u.maxPrice) { window.Toast?.error(`لا يمكن أعلى من ${U.fmtMoney(u.maxPrice)}`); return; }
            }
            const product = this.state.selectedProduct;
            const unitName = u?.name || '';
            const cost = u?.cost || 0;

            // التحقق من تكرار الصنف
            const exist = this.state.cart.find(i => i.productId === product.id && i.unitName === unitName);
            if (exist) {
                this.el.duplicateProductMsg.textContent = `الصنف ${product.name} موجود بالفعل بالكمية ${exist.quantity}. هل تريد زيادة الكمية؟`;
                this._duplicateCallback = (confirmed) => {
                    if (confirmed) {
                        exist.quantity = U.round(exist.quantity + q, 3);
                        if (pr) exist.price = pr;
                        this._renderCart(); this._saveCart();
                    }
                    this.state.addingItem = false;
                    this._closeModal('unitQuantityModal');
                };
                this._showModal('duplicateProductModal');
                return;
            }

            if (this.el.addToCartBtn) this.el.addToCartBtn.disabled = true;
            this.state.cart.push({
                productId: product.id,
                productName: product.name,
                unitName,
                quantity: q,
                price: pr,
                cost,
                factor: u?.factor || 1,
                isBase: u === product.units[0]
            });
            this._renderCart(); this._closeModal('unitQuantityModal'); this._saveCart();
            this.el.productSearchInput?.focus();
            this.el.productSearchInput?.select();
        } finally {
            this.state.addingItem = false;
            if (this.el.addToCartBtn) this.el.addToCartBtn.disabled = false;
        }
    },

    _openPayment() {
        if (!this.state.cart.length) { window.Toast?.info('السلة فارغة'); return; }
        const { sub, disc, net } = this._calcTotals();
        this.el.paySubtotal.textContent = U.fmtMoney(sub); this.el.payDiscount.textContent = U.fmtMoney(disc); this.el.payNet.textContent = U.fmtMoney(net);
        const cust = this._getCust(), bal = cust?.balance || 0;
        this.el.currentBalance.textContent = U.fmtMoney(Math.abs(bal));
        this.el.currentBalance.classList.toggle('text-success', bal >= 0); this.el.currentBalance.classList.toggle('text-danger', bal < 0);
        this.el.cashAmount.value = ''; this.el.transferAmount.value = ''; this.el.paymentMethod.value = 'cash';
        this._togglePaymentFields(); this._previewPayment(); this._showModal('paymentModal');
        if (bal < 0) {
            window.Toast?.warning('هذا العميل عليه دين سابق: ' + U.fmtMoney(-bal));
        }
    },
    _togglePaymentFields() {
        const m = this.el.paymentMethod?.value || 'cash';
        this.el.cashField.style.display = (m === 'cash' || m === 'mixed') ? 'block' : 'none';
        this.el.transferField.style.display = (m === 'transfer' || m === 'mixed') ? 'block' : 'none';
        this._previewPayment();
    },
    _previewPayment() {
        const net = this.state.net, m = this.el.paymentMethod?.value || 'cash';
        let cash = 0, trans = 0;
        if (m === 'cash') cash = +this.el.cashAmount?.value || 0;
        else if (m === 'transfer') trans = +this.el.transferAmount?.value || 0;
        else if (m === 'mixed') { cash = +this.el.cashAmount?.value || 0; trans = +this.el.transferAmount?.value || 0; }
        const cust = this._getCust();
        let used = 0;
        if (m !== 'credit' && cust?.balance > 0) used = Math.min(cust.balance, Math.max(0, net - cash - trans));
        this.state.usedBalance = used;
        const paid = U.round(cash + trans + used, 2), diff = U.round(paid - net, 2);
        const newBal = (cust?.balance || 0) - used + diff;
        this.el.remainingDisplay.textContent = diff >= 0 ? `فائض ${U.fmtMoney(diff)}` : `متبقي ${U.fmtMoney(-diff)}`;
        this.el.balanceAfterLabel.textContent = newBal >= 0 ? 'رصيد للعميل بعد الدفع:' : 'رصيد على العميل بعد الدفع:';
        this.el.balanceAfter.textContent = U.fmtMoney(Math.abs(newBal));
        this.el.balanceAfter.classList.toggle('text-success', newBal >= 0); this.el.balanceAfter.classList.toggle('text-danger', newBal < 0);
    },

    async _confirmAction(message) {
        if (window.ModalConfirm) {
            return await ModalConfirm.show({ title: 'تأكيد', message, icon: 'warn', confirmText: 'متابعة', cancelText: 'إلغاء' });
        }
        return confirm(message);
    },

    async _checkStock() {
        let productsToCheck = this.state.products;
        if (navigator.onLine && this.state.db) {
            try {
                const fresh = await DB.getProducts(true);
                if (fresh) productsToCheck = fresh;
            } catch {} // فشل الاتصال، نعتمد على المحلي
        }
        for (const item of this.state.cart) {
            const product = productsToCheck.find(p => p.id === item.productId);
            if (!product) return { ok: false, error: `المنتج ${item.productName} لم يعد متوفراً` };
            const unit = product.units?.find(u => u.name === item.unitName);
            const factor = unit?.factor || 1;
            const required = item.quantity * factor;
            const stock = product.units?.[0]?.stock || 0;
            if (required > stock) return { ok: false, error: `المخزون غير كافٍ للصنف ${item.productName} (المطلوب ${required}، المتوفر ${stock})` };
        }
        return { ok: true, products: productsToCheck };
    },

    _updateLocalStock(products) {
        for (const item of this.state.cart) {
            const product = products?.find(p => p.id === item.productId) || this.cache.prods.get(item.productId);
            if (!product?.units?.length) continue;
            const baseUnit = product.units[0];
            const selectedUnit = product.units.find(u => u.name === item.unitName);
            const factor = selectedUnit?.factor || 1;
            const reduction = item.unitName === baseUnit.name ? item.quantity : item.quantity * factor;
            baseUnit.stock = Math.max(0, (baseUnit.stock || 0) - reduction);
            this._updateProductInCache(product);
        }
    },

    async _completePayment() {
        if (this.state.busy) { window.Toast?.info('جاري المعالجة...'); return; }
        this.state.busy = true; this.el.confirmAndPrintBtn.disabled = true;
        try {
            const { sub, disc, net } = this._calcTotals(), m = this.el.paymentMethod?.value || 'cash';
            let cash = 0, trans = 0;
            if (m === 'cash') cash = +this.el.cashAmount?.value || 0;
            else if (m === 'transfer') trans = +this.el.transferAmount?.value || 0;
            else if (m === 'mixed') { cash = +this.el.cashAmount?.value || 0; trans = +this.el.transferAmount?.value || 0; }
            const used = (m === 'credit') ? 0 : this.state.usedBalance || 0;
            const paid = (m === 'credit') ? 0 : U.round(cash + trans + used, 2);
            const diff = (m === 'credit') ? -net : U.round(paid - net, 2);
            const cust = this._getCust(), oldBal = cust?.balance || 0;

            if (diff > 0 && cust && !await this._confirmAction(`سيتم إضافة ${U.fmtMoney(diff)} إلى رصيد العميل. متابعة؟`)) {
                this.state.busy = false; this.el.confirmAndPrintBtn.disabled = false; return;
            }
            if (m === 'credit' && cust && !await this._confirmAction(`سيتم تسجيل كامل المبلغ ${U.fmtMoney(net)} كدين على العميل. متابعة؟`)) {
                this.state.busy = false; this.el.confirmAndPrintBtn.disabled = false; return;
            }

            // فحص المخزون
            const stockCheck = await this._checkStock();
            if (!stockCheck.ok) throw new Error(stockCheck.error);

            const invNum = this.state.db ? await DB.generateInvoiceNumber() : this._localInvNum();
            const inv = {
                id: U.uuid(), invoice_number: invNum, date: U.today(),
                customer_id: this.state.selectedCustomerId || null, customer_name: cust?.name || CASH_CUSTOMER_STORED,
                items: this.state.cart.map(i => ({...i})),
                subtotal: sub, discount: disc, total: net,
                cash_paid: cash, transfer_paid: trans, used_customer_balance: used,
                paid, remaining: diff >= 0 ? 0 : -diff,
                customer_credit_added: diff > 0 ? diff : 0,
                change_amount: diff > 0 ? diff : 0,
                status: m === 'credit' ? 'credit' : (diff >= 0 ? 'paid' : 'partial'),
                notes: this.el.paymentNotes?.value || '',
                tenant_id: this.state.currentUser?.tenant_id,
                created_by: this.state.currentUser?.id
            };

            if (this.state.editingInv) inv.original_invoice_id = this.state.editingInv;

            let result;
            if (navigator.onLine && this.state.db) {
                result = this.state.editingInv && DB.editSaleInvoice
                    ? await DB.editSaleInvoice(inv)
                    : await DB.createSaleInvoice(inv);
            } else {
                if (window.localDB?.ready) {
                    await window.localDB.put('offline_sales', { ...inv, _offline: true });
                    this.state._offlineSales.push({ ...inv, _offline: true });
                    result = { success: true, invoice_number: inv.invoice_number };
                } else {
                    throw new Error('غير متصل ولا توجد قاعدة بيانات محلية');
                }
            }

            if (!result?.success) throw new Error(result?.error || 'فشل');

            if (this.state.resumedInvoiceId) {
                try { await window.supabaseClient.from('invoices').delete().eq('id', this.state.resumedInvoiceId); } catch {}
                this.state.resumedInvoiceId = null;
            }

            this._closeModal('paymentModal');
            this._updateLocalStock(stockCheck.products);
            this._renderProductGrid();
            this._showReceipt({ ...inv, invoice_number: result.invoice_number || inv.invoice_number }, cust || { name: CASH_CUSTOMER_STORED, balance: 0 }, this.state.cart, { sub, disc, net }, oldBal, { cash, trans, used, diff });
            this._resetCart(); this.state.editingInv = null; this._resetCartRender();
            localStorage.removeItem('payment_draft');
            this._logActivity('بيع', `فاتورة ${inv.invoice_number} بقيمة ${net}`);
            window.Toast?.success('تم البيع');
        } catch (e) { console.error(e); window.Toast?.error(e.message); }
        finally { this.state.busy = false; this.el.confirmAndPrintBtn.disabled = false; }
    },
    _localInvNum() {
        const y = new Date().getFullYear().toString().slice(-2);
        const k = `inv_counter_${y}`;
        let n = (parseInt(localStorage.getItem(k) || '0', 10) + 1);
        localStorage.setItem(k, String(n));
        return y + '-' + String(n).padStart(4, '0');
    },
    _resetCart() {
        this.state.cart = []; this.state.selectedCustomerId = null; this.state.discountValue = 0; this.state.discountType = 'amount'; this.state.usedBalance = 0; this.state.editingInv = null; this.state.resumedInvoiceId = null;
        if (this.el.discountValue) this.el.discountValue.value = 0;
        if (this.el.discountType) this.el.discountType.value = 'amount';
        if (this.el.customerSearchInput) { this.el.customerSearchInput.value = ''; this._updateCustDisplay(); }
        if (this.el.profitDisplay) this.el.profitDisplay.style.display = 'none';
        this._renderCart(); this._resetCartRender();
        localStorage.removeItem('pos_cart');
    },
    _getCust() { return this.state.selectedCustomerId ? this.cache.custs.get(this.state.selectedCustomerId) : null; },

    /* ---------- Activity Log ---------- */
    _logActivity(action, details) {
        const entry = { action, details, user: this.state.currentUser?.fullName, time: new Date().toISOString() };
        this.state._activityLog.push(entry);
        console.log('ACTIVITY:', entry);
    },

    /* ---------- Offline Queue ---------- */
    async _syncOfflineSales() {
        if (!navigator.onLine || !this.state.db) return;
        const local = window.localDB;
        if (!local?.ready) return;
        const offlineSales = await local.getAll('offline_sales').catch(() => []);
        for (const sale of offlineSales) {
            try {
                sale._offline = undefined;
                await DB.createSaleInvoice(sale);
                await local.delete('offline_sales', sale.id);
            } catch (e) {
                console.warn('فشل مزامنة بيع Offline', e);
            }
        }
    },

    /* ---------- Crash Recovery ---------- */
    _savePaymentDraft() {
        if (!this.state.cart.length) return;
        const draft = {
            cart: this.state.cart,
            customerId: this.state.selectedCustomerId,
            discountValue: this.state.discountValue,
            discountType: this.state.discountType,
            usedBalance: this.state.usedBalance,
            editingInv: this.state.editingInv,
            resumedInvoiceId: this.state.resumedInvoiceId,
            paymentMethod: this.el.paymentMethod?.value,
            paymentNotes: this.el.paymentNotes?.value,
            cashAmount: this.el.cashAmount?.value,
            transferAmount: this.el.transferAmount?.value,
            modalOpen: this.el.paymentModal?.classList.contains('open')
        };
        localStorage.setItem('payment_draft', JSON.stringify(draft));
    },
    _restorePaymentDraft() {
        const raw = localStorage.getItem('payment_draft');
        if (!raw) return;
        try {
            const d = JSON.parse(raw);
            if (d.cart && d.cart.length) {
                // انتظر تحميل البيانات إذا لم تكن جاهزة
                const restoreFn = async () => {
                    if (!this.state.products.length) await this._loadData();
                    this.state.cart = d.cart;
                    this.state.selectedCustomerId = d.customerId;
                    this.state.discountValue = d.discountValue || 0;
                    this.state.discountType = d.discountType || 'amount';
                    this.state.usedBalance = d.usedBalance || 0;
                    this.state.editingInv = d.editingInv;
                    this.state.resumedInvoiceId = d.resumedInvoiceId;
                    this._renderCart();
                    if (d.customerId) {
                        const c = this.cache.custs.get(String(d.customerId));
                        if (c && this.el.customerSearchInput) this.el.customerSearchInput.value = c.name || '';
                        this._updateCustDisplay();
                    } else if (this.el.customerSearchInput) {
                        this.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
                    }
                    if (d.modalOpen) {
                        setTimeout(() => {
                            this._openPayment();
                            if (d.paymentMethod && this.el.paymentMethod) this.el.paymentMethod.value = d.paymentMethod;
                            if (d.paymentNotes && this.el.paymentNotes) this.el.paymentNotes.value = d.paymentNotes;
                            if (d.cashAmount && this.el.cashAmount) this.el.cashAmount.value = d.cashAmount;
                            if (d.transferAmount && this.el.transferAmount) this.el.transferAmount.value = d.transferAmount;
                            this._togglePaymentFields();
                            this._previewPayment();
                        }, 500);
                    }
                };
                if (confirm('تم العثور على عملية بيع غير مكتملة. هل تريد استكمالها؟')) {
                    setTimeout(restoreFn, 100);
                } else {
                    localStorage.removeItem('payment_draft');
                }
            }
        } catch (e) { localStorage.removeItem('payment_draft'); }
    },

    async holdInvoice() {
        if (!this.state.cart.length) { window.Toast?.info('السلة فارغة'); return; }
        const { sub, disc, net } = this._calcTotals();
        const inv = {
            id: U.uuid(), invoice_number: this.state.db ? await DB.generateInvoiceNumber() : this._localInvNum(),
            type: 'sale', date: U.today(), customer_id: this.state.selectedCustomerId || null,
            customer_name: this._getCust()?.name || CASH_CUSTOMER_STORED,
            items: this.state.cart.map(i => ({...i})),
            subtotal: sub, discount: disc, total: net, paid: 0, remaining: net, status: 'held', notes: 'معلقة',
            tenant_id: this.state.currentUser?.tenant_id, created_by: this.state.currentUser?.id
        };
        try {
            if (this.state.db) await DB.saveInvoice(inv); else if (U.localReady()) await localDB.put('invoices', inv);
            window.Toast?.success(`تم تعليق ${inv.invoice_number}`); this._resetCart();
        } catch (e) { window.Toast?.error('فشل التعليق'); }
    },
    async loadHeld() {
        let invs = [];
        try {
            if (this.state.db && DB.getHeldInvoices) invs = await DB.getHeldInvoices() || [];
            else if (this.state.db) invs = (await DB.getInvoices()).filter(i => i.type === 'sale' && i.status === 'held');
            else if (U.localReady()) invs = (await localDB.getAll('invoices')).filter(i => i.type === 'sale' && i.status === 'held');
        } catch { }
        const c = this.el.heldInvoicesList; if (!c) return;
        c.innerHTML = invs.length ? invs.map(i => `<div class="held-invoice-item" data-id="${i.id}" style="padding:15px;border:1px solid ${U.cssVar('--border-light', '#e2e8f0')};border-radius:12px;margin-bottom:10px;cursor:pointer;display:flex;justify-content:space-between;"><div><strong>${U.escape(i.invoice_number || i.id?.substring(0, 8))}</strong><br>${U.escape(i.customer_name || CASH_CUSTOMER_STORED)} - ${U.fmtMoney(i.total)}</div><div><i class="fas fa-play"></i></div></div>`).join('') : '<p style="text-align:center;">لا توجد فواتير معلقة</p>';
        c.querySelectorAll('.held-invoice-item').forEach(el => el.addEventListener('click', () => this._resumeInvoice(el.dataset.id)));
        this._showModal('heldInvoicesModal');
    },
    async _resumeInvoice(id) {
        let inv;
        try {
            if (this.state.db) inv = await DB.getInvoiceById(id);
            else if (U.localReady()) inv = await localDB.getById('invoices', id);
        } catch { }
        if (!inv) { window.Toast?.error('غير موجودة'); return; }
        this.state.resumedInvoiceId = id;
        try {
            if (this.state.db) await window.supabaseClient.from('invoices').update({ status: 'resumed' }).eq('id', id);
            else if (U.localReady()) await localDB.put('invoices', { ...inv, status: 'resumed' });
        } catch { }
        const validItems = [];
        const missingItems = [];
        for (const it of (inv.items || [])) {
            const p = this.cache.prods.get(String(it.productId));
            if (p) validItems.push(it);
            else missingItems.push(it.productName || it.productId);
        }
        this.state.cart = validItems.map(i => ({...i}));
        this.state.selectedCustomerId = inv.customer_id;
        if (inv.customer_id) { 
            const c = this.cache.custs.get(String(inv.customer_id)); 
            if (c) this.el.customerSearchInput.value = c.name || ''; 
            this._updateCustDisplay(); 
        } else { 
            this.el.customerSearchInput.value = CASH_CUSTOMER_LABEL; 
            this._updateCustDisplay(); 
        }
        this._renderCart(); 
        this._closeModal('heldInvoicesModal');
        if (missingItems.length) {
            window.Toast?.warning(`بعض الأصناف لم تعد متوفرة: ${missingItems.join('، ')}`);
        }
        window.Toast?.success('تم الاسترجاع');
    },

    /* ---------- الإيصال (مع خيار الطباعة الحرارية) ---------- */
    _showReceipt(inv, cust, items, totals, oldBal, pay) {
        const s = JSON.parse(localStorage.getItem('app_settings') || '{}'), name = s?.company?.name || 'حسابي', phone = s?.company?.phone || '', foot = s?.print?.footer_message || 'شكراً لتعاملكم معنا';
        const fmt = v => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const used = pay.used || 0, diff = pay.diff || 0;
        const newBalance = (oldBal || 0) - used + diff;
        let itemsHtml = '';
        for (const it of items) {
            const lineTotal = U.round(it.price * it.quantity, 2);
            itemsHtml += `<tr><td style="text-align:right;">${U.escape(it.productName)} - ${U.escape(it.unitName)}</td><td style="text-align:center;">${it.quantity}</td><td style="text-align:center;">${fmt(it.price)}</td><td style="text-align:left;">${fmt(lineTotal)}</td></tr>`;
        }
        const receiptHtml = `<div style="font-family:'Cairo',sans-serif;font-size:13px;line-height:1.5;text-align:right;direction:rtl;padding:10px;width:80mm;max-width:100%;margin:0 auto;background:white;"><div style="text-align:center;font-weight:bold;font-size:16px;margin-bottom:5px;">${U.escape(name)}</div>${phone ? `<div style="text-align:center;font-size:12px;margin-bottom:10px;">هاتف: ${U.escape(phone)}</div>` : ''}<hr style="border-top:1px dashed #000;margin:10px 0;"><div style="display:flex;justify-content:space-between;"><span>العميل:</span> <strong>${U.escape(cust?.name || CASH_CUSTOMER_STORED)}</strong></div><div style="display:flex;justify-content:space-between;"><span>رقم الفاتورة:</span> <strong>${U.escape(inv.invoice_number || inv.id?.substring(0, 8))}</strong></div><div style="display:flex;justify-content:space-between;"><span>التاريخ:</span> ${U.fmtDate(inv.date)}</div><hr style="border-top:1px dashed #000;margin:10px 0;"><table style="width:100%;border-collapse:collapse;font-size:12px;"><thead><tr><th style="text-align:right;">الصنف</th><th style="text-align:center;">كمية</th><th style="text-align:center;">سعر</th><th style="text-align:left;">إجمالي</th></tr></thead><tbody>${itemsHtml}</tbody></table><hr style="border-top:1px dashed #000;margin:10px 0;"><div style="display:flex;justify-content:space-between;font-weight:bold;"><span>الإجمالي:</span> ${fmt(totals.sub)}</div>${totals.disc > 0 ? `<div style="display:flex;justify-content:space-between;"><span>الخصم:</span> ${fmt(totals.disc)}</div>` : ''}<div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;"><span>الصافي:</span> ${fmt(totals.net)}</div><hr style="border-top:1px dashed #000;margin:10px 0;"><div style="display:flex;justify-content:space-between;"><span>نقدي:</span> ${fmt(pay.cash || 0)}</div><div style="display:flex;justify-content:space-between;"><span>تحويل:</span> ${fmt(pay.trans || 0)}</div>${used > 0 ? `<div style="display:flex;justify-content:space-between;"><span>من رصيد:</span> ${fmt(used)}</div>` : ''}<div style="display:flex;justify-content:space-between;font-weight:bold;"><span>المدفوع:</span> ${fmt(U.round((pay.cash || 0) + (pay.trans || 0) + used, 2))}</div>${diff > 0 ? `<div style="display:flex;justify-content:space-between;color:green;"><span>فائض (أضيف للرصيد):</span> ${fmt(diff)}</div>` : ''}${diff < 0 ? `<div style="display:flex;justify-content:space-between;color:red;"><span>متبقي:</span> ${fmt(-diff)}</div>` : ''}${cust && cust.name !== CASH_CUSTOMER_STORED ? `<hr style="border-top:1px dashed #000;margin:10px 0;"><div style="display:flex;justify-content:space-between;"><span>الرصيد السابق:</span> ${fmt(oldBal)}</div>${used > 0 ? `<div style="display:flex;justify-content:space-between;"><span>خصم:</span> -${fmt(used)}</div>` : ''}${diff > 0 ? `<div style="display:flex;justify-content:space-between;color:green;"><span>إضافة:</span> +${fmt(diff)}</div>` : ''}${diff < 0 ? `<div style="display:flex;justify-content:space-between;color:red;"><span>متبقي للدفع:</span> ${fmt(-diff)}</div>` : ''}<div style="display:flex;justify-content:space-between;font-weight:bold;"><span>الرصيد الحالي:</span> ${fmt(newBalance)}</div>` : ''}<hr style="border-top:1px dashed #000;margin:10px 0;"><div style="text-align:center;font-weight:bold;">${U.escape(foot)}</div></div>`;
        this.el.receiptPrintArea.innerHTML = receiptHtml;
        this._showModal('receiptModal');
    },

    _printReceipt() {
        const content = this.el.receiptPrintArea.innerHTML;
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (printWindow) {
            printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl;text-align:right;background:white;display:flex;justify-content:center;padding:10px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${content}</body></html>`);
            printWindow.document.close(); printWindow.focus(); setTimeout(() => { printWindow.print(); }, 300);
        } else {
            const iframe = document.createElement('iframe'); iframe.style.display = 'none';
            document.body.appendChild(iframe);
            iframe.contentDocument.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-family:'Cairo',sans-serif;direction:rtl}</style></head><body>${content}</body></html>`);
            iframe.contentDocument.close(); iframe.contentWindow.focus(); iframe.contentWindow.print();
            setTimeout(() => { document.body.removeChild(iframe); }, 1000);
        }
    },

    async _printThermal() {
        try {
            if (!window.escpos) {
                window.Toast?.error('مكتبة الطباعة الحرارية غير محملة');
                return;
            }
            const device = await navigator.usb.requestDevice({ filters: [] });
            await device.open();
            await device.selectConfiguration(1);
            await device.claimInterface(0);

            const encoder = new escpos.Encoder();
            const receipt = this.el.receiptPrintArea.innerText;
            encoder
                .align('ct')
                .size(1, 1)
                .text('حسابي')
                .text('---------------------')
                .align('rt')
                .text(receipt)
                .cut('partial');

            const data = encoder.encode();
            await device.transferOut(1, data);
            await device.close();
            window.Toast?.success('تمت الطباعة');
        } catch (e) {
            console.error(e);
            window.Toast?.error('فشلت الطباعة الحرارية');
        }
    },

    _saveCart() {
        const state = {
            cart: this.state.cart,
            cust: this.state.selectedCustomerId,
            discType: this.state.discountType,
            discVal: this.state.discountValue,
            editingInv: this.state.editingInv,
            usedBalance: this.state.usedBalance,
            paymentMethod: this.el.paymentMethod?.value,
            paymentNotes: this.el.paymentNotes?.value,
            resumedInvoiceId: this.state.resumedInvoiceId,
            ts: Date.now()
        };
        if (this.state.cart.length || state.editingInv) {
            localStorage.setItem('pos_cart', JSON.stringify(state));
        } else {
            localStorage.removeItem('pos_cart');
        }
    },
    _restoreCart() {
        const s = localStorage.getItem('pos_cart'); if (!s) return;
        try {
            const d = JSON.parse(s);
            if (d.ts && Date.now() - d.ts > 2 * 60 * 60 * 1000) { localStorage.removeItem('pos_cart'); return; }
            this.state.cart = d.cart || [];
            this.state.selectedCustomerId = d.cust;
            this.state.discountType = d.discType || 'amount';
            this.state.discountValue = d.discVal || 0;
            this.state.editingInv = d.editingInv;
            this.state.usedBalance = d.usedBalance || 0;
            this.state.resumedInvoiceId = d.resumedInvoiceId || null;
            if (d.paymentMethod && this.el.paymentMethod) this.el.paymentMethod.value = d.paymentMethod;
            if (d.paymentNotes && this.el.paymentNotes) this.el.paymentNotes.value = d.paymentNotes;
            this._renderCart();
            if (d.cust) { const c = this.cache.custs.get(String(d.cust)); if (c) this.el.customerSearchInput.value = c.name || ''; this._updateCustDisplay(); }
        } catch { localStorage.removeItem('pos_cart'); }
    },

    _closeAllModals() {
        ['paymentModal','unitQuantityModal','heldInvoicesModal','receiptModal','duplicateProductModal'].forEach(id => this._closeModal(id));
    },

    _showModal(id) { const m = this.el[id]; if (m) m.classList.add('open'); },
    _closeModal(id) { const m = this.el[id]; if (m) m.classList.remove('open'); }
};

window.POS = POS;
