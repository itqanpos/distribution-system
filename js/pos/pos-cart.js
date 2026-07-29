'use strict';
(function() {
    const POS = window.POS;
    POS._openUnitModal = function(id) {
        const p = POS._getProductById(id); if (!p?.units?.length) { U.showToast('منتج غير موجود','error'); return; }
        if (p.units.length===1 && POS.state.quickSale) { POS._quickAdd(p, p.units[0]); return; }
        POS.state.selectedProduct = p; POS.state.selectedUnit = p.units[0];
        POS.el.modalProductName.textContent = p.name;
        POS.el.unitButtons.innerHTML = p.units.map((u,i) => `<button class="unit-btn ${i===0?'active':''}" data-index="${i}">${U.escape(u.name)}</button>`).join('');
        POS._updateUnitInfo(); POS._showModal('unitQuantityModal');
    };
    POS._selectUnit = function(i) { POS.state.selectedUnit = POS.state.selectedProduct.units[i]; POS.el.unitButtons.querySelectorAll('.unit-btn').forEach((b,j)=>b.classList.toggle('active',j===i)); POS._updateUnitInfo(); };
    POS._updateUnitInfo = function() {
        const p = POS.state.selectedProduct, u = POS.state.selectedUnit; if(!p||!u) return;
        const base = p.units[0], stock = base.stock||0, fac = u.factor||1;
        const avail = u===base ? stock : Math.floor(stock/fac);
        const max = Math.max(0, avail);
        POS.el.selectedPrice.value = u.price||0;
        POS.el.selectedQuantity.max = max; POS.el.selectedQuantity.value = max>0?1:0;
        POS.el.stockInfo.textContent = `المخزون: ${max} ${u.name}`;
        POS.el.priceLimitMsg.style.display = (u.minPrice||u.maxPrice)?'block':'none';
        if(u.minPrice||u.maxPrice) POS.el.priceLimitMsg.textContent = `السعر بين ${u.minPrice||0} - ${u.maxPrice||'∞'} ج.م`;
    };
    POS._addToCart = function() {
        if(POS.state.addingItem) return;
        POS.state.addingItem = true;
        try {
            const q = +POS.el.selectedQuantity?.value||0, max = +POS.el.selectedQuantity?.max||0;
            if(q<=0||q>max) { U.showToast('الكمية غير متوفرة','error'); return; }
            const u = POS.state.selectedUnit;
            let pr = +POS.el.selectedPrice?.value||0;
            if(!POS._canChangePrice()) pr = u?.price||0;
            if(u){ if(u.minPrice>0&&pr<u.minPrice){ U.showToast(`الحد الأدنى ${U.fmtMoney(u.minPrice)}`,'error'); return; } if(u.maxPrice>0&&pr>u.maxPrice){ U.showToast(`الحد الأقصى ${U.fmtMoney(u.maxPrice)}`,'error'); return; } }
            const product = POS.state.selectedProduct, unitName = u?.name||'', cost = u?.cost||0;
            const exist = POS.state.cart.find(i=>i.productId===product.id && i.unitName===unitName);
            if(exist){
                POS.el.duplicateProductMsg.textContent = `${product.name} موجود مسبقاً بالكمية ${exist.quantity}. زيادة؟`;
                POS._duplicateCallback = (confirmed) => { if(confirmed){ exist.quantity = U.round(exist.quantity+q,3); if(pr) exist.price=pr; POS._renderCart(); POS._saveCart(); } POS.state.addingItem=false; POS._closeModal('unitQuantityModal'); };
                POS._showModal('duplicateProductModal'); return;
            }
            POS.state.cart.push({ productId:product.id, productName:product.name, unitName, quantity:q, price:pr, cost, factor:u?.factor||1, isBase:u===product.units[0], note:'' });
            U.playBeep('add'); POS._renderCart(); POS._closeModal('unitQuantityModal'); POS._saveCart();
        } catch(e) { U.showToast('خطأ في الإضافة','error'); } finally { POS.state.addingItem = false; }
    };
    POS._quickAdd = function(product, unit) {
        const exist = POS.state.cart.find(i=>i.productId===product.id && i.unitName===unit.name);
        if(exist) exist.quantity = U.round(exist.quantity+1,3);
        else POS.state.cart.push({ productId:product.id, productName:product.name, unitName:unit.name, quantity:1, price:unit.price||0, cost:unit.cost||0, factor:unit.factor||1, isBase:unit===product.units[0], note:'' });
        U.playBeep('add'); POS._renderCart(); POS._saveCart();
    };
    POS._openPayment = function() {
        if(!POS.state.cart.length) { U.showToast('السلة فارغة','warning'); return; }
        const { sub, disc, net } = POS._calcTotals();
        POS.el.paySubtotal.textContent = U.fmtMoney(sub); POS.el.payDiscount.textContent = U.fmtMoney(disc); POS.el.payNet.textContent = U.fmtMoney(net);
        const cust = POS._getCust(), bal = cust?.balance||0;
        POS.el.currentBalance.textContent = U.fmtMoney(Math.abs(bal));
        POS.el.paymentMethod.value='cash'; POS._togglePaymentFields(); POS._previewPayment(); POS._showModal('paymentModal');
    };
    POS._togglePaymentFields = function() {
        const m = POS.el.paymentMethod?.value||'cash';
        POS.el.cashField.style.display = (m==='cash'||m==='mixed')?'block':'none';
        POS.el.transferField.style.display = (m==='transfer'||m==='mixed')?'block':'none';
        POS._previewPayment();
    };
    POS._previewPayment = function() {
        const net = POS.state.net, m = POS.el.paymentMethod?.value||'cash';
        let cash=0, trans=0;
        if(m==='cash') cash=+POS.el.cashAmount?.value||0;
        else if(m==='transfer') trans=+POS.el.transferAmount?.value||0;
        else if(m==='mixed'){ cash=+POS.el.cashAmount?.value||0; trans=+POS.el.transferAmount?.value||0; }
        const cust = POS._getCust();
        let used = 0;
        if(m!=='credit' && cust?.balance>0) used = Math.min(cust.balance, Math.max(0, net-cash-trans));
        POS.state.usedBalance = used;
        const paid = U.round(cash+trans+used,2), diff = U.round(paid-net,2);
        POS.el.remainingDisplay.textContent = diff>=0?`فائض ${U.fmtMoney(diff)}`:`متبقي ${U.fmtMoney(-diff)}`;
    };
    POS._completePayment = async function() {
        if(POS.state.busy) return;
        POS.state.busy=true; POS.el.confirmAndPrintBtn.disabled=true;
        try {
            const { sub, disc, net } = POS._calcTotals(), m = POS.el.paymentMethod?.value||'cash';
            let cash=0, trans=0;
            if(m==='cash') cash=+POS.el.cashAmount?.value||0;
            else if(m==='transfer') trans=+POS.el.transferAmount?.value||0;
            else if(m==='mixed'){ cash=+POS.el.cashAmount?.value||0; trans=+POS.el.transferAmount?.value||0; }
            const used = (m==='credit')?0:POS.state.usedBalance||0;
            const cust = POS._getCust(), oldBal = cust?.balance||0;
            const invNum = POS.state.db ? await DB.generateInvoiceNumber() : POS._localInvNum();
            const inv = { id:U.uuid(), invoice_number:invNum, date:U.today(), customer_id:POS.state.selectedCustomerId||null, customer_name:cust?.name||CASH_CUSTOMER_STORED, items:POS.state.cart.map(i=>({...i})), subtotal:sub, discount:disc, total:net, cash_paid:cash, transfer_paid:trans, used_customer_balance:used, paid:U.round(cash+trans+used,2), remaining:0, status:'paid', notes:POS.el.paymentNotes?.value||'', tenant_id:POS.state.currentUser?.tenant_id, created_by:POS.state.currentUser?.id };
            let result;
            if(navigator.onLine && POS.state.db) result = POS.state.editingInv && DB.editSaleInvoice ? await DB.editSaleInvoice(inv) : await DB.createSaleInvoice(inv);
            else { await localDB.put('offline_sales', inv); result = { success:true, invoice_number:inv.invoice_number }; }
            if(!result?.success) throw new Error(result?.error||'فشل');
            POS._closeModal('paymentModal');
            POS._showReceipt(inv, cust||{}, POS.state.cart, {sub,disc,net}, oldBal, {cash,trans,used,diff:0});
            POS._resetCart(); POS._resetCartRender();
            U.playBeep('success'); U.showToast('تم البيع بنجاح','success');
        } catch(e) { U.showToast(e.message,'error'); }
        finally { POS.state.busy=false; POS.el.confirmAndPrintBtn.disabled=false; }
    };
    POS._canChangePrice = function() { return POS.state.currentUser?.role==='admin'; };
    POS.holdInvoice = async function() {
        if(!POS.state.cart.length) { U.showToast('السلة فارغة','warning'); return; }
        const { sub, disc, net } = POS._calcTotals();
        const inv = { id:U.uuid(), invoice_number:POS.state.db?await DB.generateInvoiceNumber():POS._localInvNum(), type:'sale', date:U.today(), customer_id:POS.state.selectedCustomerId||null, customer_name:POS._getCust()?.name||CASH_CUSTOMER_STORED, items:POS.state.cart.map(i=>({...i})), subtotal:sub, discount:disc, total:net, paid:0, remaining:net, status:'held', notes:'معلقة', tenant_id:POS.state.currentUser?.tenant_id, created_by:POS.state.currentUser?.id };
        try { if(POS.state.db) await DB.saveInvoice(inv); else if(U.localReady()) await localDB.put('invoices',inv); U.showToast('تم تعليق الفاتورة','success'); POS._resetCart(); } catch(e) { U.showToast('فشل التعليق','error'); }
    };
    POS.loadHeld = async function() {
        let invs = [];
        try { if(POS.state.db&&DB.getHeldInvoices) invs=await DB.getHeldInvoices()||[]; else if(POS.state.db) invs=(await DB.getInvoices()).filter(i=>i.type==='sale'&&i.status==='held'); else if(U.localReady()) invs=(await localDB.getAll('invoices')).filter(i=>i.type==='sale'&&i.status==='held'); } catch{}
        const c = POS.el.heldInvoicesList; if(!c) return;
        c.innerHTML = invs.length ? invs.map(i=>`<div class="held-invoice-item" data-id="${i.id}" style="padding:15px;border:1px solid var(--border-light);border-radius:12px;margin-bottom:10px;cursor:pointer;display:flex;justify-content:space-between;"><div><strong>${U.escape(i.invoice_number||i.id?.substring(0,8))}</strong><br>${U.escape(i.customer_name||CASH_CUSTOMER_STORED)} - ${U.fmtMoney(i.total)}</div></div>`).join('') : '<p style="text-align:center;">لا توجد فواتير معلقة</p>';
        c.querySelectorAll('.held-invoice-item').forEach(el=>el.addEventListener('click',()=>POS._resumeInvoice(el.dataset.id)));
        POS._showModal('heldInvoicesModal');
    };
    POS._resumeInvoice = async function(id) {
        let inv; try { if(POS.state.db) inv=await DB.getInvoiceById(id); else if(U.localReady()) inv=await localDB.getById('invoices',id); } catch{}
        if(!inv) { U.showToast('غير موجودة','error'); return; }
        POS.state.resumedInvoiceId = id;
        const valid=[], missing=[];
        for(const it of (inv.items||[])){ const p=POS._getProductById(it.productId); if(p) valid.push(it); else missing.push(it.productName||it.productId); }
        POS.state.cart = valid.map(i=>({...i}));
        POS.state.selectedCustomerId = inv.customer_id;
        if(inv.customer_id){ const c=POS._getCustomerById(inv.customer_id); if(c) POS.el.customerSearchInput.value=c.name||''; POS._updateCustDisplay(); } else { POS.el.customerSearchInput.value=CASH_CUSTOMER_LABEL; POS._updateCustDisplay(); }
        POS._renderCart(); POS._closeModal('heldInvoicesModal');
        if(missing.length) U.showToast(`أصناف غير متوفرة: ${missing.join(',')}`,'warning');
        U.showToast('تم استئناف الفاتورة','success');
    };
    POS._confirmAction = async function(msg) { if(window.ModalConfirm) return await ModalConfirm.show({title:'تأكيد',message:msg,icon:'warn',confirmText:'نعم',cancelText:'لا'}); return confirm(msg); };
})();
