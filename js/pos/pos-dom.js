'use strict';
(function() {
    const POS = window.POS;
    POS._cacheDOM = function() {
        const ids = ['menuToggle','sidebar','sidebarOverlay','moreMenuBtn','moreDropdown','holdInvoiceBtn','heldInvoicesBtn','logoutBtn','returnSaleBtn','productSearchInput','customerSearchInput','customerBalanceDisplay','productDropdown','customerDropdown','barcodeScannerBtn','cartItemsContainer','discountValue','discountType','itemTypesCount','totalPieces','subtotal','netTotal','payBtn','unitQuantityModal','modalProductName','unitButtons','selectedQuantity','selectedPrice','stockInfo','addToCartBtn','closeUnitModalBtn','priceLimitMsg','paymentModal','paySubtotal','payDiscount','payNet','currentBalance','paymentMethod','cashField','transferField','cashAmount','transferAmount','remainingDisplay','balanceAfterLabel','balanceAfter','paymentNotes','confirmAndPrintBtn','closePaymentModalBtn','heldInvoicesModal','heldInvoicesList','closeHeldModalBtn','receiptModal','receiptPrintArea','printReceiptBtn','thermalPrintBtn','skipPrintBtn','closeReceiptModalBtn','sidebarAvatar','sidebarUserName','tabletProductSearchInput','productGrid','tabletBarcodeBtn','profitDisplay','todaySales','todayCount','duplicateProductModal','duplicateProductMsg','duplicateIncreaseBtn','duplicateCancelBtn','quickSaleToggle','speechSearchBtn'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) POS.el[id] = el; });
    };
    POS._applySafeArea = function() {
        const safeBottom = 'env(safe-area-inset-bottom, 0px)';
        const footer = document.querySelector('.cart-footer');
        if (footer) footer.style.paddingBottom = `calc(10px + ${safeBottom})`;
    };
    POS._renderProductGrid = function(products = POS.state.products) {
        const grid = POS.el.productGrid; if (!grid) return;
        if (!products || products.length === 0) {
            grid.innerHTML = `<div style="padding:30px;text-align:center;color:var(--text-muted);grid-column:1/-1;"><i class="fas fa-box-open" style="font-size:3rem;display:block;margin-bottom:12px;"></i><p>لا توجد منتجات</p></div>`;
            return;
        }
        if (POS.state._observer) POS.state._observer.disconnect();
        grid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        let currentBatch = 0;
        const cardsPerBatch = 20;
        const renderBatch = () => {
            const start = currentBatch * cardsPerBatch;
            const end = Math.min(start + cardsPerBatch, products.length);
            for (let i = start; i < end; i++) {
                const p = products[i];
                const stock = POS.state.showStock ? (p.units?.[0]?.stock || 0) : null;
                const price = p.units?.[0]?.price || 0;
                const imgHtml = (POS.state.showImages && p.image_url) ? `<img src="${U.escape(p.image_url)}" alt="${U.escape(p.name)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;margin-bottom:4px;">` : '';
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.id = p.id;
                card.innerHTML = `${imgHtml}<div style="font-weight:700;">${U.escape(p.name)}</div><div style="color:var(--text-secondary);">${U.fmtMoney(price)}</div>${POS.state.showStock ? `<div style="font-size:0.7rem;color:${stock > 0 ? 'var(--success)' : 'var(--danger)'};">${stock > 0 ? 'المخزون: ' + stock : 'نفد'}</div>` : ''}`;
                fragment.appendChild(card);
            }
            grid.appendChild(fragment);
            currentBatch++;
            if (end < products.length) {
                const sentinel = document.createElement('div');
                sentinel.className = 'scroll-sentinel';
                grid.appendChild(sentinel);
                POS.state._observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) { POS.state._observer.disconnect(); grid.removeChild(sentinel); renderBatch(); }
                }, { root: grid, rootMargin: '100px' });
                POS.state._observer.observe(sentinel);
            }
        };
        renderBatch();
    };
    POS._renderCart = function() {
        const c = POS.el.cartItemsContainer; if (!c) return;
        if (!POS.state._cartRendered) { c.innerHTML = '<div class="cart-header-row"><span></span><span>الصنف</span><span>الكمية</span><span>السعر</span><span>الإجمالي</span><span>ملاحظة</span><span></span></div>'; POS.state._cartRendered = true; }
        const rows = c.querySelectorAll('.cart-item-row'); rows.forEach(r => r.remove());
        const empty = c.querySelector('.empty-cart-message'); if (empty) empty.remove();
        if (!POS.state.cart.length) { c.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>'); POS._updateTotals(); return; }
        let html = '';
        POS.state.cart.forEach((item, idx) => {
            html += `<div class="cart-item-row" data-cart-idx="${idx}"><div><i class="fas fa-grip-vertical cart-item-drag-handle" style="cursor:grab;margin-left:8px;color:var(--text-muted);"></i></div><div><span>${U.escape(item.productName)}</span><br><span>${U.escape(item.unitName)}</span></div><div><input type="number" value="${item.quantity}" class="cart-qty-input" data-idx="${idx}"></div><div><input type="number" value="${item.price}" class="cart-price-input" data-idx="${idx}"></div><div>${U.fmtMoney(U.round(item.price*item.quantity,2))}</div><div><input type="text" placeholder="ملاحظة" value="${U.escape(item.note||'')}" class="cart-note-input" data-idx="${idx}"></div><div><i class="fas fa-trash" style="color:var(--danger);cursor:pointer;" data-idx="${idx}"></i></div></div>`;
        });
        c.insertAdjacentHTML('beforeend', html);
        POS._updateTotals();
    };
    POS._resetCartRender = function() { POS.state._cartRendered = false; };
    POS._filterProducts = function() {
        const term = (POS.el.productSearchInput?.value||'').trim().toLowerCase();
        const dd = POS.el.productDropdown; if (!dd) return;
        if (!term) { dd.classList.remove('show'); return; }
        if (!POS.state.products.length) { dd.innerHTML = '<div class="dropdown-item">لا توجد منتجات</div>'; dd.classList.add('show'); return; }
        const filtered = POS.state.products.filter(p => (p.name||'').toLowerCase().includes(term) || p.barcode === term || p.code === term);
        dd.innerHTML = filtered.length ? filtered.map(p => `<div class="dropdown-item" data-id="${p.id}"><div class="item-info"><h4>${U.escape(p.name)}</h4></div><div class="item-price">${U.fmtMoney(p.units[0]?.price||0)}</div></div>`).join('') : '<div class="dropdown-item">لا نتائج</div>';
        dd.classList.add('show');
    };
    POS._hideProdDropdown = function() { POS.el.productDropdown?.classList.remove('show'); };
    POS._hideCustDropdown = function() { POS.el.customerDropdown?.classList.remove('show'); };
    POS._showModal = function(id) { const m = POS.el[id]; if (m) m.classList.add('open'); };
    POS._closeModal = function(id) { const m = POS.el[id]; if (m) { m.classList.remove('open'); if (id==='unitQuantityModal') POS._stopBarcodeScan(); } };
    POS._updateCustDisplay = function() {
        const el = POS.el.customerBalanceDisplay; if (!el) return;
        if (!POS.state.selectedCustomerId) { el.innerHTML = ''; return; }
        const c = POS.cache.custs.get(POS.state.selectedCustomerId);
        if (c) { const bal = c.balance||0; el.innerHTML = bal>0?`له ${U.fmtMoney(bal)}`:bal<0?`عليه ${U.fmtMoney(-bal)}`:'لا رصيد'; el.className = `customer-balance ${bal>0?'positive':bal<0?'negative':''}`; }
    };
})();
