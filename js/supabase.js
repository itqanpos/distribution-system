/* =============================================
   supabase.js - الإصدار 3.7 (إصلاحات شاملة)
   ============================================= */
(function() {
    'use strict';

    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    window.App = window.App || {};
    window.DB = window.DB || {};

    let supabaseClient = null, initialized = false;

    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
            const buf = new Uint8Array(16);
            crypto.getRandomValues(buf);
            buf[6] = (buf[6] & 0x0f) | 0x40;
            buf[8] = (buf[8] & 0x3f) | 0x80;
            const hex = Array.from(buf, b => b.toString(16).padStart(2, '0')).join('');
            return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20,32)}`;
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    // ==================== SessionStore ====================
    const SessionStore = {
        _user: null, _tenantId: null, _settings: null,
        _cache: new Map(), _cacheTimes: new Map(), _maxCacheSize: 50,

        set user(val) {
            this._user = val;
            this._tenantId = val?.tenant_id || null;
            if (val) {
                const session = { id: val.id, email: val.email, fullName: val.fullName, tenant_id: val.tenant_id, loginTime: new Date().toLocaleString('ar-EG') };
                localStorage.setItem('app_session', JSON.stringify(session));
            } else {
                localStorage.removeItem('app_session');
                this._cache.clear(); this._cacheTimes.clear(); this._settings = null;
            }
        },
        get user() { return this._user; },
        get tenantId() { return this._tenantId; },

        setCache(key, data, ttl = 300000) {
            if (this._cache.size >= this._maxCacheSize) {
                const firstKey = this._cache.keys().next().value;
                this._cache.delete(firstKey);
                this._cacheTimes.delete(firstKey);
            }
            this._cache.set(key, data);
            this._cacheTimes.set(key, Date.now() + ttl);
        },
        getCache(key) {
            const expiry = this._cacheTimes.get(key);
            if (expiry && Date.now() > expiry) { this._cache.delete(key); this._cacheTimes.delete(key); return undefined; }
            return this._cache.get(key);
        },
        invalidate(key) {
            if (key) { this._cache.delete(key); this._cacheTimes.delete(key); }
            else { this._cache.clear(); this._cacheTimes.clear(); }
        }
    };

    // تنظيف الكاش تلقائيًا كل دقيقة
    setInterval(() => {
        const now = Date.now();
        for (const [key, expiry] of SessionStore._cacheTimes) {
            if (now > expiry) {
                SessionStore._cache.delete(key);
                SessionStore._cacheTimes.delete(key);
            }
        }
    }, 60000);

    function getLocalDB() { return (window.localDB && window.localDB.ready) ? window.localDB : null; }

    // ==================== OfflineLayer ====================
    const OfflineLayer = {
        async get(storeName, cloudFetcher, forceRefresh = false) {
            const local = getLocalDB(), cacheKey = `offline_${storeName}`;
            if (!forceRefresh) { const c = SessionStore.getCache(cacheKey); if (c) return c; }
            if (local && !forceRefresh) {
                try {
                    const localData = await local.getAll(storeName);
                    if (localData && localData.length > 0) {
                        SessionStore.setCache(cacheKey, localData);
                        if (navigator.onLine && supabaseClient && cloudFetcher) this._backgroundSync(storeName, cloudFetcher, local).catch(() => {});
                        return localData;
                    }
                } catch (e) { console.warn(`خطأ قراءة ${storeName}:`, e); }
            }
            if (navigator.onLine && supabaseClient && cloudFetcher) {
                try {
                    const data = await cloudFetcher();
                    if (data && Array.isArray(data)) { SessionStore.setCache(cacheKey, data); if (local) await this._deltaSync(local, storeName, data); }
                    return data;
                } catch (error) { console.warn(`فشل جلب ${storeName}:`, error); return local ? await local.getAll(storeName) : []; }
            }
            return local ? await local.getAll(storeName) : [];
        },

        async save(storeName, data, cloudSaver, isNew) {
            const local = getLocalDB(); data.updated_at = new Date().toISOString(); data.version = (data.version || 0) + 1;
            if (local) await local.put(storeName, data).catch(e => console.warn(`فشل حفظ محلي ${storeName}:`, e));
            SessionStore.invalidate(`offline_${storeName}`);
            data._operation = data._operation || (isNew === true ? 'INSERT' : (isNew === false ? 'UPDATE' : (data.id ? 'UPDATE' : 'INSERT')));
            if (navigator.onLine && supabaseClient && cloudSaver) {
                try {
                    const result = await cloudSaver(data);
                    if (local?.removeFromSyncQueue) await local.removeFromSyncQueue(data.id).catch(() => {});
                    return result;
                } catch (error) { console.warn(`فشل حفظ ${storeName}:`, error); await this._queueForSync(storeName, data); return data; }
            } else { await this._queueForSync(storeName, data); return data; }
        },

        async delete(storeName, id, cloudDeleter) {
            const local = getLocalDB();
            if (local) await local.delete(storeName, id).catch(() => {});
            SessionStore.invalidate(`offline_${storeName}`);
            if (navigator.onLine && supabaseClient && cloudDeleter) {
                try { await cloudDeleter(id); }
                catch (error) { console.warn(`فشل حذف ${storeName}:`, error); await this._queueForSync(storeName, { id, _operation: 'DELETE' }); }
            } else { await this._queueForSync(storeName, { id, _operation: 'DELETE' }); }
        },

        async _backgroundSync(storeName, cloudFetcher, local) {
            try { const cloudData = await cloudFetcher(); if (cloudData?.length > 0) { await this._deltaSync(local, storeName, cloudData); SessionStore.setCache(`offline_${storeName}`, cloudData); } } catch {}
        },

        async _deltaSync(local, storeName, cloudData) {
            const localItems = await local.getAll(storeName).catch(() => []);
            const localMap = new Map(localItems.map(i => [i.id, i]));
            const toPut = [], toDelete = new Set(localMap.keys());
            const syncQueue = await local.getSyncQueue().catch(() => []);
            const pendingIds = new Set(syncQueue.map(q => q.ref_id));

            for (const cloudItem of cloudData) {
                toDelete.delete(cloudItem.id);
                const localItem = localMap.get(cloudItem.id);
                const cloudTs = cloudItem.updated_at ? new Date(cloudItem.updated_at).getTime() : 0;
                const localTs = localItem?.updated_at ? new Date(localItem.updated_at).getTime() : 0;
                if (!localItem || cloudTs >= localTs) toPut.push(cloudItem);
            }

            // حذف فقط العناصر غير الموجودة في الطابور وليست INSERT جديدة
            for (const id of toDelete) {
                if (pendingIds.has(id)) continue;
                const localItem = localMap.get(id);
                if (localItem && localItem._operation === 'INSERT') continue;
                await local.delete(storeName, id).catch(() => {});
            }

            for (let i = 0; i < toPut.length; i += 30) await Promise.all(toPut.slice(i, i + 30).map(item => local.put(storeName, item).catch(() => {})));
        },

        async _queueForSync(table, data) {
            const local = getLocalDB();
            if (!local?.addToSyncQueue) return;
            // منع تكرار العمليات
            if (data.id && local.findQueueByRef) {
                const existing = await local.findQueueByRef(data.id, table).catch(() => null);
                if (existing && existing.type !== 'DELETE') {
                    existing.data = { ...existing.data, ...data };
                    existing.checksum = this._simpleChecksum(JSON.stringify(existing.data));
                    if (local.updateSyncQueueItem) await local.updateSyncQueueItem(existing);
                    return;
                }
            }
            await local.addToSyncQueue({
                queue_id: generateUUID(),
                ref_id: data.id,
                type: data._operation || 'UPDATE',
                table,
                data: { ...data },
                checksum: this._simpleChecksum(JSON.stringify(data)),
                retries: 0
            }).catch(e => console.warn('فشل إضافة للطابور:', e));
        },

        _simpleChecksum(str) { let hash = 0; for (let i = 0; i < str.length; i++) { hash = ((hash << 5) - hash) + str.charCodeAt(i); hash |= 0; } return hash.toString(16); }
    };

    // ==================== SyncEngine ====================
    const SyncEngine = {
        _processing: false,
        _lastRun: 0,
        async process() {
            if (this._processing || Date.now() - this._lastRun < 2000) return;
            this._processing = true; this._lastRun = Date.now();
            const local = getLocalDB();
            if (!local?.getSyncQueue || !navigator.onLine) { this._processing = false; return; }
            try {
                const allQueue = await local.getSyncQueue().catch(() => []);
                const queue = allQueue.filter(item => !item.failed && (!item.nextRetry || item.nextRetry <= Date.now()));
                if (!queue.length) { this._processing = false; return; }
                console.log(`🔄 معالجة ${queue.length} عملية...`);
                const sorted = [...queue].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                for (let i = 0; i < sorted.length; i += 3) await Promise.allSettled(sorted.slice(i, i + 3).map(item => this._processItem(item, local)));
            } finally { this._processing = false; }
        },

        async _processItem(item, local) {
            try {
                if (item.checksum && item.data) {
                    if (OfflineLayer._simpleChecksum(JSON.stringify(item.data)) !== item.checksum) {
                        console.error('⚠️ تلاعب:', item); await local.removeFromSyncQueue(item.queue_id).catch(() => {}); return;
                    }
                }
                if (item.type === 'DELETE') {
                    const handler = {
                        products: window.DB._cloudDeleteProduct, parties: window.DB._cloudDeleteParty,
                        invoices: async (id) => { await supabaseClient.from('invoices').update({ deleted_at: new Date().toISOString() }).eq('id', id); },
                        purchases: async (id) => { await supabaseClient.from('purchases').update({ deleted_at: new Date().toISOString() }).eq('id', id); },
                        transactions: async (id) => { await supabaseClient.from('transactions').update({ deleted_at: new Date().toISOString() }).eq('id', id); },
                        returns: async (id) => { await supabaseClient.from('returns').update({ deleted_at: new Date().toISOString() }).eq('id', id); },
                        journal_entries: async (id) => { await supabaseClient.from('journal_entries').update({ deleted_at: new Date().toISOString() }).eq('id', id); }
                    }[item.table];
                    if (handler) { await handler(item.ref_id); await local.removeFromSyncQueue(item.queue_id); }
                    else { console.warn('DELETE غير معروف:', item); await local.removeFromSyncQueue(item.queue_id); }
                    return;
                }
                const handler = {
                    products: window.DB._cloudSaveProduct, parties: window.DB._cloudSaveParty,
                    invoices: window.DB._cloudSaveInvoice, purchases: window.DB._cloudSavePurchase,
                    transactions: window.DB._cloudSaveTransaction, returns: window.DB._cloudSaveReturn,
                    journal_entries: window.DB._cloudSaveJournalEntry
                }[item.table];
                if (handler) { await handler(item.data); await local.removeFromSyncQueue(item.queue_id); }
                else { console.warn('عملية غير معروفة:', item); await local.removeFromSyncQueue(item.queue_id); }
            } catch (e) {
                console.warn('فشل مزامنة:', e); item.retries = (item.retries || 0) + 1;
                if (item.retries >= 5) { item.failed = true; if (local.updateSyncQueueItem) await local.updateSyncQueueItem(item); }
                else { item.nextRetry = Date.now() + Math.pow(2, item.retries) * 1000; if (local.updateSyncQueueItem) await local.updateSyncQueueItem(item); }
            }
        }
    };

    // ==================== التهيئة ====================
    function tryInitSupabase() {
        if (typeof supabase === 'undefined') { console.warn('⚠️ Supabase غير محمل.'); return false; }
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: { storage: localStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
                realtime: { params: { eventsPerSecond: 10 } },
                global: { headers: { 'X-Client-Info': 'hesaby-pos/3.7' } }
            });
            window.supabase = supabaseClient; console.log('✅ Supabase initialized'); return true;
        } catch (e) { console.error('❌ فشل تهيئة Supabase:', e); return false; }
    }

    function setupFullApp() {
        if (initialized) return; initialized = true;

        window.App = {
            async getCurrentUser() {
                if (SessionStore.user) { this._refreshSession().catch(() => {}); return SessionStore.user; }
                if (!supabaseClient) return null;
                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    if (!session) { SessionStore.user = null; return null; }
                    const { data: profile, error } = await supabaseClient.from('profiles').select('*, tenants!inner(plan)').eq('id', session.user.id).single();
                    if (error || !profile) { SessionStore.user = null; return null; }
                    const user = { id: session.user.id, email: session.user.email, fullName: profile.full_name, role: profile.role, tenant_id: profile.tenant_id, plan: profile.tenants?.plan };
                    SessionStore.user = user; return user;
                } catch (e) { console.error('❌ فشل جلب المستخدم:', e); SessionStore.user = null; return null; }
            },
            async _refreshSession() { if (!supabaseClient) return; const { data: { session } } = await supabaseClient.auth.getSession(); if (!session || session.user?.id !== SessionStore.user?.id) SessionStore.user = null; },
            async getTenantId() { return SessionStore.tenantId || (await this.getCurrentUser())?.tenant_id || null; },
            // (باقي دوال App كما هي)
            async login(email, password) { /* ... */ },
            async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') { /* ... */ },
            async logout() { if (supabaseClient) await supabaseClient.auth.signOut(); SessionStore.user = null; window.location.href = './index.html'; },
            async requireAuth() { /* ... */ },
            _redirectToLogin() { if (window.location.pathname.indexOf('index.html') === -1) window.location.href = './index.html'; },
            async checkTenantStatus(tenantId) { /* ... */ },
            async requireRole(allowedRoles) { /* ... */ },
            initUserInterface() { /* ... */ }
        };

        window.DB = {
            // دوال Cloud للـ SyncEngine
            _cloudSaveProduct: async (p) => { const { error } = await supabaseClient.from('products').upsert(p, { onConflict: 'id' }); if (error) throw error; },
            _cloudSaveParty: async (p) => { const { error } = await supabaseClient.from('parties').upsert(p, { onConflict: 'id' }); if (error) throw error; },
            _cloudSaveInvoice: async (inv) => { const { error } = await supabaseClient.from('invoices').upsert(inv, { onConflict: 'id' }); if (error) throw error; },
            _cloudSavePurchase: async (pur) => { const { error } = await supabaseClient.from('purchases').upsert(pur, { onConflict: 'id' }); if (error) throw error; },
            _cloudSaveTransaction: async (t) => { const { error } = await supabaseClient.from('transactions').upsert(t, { onConflict: 'id' }); if (error) throw error; },
            _cloudSaveReturn: async (r) => { const { error } = await supabaseClient.from('returns').upsert(r, { onConflict: 'id' }); if (error) throw error; },
            _cloudSaveJournalEntry: async (e) => { const { error } = await supabaseClient.from('journal_entries').upsert(e, { onConflict: 'id' }); if (error) throw error; },

            // استعلامات مع فلتر soft delete
            getProducts: (force) => OfflineLayer.get('products', async () => {
                const { data, error } = await supabaseClient.from('products').select('*, product_units(*)').is('deleted_at', null).order('name');
                if (error) throw error; return data;
            }, force),
            saveProduct(p) { const isNew = !p.id; return OfflineLayer.save('products', { ...p, id: p.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, async (prod) => { const { data, error } = await supabaseClient.from('products').upsert(prod, { onConflict: 'id' }).select().single(); if (error) throw error; return data; }, isNew); },
            async deleteProduct(id) { await OfflineLayer.save('products', { id, deleted_at: new Date().toISOString(), _operation: 'UPDATE' }, async (data) => { const { error } = await supabaseClient.from('products').update({ deleted_at: data.deleted_at }).eq('id', id); if (error) throw error; }, false); },
            _cloudDeleteProduct: async (id) => { const { error } = await supabaseClient.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) throw error; },

            getParties: (type) => OfflineLayer.get('parties', async () => {
                let q = supabaseClient.from('parties').select('*').is('deleted_at', null).order('name');
                if (type) q = q.eq('type', type);
                const { data, error } = await q; if (error) throw error; return data;
            }),
            saveParty(p) { const isNew = !p.id; return OfflineLayer.save('parties', { ...p, id: p.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, async (party) => { const { data, error } = await supabaseClient.from('parties').upsert(party, { onConflict: 'id' }).select().single(); if (error) throw error; return data; }, isNew); },
            async deleteParty(id) { await OfflineLayer.save('parties', { id, deleted_at: new Date().toISOString(), _operation: 'UPDATE' }, async (data) => { const { error } = await supabaseClient.from('parties').update({ deleted_at: data.deleted_at }).eq('id', id); if (error) throw error; }, false); },
            _cloudDeleteParty: async (id) => { const { error } = await supabaseClient.from('parties').update({ deleted_at: new Date().toISOString() }).eq('id', id); if (error) throw error; },

            getInvoices: () => OfflineLayer.get('invoices', async () => { const { data, error } = await supabaseClient.from('invoices').select('*').is('deleted_at', null).order('created_at', { ascending: false }); if (error) throw error; return data; }),
            saveInvoice: (inv) => { const isNew = !inv.id; return OfflineLayer.save('invoices', { ...inv, id: inv.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, async (inv) => { const { data, error } = await supabaseClient.from('invoices').upsert(inv, { onConflict: 'id' }).select().single(); if (error) throw error; return data; }, isNew); },
            getInvoicesLight: async () => { if (!supabaseClient) return []; try { const { data, error } = await supabaseClient.from('invoices').select('id, invoice_number, date, created_at, type, customer_id, customer_name, total, paid, remaining, status').is('deleted_at', null).order('created_at', { ascending: false }); if (error) throw error; return data; } catch { return []; } },
            getInvoiceById: async (id) => { if (!supabaseClient) throw new Error('غير متصل'); const { data, error } = await supabaseClient.from('invoices').select('*').eq('id', id).single(); if (error) throw error; return data; },
            createSaleInvoice: async (inv) => { if (!supabaseClient) throw new Error('غير متصل'); const { data, error } = await supabaseClient.rpc('create_sale_invoice', { p_data: inv }); if (error) throw new Error(error.message); if (!data.success) throw new Error(data.error); SessionStore.invalidate('offline_invoices'); return data; },

            getPurchases: () => OfflineLayer.get('purchases', async () => { const { data, error } = await supabaseClient.from('purchases').select('*').is('deleted_at', null).order('created_at', { ascending: false }); if (error) throw error; return data; }),
            savePurchase: (pur) => { const isNew = !pur.id; return OfflineLayer.save('purchases', { ...pur, id: pur.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, async (p) => { const { data, error } = await supabaseClient.from('purchases').upsert(p, { onConflict: 'id' }).select().single(); if (error) throw error; return data; }, isNew); },
            createPurchaseInvoice: async (inv) => { if (!supabaseClient) throw new Error('غير متصل'); const { data, error } = await supabaseClient.rpc('create_purchase_invoice', { p_data: inv }); if (error) throw new Error(error.message); if (!data.success) throw new Error(data.error); SessionStore.invalidate('offline_purchases'); return data; },

            getTransactions: () => OfflineLayer.get('transactions', async () => { const { data, error } = await supabaseClient.from('transactions').select('*').is('deleted_at', null).order('date', { ascending: false }); if (error) throw error; return data; }),
            saveTransaction: (t) => { const isNew = !t.id; return OfflineLayer.save('transactions', { ...t, id: t.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, async (trans) => { const { data, error } = await supabaseClient.from('transactions').upsert(trans, { onConflict: 'id' }).select().single(); if (error) throw error; return data; }, isNew); },

            getReturns: (type) => OfflineLayer.get('returns', async () => { let q = supabaseClient.from('returns').select('*').is('deleted_at', null).order('date', { ascending: false }); if (type) q = q.eq('type', type); const { data, error } = await q; if (error) throw error; return data; }),
            saveReturn: (r) => { const isNew = !r.id; return OfflineLayer.save('returns', { ...r, id: r.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, async (ret) => { const { data, error } = await supabaseClient.from('returns').upsert(ret, { onConflict: 'id' }).select().single(); if (error) throw error; return data; }, isNew); },

            getJournalEntries: () => OfflineLayer.get('journal_entries', async () => { const { data, error } = await supabaseClient.from('journal_entries').select('*').is('deleted_at', null).order('date', { ascending: false }); if (error) throw error; return data; }),
            saveJournalEntry: (e) => { const isNew = !e.id; return OfflineLayer.save('journal_entries', { ...e, id: e.id || generateUUID(), _operation: isNew ? 'INSERT' : 'UPDATE' }, async (entry) => { const { data, error } = await supabaseClient.from('journal_entries').upsert(entry, { onConflict: 'id' }).select().single(); if (error) throw error; return data; }, isNew); },

            getAccounts: () => OfflineLayer.get('accounts', async () => { const { data, error } = await supabaseClient.from('accounts').select('*').is('deleted_at', null).order('name'); if (error) throw error; return data; }),

            getSettings: async () => { if (SessionStore._settings) return SessionStore._settings; if (!supabaseClient) return {}; try { const { data, error } = await supabaseClient.from('settings').select('data').eq('tenant_id', SessionStore.tenantId).single(); if (error && error.code !== 'PGRST116') throw error; SessionStore._settings = data?.data || {}; return SessionStore._settings; } catch { return {}; } },
            saveSettings: async (s) => { if (!supabaseClient) throw new Error('غير متصل'); const { data, error } = await supabaseClient.from('settings').upsert({ tenant_id: SessionStore.tenantId, data: s }, { onConflict: 'tenant_id' }).select().single(); if (error) throw error; SessionStore._settings = data.data; return data.data; },

            generateInvoiceNumber: async () => { if (!supabaseClient) throw new Error('غير متصل'); const { data, error } = await supabaseClient.rpc('next_sequence', { p_name: 'inv_' + new Date().getFullYear().toString().slice(-2) }); if (error) throw error; return data; },
            getAllTenantsData: async () => { if (!supabaseClient) throw new Error('غير متصل'); const { data, error } = await supabaseClient.rpc('get_all_tenants_data'); if (error) throw error; return data || []; },
            deleteTenant: async (id) => { if (!supabaseClient) throw new Error('غير متصل'); const { error } = await supabaseClient.rpc('delete_tenant', { p_tenant_id: id }); if (error) throw error; }
        };

        // Realtime
        supabaseClient.channel('products_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => SessionStore.invalidate('offline_products'))
            .subscribe();

        if (supabaseClient) supabaseClient.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_OUT' || event === 'USER_DELETED') SessionStore.user = null;
            else if (event === 'SIGNED_IN' && session) window.App.getCurrentUser().catch(() => {});
        });

        window.addEventListener('online', () => { console.log('🌐 اتصال'); SyncEngine.process(); });
        if (navigator.onLine) SyncEngine.process();
        console.log('✅ النظام جاهز (v3.7)');
    }

    if (tryInitSupabase()) setupFullApp();
    else {
        console.warn('⚠️ وضع الطوارئ');
        window.App = { getCurrentUser: async () => null, /* ... */ };
        window.DB = { /* fallback */ };
    }
})();
