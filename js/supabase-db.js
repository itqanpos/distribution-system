/* =============================================
   supabase-db.js - دوال قاعدة البيانات (DB) - إصدار محسّن
   ============================================= */
(function() {
    'use strict';

    // الحصول على العميل بشكل آمن
    function getClient() {
        return window.supabaseClient;
    }

    // دوال Cloud مساعدة
    const _cloud = {
        saveProduct: async (p) => { const { error } = await getClient().from('products').upsert(p, { onConflict: 'id' }); if (error) throw error; },
        saveParty: async (p) => { const { error } = await getClient().from('parties').upsert(p, { onConflict: 'id' }); if (error) throw error; },
        saveInvoice: async (inv) => { const { error } = await getClient().from('invoices').upsert(inv, { onConflict: 'id' }); if (error) throw error; },
        savePurchase: async (pur) => { const { error } = await getClient().from('purchases').upsert(pur, { onConflict: 'id' }); if (error) throw error; },
        saveTransaction: async (t) => { const { error } = await getClient().from('transactions').upsert(t, { onConflict: 'id' }); if (error) throw error; },
        saveReturn: async (r) => { const { error } = await getClient().from('returns').upsert(r, { onConflict: 'id' }); if (error) throw error; },
        saveJournalEntry: async (e) => { const { error } = await getClient().from('journal_entries').upsert(e, { onConflict: 'id' }); if (error) throw error; },
        deleteProduct: async (id) => { await getClient().from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id); },
        deleteParty: async (id) => { await getClient().from('parties').update({ deleted_at: new Date().toISOString() }).eq('id', id); }
    };

    // دالة آمنة لاستخدام OfflineLayer إذا كانت موجودة
    function offlineGet(storeName, cloudFetcher, forceRefresh) {
        if (window.OfflineLayer && typeof window.OfflineLayer.get === 'function') {
            return window.OfflineLayer.get(storeName, cloudFetcher, forceRefresh);
        }
        // خطة بديلة: جلب مباشر من Supabase
        console.warn('OfflineLayer غير متوفر، جلب مباشر من السحابة');
        return cloudFetcher().catch(err => {
            console.error(`فشل جلب ${storeName}`, err);
            return [];
        });
    }

    function offlineSave(storeName, data, cloudSaver, isNew) {
        if (window.OfflineLayer && typeof window.OfflineLayer.save === 'function') {
            return window.OfflineLayer.save(storeName, data, cloudSaver, isNew);
        }
        // خطة بديلة: حفظ مباشر
        return cloudSaver(data).catch(err => {
            console.error(`فشل حفظ ${storeName}`, err);
            throw err;
        });
    }

    window.DB = {
        _cloudSaveProduct: _cloud.saveProduct,
        _cloudSaveParty: _cloud.saveParty,
        _cloudSaveInvoice: _cloud.saveInvoice,
        _cloudSavePurchase: _cloud.savePurchase,
        _cloudSaveTransaction: _cloud.saveTransaction,
        _cloudSaveReturn: _cloud.saveReturn,
        _cloudSaveJournalEntry: _cloud.saveJournalEntry,
        _cloudDeleteProduct: _cloud.deleteProduct,
        _cloudDeleteParty: _cloud.deleteParty,

        // ---------- المنتجات ----------
        getProducts: (force) => offlineGet('products', async () => {
            const { data, error } = await getClient()
                .from('products')
                .select('*, product_units(*)')
                .is('deleted_at', null)
                .order('name');
            if (error) throw error;
            console.log(`✅ تم جلب ${data.length} منتج من Supabase`);
            return data;
        }, force),

        saveProduct(p) {
            const isNew = !p.id;
            const product = { ...p, id: p.id || window.generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' };
            return offlineSave('products', product, _cloud.saveProduct, isNew);
        },

        deleteProduct: (id) => offlineSave('products',
            { id, deleted_at: new Date().toISOString(), _operation: 'UPDATE' },
            _cloud.deleteProduct, false
        ),

        // ---------- الأطراف ----------
        getParties: (type) => offlineGet('parties', async () => {
            let q = getClient().from('parties').select('*').is('deleted_at', null).order('name');
            if (type) q = q.eq('type', type);
            const { data, error } = await q;
            if (error) throw error;
            return data;
        }),

        saveParty(p) {
            const isNew = !p.id;
            const party = { ...p, id: p.id || window.generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' };
            return offlineSave('parties', party, _cloud.saveParty, isNew);
        },

        deleteParty: (id) => offlineSave('parties',
            { id, deleted_at: new Date().toISOString(), _operation: 'UPDATE' },
            _cloud.deleteParty, false
        ),

        // ---------- الفواتير ----------
        getInvoices: () => offlineGet('invoices', async () => {
            const { data, error } = await getClient()
                .from('invoices')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        }),

        saveInvoice(inv) {
            const isNew = !inv.id;
            const invoice = { ...inv, id: inv.id || window.generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' };
            return offlineSave('invoices', invoice, _cloud.saveInvoice, isNew);
        },

        getInvoicesLight: async () => {
            const client = getClient();
            if (!client) return [];
            try {
                const { data, error } = await client
                    .from('invoices')
                    .select('id, invoice_number, date, created_at, type, customer_id, customer_name, total, paid, remaining, status')
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            } catch { return []; }
        },

        getInvoiceById: async (id) => {
            const { data, error } = await getClient().from('invoices').select('*').eq('id', id).single();
            if (error) throw error;
            return data;
        },

        createSaleInvoice: async (inv) => {
            const { data, error } = await getClient().rpc('create_sale_invoice', { p_data: inv });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            window.SessionStore?.invalidate('offline_invoices');
            return data;
        },

        // ---------- المشتريات ----------
        getPurchases: () => offlineGet('purchases', async () => {
            const { data, error } = await getClient()
                .from('purchases')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data;
        }),

        savePurchase(pur) {
            const isNew = !pur.id;
            const purchase = { ...pur, id: pur.id || window.generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' };
            return offlineSave('purchases', purchase, _cloud.savePurchase, isNew);
        },

        getPurchasesLight: async () => {
            const client = getClient();
            if (!client) return [];
            try {
                const { data, error } = await client
                    .from('purchases')
                    .select('id, date, created_at, supplier_id, supplier_name, total, paid, remaining, status')
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            } catch { return []; }
        },

        getPurchaseById: async (id) => {
            const { data, error } = await getClient().from('purchases').select('*').eq('id', id).single();
            if (error) throw error;
            return data;
        },

        createPurchaseInvoice: async (inv) => {
            const { data, error } = await getClient().rpc('create_purchase_invoice', { p_data: inv });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            window.SessionStore?.invalidate('offline_purchases');
            return data;
        },

        // ---------- المعاملات ----------
        getTransactions: () => offlineGet('transactions', async () => {
            const { data, error } = await getClient()
                .from('transactions')
                .select('*')
                .is('deleted_at', null)
                .order('date', { ascending: false });
            if (error) throw error;
            return data;
        }),

        saveTransaction(t) {
            const isNew = !t.id;
            const trans = { ...t, id: t.id || window.generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' };
            return offlineSave('transactions', trans, _cloud.saveTransaction, isNew);
        },

        // ---------- المرتجعات ----------
        getReturns: (type) => offlineGet('returns', async () => {
            let q = getClient().from('returns').select('*').is('deleted_at', null).order('date', { ascending: false });
            if (type) q = q.eq('type', type);
            const { data, error } = await q;
            if (error) throw error;
            return data;
        }),

        saveReturn(r) {
            const isNew = !r.id;
            const ret = { ...r, id: r.id || window.generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' };
            return offlineSave('returns', ret, _cloud.saveReturn, isNew);
        },

        // ---------- القيود المحاسبية ----------
        getJournalEntries: () => offlineGet('journal_entries', async () => {
            const { data, error } = await getClient()
                .from('journal_entries')
                .select('*')
                .is('deleted_at', null)
                .order('date', { ascending: false });
            if (error) throw error;
            return data;
        }),

        saveJournalEntry(e) {
            const isNew = !e.id;
            const entry = { ...e, id: e.id || window.generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' };
            return offlineSave('journal_entries', entry, _cloud.saveJournalEntry, isNew);
        },

        // ---------- الحسابات ----------
        getAccounts: () => offlineGet('accounts', async () => {
            const { data, error } = await getClient()
                .from('accounts')
                .select('*')
                .is('deleted_at', null)
                .order('name');
            if (error) throw error;
            return data;
        }),

        // ---------- الإعدادات ----------
        getSettings: async () => {
            if (window.SessionStore?._settings) return window.SessionStore._settings;
            const client = getClient();
            if (!client) return {};
            try {
                const { data, error } = await client
                    .from('settings')
                    .select('data')
                    .eq('tenant_id', window.SessionStore.tenantId)
                    .single();
                if (error && error.code !== 'PGRST116') throw error;
                window.SessionStore._settings = data?.data || {};
                return window.SessionStore._settings;
            } catch { return {}; }
        },

        saveSettings: async (s) => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client
                .from('settings')
                .upsert({ tenant_id: window.SessionStore.tenantId, data: s }, { onConflict: 'tenant_id' })
                .select().single();
            if (error) throw error;
            window.SessionStore._settings = data.data;
            return data.data;
        },

        // ---------- أرقام الفواتير ----------
        generateInvoiceNumber: async () => {
            const client = getClient();
            if (!client) throw new Error('غير متصل');
            const { data, error } = await client.rpc('next_sequence', {
                p_name: 'inv_' + new Date().getFullYear().toString().slice(-2)
            });
            if (error) throw new Error('فشل توليد رقم الفاتورة: ' + error.message);
            return data;
        },

        // ---------- إدارة المستأجرين ----------
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
