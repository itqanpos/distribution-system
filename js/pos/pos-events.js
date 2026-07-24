'use strict';
import { U, UserPrefs, CASH_CUSTOMER_LABEL } from './utils.js';
import { _debouncedRenderGrid } from './pos-dom.js'; // تأكد من الاستيراد

export function _bindEvents(POS) {
    const on = (id, ev, fn) => { if (POS.el[id]) POS.el[id].addEventListener(ev, fn); };

    on('menuToggle', 'click', () => {
        POS.el.sidebar?.classList.toggle('open');
        POS.el.sidebarOverlay?.classList.toggle('show');
    });
    on('sidebarOverlay', 'click', () => {
        POS.el.sidebar?.classList.remove('open');
        POS.el.sidebarOverlay?.classList.remove('show');
    });
    document.querySelectorAll('.menu-item').forEach(l =>
        l.addEventListener('click', () => {
            POS.el.sidebar?.classList.remove('open');
            POS.el.sidebarOverlay?.classList.remove('show');
        })
    );

    on('moreMenuBtn', 'click', (e) => { e.stopPropagation(); POS.el.moreDropdown?.classList.toggle('show'); });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.nav-actions')) POS.el.moreDropdown?.classList.remove('show');
    });

    on('returnSaleBtn', 'click', (e) => { e.preventDefault(); POS.openReturn(); POS.el.moreDropdown?.classList.remove('show'); });
    on('holdInvoiceBtn', 'click', (e) => { e.preventDefault(); POS.holdInvoice(); POS.el.moreDropdown?.classList.remove('show'); });
    on('heldInvoicesBtn', 'click', (e) => { e.preventDefault(); POS.loadHeld(); POS.el.moreDropdown?.classList.remove('show'); });
    on('logoutBtn', 'click', async (e) => {
        e.preventDefault();
        const confirmed = await POS._confirmAction('Are you sure you want to logout?');
        if (confirmed) App.logout();
    });

    on('quickSaleToggle', 'click', () => {
        POS.state.quickSale = !POS.state.quickSale;
        UserPrefs.set('quickSale', POS.state.quickSale);
        POS.el.quickSaleToggle?.classList.toggle('active', POS.state.quickSale);
        window.Toast?.info(POS.state.quickSale ? 'Quick Sale ON' : 'Quick Sale OFF');
    });

    on('speechSearchBtn', 'click', () => POS._startSpeechSearch());

    on('tabletProductSearchInput', 'input', U.debounce(() => POS._filterTabletProducts(), 150));
    on('tabletBarcodeBtn', 'click', () => POS._scanBarcode());
    if (POS.el.productGrid) {
        POS.el.productGrid.addEventListener('click', (e) => {
            const card = e.target.closest('.product-card');
            if (card?.dataset.id) POS._openUnitModal(card.dataset.id);
        });
    }

    on('productSearchInput', 'input', U.debounce(() => POS._filterProducts(), 150));
    on('productSearchInput', 'keypress', (e) => {
        if (e.key === 'Enter') {
            const term = POS.el.productSearchInput.value.trim();
            const found = POS.cache.barcode.get(term) || POS.state.products.find(p => p.barcode === term || p.code === term);
            if (found) {
                if (found.units?.length === 1 || POS.state.quickSale) {
                    POS._quickAdd(found, found.units[0]);
                } else {
                    POS._openUnitModal(found.id);
                }
            }
        }
    });
    on('productDropdown', 'click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item?.dataset.id) {
            POS._openUnitModal(item.dataset.id);
            POS._hideProdDropdown();
            POS.el.productSearchInput.value = '';
        }
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-header')) POS._hideProdDropdown();
    });
    on('barcodeScannerBtn', 'click', () => POS._scanBarcode());

    on('customerSearchInput', 'input', U.debounce(() => POS._filterCustomers(), 150));
    on('customerDropdown', 'click', (e) => {
        const item = e.target.closest('.dropdown-item');
        if (item?.dataset.id) {
            if (item.dataset.id === 'cash') {
                POS.state.selectedCustomerId = null;
                POS.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
            } else {
                POS.state.selectedCustomerId = item.dataset.id;
                const c = POS.cache.custs.get(item.dataset.id);
                POS.el.customerSearchInput.value = c?.name || '';
            }
            POS._updateCustDisplay();
            POS._hideCustDropdown();
            POS._saveCart();
        }
    });
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.customer-box')) POS._hideCustDropdown();
    });

    on('discountValue', 'input', () => {
        POS.state.discountValue = +POS.el.discountValue.value || 0;
        POS._updateTotals();
        POS._saveCart();
    });
    on('discountType', 'change', () => {
        POS.state.discountType = POS.el.discountType.value;
        POS._updateTotals();
        POS._saveCart();
    });
    on('payBtn', 'click', () => POS._openPayment());

    on('addToCartBtn', 'click', () => POS._addToCart());
    on('closeUnitModalBtn', 'click', () => {
        POS._stopBarcodeScan();
        POS._closeModal('unitQuantityModal');
    });

    on('confirmAndPrintBtn', 'click', (e) => { e.preventDefault(); POS._completePayment(); });
    on('closePaymentModalBtn', 'click', () => POS._closeModal('paymentModal'));
    on('paymentMethod', 'change', () => POS._togglePaymentFields());
    on('cashAmount', 'input', () => POS._previewPayment());
    on('transferAmount', 'input', () => POS._previewPayment());

    on('closeHeldModalBtn', 'click', () => POS._closeModal('heldInvoicesModal'));
    on('closeReceiptModalBtn', 'click', () => POS._closeModal('receiptModal'));
    on('skipPrintBtn', 'click', () => POS._closeModal('receiptModal'));
    on('printReceiptBtn', 'click', () => POS._printReceipt());
    on('thermalPrintBtn', 'click', () => POS._printThermal());

    if (POS.el.cartItemsContainer) {
        POS.el.cartItemsContainer.addEventListener('change', e => POS._onCartChange(e));
        POS.el.cartItemsContainer.addEventListener('click', e => POS._onCartClick(e));
    }

    if (POS.el.unitButtons && !POS.state._unitButtonsBound) {
        POS.el.unitButtons.addEventListener('click', (e) => {
            const btn = e.target.closest('.unit-btn');
            if (btn) POS._selectUnit(+btn.dataset.index);
        });
        POS.state._unitButtonsBound = true;
    }

    on('duplicateIncreaseBtn', 'click', () => {
        if (POS._duplicateCallback) { POS._duplicateCallback(true); POS._duplicateCallback = null; }
        POS._closeModal('duplicateProductModal');
    });
    on('duplicateCancelBtn', 'click', () => {
        if (POS._duplicateCallback) { POS._duplicateCallback(false); POS._duplicateCallback = null; }
        POS._closeModal('duplicateProductModal');
    });
}

