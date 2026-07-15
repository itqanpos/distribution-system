/* =============================================
   supabase-db.js - دوال قاعدة البيانات (محسّن)
   ============================================= */
(function() {
    'use strict';

    function getClient() {
        return window.supabaseClient;
    }

    // ---------- دوال سحابية مساعدة ----------
    const _cloud = {
        saveProduct: async (p) => {
            const { error } = await getClient().from('products').upsert(p, { onConflict: 'id' });
            if (error) throw error;
        },
        saveParty: async (p) => {
            const { error } = await getClient().from('parties').upsert(p, { onConflict: 'id' });
            if (error) throw error;
        },
        saveInvoice: async (inv) => {
            const { error } = await getClient().from('invoices').upsert(inv, { onConflict: 'id' });
            if (error) throw error;
        },
        savePurchase: async (pur) => {
            const { error } = await getClient().from('purchases').upsert(pur, { onConflict: 'id' });
            if (error) throw error;
        },
        saveTransaction: async (t) => {
            const { error } = await getClient().from('transactions').upsert(t, { onConflict: 'id' });
            if (error) throw error;
        },
        saveReturn: async (r) => {
            const { error } = await getClient().from('returns').upsert(r, { onConflict: 'id' });
            if (error) throw error;
        },
        saveJournalEntry: async (e) => {
            const { error } = await getClient().from('journal_entries').upsert(e, { onConflict: 'id' });
            if (error) throw error;
        },
        deleteProduct: async (p) => {
            const { error } = await getClient().from('products')
                .update({ deleted_at: p.deleted_at || new Date().toISOString() })
                .eq('id', p.id);
            if (error) throw error;
        },
        deleteParty: async (p) => {
            const { error } = await getClient().from('parties')
                .update({ deleted_at: p.deleted_at || new Date().toISOString() })
                .eq('id', p.id);
            if (error) throw error;
        }
    };

    // ---------- مُولّد UUID احتياطي ----------
    function generateUUID() {
        if (window.generateUUID) return window.generateUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ---------- طبقة offline آمنة ----------
    function offlineGet(storeName, cloudFetcher, forceRefresh = false) {
        if (window.OfflineLayer && typeof window.OfflineLayer.get === 'function') {
            return window.OfflineLayer.get(storeName, cloudFetcher, forceRefresh);
        }
        // Fallback: جلب مباشر من Supabase
        if (!getClient()) {
            console.warn('Supabase client غير متوفر ولا OfflineLayer، إرجاع مصفوفة فارغة');
            return [];
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
        // Fallback: حفظ مباشر
        if (!getClient()) {
            throw new Error('غير متصل ولا توجد قاعدة بيانات محلية');
        }
        return cloudSaver(data).catch(err => {
            console.error(`فشل حفظ ${storeName}`, err);
            throw err;
        });
    }

    // دالة مساعدة لإبطال كاش البيانات (وليس كاش الجلسة)
    function invalidateDataCache(storeName) {
        if (window.OfflineLayer && typeof window.OfflineLayer.invalidate === 'function') {
            window.OfflineLayer.invalidate(storeName);
        }
    }

    // ---------- تحويل وحدات المنتج ----------
    function transformProducts(rawProducts) {
        return rawProducts.map(p => {
            const units = (p.product_units || []).map(u => ({
                id: u.id,
                name: u.unit_name,
                price: u.price,
                cost: u.cost,
                factor: u.factor,
                stock: u.stock,
                minPrice: u.min_price,
                maxPrice: u.max_price,
                barcode: u.barcode
            }));
            if (units.length === 0) {
                units.push({
                    name: 'وحدة',
                    price: p.price || 0,
                    cost: p.cost || 0,
                    factor: 1,
                    stock: p.stock || 0,
                    minPrice: 0,
                    maxPrice: 0
                });
            }
            return {
                ...p,
                units,
                product_units: undefined
            };
        });
    }

    // ========== كائن DB العام ==========
    window.DB = {
        // تعريض دوال السحابة للاستخدام الخارجي عند الحاجة
        _cloudSaveProduct: _cloud.saveProduct,
        _cloudSaveParty: _cloud.saveParty,
        _cloudSaveInvoice: _cloud.saveInvoice,
        _cloudSavePurchase: _cloud.savePurchase,
        _cloudSaveTransaction: _cloud.saveTransaction,
        _cloudSaveReturn: _cloud.saveReturn,
        _cloudSaveJournalEntry: _cloud.saveJournalEntry,
        _cloudDeleteProduct: _cloud.deleteProduct,
        _cloudDeleteParty: _cloud.deleteParty,

        // ========== المنتجات ==========
        getProducts: (force) => offlineGet('products', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('products')
                .select('*, product_units(*)')
                .is('deleted_at', null)
                .order('name');
            if (error) throw error;
            return transformProducts(data || []);
        }, force),

        saveProduct(p) {
            const isNew = !p.id;
            const product = {
                ...p,
                id: p.id || generateUUID(),
                _operation: isNew ? 'INSERT' : 'UPDATE'
            };
            return offlineSave('products', product, _cloud.saveProduct, isNew);
        },

        deleteProduct: (id) => {
            const data = {
                id,
                deleted_at: new Date().toISOString(),
                _operation: 'UPDATE'
            };
            return offlineSave('products', data, _cloud.deleteProduct, false);
        },

        // ========== الأطراف ==========
        getParties: (type) => {
            const storeKey = 'parties' + (type ? '_' + type : '');
            return offlineGet(storeKey, async () => {
                const client = getClient();
                if (!client) throw new Error('غير متصل');
                let q = client.from('parties').select('*').is('deleted_at', null).order('name');
                if (type) q = q.eq('type', type);
                const { data, error } = await q;
                if (error) throw error;
                return data || [];
            });
        },

        saveParty(p) {
            const isNew = !p.id;
            const party = {
                ...p,
                id: p.id || generateUUID(),
                _operation: isNew ? 'INSERT' : 'UPDATE'
            };
            return offlineSave('parties', party, _cloud.saveParty, isNew);
        },

        deleteParty: (id) => {
            const data = {
                id,
                deleted_at: new Date().toISOString(),
                _operation: 'UPDATE'
            };
            return offlineSave('parties', data, _cloud.deleteParty, false);
        },

        // ========== الفواتير ==========
        getInvoices: () => offlineGet('invoices', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('invoices')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),

        saveInvoice(inv) {
            const isNew = !inv.id;
            const invoice = {
                ...inv,
                id: inv.id || generateUUID(),
                _operation: isNew ? 'INSERT' : 'UPDATE'
            };
            return offlineSave('invoices', invoice, _cloud.saveInvoice, isNew);
        },

        getHeldInvoices: () => offlineGet('held_invoices', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('invoices')
                .select('*')
                .eq('type', 'sale')
                .eq('status', 'held')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),

        getInvoicesLight: () => offlineGet('invoices_light', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('invoices')
                .select('id, invoice_number, date, created_at, type, customer_id, customer_name, total, paid, remaining, status')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),

        getInvoiceById: async (id) => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('invoices')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        },

        createSaleInvoice: async (inv) => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client.rpc('create_sale_invoice', { p_data: inv });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            invalidateDataCache('invoices');
            invalidateDataCache('invoices_light');
            return data;
        },

        editSaleInvoice: async (inv) => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            // استخدام upsert كبديل آمن إذا لم توجد دالة RPC مخصصة
            try {
                const { data: rpcData, error: rpcError } = await client.rpc('edit_sale_invoice', { p_data: inv });
                if (!rpcError && rpcData) {
                    if (rpcData.success === false) throw new Error(rpcData.error);
                    invalidateDataCache('invoices');
                    return rpcData;
                }
                throw rpcError || new Error('RPC edit_sale_invoice غير متوفرة');
            } catch (rpcErr) {
                console.warn('edit_sale_invoice فشلت، محاولة حفظ مباشر:', rpcErr);
                // بديل: تحديث مباشر للفاتورة
                const { error: updateError } = await client
                    .from('invoices')
                    .upsert(inv, { onConflict: 'id' });
                if (updateError) throw updateError;
                invalidateDataCache('invoices');
                return { success: true };
            }
        },

        // ========== المشتريات ==========
        getPurchases: () => offlineGet('purchases', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('purchases')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),

        savePurchase(pur) {
            const isNew = !pur.id;
            const purchase = {
                ...pur,
                id: pur.id || generateUUID(),
                _operation: isNew ? 'INSERT' : 'UPDATE'
            };
            return offlineSave('purchases', purchase, _cloud.savePurchase, isNew);
        },

        getPurchasesLight: () => offlineGet('purchases_light', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('purchases')
                .select('id, date, created_at, supplier_id, supplier_name, total, paid, remaining, status')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        }),

        getPurchaseById: async (id) => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('purchases')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        },

        createPurchaseInvoice: async (inv) => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client.rpc('create_purchase_invoice', { p_data: inv });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            invalidateDataCache('purchases');
            invalidateDataCache('purchases_light');
            return data;
        },

        // ========== المعاملات ==========
        getTransactions: () => offlineGet('transactions', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('transactions')
                .select('*')
                .is('deleted_at', null)
                .order('date', { ascending: false });
            if (error) throw error;
            return data || [];
        }),

        saveTransaction(t) {
            const isNew = !t.id;
            const trans = {
                ...t,
                id: t.id || generateUUID(),
                _operation: isNew ? 'INSERT' : 'UPDATE'
            };
            return offlineSave('transactions', trans, _cloud.saveTransaction, isNew);
        },

        // ========== المرتجعات ==========
        getReturns: (type) => {
            const storeKey = 'returns' + (type ? '_' + type : '');
            return offlineGet(storeKey, async () => {
                const client = getClient();
                if (!client) throw new Error('غير متصل');
                let q = client.from('returns').select('*').is('deleted_at', null).order('date', { ascending: false });
                if (type) q = q.eq('type', type);
                const { data, error } = await q;
                if (error) throw error;
                return data || [];
            });
        },

        saveReturn(r) {
            const isNew = !r.id;
            const ret = {
                ...r,
                id: r.id || generateUUID(),
                _operation: isNew ? 'INSERT' : 'UPDATE'
            };
            return offlineSave('returns', ret, _cloud.saveReturn, isNew);
        },

        // ========== القيود المحاسبية ==========
        getJournalEntries: () => offlineGet('journal_entries', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('journal_entries')
                .select('*')
                .is('deleted_at', null)
                .order('date', { ascending: false });
            if (error) throw error;
            return data || [];
        }),

        saveJournalEntry(e) {
            const isNew = !e.id;
            const entry = {
                ...e,
                id: e.id || generateUUID(),
                _operation: isNew ? 'INSERT' : 'UPDATE'
            };
            return offlineSave('journal_entries', entry, _cloud.saveJournalEntry, isNew);
        },

        // ========== الحسابات ==========
        getAccounts: () => offlineGet('accounts', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('accounts')
                .select('*')
                .is('deleted_at', null)
                .order('name');
            if (error) throw error;
            return data || [];
        }),

        // ========== الإعدادات ==========
        getSettings: () => offlineGet('settings', async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const tenantId = window.SessionStore?.tenantId;
            if (!tenantId) return {};
            const { data, error } = await client
                .from('settings')
                .select('data')
                .eq('tenant_id', tenantId)
                .maybeSingle();
            if (error && error.code !== 'PGRST116') throw error;
            return data?.data || {};
        }),

        saveSettings: async (s) => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const tenantId = window.SessionStore?.tenantId;
            if (!tenantId) throw new Error('لا يوجد معرف مستأجر');
            const { data, error } = await client
                .from('settings')
                .upsert({ tenant_id: tenantId, data: s }, { onConflict: 'tenant_id' })
                .select('data')
                .single();
            if (error) throw error;
            // إبطال الكاش الخاص بالإعدادات في OfflineLayer
            invalidateDataCache('settings');
            return data.data;
        },

        // ========== أرقام الفواتير ==========
        generateInvoiceNumber: async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client.rpc('next_sequence', {
                p_name: 'inv_' + new Date().getFullYear().toString().slice(-2)
            });
            if (error) throw new Error('فشل توليد رقم الفاتورة: ' + error.message);
            return data;
        },

        // ========== إدارة المستأجرين (للمشرف العام) ==========
        getAllTenantsData: async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client.rpc('get_all_tenants_data');
            if (error) throw error;
            return data || [];
        },

        deleteTenant: async (tenantId) => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { error } = await client.rpc('delete_tenant', { p_tenant_id: tenantId });
            if (error) throw error;
        }
    };
})();
