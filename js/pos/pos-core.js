'use strict';
import { U, CASH_CUSTOMER_STORED } from './utils.js';
import { _localInvNum } from './pos-state.js';
import { _updateProductInCache } from './pos-cache.js';
import { _showModal, _closeModal, _renderProductGrid, _previewPayment, _togglePaymentFields } from './pos-dom.js';

export function _openUnitModal(POS, id) {
    const p = POS.cache.prods.get(String(id));
    if (!p?.units?.length) { window.Toast?.info('Product not found'); return; }
    if (p.units.length === 1 && POS.state.quickSale) {
        POS._quickAdd(p, p.units[0]);
        return;
    }
    POS.state.selectedProduct = p;
    POS.state.selectedUnit = p.units[0];
    POS.el.modalProductName.textContent = p.name;
    POS.el.unitButtons.innerHTML = p.units.map((u, i) =>
        `<button class="unit-btn ${i===0?'active':''}" data-index="${i}">${U.escape(u.name)}</button>`
    ).join('');
    POS._updateUnitInfo();
    POS._showModal('unitQuantityModal');
}

export function _selectUnit(POS, i) {
    POS.state.selectedUnit = POS.state.selectedProduct.units[i];
    POS.el.unitButtons.querySelectorAll('.unit-btn').forEach((b, j) => b.classList.toggle('active', j===i));
    POS._updateUnitInfo();
}

export function _updateUnitInfo(POS) {
    const p = POS.state.selectedProduct, u = POS.state.selectedUnit;
    if (!p||!u) return;
    const base = p.units[0], stock = base.stock || 0, fac = u.factor || 1;
    const avail = u === base ? stock : Math.floor(stock / fac);
    const max = Math.max(0, avail);
    POS.el.selectedPrice.value = u.price || 0;
    POS.el.selectedQuantity.max = max;
    POS.el.selectedQuantity.value = max > 0 ? 1 : 0;
    POS.el.stockInfo.textContent = `Stock: ${max} ${u.name}`;
    POS.el.priceLimitMsg.style.display = (u.minPrice || u.maxPrice) ? 'block' : 'none';
    if (u.minPrice || u.maxPrice) POS.el.priceLimitMsg.textContent = `Price between ${u.minPrice || 0} - ${u.maxPrice || '∞'} EGP`;
}

export function _addToCart(POS) {
    if (POS.state.addingItem) return;
    POS.state.addingItem = true;
    try {
        const q = +POS.el.selectedQuantity?.value || 0, max = +POS.el.selectedQuantity?.max || 0;
        if (q <= 0 || q > max) { window.Toast?.error('Quantity not available'); return; }
        const u = POS.state.selectedUnit;
        let pr = +POS.el.selectedPrice?.value || 0;
        if (!POS._canChangePrice()) pr = u?.price || 0;
        if (u) {
            if (u.minPrice > 0 && pr < u.minPrice) { window.Toast?.error(`Min ${U.fmtMoney(u.minPrice)}`); return; }
            if (u.maxPrice > 0 && pr > u.maxPrice) { window.Toast?.error(`Max ${U.fmtMoney(u.maxPrice)}`); return; }
        }
        const product = POS.state.selectedProduct;
        const unitName = u?.name || '';
        const cost = u?.cost || 0;
        const exist = POS.state.cart.find(i => i.productId === product.id && i.unitName === unitName);
        if (exist) {
            POS.el.duplicateProductMsg.textContent = `${product.name} already in cart with qty ${exist.quantity}. Increase?`;
            POS._duplicateCallback = (confirmed) => {
                if (confirmed) {
                    exist.quantity = U.round(exist.quantity + q, 3);
                    if (pr) exist.price = pr;
                    POS._renderCart();
                    POS._saveCart();
                }
                POS.state.addingItem = false;
                POS._closeModal('unitQuantityModal');
            };
            POS._showModal('duplicateProductModal');
            return;
        }
        POS.state.cart.push({
            productId: product.id,
            productName: product.name,
            unitName,
            quantity: q,
            price: pr,
            cost,
            factor: u?.factor || 1,
            isBase: u === product.units[0],
            note: ''
        });
        U.playBeep('add');
        POS._renderCart();
        POS._closeModal('unitQuantityModal');
        POS._saveCart();
        POS.el.productSearchInput?.focus();
        POS.el.productSearchInput?.select();
    } catch (e) {
        window.Toast?.error(e.message);
    } finally {
        POS.state.addingItem = false;
        if (POS.el.addToCartBtn) POS.el.addToCartBtn.disabled = false;
    }
}

