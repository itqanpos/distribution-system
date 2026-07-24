'use strict';
import { U, CASH_CUSTOMER_LABEL } from './utils.js';
import { _debouncedRenderGrid } from './pos-events.js'; // سنعرّفها هناك

export function _cacheDOM(POS) {
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
        'profitDisplay','todaySales','todayCount',
        'duplicateProductModal','duplicateProductMsg','duplicateIncreaseBtn','duplicateCancelBtn',
        'quickSaleToggle','speechSearchBtn'
    ];
    ids.forEach(id => { const el = document.getElementById(id); if (el) POS.el[id] = el; });
}

export function _applySafeArea() {
    const safeBottom = 'env(safe-area-inset-bottom, 0px)';
    const footer = document.querySelector('.cart-footer');
    if (footer) footer.style.paddingBottom = `calc(10px + ${safeBottom})`;
}

export function _renderCart(POS) {
    const c = POS.el.cartItemsContainer;
    if (!c) return;
    if (!POS._cartRendered) {
        c.innerHTML = `<div class="cart-header-row"><span>Item</span><span>Qty</span><span>Price</span><span>Total</span><span></span></div>`;
        POS._cartRendered = true;
    }
    const existingRows = c.querySelectorAll('.cart-item-row');
    existingRows.forEach(r => r.remove());
    const emptyMsg = c.querySelector('.empty-cart-message');
    if (emptyMsg) emptyMsg.remove();

    if (!POS.state.cart.length) {
        c.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">Cart is empty</div>');
        POS._updateTotals();
        return;
    }

    let rows = '';
    POS.state.cart.forEach((item, idx) => {
        rows += `<div class="cart-item-row" data-cart-idx="${idx}">
            <div><i class="fas fa-grip-vertical cart-item-drag-handle" style="cursor:grab;margin-right:8px;color:var(--text-muted);"></i></div>
            <div><span class="cart-item-name">${U.escape(item.productName)}</span><br><span class="cart-item-unit">${U.escape(item.unitName)}</span></div>
            <div><input type="number" value="${item.quantity}" min="0.001" step="0.001" class="cart-qty-input" data-idx="${idx}"></div>
            <div><input type="number" value="${item.price}" step="0.01" class="cart-price-input" data-idx="${idx}"></div>
            <div>${U.fmtMoney(U.round(item.price * item.quantity, 2))}</div>
            <div><input type="text" placeholder="Note" value="${item.note||''}" class="cart-note-input" data-idx="${idx}" style="width:60px;"></div>
            <div><i class="fas fa-trash" style="color:var(--danger);cursor:pointer;" data-idx="${idx}"></i></div>
        </div>`;
    });
    c.insertAdjacentHTML('beforeend', rows);
    POS._updateTotals();
}

export function _resetCartRender(POS) {
    POS._cartRendered = false;
}

export function _renderProductGrid(POS, products = POS.state.products) {
    const grid = POS.el.productGrid;
    if (!grid) return;
    if (!products.length) {
        grid.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);">No products</div>';
        return;
    }
    if (POS.state._observer) POS.state._observer.disconnect();
    grid.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const cardsPerBatch = 20;
    let currentBatch = 0;

    const renderBatch = () => {
        const start = currentBatch * cardsPerBatch;
        const end = Math.min(start + cardsPerBatch, products.length);
        for (let i = start; i < end; i++) {
            const p = products[i];
            const stock = POS.state.showStock ? (p.units?.[0]?.stock || 0) : null;
            const price = p.units?.[0]?.price || 0;
            const imgHtml = (POS.state.showImages && p.image_url)
                ? `<img src="${p.image_url}" alt="${p.name}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;margin-bottom:4px;">` : '';
            const card = document.createElement('div');
            card.className = 'product-card';
            card.dataset.id = p.id;
            card.innerHTML = `${imgHtml}<div style="font-weight:700;font-size:0.9rem;margin-bottom:4px;">${U.escape(p.name)}</div>
                <div style="font-size:0.8rem;color:var(--text-secondary);">${U.fmtMoney(price)}</div>
                ${POS.state.showStock ? `<div style="font-size:0.7rem;color:${stock > 0 ? 'var(--success)' : 'var(--danger)'};">${stock > 0 ? 'Stock: ' + stock : 'Out'}</div>` : ''}`;
            fragment.appendChild(card);
        }
        grid.appendChild(fragment);
        currentBatch++;
        if (end < products.length) {
            const sentinel = document.createElement('div');
            sentinel.className = 'scroll-sentinel';
            grid.appendChild(sentinel);
            POS.state._observer = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting) {
                    POS.state._observer.disconnect();
                    grid.removeChild(sentinel);
                    renderBatch();
                }
            }, { root: grid, rootMargin: '100px' });
            POS.state._observer.observe(sentinel);
        }
    };
    renderBatch();
}

export function _filterTabletProducts(POS) {
    const term = (POS.el.tabletProductSearchInput?.value || '').trim().toLowerCase();
    if (!term) {
        POS._renderProductGrid();
        return;
    }
    const filtered = POS.state.products.filter(p =>
        p.name?.toLowerCase().includes(term) || p.barcode === term || p.code === term
    );
    POS._renderProductGrid(filtered);
}

