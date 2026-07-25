'use strict';
(function() {
    const POS = window.POS;

    POS._loadData = async function() {
        POS.state.db = U.dbReady();
        await POS._fetchProdsAndCusts();
        POS._restoreCart();
        POS._loadEditInvoice();
        POS._renderProductGrid();
        if (!POS.state.products.length) {
            // الشبكة تظهر رسالة مع زر إعادة المحاولة
        }
    };

    POS._fetchProdsAndCusts = async function() {
        let prods = [], custs = [];
        if (POS.state.db) {
            try { prods = await DB.getProducts() || []; } catch (e) { console.error(e); }
            try { custs = await DB.getParties('customer') || []; } catch (e) {}
        } else if (U.localReady()) {
            try { prods = await localDB.getAll('products') || []; } catch (e) {}
            try { custs = await localDB.getAll('parties') || []; } catch (e) {}
        }
        POS.state.products = prods;
        POS.state.customers = custs.filter(c => c.type === 'customer');
        POS.state.products.forEach(p => {
            if (typeof p.units === 'string') try { p.units = JSON.parse(p.units); } catch { p.units = []; }
            if (!p.units || !p.units.length) p.units = [{ name: 'وحدة', price: p.price||0, cost: p.cost||0, factor:1, stock: p.stock||0 }];
        });
        POS._buildCache();
    };

    POS._buildCache = function() {
        POS.cache.prods.clear(); POS.cache.custs.clear(); POS.cache.barcode.clear();
        POS.state.products.forEach(p => {
            POS.cache.prods.set(String(p.id), p);
            POS.cache.prods.set(p.id, p);
            if (p.barcode) POS.cache.barcode.set(p.barcode, p);
            if (p.code) POS.cache.barcode.set(p.code, p);
        });
        POS.state.customers.forEach(c => {
            POS.cache.custs.set(String(c.id), c);
            POS.cache.custs.set(c.id, c);
        });
    };

    POS._restoreCart = function() {
        const s = localStorage.getItem('pos_cart'); if (!s) return;
        try {
            const d = JSON.parse(s);
            if (d.ts && Date.now() - d.ts > 2*3600000) { localStorage.removeItem('pos_cart'); return; }
            POS.state.cart = d.cart || [];
            POS.state.selectedCustomerId = d.cust;
            POS.state.discountType = d.discType || 'amount';
            POS.state.discountValue = d.discVal || 0;
            POS.state.editingInv = d.editingInv;
            POS.state.usedBalance = d.usedBalance || 0;
            POS.state.resumedInvoiceId = d.resumedInvoiceId || null;
            POS._renderCart();
            if (d.cust) { const c = POS.cache.custs.get(String(d.cust)); if (c) POS.el.customerSearchInput.value = c.name || ''; POS._updateCustDisplay(); }
        } catch { localStorage.removeItem('pos_cart'); }
    };
})();