export function _quickAdd(POS, product, unit) {
    const exist = POS.state.cart.find(i => i.productId === product.id && i.unitName === unit.name);
    if (exist) {
        exist.quantity = U.round(exist.quantity + 1, 3);
    } else {
        POS.state.cart.push({
            productId: product.id,
            productName: product.name,
            unitName: unit.name,
            quantity: 1,
            price: unit.price || 0,
            cost: unit.cost || 0,
            factor: unit.factor || 1,
            isBase: unit === product.units[0],
            note: ''
        });
    }
    U.playBeep('add');
    POS._renderCart();
    POS._saveCart();
    POS._updateLocalStock([product]);
    POS._renderProductGrid();
    window.Toast?.info(`${product.name} added`);
}

export function _openPayment(POS) {
    if (!POS.state.cart.length) { window.Toast?.info('Cart is empty'); return; }
    const { sub, disc, net } = POS._calcTotals();
    POS.el.paySubtotal.textContent = U.fmtMoney(sub);
    POS.el.payDiscount.textContent = U.fmtMoney(disc);
    POS.el.payNet.textContent = U.fmtMoney(net);
    const cust = POS._getCust(), bal = cust?.balance || 0;
    POS.el.currentBalance.textContent = U.fmtMoney(Math.abs(bal));
    POS.el.currentBalance.classList.toggle('text-success', bal >= 0);
    POS.el.currentBalance.classList.toggle('text-danger', bal < 0);
    POS.el.cashAmount.value = '';
    POS.el.transferAmount.value = '';
    POS.el.paymentMethod.value = 'cash';
    POS._togglePaymentFields();
    POS._previewPayment();
    POS._showModal('paymentModal');
    if (bal < 0) window.Toast?.warning('Customer has debt: ' + U.fmtMoney(-bal));
}

export async function _completePayment(POS) {
    if (POS.state.busy) { window.Toast?.info('Processing...'); return; }
    POS.state.busy = true;
    POS.el.confirmAndPrintBtn.disabled = true;
    try {
        const { sub, disc, net } = POS._calcTotals(), m = POS.el.paymentMethod?.value || 'cash';
        let cash = 0, trans = 0;
        if (m === 'cash') cash = +POS.el.cashAmount?.value || 0;
        else if (m === 'transfer') trans = +POS.el.transferAmount?.value || 0;
        else if (m === 'mixed') { cash = +POS.el.cashAmount?.value || 0; trans = +POS.el.transferAmount?.value || 0; }
        const used = (m === 'credit') ? 0 : POS.state.usedBalance || 0;
        const paid = (m === 'credit') ? 0 : U.round(cash + trans + used, 2);
        const diff = (m === 'credit') ? -net : U.round(paid - net, 2);
        const cust = POS._getCust(), oldBal = cust?.balance || 0;

        if (diff > 0 && cust && !await POS._confirmAction(`Add ${U.fmtMoney(diff)} to balance?`)) {
            POS.state.busy = false;
            POS.el.confirmAndPrintBtn.disabled = false;
            return;
        }
        if (m === 'credit' && cust && !await POS._confirmAction(`Record ${U.fmtMoney(net)} as debt?`)) {
            POS.state.busy = false;
            POS.el.confirmAndPrintBtn.disabled = false;
            return;
        }

        const stockCheck = await POS._checkStock();
        if (!stockCheck.ok) throw new Error(stockCheck.error);

        const invNum = POS.state.db ? await DB.generateInvoiceNumber() : _localInvNum();
        const inv = {
            id: U.uuid(),
            invoice_number: invNum,
            date: U.today(),
            customer_id: POS.state.selectedCustomerId || null,
            customer_name: cust?.name || CASH_CUSTOMER_STORED,
            items: POS.state.cart.map(i => ({...i, _tempId: undefined})),
            subtotal: sub,
            discount: disc,
            total: net,
            cash_paid: cash,
            transfer_paid: trans,
            used_customer_balance: used,
            paid,
            remaining: diff >= 0 ? 0 : -diff,
            customer_credit_added: diff > 0 ? diff : 0,
            change_amount: diff > 0 ? diff : 0,
            status: m === 'credit' ? 'credit' : (diff >= 0 ? 'paid' : 'partial'),
            notes: POS.el.paymentNotes?.value || '',
            tenant_id: POS.state.currentUser?.tenant_id,
            created_by: POS.state.currentUser?.id
        };
        if (POS.state.editingInv) inv.original_invoice_id = POS.state.editingInv;

        let result;
        if (navigator.onLine && POS.state.db) {
            result = POS.state.editingInv && DB.editSaleInvoice
                ? await DB.editSaleInvoice(inv)
                : await DB.createSaleInvoice(inv);
        } else {
            if (window.localDB?.ready) {
                await window.localDB.put('offline_sales', { ...inv, _offline: true });
                POS.state._offlineSales.push({ ...inv, _offline: true });
                result = { success: true, invoice_number: inv.invoice_number };
            } else throw new Error('Offline and no local DB');
        }
        if (!result?.success) throw new Error(result?.error || 'Failed');

        if (POS.state.resumedInvoiceId) {
            try { await window.supabaseClient.from('invoices').delete().eq('id', POS.state.resumedInvoiceId); } catch {}
            POS.state.resumedInvoiceId = null;
        }

        POS._closeModal('paymentModal');
        POS._updateLocalStock(stockCheck.products);
        POS._renderProductGrid();
        POS._showReceipt(
            { ...inv, invoice_number: result.invoice_number || inv.invoice_number },
            cust || { name: CASH_CUSTOMER_STORED, balance: 0 },
            POS.state.cart,
            { sub, disc, net },
            oldBal,
            { cash, trans, used, diff }
        );
        POS._resetCart();
        POS._resetCartRender();
        localStorage.removeItem('payment_draft');
        U.playBeep('success');
        window.Toast?.success('Sale completed');
    } catch (e) {
        console.error(e);
        window.Toast?.error(e.message);
    } finally {
        POS.state.busy = false;
        POS.el.confirmAndPrintBtn.disabled = false;
    }
}

