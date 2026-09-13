/* =============================================
   db.js - Data Layer (Supabase + IndexedDB)
   Version: 4.0.0 - Atomic Operations + Stock Movements + Sync Queue
   ============================================= */
(function() {
    'use strict';

    const CFG = window.APP_CONFIG;
    const DEVICE_KEY = 'hesaby_device_id';

    /* ============================================
       Device ID (لأرقام الفواتير والتدقيق)
       ============================================ */
    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = (crypto.randomUUID?.() || U.uuid()).replace(/-/g, '').slice(0, 8);
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    }

    /* ============================================
       Date Helpers (محلية — لا UTC)
       ============================================ */
    function localDateStr(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /* ============================================
       IndexedDB Layer
       ============================================ */
    class LocalDB {
        constructor() {
            this.db = null;
            this.ready = false;
            this.initPromise = this.init();
        }

        init() {
            return new Promise((resolve) => {
                if (typeof indexedDB === 'undefined') {
                    console.warn('⚠️ IndexedDB not available');
                    resolve(this);
                    return;
                }
                const req = indexedDB.open(CFG.DB_NAME, CFG.DB_VERSION);

                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    const stores = [
                        'products', 'parties', 'invoices',
                        'settings', 'transactions', 'sync_queue'
                    ];

                    stores.forEach(name => {
                        if (!db.objectStoreNames.contains(name)) {
                            const keyPath = name === 'sync_queue' ? 'key' : 'id';
                            const store = db.createObjectStore(name, { keyPath });

                            if (name === 'invoices') {
                                store.createIndex('date', 'date');
                                store.createIndex('type', 'type');
                                store.createIndex('status', 'status');
                                store.createIndex('customer_id', 'customer_id');
                            }
                            if (name === 'products') {
                                store.createIndex('barcode', 'barcode');
                                store.createIndex('category', 'category');
                            }
                            if (name === 'parties') {
                                store.createIndex('type', 'type');
                                store.createIndex('phone', 'phone');
                            }
                            if (name === 'transactions') {
                                store.createIndex('party_id', 'party_id');
                                store.createIndex('date', 'date');
                            }
                            if (name === 'sync_queue') {
                                store.createIndex('created_at', 'created_at');
                            }
                        }
                    });
                };

                req.onsuccess = (e) => {
                    this.db = e.target.result;
                    this.ready = true;
                    console.log('✅ IndexedDB ready');
                    resolve(this);
                };
                req.onerror = () => resolve(this);
            });
        }

        async _ready() { if (!this.ready) await this.initPromise; }

        async get(store, id) {
            await this._ready();
            if (!this.db) return null;
            return new Promise((resolve) => {
                const tx = this.db.transaction(store, 'readonly');
                const req = tx.objectStore(store).get(id);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => resolve(null);
            });
        }

        async getAll(store) {
            await this._ready();
            if (!this.db) return [];
            return new Promise((resolve) => {
                const tx = this.db.transaction(store, 'readonly');
                const req = tx.objectStore(store).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        }

        // ✅ يُرفض عند فشل الكتابة (لا نجاح كاذب)
        async put(store, data) {
            await this._ready();
            if (!this.db) return data;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).put(data);
                tx.oncomplete = () => resolve(data);
                tx.onerror = (e) => reject(e.target.error || new Error('IDB write failed'));
                tx.onabort = () => reject(new Error('IDB transaction aborted'));
            });
        }

        async putMany(store, items) {
            await this._ready();
            if (!this.db || !items?.length) return items || [];
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readwrite');
                const s = tx.objectStore(store);
                items.forEach(item => s.put(item));
                tx.oncomplete = () => resolve(items);
                tx.onerror = (e) => reject(e.target.error || new Error('IDB bulk write failed'));
                tx.onabort = () => reject(new Error('IDB bulk transaction aborted'));
            });
        }

        async delete(store, id) {
            await this._ready();
            if (!this.db) return;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error || new Error('IDB delete failed'));
            });
        }

        async clear(store) {
            await this._ready();
            if (!this.db) return;
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(new Error('IDB clear failed'));
            });
        }
    }

    /* ============================================
       Supabase Client
       ============================================ */
    let supabaseClient = null;

    function initSupabase() {
        if (typeof window.supabase === 'undefined') {
            console.warn('⚠️ Supabase library not loaded');
            return null;
        }
        try {
            supabaseClient = window.supabase.createClient(
                CFG.SUPABASE_URL,
                CFG.SUPABASE_ANON_KEY,
                {
                    auth: {
                        storage: localStorage,
                        persistSession: true,
                        autoRefreshToken: true,
                        detectSessionInUrl: false // ← لا نستخدم Magic Links
                    }
                }
            );
            console.log('✅ Supabase client initialized');
            return supabaseClient;
        } catch (e) {
            console.error('❌ Supabase init failed', e);
            return null;
        }
    }

    function getClient() { return window.DB?.client || supabaseClient; }

    function getTenantId() {
        // من app_metadata أولًا (آمن) ثم fallback
        const user = window.Auth?.user;
        if (!user) return null;
        return user.app_metadata?.tenant_id
            || user.user_metadata?.tenant_id
            || null;
    }

    /* ============================================
       Memory Cache — يُرجع نسخًا (لا مرجع)
       ============================================ */
    const MemCache = {
        products: [],
        parties: [],
        invoices: [],
        transactions: [],
        _time: {},
        set(key, data) {
            this[key] = Array.isArray(data) ? data.slice() : data;
            this._time[key] = Date.now();
        },
        get(key, maxAge = 60000) {
            if (!this._time[key]) return null;
            if (Date.now() - this._time[key] > maxAge) return null;
            const val = this[key];
            return Array.isArray(val) ? val.slice() : val;
        },
        clear(key) {
            if (key) {
                this[key] = [];
                delete this._time[key];
            } else {
                this.products = [];
                this.parties = [];
                this.invoices = [];
                this.transactions = [];
                this._time = {};
            }
        }
    };

    /* ============================================
       Sync Queue (للعمليات التي تنتظر الشبكة)
       ============================================ */
    const SyncQueue = {
        _key(op) { return `${op.type}:${op.id}`; },

        async enqueue(op) {
            try {
                await window.DB.local.put('sync_queue', {
                    key: this._key(op),
                    ...op,
                    created_at: new Date().toISOString(),
                    retries: 0
                });
            } catch (e) {
                console.warn('sync_queue enqueue failed', e);
            }
        },

        async dequeue(op) {
            try {
                await window.DB.local.delete('sync_queue', this._key(op));
            } catch (e) { /* ignore */ }
        },

        async all() {
            return await window.DB.local.getAll('sync_queue') || [];
        },

        async pendingCount() {
            const all = await this.all();
            return all.length;
        }
    };

    /* ============================================
       DB API
       ============================================ */
    window.DB = {
        local: null,
        client: null,
        ready: null,

        async init() {
            if (this.ready) return this.ready;
            this.ready = (async () => {
                this.local = new LocalDB();
                await this.local.initPromise;
                this.client = initSupabase();

                // مزامنة تلقائية عند عودة الاتصال
                window.addEventListener('online', () => {
                    this.flushSyncQueue().catch(e =>
                        console.warn('flushSyncQueue error', e)
                    );
                });

                console.log('✅ DB initialized');
                return this;
            })();
            return this.ready;
        },

        /* ============================================
           Sync Queue Flushing
           ============================================ */
        async flushSyncQueue() {
            if (!navigator.onLine || !this.client) return;
            const ops = await SyncQueue.all();
            if (!ops.length) return;

            ops.sort((a, b) =>
                new Date(a.created_at) - new Date(b.created_at));

            for (const op of ops) {
                try {
                    let result;
                    if (op.type === 'create_invoice') {
                        result = await this._cloudCreateInvoice(op.payload);
                    } else if (op.type === 'add_payment') {
                        result = await this.client
                            .from('transactions')
                            .insert(op.payload);
                    } else if (op.type === 'party_balance') {
                        result = await this.client
                            .from('parties')
                            .update({ balance: op.payload.balance })
                            .eq('id', op.payload.id);
                    }

                    if (result?.error) {
                        console.warn('Sync op failed', op, result.error);
                        // retries++
                        op.retries = (op.retries || 0) + 1;
                        if (op.retries > 10) {
                            await SyncQueue.dequeue(op);
                        } else {
                            await this.local.put('sync_queue', op);
                        }
                    } else {
                        await SyncQueue.dequeue(op);
                    }
                } catch (e) {
                    console.warn('Sync op threw', op, e);
                }
            }
        },

        /* ============================================
           PRODUCTS
           ============================================ */
        async getProducts(force = false) {
            if (!force) {
                const cached = MemCache.get('products');
                if (cached?.length) return cached;
            }

            if (!navigator.onLine || !this.client) {
                const local = await this.local.getAll('products');
                MemCache.set('products', local);
                return local;
            }

            try {
                const { data, error } = await this.client
                    .from('products')
                    .select('*, product_units(*)')
                    .is('deleted_at', null)
                    .order('name');

                if (error) throw error;

                const products = (data || []).map(p => ({
                    ...p,
                    units: (p.product_units || [])
                        .map(u => ({
                            id: u.id,
                            name: u.unit_name,
                            price: u.price,
                            cost: u.cost,
                            factor: u.factor,
                            stock: u.stock,
                            minPrice: u.min_price,
                            maxPrice: u.max_price,
                            barcode: u.barcode,
                            isBase: u.is_base
                        }))
                        // ✅ الوحدة الأساسية أولًا دائمًا
                        .sort((a, b) => (b.isBase ? 1 : 0) - (a.isBase ? 1 : 0))
                }));

                await this.local.putMany('products', products);
                MemCache.set('products', products);
                return products;
            } catch (e) {
                console.warn('Cloud fetch failed, using local', e);
                return await this.local.getAll('products');
            }
        },

        async saveProduct(product) {
            const id = product.id || U.uuid();
            const now = new Date().toISOString();

            const payload = {
                id,
                tenant_id: getTenantId(),
                name: product.name,
                code: product.code || null,
                barcode: product.barcode || null,
                category: product.category || null,
                description: product.description || null,
                is_active: true,
                updated_at: now
            };

            await this.local.put('products', { ...payload, units: product.units || [] });

            if (navigator.onLine && this.client) {
                const { error } = await this.client.from('products')
                    .upsert(payload, { onConflict: 'id' });
                if (error) throw error;

                if (product.units?.length) {
                    const unitsPayload = product.units.map(u => ({
                        id: u.id || U.uuid(),
                        product_id: id,
                        tenant_id: getTenantId(),
                        unit_name: u.name,
                        barcode: u.barcode || null,
                        price: u.price || 0,
                        cost: u.cost || 0,
                        factor: u.factor || 1,
                        stock: u.stock || 0,
                        min_price: u.minPrice || 0,
                        max_price: u.maxPrice || 0,
                        is_base: !!u.isBase
                    }));

                    const { error: uErr } = await this.client
                        .from('product_units')
                        .upsert(unitsPayload, { onConflict: 'id' });
                    if (uErr) console.warn('Units save warning', uErr);
                }
            }

            MemCache.clear('products');
            return { success: true, id };
        },

        async deleteProduct(id) {
            await this.local.delete('products', id);
            if (navigator.onLine && this.client) {
                await this.client.from('products')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', id);
            }
            MemCache.clear('products');
            return { success: true };
        },

        /* ============================================
           PARTIES
           ============================================ */
        async getParties(type = null, force = false) {
            if (!force) {
                const cached = MemCache.get('parties');
                if (cached?.length) {
                    return type
                        ? cached.filter(p => p.type === type || p.type === 'both')
                        : cached;
                }
            }

            if (!navigator.onLine || !this.client) {
                const local = await this.local.getAll('parties');
                const filtered = type
                    ? local.filter(p => p.type === type || p.type === 'both')
                    : local;
                MemCache.set('parties', local);
                return filtered;
            }

            try {
                let query = this.client.from('parties').select('*')
                    .is('deleted_at', null).order('name');
                if (type) query = query.or(`type.eq.${type},type.eq.both`);

                const { data, error } = await query;
                if (error) throw error;

                await this.local.putMany('parties', data || []);
                MemCache.set('parties', data || []);
                return data || [];
            } catch (e) {
                console.warn('Cloud parties fetch failed', e);
                const local = await this.local.getAll('parties');
                return type
                    ? local.filter(p => p.type === type || p.type === 'both')
                    : local;
            }
        },

        async saveParty(party) {
            const id = party.id || U.uuid();
            const now = new Date().toISOString();

            const payload = {
                id,
                tenant_id: party.tenant_id || getTenantId(),
                name: party.name,
                type: party.type || 'customer',
                phone: party.phone || null,
                email: party.email || null,
                address: party.address || null,
                balance: Number(party.balance) || 0,
                credit_limit: party.credit_limit || 0,
                notes: party.notes || null,
                is_active: true,
                updated_at: now
            };

            await this.local.put('parties', payload);

            if (navigator.onLine && this.client) {
                const { error } = await this.client.from('parties')
                    .upsert(payload, { onConflict: 'id' });
                if (error) throw error;
            }

            MemCache.clear('parties');
            return { success: true, id };
        },

        async deleteParty(id) {
            await this.local.delete('parties', id);
            if (navigator.onLine && this.client) {
                await this.client.from('parties')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', id);
            }
            MemCache.clear('parties');
            return { success: true };
        },

        async updatePartyBalance(partyId, newBalance) {
            const party = await this.local.get('parties', partyId);
            if (party) {
                party.balance = U.round(newBalance);
                party.updated_at = new Date().toISOString();
                await this.local.put('parties', party);
            }

            if (navigator.onLine && this.client) {
                const { error } = await this.client.from('parties')
                    .update({ balance: U.round(newBalance) })
                    .eq('id', partyId);
                if (error) {
                    await SyncQueue.enqueue({
                        type: 'party_balance',
                        id: partyId,
                        payload: { id: partyId, balance: U.round(newBalance) }
                    });
                }
            } else {
                await SyncQueue.enqueue({
                    type: 'party_balance',
                    id: partyId,
                    payload: { id: partyId, balance: U.round(newBalance) }
                });
            }

            MemCache.clear('parties');
        },

        /* ============================================
           PAYMENTS
           ============================================ */
        async addPayment(payment) {
            const client = getClient();
            const id = U.uuid();
            const now = new Date().toISOString();

            const payload = {
                id,
                tenant_id: getTenantId(),
                type: payment.type,
                amount: Math.abs(Number(payment.amount) || 0),
                party_id: payment.party_id,
                payment_method: payment.payment_method || 'cash',
                reference: payment.reference || null,
                notes: payment.notes || null,
                date: payment.date || localDateStr(),
                created_by: window.Auth?.user?.id || null,
                created_at: now
            };

            await this.local.put('transactions', payload);

            // ✅ فرق واضح: payment_in يزيد رصيدنا (العميل يدفع)، payment_out ينقص
            const party = await this.local.get('parties', payment.party_id);
            if (party) {
                const delta = payment.type === 'payment_in'
                    ? -payload.amount   // العميل يدفع → دينه ينقص
                    : payload.amount;    // ندفع لمورد → التزامنا ينقص (رصيده يزيد اتجاهنا)
                party.balance = U.round((Number(party.balance) || 0) + delta);
                party.updated_at = now;
                await this.local.put('parties', party);
            }

            if (navigator.onLine && client) {
                const { error } = await client.from('transactions').insert(payload);
                if (error) {
                    await SyncQueue.enqueue({
                        type: 'add_payment', id, payload
                    });
                    throw error;
                }
                if (party) {
                    await client.from('parties')
                        .update({ balance: party.balance }).eq('id', party.id);
                }
            } else {
                await SyncQueue.enqueue({ type: 'add_payment', id, payload });
            }

            MemCache.clear('parties');
            MemCache.clear('transactions');

            if (window.SessionStore) {
                window.SessionStore.invalidate('offline_parties');
                window.SessionStore.invalidate('offline_transactions');
            }

            return { success: true, id };
        },

        async getPayments(partyId = null) {
            if (!navigator.onLine || !this.client) {
                const local = await this.local.getAll('transactions');
                return partyId
                    ? local.filter(t => t.party_id === partyId)
                    : local;
            }

            try {
                let query = this.client.from('transactions')
                    .select('*').order('date', { ascending: false });
                if (partyId) query = query.eq('party_id', partyId);

                const { data, error } = await query;
                if (error) throw error;

                await this.local.putMany('transactions', data || []);
                return data || [];
            } catch (e) {
                const local = await this.local.getAll('transactions');
                return partyId
                    ? local.filter(t => t.party_id === partyId)
                    : local;
            }
        },

        /* ============================================
           INVOICES
           ============================================ */
        async getInvoices(force = false) {
            if (!force) {
                const cached = MemCache.get('invoices', 30000);
                if (cached?.length) return cached;
            }

            if (!navigator.onLine || !this.client) {
                const local = await this.local.getAll('invoices');
                local.sort((a, b) =>
                    new Date(b.created_at || b.date) -
                    new Date(a.created_at || a.date));
                return local;
            }

            try {
                const { data, error } = await this.client
                    .from('invoices')
                    .select('*')
                    .is('deleted_at', null)
                    .order('created_at', { ascending: false });

                if (error) throw error;

                await this.local.putMany('invoices', data || []);
                MemCache.set('invoices', data || []);
                return data || [];
            } catch (e) {
                console.warn('Cloud invoices fetch failed', e);
                const local = await this.local.getAll('invoices');
                return local;
            }
        },

        async getInvoiceById(id) {
            if (navigator.onLine && this.client) {
                try {
                    const { data, error } = await this.client
                        .from('invoices').select('*')
                        .eq('id', id).maybeSingle();
                    if (!error && data) return data;
                } catch { /* ignore */ }
            }
            return await this.local.get('invoices', id);
        },

        /* ============================================
           ✅ إنشاء فاتورة — ذرّي بالكامل
           ============================================ */
        async createInvoice(invoice) {
            if (!invoice.items?.length) {
                throw new Error('لا توجد أصناف في الفاتورة');
            }

            const id = invoice.id || U.uuid();
            const now = new Date().toISOString();

            // ✅ تحويل عناصر الفاتورة لتنسيق موحّد قبل الحفظ
            const normalizedItems = invoice.items.map(item => {
                const productId = item.productId || item.product_id;
                const unitName = item.unitName || item.unit_name;
                return {
                    ...item,
                    productId,
                    product_id: productId,
                    unitName,
                    unit_name: unitName,
                    quantity: Number(item.quantity) || 0,
                    price: Number(item.price) || 0,
                    cost: Number(item.cost) || 0
                };
            });

            const payload = {
                id,
                tenant_id: getTenantId(),
                invoice_number: invoice.invoice_number,
                type: invoice.type || 'sale',
                date: invoice.date || localDateStr(),
                customer_id: invoice.customer_id || null,
                customer_name: invoice.customer_name || 'نقدي',
                supplier_id: invoice.supplier_id || null,
                supplier_name: invoice.supplier_name || null,
                items: normalizedItems,
                subtotal: Number(invoice.subtotal) || 0,
                discount: Number(invoice.discount) || 0,
                total: Number(invoice.total) || 0,
                cash_paid: Number(invoice.cash_paid) || 0,
                transfer_paid: Number(invoice.transfer_paid) || 0,
                card_paid: Number(invoice.card_paid) || 0,
                used_balance: Number(invoice.used_balance) || 0,
                paid: Number(invoice.paid) || 0,
                remaining: Number(invoice.remaining) || 0,
                change_amount: Number(invoice.change_amount) || 0,
                payment_method: invoice.payment_method || 'cash',
                status: invoice.status || 'paid',
                notes: invoice.notes || null,
                created_by: window.Auth?.user?.id || null,
                created_at: now,
                updated_at: now,
                device_id: getDeviceId()
            };

            // ✅ المسار السحابي: RPC ذرّي (كل شيء أو لا شيء)
            if (navigator.onLine && this.client) {
                try {
                    const { data, error } = await this.client.rpc(
                        'create_invoice_atomic',
                        { p_invoice: payload }
                    );
                    if (error) throw error;

                    // نجاح كامل — حفظ محلي فقط
                    await this.local.put('invoices', payload);
                    await this._refreshLocalAfterInvoice(payload);

                    MemCache.clear();
                    return {
                        success: true, id,
                        invoice_number: payload.invoice_number
                    };
                } catch (cloudErr) {
                    console.warn('Atomic invoice failed, queueing offline', cloudErr);
                    // نُسجّل في queue ونكمل أوفلاين
                    await SyncQueue.enqueue({
                        type: 'create_invoice', id, payload
                    });
                }
            } else {
                await SyncQueue.enqueue({
                    type: 'create_invoice', id, payload
                });
            }

            // ✅ المسار الأوفلاين: خصم/زيادة محلية + تحديث أرصدة
            await this.local.put('invoices', payload);
            await this._applyOfflineEffects(payload);

            MemCache.clear();
            return { success: true, id, invoice_number: payload.invoice_number };
        },

        /* ============================================
           Helper: تطبيق التأثيرات المحلية أوفلاين
           ============================================ */
        async _applyOfflineEffects(invoice) {
            const status = invoice.status || 'paid';
            const type = invoice.type;

            // 1) المخزون
            if (status !== 'held') {
                let sign = 0;
                if (type === 'sale') sign = -1;
                else if (type === 'purchase') sign = +1;
                else if (type === 'return_sale') sign = +1;
                else if (type === 'return_purchase') sign = -1;

                if (sign !== 0) {
                    for (const item of invoice.items) {
                        await this._applyLocalStockDelta(
                            item.productId, item.unitName,
                            sign * (Number(item.quantity) || 0),
                            type
                        );
                    }
                }
            }

            // 2) رصيد العميل
            if (invoice.customer_id && ['sale', 'return_sale'].includes(type)) {
                const cust = await this.local.get('parties', invoice.customer_id);
                if (cust) {
                    const oldBal = Number(cust.balance) || 0;
                    let delta = 0;

                    if (type === 'sale') {
                        const remaining = Number(invoice.remaining) || 0;
                        const change = Number(invoice.change_amount) || 0;
                        const used = Number(invoice.used_balance) || 0;
                        delta = change - remaining - used;
                    } else if (type === 'return_sale') {
                        delta = Number(invoice.total) || 0;
                    }

                    cust.balance = U.round(oldBal + delta);
                    cust.updated_at = new Date().toISOString();
                    await this.local.put('parties', cust);
                }
            }

            // 3) رصيد المورد
            if (invoice.supplier_id && ['purchase', 'return_purchase'].includes(type)) {
                const sup = await this.local.get('parties', invoice.supplier_id);
                if (sup) {
                    const oldBal = Number(sup.balance) || 0;
                    let delta = 0;

                    if (type === 'purchase') {
                        delta = (Number(invoice.total) || 0)
                              - (Number(invoice.paid) || 0);
                    } else if (type === 'return_purchase') {
                        delta = -(Number(invoice.total) || 0);
                    }

                    sup.balance = U.round(oldBal + delta);
                    sup.updated_at = new Date().toISOString();
                    await this.local.put('parties', sup);
                }
            }
        },

        /* ============================================
           Helper: تعديل مخزون محلي (يستخدم factor صحيح)
           ============================================ */
        async _applyLocalStockDelta(productId, unitName, qtyInBaseUnit, reason) {
            const product = await this.local.get('products', productId);
            if (!product?.units?.length) return;

            const baseUnit = product.units.find(u => u.isBase) || product.units[0];
            const selectedUnit = product.units.find(u => u.name === unitName) || baseUnit;
            const factor = selectedUnit === baseUnit
                ? 1
                : (Number(selectedUnit.factor) || 1);

            // qtyInBaseUnit هو الكمية بالوحدة الأساسية
            const delta = Number(qtyInBaseUnit) * factor;
            const oldStock = Number(baseUnit.stock) || 0;
            const newStock = oldStock + delta;

            // تسجيل التحذير فقط — لا نُخفي المخزون السالب (لأنه مؤشر مهم)
            if (newStock < 0) {
                console.warn(`⚠️ مخزون سالب محلي: ${product.name} (${oldStock} → ${newStock})`);
            }

            baseUnit.stock = newStock;
            product.stock_updated_at = new Date().toISOString();

            await this.local.put('products', product);
            MemCache.clear('products');
        },

        /* ============================================
           Helper: تحديث محلي بعد نجاح RPC سحابي
           ============================================ */
        async _refreshLocalAfterInvoice(invoice) {
            // بعد نجاح RPC، نُحدّث النسخ المحلية من السحابة عند أول فرصة
            // الآن نُطبّق نفس التأثيرات محليًا لضمان الاتساق
            await this._applyOfflineEffects(invoice);
        },

        /* ============================================
           SETTINGS
           ============================================ */
        async getSettings() {
            const local = await this.local.get('settings', 'app_settings');
            if (local) return local.data || {};

            if (navigator.onLine && this.client) {
                const tenantId = getTenantId();
                if (!tenantId) return {};

                try {
                    const { data, error } = await this.client
                        .from('settings').select('data')
                        .eq('tenant_id', tenantId).maybeSingle();

                    if (!error && data) {
                        await this.local.put('settings', {
                            id: 'app_settings', data: data.data
                        });
                        return data.data;
                    }
                } catch { /* ignore */ }
            }
            return {};
        },

        async saveSettings(data) {
            const tenantId = getTenantId();
            if (!tenantId) {
                // بدلًا من الرمي، نحفظ محليًا فقط
                await this.local.put('settings', { id: 'app_settings', data });
                return data;
            }

            await this.local.put('settings', { id: 'app_settings', data });

            if (navigator.onLine && this.client) {
                const { error } = await this.client
                    .from('settings')
                    .upsert({ tenant_id: tenantId, data },
                            { onConflict: 'tenant_id' });
                if (error) throw error;
            }
            return data;
        },

        /* ============================================
           INVOICE NUMBER — محصّن ضد السباق
           ============================================ */
        async generateInvoiceNumber() {
            const deviceId = getDeviceId();

            if (navigator.onLine && this.client) {
                try {
                    const { data, error } = await this.client
                        .rpc('next_invoice_number',
                             { p_device_id: deviceId });
                    if (!error && data) return data;
                } catch (e) {
                    console.warn('Server invoice number failed, using local', e);
                }
            }

            // fallback محلي — يستخدم device_id لتجنب التصادم
            const year = new Date().getFullYear().toString().slice(-2);
            const key = `invoice_counter_${year}_${deviceId}`;
            const current = parseInt(localStorage.getItem(key) || '0', 10);
            const next = current + 1;
            localStorage.setItem(key, String(next));

            return `${year}-${deviceId.slice(0, 4).toUpperCase()}-${String(next).padStart(4, '0')}`;
        },

        /* ============================================
           Stock Movements Query (للتقارير)
           ============================================ */
        async getStockMovements(productId = null, limit = 100) {
            if (!navigator.onLine || !this.client) return [];

            try {
                let q = this.client.from('stock_movements')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(limit);
                if (productId) q = q.eq('product_id', productId);

                const { data, error } = await q;
                if (error) throw error;
                return data || [];
            } catch (e) {
                console.warn('getStockMovements failed', e);
                return [];
            }
        },

        async getPendingSyncCount() {
            return await SyncQueue.pendingCount();
        },

        clearCache() {
            MemCache.clear();
        }
    };

    window.addEventListener('load', () => {
        window.DB.init().catch(e => console.error('DB init error', e));
    });

    console.log('✅ db.js loaded (v4.0.0 - atomic + stock_movements + sync_queue)');
})();
