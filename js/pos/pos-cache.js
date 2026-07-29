'use strict';
(function() {
    const POS = window.POS;
    POS._buildCache = function() {
        POS.cache.prods.clear(); POS.cache.custs.clear(); POS.cache.barcode.clear();
        POS.state.products.forEach(p => {
            POS.cache.prods.set(String(p.id), p); POS.cache.prods.set(p.id, p);
            if (p.barcode) POS.cache.barcode.set(p.barcode, p);
            if (p.code) POS.cache.barcode.set(p.code, p);
        });
        POS.state.customers.forEach(c => { POS.cache.custs.set(String(c.id), c); POS.cache.custs.set(c.id, c); });
    };
    POS._updateProductInCache = function(product) {
        if (!product || !product.id) return;
        const old = POS.cache.prods.get(String(product.id));
        if (old) {
            if (old.barcode && old.barcode !== product.barcode) POS.cache.barcode.delete(old.barcode);
            if (old.code && old.code !== product.code) POS.cache.barcode.delete(old.code);
        }
        POS.cache.prods.set(String(product.id), product);
        POS.cache.prods.set(product.id, product);
        if (product.barcode) POS.cache.barcode.set(product.barcode, product);
        if (product.code) POS.cache.barcode.set(product.code, product);
        const idx = POS.state.products.findIndex(p => p.id === product.id);
        if (idx !== -1) POS.state.products[idx] = product;
    };
    POS._findProductByBarcode = function(code) {
        if (!code) return null;
        const cached = POS.cache.barcode.get(code);
        if (cached) return cached;
        const product = POS.state.products.find(p => p.barcode === code || p.code === code);
        if (product) POS.cache.barcode.set(code, product);
        return product || null;
    };
    POS._getProductById = function(id) { return POS.cache.prods.get(String(id)) || null; };
    POS._getCustomerById = function(id) { return POS.cache.custs.get(String(id)) || null; };
})();