export function _checkStock(POS) {
    let productsToCheck = POS.state.products;
    if (navigator.onLine && POS.state.db) {
        return DB.getProducts(true).then(fresh => {
            if (fresh) productsToCheck = fresh;
            for (const item of POS.state.cart) {
                const product = productsToCheck.find(p => p.id === item.productId);
                if (!product) return { ok: false, error: `${item.productName} unavailable` };
                const unit = product.units?.find(u => u.name === item.unitName);
                const factor = unit?.factor || 1;
                const required = item.quantity * factor;
                const stock = product.units?.[0]?.stock || 0;
                if (required > stock) return { ok: false, error: `Not enough stock for ${item.productName}` };
            }
            return { ok: true, products: productsToCheck };
        }).catch(() => POS._localStockCheck());
    }
    return Promise.resolve(POS._localStockCheck());
}

export function _localStockCheck(POS) {
    for (const item of POS.state.cart) {
        const product = POS.cache.prods.get(item.productId);
        if (!product) return { ok: false, error: `${item.productName} not found` };
        const unit = product.units?.find(u => u.name === item.unitName);
        const factor = unit?.factor || 1;
        const required = item.quantity * factor;
        const stock = product.units?.[0]?.stock || 0;
        if (required > stock) return { ok: false, error: `Not enough stock for ${item.productName}` };
    }
    return { ok: true, products: POS.state.products };
}

export function _updateLocalStock(POS, products) {
    // تحديث المخزون في الحالة المحلية
    for (const item of POS.state.cart) {
        const product = products?.find(p => p.id === item.productId) || POS.cache.prods.get(item.productId);
        if (!product?.units?.length) continue;
        const baseUnit = product.units[0];
        const selectedUnit = product.units.find(u => u.name === item.unitName);
        const factor = selectedUnit?.factor || 1;
        const reduction = item.unitName === baseUnit.name ? item.quantity : item.quantity * factor;
        baseUnit.stock = Math.max(0, (baseUnit.stock || 0) - reduction);
        _updateProductInCache(POS, product);
    }
    // مزامنة المخزون الجديد مع state.products إذا كانت المنتجات المستخدمة من الخادم
    if (products && products !== POS.state.products) {
        // إذا تم جلب منتجات جديدة، نقوم بتحديث state.products بالمخزونات المعدلة
        products.forEach(p => {
            const existing = POS.state.products.find(sp => sp.id === p.id);
            if (existing && p.units?.length) {
                existing.units[0].stock = p.units[0].stock;
            }
        });
    }
}

