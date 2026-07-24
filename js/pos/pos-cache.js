'use strict';

export function _buildCache(POS) {
    POS.cache.prods.clear();
    POS.cache.custs.clear();
    POS.cache.barcode.clear();
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
}

export function _updateProductInCache(POS, product) {
    if (!product) return;
    const old = POS.cache.prods.get(String(product.id));
    if (old) {
        if (old.barcode) POS.cache.barcode.delete(old.barcode);
        if (old.code) POS.cache.barcode.delete(old.code);
    }
    const id = String(product.id);
    POS.cache.prods.set(id, product);
    POS.cache.prods.set(product.id, product);
    if (product.barcode) POS.cache.barcode.set(product.barcode, product);
    if (product.code) POS.cache.barcode.set(product.code, product);
}
