'use strict';
(function() {
    const POS = window.POS;
    POS._loadData = async function() {
        POS.state.db = U.dbReady();
        await POS._fetchProdsAndCusts();
        POS._restoreCart();
        POS._loadEditInvoice();
        POS._renderProductGrid();
        if(!POS.state.products.length) U.showToast('لا توجد منتجات','warning');
    };
    POS._fetchProdsAndCusts = async function() {
        let prods=[], custs=[];
        if(POS.state.db){ try{ prods=await DB.getProducts()||[]; }catch(e){} try{ custs=await DB.getParties('customer')||[]; }catch(e){} }
        else if(U.localReady()){ try{ prods=await localDB.getAll('products')||[]; }catch(e){} try{ custs=await localDB.getAll('parties')||[]; }catch(e){} }
        POS.state.products = prods;
        POS.state.customers = custs.filter(c=>c.type==='customer');
        POS.state.products.forEach(p=>{ if(typeof p.units==='string') try{p.units=JSON.parse(p.units);}catch{p.units=[];} if(!Array.isArray(p.units)||!p.units.length) p.units=[{name:'وحدة',price:p.price||0,cost:0,factor:1,stock:0}]; });
        POS._buildCache();
    };
    POS._loadEditInvoice = function() {
        const id = localStorage.getItem('edit_invoice_id'); if(!id) return;
        localStorage.removeItem('edit_invoice_id');
        if(POS.state.db && DB.getInvoiceById) DB.getInvoiceById(id).then(inv=>{ if(inv?.type==='sale'&&inv.status!=='voided'){ POS.state.cart=(inv.items||[]).map(i=>({...i})); POS.state.selectedCustomerId=inv.customer_id; POS.state.editingInv=inv.id; if(inv.customer_id){ const c=POS._getCustomerById(inv.customer_id); if(c) POS.el.customerSearchInput.value=c.name||''; } else POS.el.customerSearchInput.value=CASH_CUSTOMER_LABEL; POS._renderCart(); } });
    };
    POS._checkStock = function() {
        if(navigator.onLine && POS.state.db && DB.getProducts) return DB.getProducts(true).then(fresh=>POS._validateStock(fresh||POS.state.products)).catch(()=>POS._validateStock(POS.state.products));
        return Promise.resolve(POS._validateStock(POS.state.products));
    };
    POS._validateStock = function(products) {
        for(const item of POS.state.cart){
            const p = products.find(p=>p.id===item.productId);
            if(!p) return {ok:false, error:`${item.productName} غير متوفر`};
            const u = p.units?.find(u=>u.name===item.unitName);
            const factor = u?.factor||1;
            const required = item.quantity*factor;
            const stock = p.units?.[0]?.stock||0;
            if(required>stock) return {ok:false, error:`مخزون غير كاف لـ ${item.productName}`};
        }
        return {ok:true, products};
    };
    POS._updateLocalStock = function(products) {
        for(const item of POS.state.cart){
            const p = products?.find(p=>p.id===item.productId) || POS._getProductById(item.productId);
            if(!p?.units?.length) continue;
            const base = p.units[0];
            const u = p.units.find(u=>u.name===item.unitName);
            const factor = u?.factor||1;
            const reduction = item.unitName===base.name ? item.quantity : item.quantity*factor;
            base.stock = Math.max(0, (base.stock||0)-reduction);
            POS._updateProductInCache(p);
        }
    };
})();