export async function _confirmAction(POS, message) {
    if (window.ModalConfirm && ModalConfirm.show) {
        return await ModalConfirm.show({ title: 'Confirm', message, icon: 'warn', confirmText: 'Yes', cancelText: 'No' });
    }
    return confirm(message);
}

export function holdInvoice(POS) {
    if (!POS.state.cart.length) { window.Toast?.info('Cart is empty'); return; }
    const { sub, disc, net } = POS._calcTotals();
    const inv = {
        id: U.uuid(),
        invoice_number: POS.state.db ? DB.generateInvoiceNumber() : _localInvNum(),
        type: 'sale',
        date: U.today(),
        customer_id: POS.state.selectedCustomerId || null,
        customer_name: POS._getCust()?.name || CASH_CUSTOMER_STORED,
        items: POS.state.cart.map(i => ({...i})),
        subtotal: sub,
        discount: disc,
        total: net,
        paid: 0,
        remaining: net,
        status: 'held',
        notes: 'Held',
        tenant_id: POS.state.currentUser?.tenant_id,
        created_by: POS.state.currentUser?.id
    };
    try {
        if (POS.state.db) DB.saveInvoice(inv);
        else if (U.localReady()) localDB.put('invoices', inv);
        window.Toast?.success(`Held ${inv.invoice_number}`);
        POS._resetCart();
    } catch (e) { window.Toast?.error('Failed to hold'); }
}

export async function loadHeld(POS) {
    let invs = [];
    try {
        if (POS.state.db && DB.getHeldInvoices) invs = await DB.getHeldInvoices() || [];
        else if (POS.state.db) invs = (await DB.getInvoices()).filter(i => i.type === 'sale' && i.status === 'held');
        else if (U.localReady()) invs = (await localDB.getAll('invoices')).filter(i => i.type === 'sale' && i.status === 'held');
    } catch {}
    const c = POS.el.heldInvoicesList; if (!c) return;
    c.innerHTML = invs.length
        ? invs.map(i => `<div class="held-invoice-item" data-id="${i.id}" style="padding:15px;border:1px solid ${U.cssVar('--border-light', '#e2e8f0')};border-radius:12px;margin-bottom:10px;cursor:pointer;display:flex;justify-content:space-between;">
            <div><strong>${U.escape(i.invoice_number || i.id?.substring(0, 8))}</strong><br>${U.escape(i.customer_name || CASH_CUSTOMER_STORED)} - ${U.fmtMoney(i.total)}<br><small style="color:var(--text-muted);">${U.fmtDate(i.date)}</small></div>
            <div><i class="fas fa-play"></i></div></div>`).join('')
        : '<p style="text-align:center;">No held invoices</p>';
    c.querySelectorAll('.held-invoice-item').forEach(el => el.addEventListener('click', () => POS._resumeInvoice(el.dataset.id)));
    POS._showModal('heldInvoicesModal');
}

export async function _resumeInvoice(POS, id) {
    let inv;
    try { if (POS.state.db) inv = await DB.getInvoiceById(id); else if (U.localReady()) inv = await localDB.getById('invoices', id); } catch {}
    if (!inv) { window.Toast?.error('Not found'); return; }
    POS.state.resumedInvoiceId = id;
    try {
        if (POS.state.db) await window.supabaseClient.from('invoices').update({ status: 'resumed' }).eq('id', id);
        else if (U.localReady()) await localDB.put('invoices', { ...inv, status: 'resumed' });
    } catch {}
    const validItems = [], missingItems = [];
    for (const it of (inv.items || [])) {
        const p = POS.cache.prods.get(String(it.productId));
        if (p) validItems.push(it); else missingItems.push(it.productName || it.productId);
    }
    POS.state.cart = validItems.map(i => ({...i}));
    POS.state.selectedCustomerId = inv.customer_id;
    if (inv.customer_id) {
        const c = POS.cache.custs.get(String(inv.customer_id));
        if (c) POS.el.customerSearchInput.value = c.name || '';
        POS._updateCustDisplay();
    } else {
        POS.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
        POS._updateCustDisplay();
    }
    POS._renderCart();
    POS._closeModal('heldInvoicesModal');
    if (missingItems.length) window.Toast?.warning(`Missing items: ${missingItems.join(', ')}`);
    window.Toast?.success('Invoice resumed');
}
