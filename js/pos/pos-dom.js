'use strict';
(function() {
    const POS = window.POS;
    POS._cacheDOM = function() {
        const ids = ['menuToggle','sidebar','sidebarOverlay','moreMenuBtn','moreDropdown','actionsBtn','actionsDropdown','holdInvoiceBtn','heldInvoicesBtn','logoutBtn','returnSaleBtn','productSearchInput','customerSearchInput','customerBalanceDisplay','customerDetails','productDropdown','customerDropdown','barcodeScannerBtn','cartItemsContainer','discountValue','discountType','taxRate','shipping','taxAmount','shippingAmount','discountDisplay','itemTypesCount','totalPieces','subtotal','netTotal','payBtn','unitQuantityModal','modalProductName','unitButtons','selectedQuantity','selectedPrice','stockInfo','addToCartBtn','closeUnitModalBtn','priceLimitMsg','paymentModal','paySubtotal','payDiscount','payNet','currentBalance','paymentMethod','cashField','transferField','cashAmount','transferAmount','remainingDisplay','balanceAfterLabel','balanceAfter','paymentNotes','confirmAndPrintBtn','closePaymentModalBtn','heldInvoicesModal','heldInvoicesList','closeHeldModalBtn','receiptModal','receiptPrintArea','printReceiptBtn','thermalPrintBtn','skipPrintBtn','closeReceiptModalBtn','sidebarAvatar','sidebarUserName','headerUserName','headerDate','headerTime','headerInvoiceNumber','headerConnectionStatus','tabletProductSearchInput','productGrid','tabletBarcodeBtn','profitDisplay','todaySales','todayCount','duplicateProductModal','duplicateProductMsg','duplicateIncreaseBtn','duplicateCancelBtn','quickSaleToggle','speechSearchBtn'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) POS.el[id] = el; });
    };
    POS._applySafeArea = function() {
        const safeBottom = 'env(safe-area-inset-bottom, 0px)';
        const footer = document.querySelector('.cart-footer');
        if (footer) footer.style.paddingBottom = `calc(10px + ${safeBottom})`;
    };
    POS._sortProducts = function(products) {
        const sort = POS.state.productSort || 'popular';
        if (sort === 'popular') {
            return [...products].sort((a, b) => (b.sales_count || 0) - (a.sales_count || 0));
        } else if (sort === 'name') {
            return [...products].sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));
        }
        return products;
    };
    POS._renderProductGrid = function(products = POS.state.products) {
        const grid = POS.el.productGrid; if (!grid) return;
        const sorted = POS._sortProducts(products);
        if (!sorted.length) {
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
            const end = Math.min(start + cardsPerBatch, sorted.length);
            for (let i = start; i < end; i++) {
                const p = sorted[i];
                const base = p.units?.[0] || {};
                const stock = base.stock || 0;
                const lowThreshold = POS.state.lowStockThreshold || 5;
                let stockBadge = '';
                if (stock <= 0) stockBadge = '<span class="badge badge-danger">نفد</span>';
                else if (stock <= lowThreshold) stockBadge = `<span class="badge badge-warning">باقي ${stock}</span>`;
                const offerBadge = p.is_on_offer ? '<span class="badge badge-offer">عرض</span>' : '';
                const imgHtml = (POS.state.showImages && p.image_url) ? `<img src="${U.escape(p.image_url)}" alt="${U.escape(p.name)}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;margin-bottom:4px;" loading="lazy">` : '';
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.id = p.id;
                card.innerHTML = `<div class="card-badges">${offerBadge}${stockBadge}</div>${imgHtml}<div style="font-weight:700;">${U.escape(p.name)}</div><div style="color:var(--text-secondary);">${U.fmtMoney(base.price)}</div>${POS.state.showStock ? `<div style="font-size:0.7rem;color:${stock > lowThreshold ? 'var(--success)' : 'var(--danger)'};">${stock > lowThreshold ? 'المخزون: ' + stock : 'نفد'}</div>` : ''}`;
                fragment.appendChild(card);
            }
            grid.appendChild(fragment);
            currentBatch++;
            if (end < sorted.length) {
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
        if (!POS.state._cartRendered) {
            c.innerHTML = '<div class="cart-header-row"><span></span><span>الصنف</span><span>الكمية</span><span>السعر</span><span>خصم</span><span>الإجمالي</span><span></span></div>';
            POS.state._cartRendered = true;
        }
        const rows = c.querySelectorAll('.cart-item-row'); rows.forEach(r => r.remove());
        const empty = c.querySelector('.empty-cart-message'); if (empty) empty.remove();
        if (!POS.state.cart.length) { c.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>'); POS._updateTotals(); return; }
        let html = '';
        POS.state.cart.forEach((item, idx) => {
            const itemDisc = item.discount || 0;
            const itemTotal = U.round(item.price * item.quantity - itemDisc, 2);
            html += `<div class="cart-item-row" data-cart-idx="${idx}"><div><i class="fas fa-grip-vertical cart-item-drag-handle" style="cursor:grab;margin-left:8px;color:var(--text-muted);"></i></div><div><span>${U.escape(item.productName)}</span><br><span>${U.escape(item.unitName)}</span></div><div><input type="number" value="${item.quantity}" class="cart-qty-input" data-idx="${idx}"></div><div><input type="number" value="${item.price}" class="cart-price-input" data-idx="${idx}"></div><div><input type="number" value="${itemDisc}" class="cart-item-discount" data-idx="${idx}" style="width:50px;"></div><div>${U.fmtMoney(itemTotal)}</div><div><i class="fas fa-trash" style="color:var(--danger);cursor:pointer;" data-idx="${idx}"></i></div></div>`;
        });
        c.insertAdjacentHTML('beforeend', html);
        POS._updateTotals();
    };
    POS._resetCartRender = function() { POS.state._cartRendered = false; };
    POS._filterProducts = function(term = null) {
        const searchTerm = term || (POS.el.productSearchInput?.value||'').trim().toLowerCase();
        const dd = POS.el.productDropdown; if (!dd) return;
        if (!searchTerm) { dd.classList.remove('show'); return; }
        if (!POS.state.products.length) { dd.innerHTML = '<div class="dropdown-item">لا توجد منتجات</div>'; dd.classList.add('show'); return; }
        const filtered = POS.state.products.filter(p => (p.name||'').toLowerCase().includes(searchTerm) || p.barcode === searchTerm || p.code === searchTerm);
        dd.innerHTML = filtered.length ? filtered.map(p => `<div class="dropdown-item" data-id="${p.id}"><div class="item-info"><h4>${U.escape(p.name)}</h4></div><div class="item-price">${U.fmtMoney(p.units[0]?.price||0)}</div></div>`).join('') : '<div class="dropdown-item">لا نتائج</div>';
        dd.classList.add('show');
    };
    POS._filterTabletProducts = function() {
        const term = (POS.el.tabletProductSearchInput?.value||'').trim().toLowerCase();
        if (!term) { POS._renderProductGrid(); return; }
        const filtered = POS.state.products.filter(p => (p.name||'').toLowerCase().includes(term) || p.barcode === term || p.code === term);
        POS._renderProductGrid(filtered);
    };
    POS._renderCustomerInfo = function() {
        const cust = POS._getCust();
        if (!cust) { if (POS.el.customerDetails) POS.el.customerDetails.style.display = 'none'; return; }
        if (POS.el.customerDetails) {
            POS.el.customerDetails.style.display = 'block';
            POS.el.customerDetails.innerHTML = `
                <div class="customer-info-row"><span>الرصيد:</span> <strong class="${cust.balance>=0?'text-success':'text-danger'}">${U.fmtMoney(cust.balance)}</strong></div>
                <div class="customer-info-row"><span>الحد الائتماني:</span> <strong>${U.fmtMoney(cust.credit_limit||0)}</strong></div>
                <div class="customer-info-row"><span>آخر شراء:</span> <span>${U.fmtDate(cust.last_purchase_date) || 'لا يوجد'}</span></div>
            `;
        }
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
        POS._renderCustomerInfo();
    };
    POS._updateHeader = function() {
        const u = POS.state.currentUser;
        const now = new Date();
        if (POS.el.headerUserName) POS.el.headerUserName.textContent = u?.fullName || 'مستخدم';
        if (POS.el.headerDate) POS.el.headerDate.textContent = now.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
        if (POS.el.headerTime) POS.el.headerTime.textContent = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        if (POS.el.headerConnectionStatus) POS.el.headerConnectionStatus.textContent = navigator.onLine ? '🟢 متصل' : '🔴 غير متصل';
        setInterval(() => {
            const t = new Date();
            if (POS.el.headerTime) POS.el.headerTime.textContent = t.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }, 1000);
    };
})();