export function _bindKeyboardShortcuts(POS) {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        if (e.key === 'F1') { e.preventDefault(); POS.el.customerSearchInput?.focus(); }
        if (e.key === 'F2') { e.preventDefault(); POS.el.productSearchInput?.focus(); }
        if (e.key === 'F4') { e.preventDefault(); if (POS.state.cart.length) POS._openPayment(); }
        if (e.key === 'F5') { e.preventDefault(); POS.holdInvoice(); }
        if (e.key === 'Escape') { POS._closeAllModals(); }
    });
}

export function _setupBarcodeBuffer(POS) {
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
        const now = Date.now();
        if (e.key === 'Enter') {
            if (POS.state._barcodeBuffer.length > 5) {
                POS._searchBarcode(POS.state._barcodeBuffer);
            }
            POS.state._barcodeBuffer = '';
            POS.state._lastKeyTime = 0;
            return;
        }
        if (e.key.length === 1) {
            if (POS.state._lastKeyTime && (now - POS.state._lastKeyTime > 30)) {
                POS.state._barcodeBuffer = '';
            }
            POS.state._lastKeyTime = now;
            POS.state._barcodeBuffer += e.key;
            clearTimeout(POS.state._barcodeTimer);
            POS.state._barcodeTimer = setTimeout(() => {
                if (POS.state._barcodeBuffer.length > 5) {
                    POS._searchBarcode(POS.state._barcodeBuffer);
                }
                POS.state._barcodeBuffer = '';
                POS.state._lastKeyTime = 0;
            }, 150);
        }
    });
}

export function _enableDragDrop(POS) {
    if (!POS.el.cartItemsContainer || typeof Sortable === 'undefined') return;
    new Sortable(POS.el.cartItemsContainer, {
        handle: '.cart-item-drag-handle',
        animation: 150,
        onEnd: () => {
            const rows = [...POS.el.cartItemsContainer.querySelectorAll('.cart-item-row')];
            const newCart = [];
            rows.forEach(row => {
                const idx = +row.dataset.cartIdx;
                if (!isNaN(idx) && POS.state.cart[idx]) newCart.push(POS.state.cart[idx]);
            });
            POS.state.cart = newCart;
            POS._renderCart();
            POS._saveCart();
        }
    });
}

export function _onCartChange(POS, e) {
    if (e.target.classList.contains('cart-price-input')) {
        if (!POS._canChangePrice()) { window.Toast?.error('Permission denied'); POS._renderCart(); return; }
        const idx = +e.target.dataset.idx, p = +e.target.value;
        if (!isNaN(p) && p >= 0) { POS.state.cart[idx].price = p; }
        POS._renderCart(); POS._saveCart();
    } else if (e.target.classList.contains('cart-qty-input')) {
        const idx = +e.target.dataset.idx, q = +e.target.value;
        if (isNaN(q) || q <= 0) POS.state.cart.splice(idx, 1);
        else POS.state.cart[idx].quantity = q;
        POS._renderCart(); POS._saveCart();
    } else if (e.target.classList.contains('cart-note-input')) {
        const idx = +e.target.dataset.idx;
        POS.state.cart[idx].note = e.target.value;
        POS._saveCart();
    }
}

export function _onCartClick(POS, e) {
    if (e.target.closest('.fa-trash')) {
        const idx = +e.target.closest('.fa-trash').dataset.idx;
        const removed = POS.state.cart[idx];
        POS.state.cart.splice(idx, 1);
        U.playBeep('remove');
        POS._logActivity('Item removed', removed.productName);
        POS._renderCart(); POS._saveCart();
    }
}

export function _canChangePrice(POS) {
    return POS.state.currentUser?.role === 'admin';
}

export function _closeAllModals(POS) {
    ['paymentModal','unitQuantityModal','heldInvoicesModal','receiptModal','duplicateProductModal'].forEach(id => POS._closeModal(id));
}
