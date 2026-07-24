/* =============================================
   supabase-db.js - دوال قاعدة البيانات (مُحسَّن ومتوافق مع IndexedDB)
   ============================================= */
(function() {
    'use strict';

    function getClient() {
        return window.supabaseClient;
    }

    // ---------- دوال سحابية مساعدة ----------
    const _cloud = {
        saveProduct: async (p) => { const { error } = await getClient().from('products').upsert(p, { onConflict: 'id' }); if (error) throw error; },
        saveParty: async (p) => { const { error } = await getClient().from('parties').upsert(p, { onConflict: 'id' }); if (error) throw error; },
        saveInvoice: async (inv) => { const { error } = await getClient().from('invoices').upsert(inv, { onConflict: 'id' }); if (error) throw error; },
        savePurchase: async (pur) => { const { error } = await getClient().from('purchases').upsert(pur, { onConflict: 'id' }); if (error) throw error; },
        saveTransaction: async (t) => { const { error } = await getClient().from('transactions').upsert(t, { onConflict: 'id' }); if (error) throw error; },
        saveReturn: async (r) => { const { error } = await getClient().from('returns').upsert(r, { onConflict: 'id' }); if (error) throw error; },
        saveJournalEntry: async (e) => { const { error } = await getClient().from('journal_entries').upsert(e, { onConflict: 'id' }); if (error) throw error; },
        deleteProduct: async (p) => { const { error } = await getClient().from('products').update({ deleted_at: new Date().toISOString() }).eq('id', p.id); if (error) throw error; },
        deleteParty: async (p) => { const { error } = await getClient().from('parties').update({ deleted_at: new Date().toISOString() }).eq('id', p.id); if (error) throw error; }
    };

    // ---------- مُولّد UUID ----------
    function generateUUID() {
        if (window.generateUUID) return window.generateUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ---------- طبقة Offline ----------
    function offlineGet(storeName, cloudFetcher, forceRefresh = false) {
        if (window.OfflineLayer && typeof window.OfflineLayer.get === 'function') {
            return window.OfflineLayer.get(storeName, cloudFetcher, forceRefresh);
        }
        if (!getClient()) {
            console.warn('Supabase client غير متوفر ولا OfflineLayer');
            return Promise.resolve([]);
        }
        return cloudFetcher().catch(err => {
            console.error(`فشل جلب ${storeName}`, err);
            return [];
        });
    }

    function offlineSave(storeName, data, cloudSaver, isNew) {
        if (window.OfflineLayer && typeof window.OfflineLayer.save === 'function') {
            return window.OfflineLayer.save(storeName, data, cloudSaver, isNew);
        }
        if (!getClient()) {
            return Promise.reject(new Error('غير متصل ولا توجد قاعدة بيانات محلية'));
        }
        return cloudSaver(data);
    }

    function invalidateDataCache(storeName) {
        if (window.OfflineLayer && typeof window.OfflineLayer.invalidate === 'function') {
            window.OfflineLayer.invalidate(storeName);
        }
    }

    // ---------- تحويل وحدات المنتج (دعم علاقات و JSON) ----------
    function transformProducts(rawProducts) {
        return rawProducts.map(p => {
            const units = (p.product_units || []).map(u => ({
                id: u.id,
                name: u.unit_name || u.name,
                price: u.price,
                cost: u.cost,
                factor: u.factor,
                stock: u.stock,
                minPrice: u.min_price,
                maxPrice: u.max_price,
                barcode: u.barcode
            }));
            if (units.length === 0) {
                let parsedUnits = [];
                if (p.units) {
                    if (typeof p.units === 'string') {
                        try { parsedUnits = JSON.parse(p.units); } catch { parsedUnits = []; }
                    } else if (Array.isArray(p.units)) {
                        parsedUnits = p.units;
                    }
                }
                parsedUnits.forEach(u => units.push({
                    name: u.name || 'وحدة',
                    price: u.price || 0,
                    cost: u.cost || 0,
                    factor: u.factor || 1,
                    stock: u.stock || 0,
                    minPrice: u.min_price || 0,
                    maxPrice: u.max_price || 0
                }));
                if (units.length === 0) {
                    units.push({ name: 'وحدة', price: p.price || 0, cost: p.cost || 0, factor: 1, stock: p.stock || 0, minPrice: 0, maxPrice: 0 });
                }
            }
            return { ...p, units, product_units: undefined };
        });
    }

    // ========== كائن DB العام ==========
    window.DB = {
        getProducts: (force) => offlineGet('products', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            try {
                const { data, error } = await client.from('products').select('*, product_units(*)').is('deleted_at', null).order('name');
                if (!error) return transformProducts(data || []);
                console.warn('product_units join failed:', error.message);
            } catch (e) {}
            const { data, error } = await client.from('products').select('*').is('deleted_at', null).order('name');
            if (error) throw error;
            return transformProducts(data || []);
        }, force),

        saveProduct(p) {
            const isNew = !p.id;
            return offlineSave('products', { ...p, id: p.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, _cloud.saveProduct, isNew);
        },
        deleteProduct: (id) => offlineSave('products', { id, deleted_at: new Date().toISOString(), _operation: 'UPDATE' }, _cloud.deleteProduct, false),

        getParties: (type) => offlineGet('parties' + (type ? '_' + type : ''), async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            let q = client.from('parties').select('*').is('deleted_at', null).order('name');
            if (type) q = q.eq('type', type);
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        }),
        saveParty(p) {
            const isNew = !p.id;
            return offlineSave('parties', { ...p, id: p.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, _cloud.saveParty, isNew);
        },
        deleteParty: (id) => offlineSave('parties', { id, deleted_at: new Date().toISOString(), _operation: 'UPDATE' }, _cloud.deleteParty, false),

        getInvoices: () => offlineGet('invoices', async () => {
            const { data, error } = await getClient().from('invoices').select('*').is('deleted_at', null).order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),
        saveInvoice(inv) {
            const isNew = !inv.id;
            return offlineSave('invoices', { ...inv, id: inv.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, _cloud.saveInvoice, isNew);
        },
        getHeldInvoices: () => offlineGet('held_invoices', async () => {
            const { data, error } = await getClient().from('invoices').select('*').eq('type', 'sale').eq('status', 'held').is('deleted_at', null);
            if (error) throw error;
            return data || [];
        }),
        getInvoicesLight: () => offlineGet('invoices_light', async () => {
            const { data, error } = await getClient().from('invoices').select('id, invoice_number, date, created_at, type, customer_id, customer_name, total, paid, remaining, status').is('deleted_at', null).order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),
        getInvoiceById: async (id) => {
            const { data, error } = await getClient().from('invoices').select('*').eq('id', id).maybeSingle();
            if (error) throw error;
            return data || null;
        },
        createSaleInvoice: async (inv) => {
            const { data, error } = await getClient().rpc('create_sale_invoice', { p_data: inv });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            invalidateDataCache('invoices');
            return data;
        },
        editSaleInvoice: async (inv) => {
            try {
                const { data: rpcData, error } = await getClient().rpc('edit_sale_invoice', { p_data: inv });
                if (!error && rpcData && rpcData.success !== false) return rpcData;
                throw error || new Error(rpcData?.error);
            } catch (e) {
                console.warn('edit_sale_invoice fallback:', e);
                const { error: updateError } = await getClient().from('invoices').upsert(inv, { onConflict: 'id' });
                if (updateError) throw updateError;
                return { success: true };
            }
        },

        getPurchases: () => offlineGet('purchases', async () => {
            const { data, error } = await getClient().from('purchases').select('*').is('deleted_at', null).order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),
        savePurchase(pur) {
            const isNew = !pur.id;
            return offlineSave('purchases', { ...pur, id: pur.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, _cloud.savePurchase, isNew);
        },
        getPurchasesLight: () => offlineGet('purchases_light', async () => {
            const { data, error } = await getClient().from('purchases').select('id, date, created_at, supplier_id, supplier_name, total, paid, remaining, status').is('deleted_at', null).order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),
        createPurchaseInvoice: async (inv) => {
            const { data, error } = await getClient().rpc('create_purchase_invoice', { p_data: inv });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            invalidateDataCache('purchases');
            return data;
        },

        getTransactions: () => offlineGet('transactions', async () => {
            const { data, error } = await getClient().from('transactions').select('*').is('deleted_at', null).order('date', { ascending: false });
            if (error) throw error;
            return data || [];
        }),
        saveTransaction(t) {
            const isNew = !t.id;
            return offlineSave('transactions', { ...t, id: t.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, _cloud.saveTransaction, isNew);
        },

        getReturns: (type) => offlineGet('returns' + (type ? '_' + type : ''), async () => {
            let q = getClient().from('returns').select('*').is('deleted_at', null).order('date', { ascending: false });
            if (type) q = q.eq('type', type);
            const { data, error } = await q;
            if (error) throw error;
            return data || [];
        }),
        saveReturn(r) {
            const isNew = !r.id;
            return offlineSave('returns', { ...r, id: r.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, _cloud.saveReturn, isNew);
        },

        getJournalEntries: () => offlineGet('journal_entries', async () => {
            const { data, error } = await getClient().from('journal_entries').select('*').is('deleted_at', null).order('date', { ascending: false });
            if (error) throw error;
            return data || [];
        }),
        saveJournalEntry(e) {
            const isNew = !e.id;
            return offlineSave('journal_entries', { ...e, id: e.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, _cloud.saveJournalEntry, isNew);
        },

        getAccounts: () => offlineGet('accounts', async () => {
            const { data, error } = await getClient().from('accounts').select('*').is('deleted_at', null).order('name');
            if (error) throw error;
            return data || [];
        }),

        getSettings: () => offlineGet('settings', async () => {
            const tenantId = window.SessionStore?.tenantId;
            if (!tenantId) return {};
            const { data, error } = await getClient().from('settings').select('data').eq('tenant_id', tenantId).maybeSingle();
            if (error && error.code !== 'PGRST116') throw error;
            return data?.data || {};
        }),
        saveSettings: async (s) => {
            const tenantId = window.SessionStore?.tenantId;
            if (!tenantId) throw new Error('لا يوجد معرف مستأجر');
            const { data, error } = await getClient().from('settings').upsert({ tenant_id: tenantId, data: s }, { onConflict: 'tenant_id' }).select('data').single();
            if (error) throw error;
            invalidateDataCache('settings');
            return data.data;
        },

        generateInvoiceNumber: async () => {
            const { data, error } = await getClient().rpc('next_sequence', { p_name: 'inv_' + new Date().getFullYear().toString().slice(-2) });
            if (error) throw new Error(error.message);
            return data;
        },

        getAllTenantsData: async () => {
            const { data, error } = await getClient().rpc('get_all_tenants_data');
            if (error) throw error;
            return data || [];
        },
        deleteTenant: async (tenantId) => {
            const { error } = await getClient().rpc('delete_tenant', { p_tenant_id: tenantId });
            if (error) throw error;
        }
    };
})();