export function _filterProducts(POS) {
    const term = POS.el.productSearchInput?.value.trim().toLowerCase() || '';
    const dd = POS.el.productDropdown;
    if (!dd) return;
    if (!term) {
        dd.classList.remove('show');
        return;
    }
    if (!POS.state.products.length) {
        dd.innerHTML = '<div class="dropdown-item" style="color:var(--danger);text-align:center;">No products</div>';
        dd.classList.add('show');
        return;
    }
    const filtered = POS.state.products.filter(p =>
        p.name?.toLowerCase().includes(term) || p.barcode === term || p.code === term
    );
    dd.innerHTML = filtered.length
        ? filtered.map(p => `<div class="dropdown-item" data-id="${p.id}"><div class="item-info"><h4>${U.escape(p.name)}</h4></div><div class="item-price">${U.fmtMoney(p.units[0]?.price||0)}</div></div>`).join('')
        : '<div class="dropdown-item" style="color:var(--text-muted);">No results</div>';
    dd.classList.add('show');
}

export function _filterCustomers(POS) {
    const term = POS.el.customerSearchInput?.value.trim().toLowerCase() || '';
    const dd = POS.el.customerDropdown;
    if (!dd) return;
    let list = POS.state.customers;
    if (term && term !== CASH_CUSTOMER_LABEL.toLowerCase()) {
        list = list.filter(c => c.name?.toLowerCase().includes(term) || (c.phone && c.phone.includes(term)));
    }
    let html = `<div class="dropdown-item" data-id="cash"><div class="item-info"><h4>${CASH_CUSTOMER_LABEL}</h4></div></div>`;
    list.forEach(c => {
        const bal = c.balance || 0;
        const col = bal > 0 ? U.cssVar('--success', '#10b981') : bal < 0 ? U.cssVar('--danger', '#ef4444') : U.cssVar('--text-muted', '#94a3b8');
        const sign = bal > 0 ? `Credit ${U.fmtMoney(bal)}` : bal < 0 ? `Debit ${U.fmtMoney(-bal)}` : 'No balance';
        html += `<div class="dropdown-item" data-id="${c.id}"><div class="item-info"><h4>${U.escape(c.name)}</h4><small style="color:${col};">${sign}</small></div><div class="item-price">${c.phone||''}</div></div>`;
    });
    dd.innerHTML = html;
    dd.classList.add('show');
}

export function _hideCustDropdown(POS) {
    POS.el.customerDropdown?.classList.remove('show');
}

export function _hideProdDropdown(POS) {
    POS.el.productDropdown?.classList.remove('show');
}

export function _updateCustDisplay(POS) {
    const el = POS.el.customerBalanceDisplay;
    if (!el) return;
    if (!POS.state.selectedCustomerId) {
        el.innerHTML = '';
        el.className = 'customer-balance';
        return;
    }
    const c = POS.cache.custs.get(POS.state.selectedCustomerId);
    if (c) {
        const bal = c.balance || 0;
        el.innerHTML = bal > 0 ? `Credit ${U.fmtMoney(bal)}` : bal < 0 ? `Debit ${U.fmtMoney(-bal)}` : 'No balance';
        el.className = `customer-balance ${bal > 0 ? 'positive' : bal < 0 ? 'negative' : ''}`;
    }
}

export function _showModal(POS, id) {
    const m = POS.el[id];
    if (m) m.classList.add('open');
}

export function _closeModal(POS, id) {
    const m = POS.el[id];
    if (m) {
        m.classList.remove('open');
        if (id === 'unitQuantityModal') POS._stopBarcodeScan();
    }
}

export function _applyUserPrefs(POS) {
    if (POS.state.fontSize !== 14) {
        document.documentElement.style.fontSize = POS.state.fontSize + 'px';
    }
}

export function _connStatus() {
    const n = document.getElementById('mainNavbar');
    if (n) n.classList.toggle('offline', !navigator.onLine);
    document.body.classList.toggle('offline', !navigator.onLine);
}

export function _togglePaymentFields(POS) {
    const m = POS.el.paymentMethod?.value || 'cash';
    POS.el.cashField.style.display = (m === 'cash' || m === 'mixed') ? 'block' : 'none';
    POS.el.transferField.style.display = (m === 'transfer' || m === 'mixed') ? 'block' : 'none';
    POS._previewPayment();
}

export function _previewPayment(POS) {
    const net = POS.state.net;
    const m = POS.el.paymentMethod?.value || 'cash';
    let cash = 0, trans = 0;
    if (m === 'cash') cash = +POS.el.cashAmount?.value || 0;
    else if (m === 'transfer') trans = +POS.el.transferAmount?.value || 0;
    else if (m === 'mixed') { cash = +POS.el.cashAmount?.value || 0; trans = +POS.el.transferAmount?.value || 0; }
    const cust = POS._getCust();
    let used = 0;
    if (m !== 'credit' && cust?.balance > 0) used = Math.min(cust.balance, Math.max(0, net - cash - trans));
    POS.state.usedBalance = used;
    const paid = U.round(cash + trans + used, 2);
    const diff = U.round(paid - net, 2);
    const newBal = (cust?.balance || 0) - used + diff;
    POS.el.remainingDisplay.textContent = diff >= 0 ? `Change ${U.fmtMoney(diff)}` : `Remaining ${U.fmtMoney(-diff)}`;
    POS.el.balanceAfterLabel.textContent = newBal >= 0 ? 'Balance after:' : 'Debt after:';
    POS.el.balanceAfter.textContent = U.fmtMoney(Math.abs(newBal));
    POS.el.balanceAfter.classList.toggle('text-success', newBal >= 0);
    POS.el.balanceAfter.classList.toggle('text-danger', newBal < 0);
}

// سنضيف _debouncedRenderGrid هنا أو في events
export const _debouncedRenderGrid = U.debounce(function(POS) {
    POS._renderProductGrid();
}, 200);
