'use strict';
import { _buildCache } from './pos-cache.js';

export async function _loadData(POS) {
    POS.state.db = POS.U.dbReady();
    await POS._fetchProdsAndCusts();
    POS._restoreCart();
    POS._loadEditInvoice();
    POS._renderProductGrid();
    if (!POS.state.products.length) window.Toast?.info('No products available');
}

export async function _fetchProdsAndCusts(POS) {
    try {
        let custs = [];
        if (POS.state.db) {
            POS.state.products = await DB.getProducts() || [];
            custs = await DB.getParties('customer') || [];
        } else if (POS.U.localReady()) {
            POS.state.products = await localDB.getAll('products') || [];
            custs = await localDB.getAll('parties') || [];
        } else {
            POS.state.products = [];
            custs = [];
        }
        POS.state.customers = custs.filter(c => c.type === 'customer');
        POS.state.products.forEach(p => {
            if (typeof p.units === 'string') try { p.units = JSON.parse(p.units); } catch (e) { p.units = []; }
        });
        _buildCache(POS);
    } catch (e) {
        console.error('Failed to load data:', e);
        POS.state.products = [];
        POS.state.customers = [];
        window.Toast?.error('Failed to load data');
    }
}

export function _loadEditInvoice(POS) {
    const id = localStorage.getItem('edit_invoice_id');
    if (!id) return;
    localStorage.removeItem('edit_invoice_id');
    if (POS.state.db && DB.getInvoiceById) {
        DB.getInvoiceById(id).then(inv => {
            if (inv?.type === 'sale' && inv.status !== 'voided') {
                POS.state.cart = (inv.items || []).map(i => ({...i}));
                POS.state.selectedCustomerId = inv.customer_id;
                POS.state.editingInv = inv.id;
                if (inv.customer_id) {
                    const c = POS.cache.custs.get(String(inv.customer_id));
                    if (c) POS.el.customerSearchInput.value = c.name || '';
                    POS._updateCustDisplay();
                } else {
                    POS.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
                }
                POS._renderCart();
                window.Toast?.info('Invoice loaded for editing');
            }
        }).catch(() => {});
    }
}

export function _setupRealtimeSync(POS) {
    if (!window.supabaseClient) return;
    window.supabaseClient
        .channel('products-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
            if (payload.eventType === 'DELETE') {
                const deletedId = payload.old?.id;
                if (deletedId) {
                    POS.state.products = POS.state.products.filter(p => p.id !== deletedId);
                    POS.cache.prods.delete(String(deletedId));
                    POS.cache.prods.delete(deletedId);
                    POS._debouncedRenderGrid(POS);
                }
                return;
            }
            const updatedProduct = payload.new;
            if (updatedProduct) {
                const idx = POS.state.products.findIndex(p => p.id === updatedProduct.id);
                if (idx !== -1) POS.state.products[idx] = updatedProduct;
                else POS.state.products.push(updatedProduct);
                POS._updateProductInCache(updatedProduct);
                POS._debouncedRenderGrid(POS);
            }
        })
        .subscribe();
}

export function _setupConnectionCheck(POS) {
    POS.state._connectionCheckTimer = setInterval(async () => {
        const online = navigator.onLine;
        if (online && window.supabaseClient) {
            try { await window.supabaseClient.from('tenants').select('id').limit(1); }
            catch { document.body.classList.add('slow-connection'); return; }
            document.body.classList.remove('slow-connection');
        }
    }, 30000);
}

export function _startTodayStatsUpdater(POS) {
    const update = async () => {
        if (!POS.state.db) return;
        try {
            const invs = await DB.getInvoicesLight();
            const today = U.today();
            const todayInvs = invs.filter(i => i.date === today && i.type === 'sale');
            const total = todayInvs.reduce((s, i) => s + (i.total || 0), 0);
            if (POS.el.todaySales) POS.el.todaySales.textContent = U.fmtMoney(total);
            if (POS.el.todayCount) POS.el.todayCount.textContent = todayInvs.length;
        } catch {}
    };
    update();
    setInterval(update, 60000);
}

export async function _syncOfflineSales(POS) {
    if (!navigator.onLine || !POS.state.db) return;
    const local = window.localDB;
    if (!local?.ready) return;
    const offlineSales = await local.getAll('offline_sales').catch(() => []);
    for (const sale of offlineSales) {
        try {
            sale._offline = undefined;
            await DB.createSaleInvoice(sale);
            await local.delete('offline_sales', sale.id);
        } catch (e) { console.warn('Failed to sync offline sale', e); }
    }
}
