'use strict';
(function() {
    const POS = window.POS;
    POS._bindEvents = function() {
        const on = (id, ev, fn) => { if (POS.el[id]) POS.el[id].addEventListener(ev, fn); };
        on('menuToggle','click',()=>{ POS.el.sidebar?.classList.toggle('open'); POS.el.sidebarOverlay?.classList.toggle('show'); });
        on('sidebarOverlay','click',()=>{ POS.el.sidebar?.classList.remove('open'); POS.el.sidebarOverlay?.classList.remove('show'); });
        document.querySelectorAll('.menu-item').forEach(l=>l.addEventListener('click',()=>{ POS.el.sidebar?.classList.remove('open'); POS.el.sidebarOverlay?.classList.remove('show'); }));
        on('moreMenuBtn','click',e=>{ e.stopPropagation(); POS.el.moreDropdown?.classList.toggle('show'); });
        document.addEventListener('click',e=>{ if(!e.target.closest('.nav-actions')) POS.el.moreDropdown?.classList.remove('show'); });
        on('actionsBtn','click',e=>{ e.stopPropagation(); POS.el.actionsDropdown?.classList.toggle('show'); });
        document.addEventListener('click',e=>{ if(!e.target.closest('.actions-wrapper')) POS.el.actionsDropdown?.classList.remove('show'); });
        on('holdInvoiceBtn','click',e=>{ e.preventDefault(); POS.holdInvoice(); POS.el.actionsDropdown?.classList.remove('show'); });
        on('heldInvoicesBtn','click',e=>{ e.preventDefault(); POS.loadHeld(); POS.el.actionsDropdown?.classList.remove('show'); });
        on('returnSaleBtn','click',e=>{ e.preventDefault(); POS.openReturn(); POS.el.actionsDropdown?.classList.remove('show'); });
        on('logoutBtn','click',async e=>{ e.preventDefault(); if(await POS._confirmAction('تسجيل الخروج؟')) App.logout(); });
        on('quickSaleToggle','click',()=>{ POS.state.quickSale=!POS.state.quickSale; UserPrefs.set('quickSale',POS.state.quickSale); POS.el.quickSaleToggle?.classList.toggle('active',POS.state.quickSale); });
        on('speechSearchBtn','click',()=>POS._startSpeechSearch());
        on('tabletProductSearchInput','input',U.debounce(()=>POS._filterTabletProducts(),150));
        on('tabletBarcodeBtn','click',()=>POS._scanBarcode());
        if(POS.el.productGrid) POS.el.productGrid.addEventListener('click',e=>{ const card=e.target.closest('.product-card'); if(card?.dataset.id) POS._openUnitModal(card.dataset.id); });
        on('productSearchInput','input',U.debounce(()=>POS._filterProducts(),150));
        on('productSearchInput','keypress',e=>{ if(e.key==='Enter'){ const term=POS.el.productSearchInput.value.trim(); const found=POS.cache.barcode.get(term)||POS.state.products.find(p=>p.barcode===term||p.code===term); if(found) found.units?.length===1||POS.state.quickSale?POS._quickAdd(found,found.units[0]):POS._openUnitModal(found.id); } });
        on('productDropdown','click',e=>{ const item=e.target.closest('.dropdown-item'); if(item?.dataset.id){ POS._openUnitModal(item.dataset.id); POS._hideProdDropdown(); POS.el.productSearchInput.value=''; } });
        document.addEventListener('click',e=>{ if(!e.target.closest('.search-header')) POS._hideProdDropdown(); });
        on('barcodeScannerBtn','click',()=>POS._scanBarcode());
        on('customerSearchInput','input',U.debounce(()=>POS._filterCustomers(),150));
        on('customerDropdown','click',e=>{ const item=e.target.closest('.dropdown-item'); if(item?.dataset.id){ if(item.dataset.id==='cash'){ POS.state.selectedCustomerId=null; POS.el.customerSearchInput.value=CASH_CUSTOMER_LABEL; } else { POS.state.selectedCustomerId=item.dataset.id; const c=POS.cache.custs.get(item.dataset.id); POS.el.customerSearchInput.value=c?.name||''; } POS._updateCustDisplay(); POS._hideCustDropdown(); POS._saveCart(); } });
        document.addEventListener('click',e=>{ if(!e.target.closest('.customer-box')) POS._hideCustDropdown(); });
        on('discountValue','input',()=>{ POS.state.discountValue=+POS.el.discountValue.value||0; POS._updateTotals(); POS._saveCart(); });
        on('discountType','change',()=>{ POS.state.discountType=POS.el.discountType.value; POS._updateTotals(); POS._saveCart(); });
        on('taxRate','input',()=>{ POS.state.taxRate=+POS.el.taxRate.value||0; POS._updateTotals(); POS._saveCart(); });
        on('shipping','input',()=>{ POS.state.shipping=+POS.el.shipping.value||0; POS._updateTotals(); POS._saveCart(); });
        on('payBtn','click',()=>POS._openPayment());
        on('addToCartBtn','click',()=>POS._addToCart());
        on('closeUnitModalBtn','click',()=>{ POS._stopBarcodeScan(); POS._closeModal('unitQuantityModal'); });
        on('confirmAndPrintBtn','click',e=>{ e.preventDefault(); POS._completePayment(); });
        on('closePaymentModalBtn','click',()=>POS._closeModal('paymentModal'));
        on('paymentMethod','change',()=>POS._togglePaymentFields());
        on('cashAmount','input',()=>POS._previewPayment());
        on('transferAmount','input',()=>POS._previewPayment());
        on('closeHeldModalBtn','click',()=>POS._closeModal('heldInvoicesModal'));
        on('closeReceiptModalBtn','click',()=>POS._closeModal('receiptModal'));
        on('skipPrintBtn','click',()=>POS._closeModal('receiptModal'));
        on('printReceiptBtn','click',()=>POS._printReceipt());
        on('thermalPrintBtn','click',()=>POS._printThermal());
        if(POS.el.cartItemsContainer){ POS.el.cartItemsContainer.addEventListener('change',e=>POS._onCartChange(e)); POS.el.cartItemsContainer.addEventListener('click',e=>POS._onCartClick(e)); }
        if(POS.el.unitButtons && !POS.state._unitButtonsBound){ POS.el.unitButtons.addEventListener('click',e=>{ const btn=e.target.closest('.unit-btn'); if(btn) POS._selectUnit(+btn.dataset.index); }); POS.state._unitButtonsBound=true; }
        on('duplicateIncreaseBtn','click',()=>{ if(POS._duplicateCallback){ POS._duplicateCallback(true); POS._duplicateCallback=null; } POS._closeModal('duplicateProductModal'); });
        on('duplicateCancelBtn','click',()=>{ if(POS._duplicateCallback){ POS._duplicateCallback(false); POS._duplicateCallback=null; } POS._closeModal('duplicateProductModal'); });
    };
    POS._bindKeyboardShortcuts = function() {
        document.addEventListener('keydown',e=>{
            if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA') return;
            if(e.key==='F1'){ e.preventDefault(); POS.el.customerSearchInput?.focus(); }
            if(e.key==='F2'){ e.preventDefault(); POS.el.productSearchInput?.focus(); }
            if(e.key==='F4'){ e.preventDefault(); if(POS.state.cart.length) POS._openPayment(); }
            if(e.key==='F5'){ e.preventDefault(); POS.holdInvoice(); }
            if(e.key==='F6'){ e.preventDefault(); POS.loadHeld(); }
            if(e.key==='F7'){ e.preventDefault(); POS._scanBarcode(); }
            if(e.key==='Escape') POS._closeAllModals();
            if(e.ctrlKey && e.key==='p'){ e.preventDefault(); if(POS.state.cart.length) POS._openPayment(); }
        });
    };
    POS._setupBarcodeBuffer = function() {
        document.addEventListener('keydown',e=>{ if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT'||e.target.tagName==='TEXTAREA') return; const now=Date.now(); if(e.key==='Enter'){ if(POS.state._barcodeBuffer.length>5) POS._searchBarcode(POS.state._barcodeBuffer); POS.state._barcodeBuffer=''; POS.state._lastKeyTime=0; return; } if(e.key.length===1){ if(POS.state._lastKeyTime && now-POS.state._lastKeyTime>30) POS.state._barcodeBuffer=''; POS.state._lastKeyTime=now; POS.state._barcodeBuffer+=e.key; clearTimeout(POS.state._barcodeTimer); POS.state._barcodeTimer=setTimeout(()=>{ if(POS.state._barcodeBuffer.length>5) POS._searchBarcode(POS.state._barcodeBuffer); POS.state._barcodeBuffer=''; POS.state._lastKeyTime=0; },150); } });
    };
    POS._filterCustomers = function() {
        const term=(POS.el.customerSearchInput?.value||'').trim().toLowerCase();
        const dd=POS.el.customerDropdown; if(!dd) return;
        let list=POS.state.customers;
        if(term && term!==CASH_CUSTOMER_LABEL.toLowerCase()) list=list.filter(c=>(c.name||'').toLowerCase().includes(term)||(c.phone&&c.phone.includes(term)));
        let html=`<div class="dropdown-item" data-id="cash"><div class="item-info"><h4>${CASH_CUSTOMER_LABEL}</h4></div></div>`;
        list.forEach(c=>{ const bal=c.balance||0; const col=bal>0?U.cssVar('--success','#10b981'):bal<0?U.cssVar('--danger','#ef4444'):U.cssVar('--text-muted','#94a3b8'); const sign=bal>0?`له ${U.fmtMoney(bal)}`:bal<0?`عليه ${U.fmtMoney(-bal)}`:'لا رصيد'; html+=`<div class="dropdown-item" data-id="${c.id}"><div class="item-info"><h4>${U.escape(c.name)}</h4><small style="color:${col};">${sign}</small></div><div class="item-price">${c.phone||''}</div></div>`; });
        dd.innerHTML=html; dd.classList.add('show');
    };
    POS._onCartChange = function(e) {
        const t = e.target;
        if(t.classList.contains('cart-price-input')){
            if(!POS.can('canEditPrice')){ U.showToast('لا صلاحية','error'); POS._renderCart(); return; }
            const idx=+t.dataset.idx,p=+t.value; if(!isNaN(p)&&p>=0) POS.state.cart[idx].price=p;
            POS._renderCart(); POS._saveCart();
        } else if(t.classList.contains('cart-qty-input')){
            const idx=+t.dataset.idx,q=+t.value; if(isNaN(q)||q<=0) POS.state.cart.splice(idx,1); else POS.state.cart[idx].quantity=q;
            POS._renderCart(); POS._saveCart();
        } else if(t.classList.contains('cart-item-discount')){
            if(!POS.can('canEditDiscount')){ U.showToast('لا صلاحية','error'); POS._renderCart(); return; }
            const idx=+t.dataset.idx,val=+t.value; if(!isNaN(val)&&val>=0) POS.state.cart[idx].discount=val;
            POS._renderCart(); POS._saveCart();
        } else if(t.classList.contains('cart-note-input')){
            const idx=+t.dataset.idx; POS.state.cart[idx].note=t.value; POS._saveCart();
        }
    };
    POS._onCartClick = function(e) {
        if(e.target.closest('.fa-trash')){
            if(!POS.can('canDeleteItem')){ U.showToast('لا صلاحية للحذف','error'); return; }
            const idx=+e.target.closest('.fa-trash').dataset.idx;
            POS._logActivity('حذف صنف', POS.state.cart[idx]?.productName);
            POS.state.cart.splice(idx,1); U.playBeep('remove'); POS._renderCart(); POS._saveCart();
        }
    };
    POS._closeAllModals = function(){ ['paymentModal','unitQuantityModal','heldInvoicesModal','receiptModal','duplicateProductModal'].forEach(id=>POS._closeModal(id)); };
})();
