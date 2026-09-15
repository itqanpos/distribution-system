/* =============================================
   db.js - Data Layer (Supabase + IndexedDB)
   Version: 5.2.0

   Changes from v5.0.0:
   - [1] requireTenant() — يمنع الكتابة بدون tenant
   - [2] لا fallback لـ IDB عند الفشل أونلاين
   - [3] deleteByTenant() — عزل بيانات المستأجرين في IDB
   - [4] getProducts/getParties/getInvoices يحترمون tenant
   - [5] createSaleInvoice / createPurchaseInvoice كأغلفة
   - [6] getInvoicesLight / getPurchases / getPurchaseById / getPurchasesLight
   - [7] addPayment: لا تغيير محلي قبل نجاح RPC
   - [8] wipeLocalData يشمل failed_sync
   ============================================= */
(function() {
    'use strict';

    const CFG = window.APP_CONFIG || {};
    const DEVICE_KEY = 'hesaby_device_id';

    /* ============================================
       Helpers
       ============================================ */
    function getDeviceId() {
        let id = localStorage.getItem(DEVICE_KEY);
        if (!id) {
            id = (crypto.randomUUID?.() || fallbackUuid()).replace(/-/g, '').slice(0, 8);
            localStorage.setItem(DEVICE_KEY, id);
        }
        return id;
    }

    function fallbackUuid() {
        if (crypto.getRandomValues) {
            const b = crypto.getRandomValues(new Uint8Array(16));
            b[6] = (b[6] & 0x0f) | 0x40;
            b[8] = (b[8] & 0x3f) | 0x80;
            const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
            return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function localDateStr(d = new Date()) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function round3(v) {
        const n = Number(v);
        if (!Number.isFinite(n)) return 0;
        const f = 1000;
        const s = n * f;
        return Math.round(s + (s >= 0 ? 1e-9 : -1e-9)) / f;
    }

    const BUSINESS_ERROR_CODES = new Set([
        'P0001', 'P0002', 'P0003', 'P0004', 'P0005', 'P0006',
        '42501', '23505', '23514', '23503', '42P01'
    ]);

    function isBusinessError(err) {
        const code = err?.code || '';
        return BUSINESS_ERROR_CODES.has(code);
    }

    /* ============================================
       IndexedDB
       ============================================ */
    class LocalDB {
        constructor() { this.db = null; this.ready = false; this.initPromise = this.init(); }

        init() {
            return new Promise((resolve) => {
                if (typeof indexedDB === 'undefined') { resolve(this); return; }
                const req = indexedDB.open(CFG.DB_NAME || 'hesaby_pos', CFG.DB_VERSION || 3);

                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    const stores = ['products','parties','invoices','settings',
                                    'transactions','sync_queue','failed_sync'];
                    stores.forEach(name => {
                        if (db.objectStoreNames.contains(name)) return;
                        const keyPath = (name === 'sync_queue' || name === 'failed_sync') ? 'key' : 'id';
                        const store = db.createObjectStore(name, { keyPath });

                        if (name === 'invoices') {
                            store.createIndex('date', 'date');
                            store.createIndex('status', 'status');
                            store.createIndex('customer_id', 'customer_id');
                            store.createIndex('tenant_id', 'tenant_id');
                        }
                        if (name === 'products') {
                            store.createIndex('barcode', 'barcode');
                            store.createIndex('category', 'category');
                            store.createIndex('tenant_id', 'tenant_id');
                        }
                        if (name === 'parties') {
                            store.createIndex('type', 'type');
                            store.createIndex('phone', 'phone');
                            store.createIndex('tenant_id', 'tenant_id');
                        }
                        if (name === 'transactions') {
                            store.createIndex('party_id', 'party_id');
                            store.createIndex('date', 'date');
                            store.createIndex('tenant_id', 'tenant_id');
                        }
                        if (name === 'sync_queue') {
                            store.createIndex('created_at', 'created_at');
                        }
                    });
                };
                req.onsuccess = (e) => { this.db = e.target.result; this.ready = true; resolve(this); };
                req.onerror = () => resolve(this);
            });
        }

        async _ready() { if (!this.ready) await this.initPromise; }

        async get(store, id) {
            await this._ready(); if (!this.db) return null;
            return new Promise(res => {
                const r = this.db.transaction(store, 'readonly').objectStore(store).get(id);
                r.onsuccess = () => res(r.result); r.onerror = () => res(null);
            });
        }

        async getAll(store) {
            await this._ready(); if (!this.db) return [];
            return new Promise(res => {
                const r = this.db.transaction(store, 'readonly').objectStore(store).getAll();
                r.onsuccess = () => res(r.result || []); r.onerror = () => res([]);
            });
        }

        async put(store, data) {
            await this._ready(); if (!this.db) return data;
            return new Promise((res, rej) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).put(data);
                tx.oncomplete = () => res(data);
                tx.onerror = (e) => rej(e.target.error || new Error('IDB write failed'));
                tx.onabort = () => rej(new Error('IDB aborted'));
            });
        }

        async putMany(store, items) {
            await this._ready(); if (!this.db || !items?.length) return items || [];
            return new Promise((res, rej) => {
                const tx = this.db.transaction(store, 'readwrite');
                const s = tx.objectStore(store);
                items.forEach(i => s.put(i));
                tx.oncomplete = () => res(items);
                tx.onerror = (e) => rej(e.target.error || new Error('IDB bulk failed'));
            });
        }

        async delete(store, id) {
            await this._ready(); if (!this.db) return;
            return new Promise((res, rej) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).delete(id);
                tx.oncomplete = () => res();
                tx.onerror = () => rej(new Error('IDB delete failed'));
            });
        }

        async clear(store) {
            await this._ready(); if (!this.db) return;
            return new Promise((res, rej) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).clear();
                tx.oncomplete = () => res();
                tx.onerror = () => rej(new Error('IDB clear failed'));
            });
        }

        // ✅ حذف كل السجلات التي لا تنتمي لمستأجر معيّن
        async deleteByTenant(store, tenantId) {
            await this._ready();
            if (!this.db || !tenantId) return 0;
            const all = await this.getAll(store);
            const foreign = all.filter(x => x.tenant_id && x.tenant_id !== tenantId);
            if (!foreign.length) return 0;
            return new Promise((res, rej) => {
                const tx = this.db.transaction(store, 'readwrite');
                const s = tx.objectStore(store);
                foreign.forEach(f => s.delete(f.id));
                tx.oncomplete = () => res(foreign.length);
                tx.onerror = () => rej(new Error('IDB bulk delete failed'));
            });
        }
    }

    /* ============================================
       Supabase Client
       ============================================ */
    let supabaseClient = null;

    function initSupabase() {
        if (typeof window.supabase === 'undefined') return null;
        try {
            supabaseClient = window.supabase.createClient(
                CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY,
                { auth: { storage: localStorage, persistSession: true,
                          autoRefreshToken: true, detectSessionInUrl: false } }
            );
            return supabaseClient;
        } catch (e) {
            console.error('Supabase init failed', e);
            return null;
        }
    }

    function getClient() { return window.DB?.client || supabaseClient; }

    function getTenantId() {
        return window.Auth?.user?.tenant_id || null;
    }

    // ✅ يمنع أي كتابة بدون مستأجر
    function requireTenant() {
        const t = getTenantId();
        if (!t) {
            const err = new Error('لا يوجد مستأجر مرتبط بالحساب. أعد تسجيل الدخول.');
            err.code = 'NO_TENANT';
            throw err;
        }
        return t;
    }

    /* ============================================
       Memory Cache
       ============================================ */
    const MemCache = {
        _data: {}, _time: {}, _max: 2000,
        set(key, data) {
            if (Array.isArray(data) && data.length > this._max) data = data.slice(0, this._max);
            this._data[key] = Array.isArray(data) ? data.slice() : data;
            this._time[key] = Date.now();
        },
        get(key, maxAge = 60000) {
            if (!this._time[key]) return null;
            if (Date.now() - this._time[key] > maxAge) return null;
            const v = this._data[key];
            return Array.isArray(v) ? v.slice() : v;
        },
        clear(key) {
            if (key) { delete this._data[key]; delete this._time[key]; }
            else { this._data = {}; this._time = {}; }
        }
    };

    /* ============================================
       Sync Queue
       ============================================ */
    const SyncQueue = {
        _key(op) { return `${op.type}:${op.id}`; },

        async enqueue(op) {
            try {
                await window.DB.local.put('sync_queue', {
                    key: this._key(op), ...op,
                    created_at: new Date().toISOString(),
                    retries: 0,
                    next_retry_at: 0
                });

                if ('serviceWorker' in navigator && 'SyncManager' in window) {
                    try {
                        const reg = await navigator.serviceWorker.ready;
                        await reg.sync.register('hesaby-sync-queue');
                    } catch (e) { /* ignore */ }
                }
            } catch (e) { console.warn('sync_queue enqueue failed', e); }
        },

        async dequeue(op) {
            try { await window.DB.local.delete('sync_queue', this._key(op)); } catch {}
        },

        async all() { return await window.DB.local.getAll('sync_queue') || []; },

        async pendingCount() { return (await this.all()).length; },

        async moveToFailed(op, error) {
            try {
                await window.DB.local.put('failed_sync', {
                    key: this._key(op), ...op,
                    error: String(error?.message || error),
                    error_code: error?.code || null,
                    failed_at: new Date().toISOString()
                });
                await this.dequeue(op);
            } catch (e) { console.warn('moveToFailed failed', e); }
        },

        async clearFailed() {
            try { await window.DB.local.clear('failed_sync'); } catch {}
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

                window.addEventListener('online', () => {
                    this.flushSyncQueue().catch(e => console.warn('flush error', e));
                });

                setInterval(() => {
                    if (navigator.onLine) this.flushSyncQueue().catch(() => {});
                }, CFG.SYNC_INTERVAL || 30000);

                return this;
            })();
            return this.ready;
        },

        /* ============================================
           Sync
           ============================================ */
        async flushSyncQueue() {
            if (!navigator.onLine || !this.client) return;
            const ops = await SyncQueue.all();
            if (!ops.length) return;

            ops.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));

            for (const op of ops) {
                if (op.next_retry_at && Date.now() < op.next_retry_at) continue;

                try {
                    const result = await this._dispatchSync(op);
                    if (result?.error) throw result.error;
                    await SyncQueue.dequeue(op);
                } catch (e) {
                    if (isBusinessError(e)) {
                        console.error('Business error in sync op', op, e);
                        await SyncQueue.moveToFailed(op, e);
                        continue;
                    }
                    op.retries = (op.retries || 0) + 1;
                    if (op.retries >= (CFG.SYNC_MAX_RETRIES || 8)) {
                        console.error('Sync op failed permanently', op, e);
                        await SyncQueue.moveToFailed(op, e);
                    } else {
                        op.next_retry_at = Date.now() + Math.min(60000, 1000 * 2 ** op.retries);
                        await this.local.put('sync_queue', op);
                    }
                }
            }
        },

        async _dispatchSync(op) {
            switch (op.type) {
                case 'create_invoice':
                    return await this.client.rpc('create_invoice_atomic', { p_invoice: op.payload });
                case 'void_invoice':
                    return await this.client.rpc('void_invoice_atomic', { p_invoice_id: op.payload.id });
                case 'add_payment':
                    return await this.client.rpc('add_payment_atomic', { p_payment: op.payload });
                case 'save_product':
                    return await this.client.from('products').upsert(op.payload, { onConflict: 'id' });
                case 'save_units':
                    return await this.client.from('product_units').upsert(op.payload, { onConflict: 'id' });
                case 'delete_product':
                    return await this.client.from('products')
                        .update({ deleted_at: new Date().toISOString() }).eq('id', op.payload.id);
                case 'save_party':
                    return await this.client.from('parties').upsert(op.payload, { onConflict: 'id' });
                case 'delete_party':
                    return await this.client.from('parties')
                        .update({ deleted_at: new Date().toISOString() }).eq('id', op.payload.id);
                case 'save_settings':
                    return await this.client.from('settings')
                        .upsert({ tenant_id: op.payload.tenant_id, data: op.payload.data },
                                { onConflict: 'tenant_id' });
                default:
                    return { error: new Error('Unknown sync type: ' + op.type) };
            }
        },

        /* ============================================
           PRODUCTS
           ============================================ */
        async getProducts(force = false) {
            if (!force) {
                const c = MemCache.get('products');
                if (c?.length) return c;
            }

            const tenantId = getTenantId();

            if (!navigator.onLine || !this.client) {
                const all = await this.local.getAll('products');
                const local = all.filter(p =>
                    !p.deleted_at && (!tenantId || p.tenant_id === tenantId)
                );
                MemCache.set('products', local);
                return local;
            }

            const { data, error } = await this.client
                .from('products')
                .select('*, product_units(*)')
                .is('deleted_at', null)
                .order('name');
            if (error) throw error;

            const remote = (data || []).map(p => ({
                ...p,
                units: (p.product_units || [])
                    .map(u => ({
                        id: u.id, name: u.unit_name,
                        price: u.price, cost: u.cost,
                        factor: u.factor, stock: u.stock,
                        minPrice: u.min_price, maxPrice: u.max_price,
                        barcode: u.barcode, isBase: u.is_base
                    }))
                    .sort((a,b) => (b.isBase ? 1 : 0) - (a.isBase ? 1 : 0))
            }));

            // امسح بيانات مستأجرين آخرين
            if (tenantId) {
                try { await this.local.deleteByTenant('products', tenantId); }
                catch (e) { console.warn('deleteByTenant failed', e); }
            }

            const existing = await this.local.getAll('products');
            const merged = remote.map(rp => {
                const lp = existing.find(e => e.id === rp.id);
                if (!lp?.updated_at || !rp.updated_at) return rp;

                if (new Date(lp.updated_at) > new Date(rp.updated_at)) {
                    const mergedUnits = (lp.units || []).map(lu => {
                        const ru = (rp.units || []).find(u => u.id === lu.id);
                        return ru ? { ...lu, stock: ru.stock } : lu;
                    });
                    (rp.units || []).forEach(ru => {
                        if (!mergedUnits.find(u => u.id === ru.id)) mergedUnits.push(ru);
                    });
                    return { ...lp, tenant_id: rp.tenant_id, units: mergedUnits };
                }
                return rp;
            });

            await this.local.putMany('products', merged);
            MemCache.set('products', merged);
            return merged;
        },

        async saveProduct(product) {
            const tenantId = requireTenant();
            const id = product.id || fallbackUuid();
            const now = new Date().toISOString();

            const payload = {
                id, tenant_id: tenantId,
                name: product.name,
                code: product.code || null,
                barcode: product.barcode || null,
                category: product.category || null,
                description: product.description || null,
                is_active: true,
                updated_at: now
            };

            await this.local.put('products', { ...payload, units: product.units || [] });

            const unitsPayload = (product.units || []).map(u => ({
                id: u.id || fallbackUuid(),
                product_id: id,
                tenant_id: tenantId,
                unit_name: u.name,
                barcode: u.barcode || null,
                price: u.price || 0,
                cost: u.cost || 0,
                factor: u.isBase ? 1 : (u.factor || 1),
                stock: u.stock || 0,
                min_price: u.minPrice || 0,
                max_price: u.maxPrice || 0,
                is_base: !!u.isBase
            }));

            if (navigator.onLine && this.client) {
                try {
                    const { error } = await this.client.from('products')
                        .upsert(payload, { onConflict: 'id' });
                    if (error) throw error;

                    if (unitsPayload.length) {
                        const { error: uErr } = await this.client.from('product_units')
                            .upsert(unitsPayload, { onConflict: 'id' });
                        if (uErr) throw uErr;
                    }
                } catch (e) {
                    if (isBusinessError(e)) throw e;
                    await SyncQueue.enqueue({ type: 'save_product', id, payload });
                    if (unitsPayload.length) {
                        await SyncQueue.enqueue({ type: 'save_units', id, payload: unitsPayload });
                    }
                }
            } else {
                await SyncQueue.enqueue({ type: 'save_product', id, payload });
                if (unitsPayload.length) {
                    await SyncQueue.enqueue({ type: 'save_units', id, payload: unitsPayload });
                }
            }

            MemCache.clear('products');
            return { success: true, id };
        },

        async deleteProduct(id) {
            requireTenant();
            const product = await this.local.get('products', id);
            if (product) {
                product.deleted_at = new Date().toISOString();
                await this.local.put('products', product);
            }

            if (navigator.onLine && this.client) {
                try {
                    const { error } = await this.client.from('products')
                        .update({ deleted_at: new Date().toISOString() }).eq('id', id);
                    if (error) throw error;
                } catch (e) {
                    if (isBusinessError(e)) throw e;
                    await SyncQueue.enqueue({ type: 'delete_product', id, payload: { id } });
                }
            } else {
                await SyncQueue.enqueue({ type: 'delete_product', id, payload: { id } });
            }

            MemCache.clear('products');
            return { success: true };
        },

        /* ============================================
           PARTIES
           ============================================ */
        async getParties(type = null, force = false) {
            if (!force) {
                const c = MemCache.get('parties');
                if (c?.length) {
                    return type ? c.filter(p => p.type === type || p.type === 'both') : c;
                }
            }

            const tenantId = getTenantId();

            if (!navigator.onLine || !this.client) {
                const all = await this.local.getAll('parties');
                const local = all.filter(p =>
                    !p.deleted_at && (!tenantId || p.tenant_id === tenantId)
                );
                MemCache.set('parties', local);
                return type ? local.filter(p => p.type === type || p.type === 'both') : local;
            }

            let q = this.client.from('parties').select('*')
                .is('deleted_at', null).order('name');
            if (type) q = q.or(`type.eq.${type},type.eq.both`);
            const { data, error } = await q;
            if (error) throw error;

            if (tenantId) {
                try { await this.local.deleteByTenant('parties', tenantId); }
                catch (e) { console.warn('deleteByTenant failed', e); }
            }

            const existing = await this.local.getAll('parties');
            const merged = (data || []).map(rp => {
                const lp = existing.find(e => e.id === rp.id);
                if (lp?.updated_at && rp.updated_at &&
                    new Date(lp.updated_at) > new Date(rp.updated_at)) {
                    return { ...lp, tenant_id: rp.tenant_id, balance: rp.balance };
                }
                return rp;
            });

            await this.local.putMany('parties', merged);
            MemCache.set('parties', merged);
            return merged;
        },

        async saveParty(party) {
            const tenantId = party.tenant_id || requireTenant();
            const id = party.id || fallbackUuid();
            const now = new Date().toISOString();

            const payload = {
                id, tenant_id: tenantId,
                name: party.name,
                type: party.type || 'customer',
                phone: party.phone || null,
                email: party.email || null,
                address: party.address || null,
                balance: Number(party.balance) || 0,
                credit_limit: Number(party.credit_limit) || 0,
                notes: party.notes || null,
                is_active: true,
                updated_at: now
            };

            await this.local.put('parties', payload);

            if (navigator.onLine && this.client) {
                try {
                    const { error } = await this.client.from('parties')
                        .upsert(payload, { onConflict: 'id' });
                    if (error) throw error;
                } catch (e) {
                    if (isBusinessError(e)) throw e;
                    await SyncQueue.enqueue({ type: 'save_party', id, payload });
                }
            } else {
                await SyncQueue.enqueue({ type: 'save_party', id, payload });
            }

            MemCache.clear('parties');
            return { success: true, id };
        },

        async deleteParty(id) {
            requireTenant();
            const party = await this.local.get('parties', id);
            if (party) {
                party.deleted_at = new Date().toISOString();
                await this.local.put('parties', party);
            }

            if (navigator.onLine && this.client) {
                try {
                    const { error } = await this.client.from('parties')
                        .update({ deleted_at: new Date().toISOString() }).eq('id', id);
                    if (error) throw error;
                } catch (e) {
                    if (isBusinessError(e)) throw e;
                    await SyncQueue.enqueue({ type: 'delete_party', id, payload: { id } });
                }
            } else {
                await SyncQueue.enqueue({ type: 'delete_party', id, payload: { id } });
            }

            MemCache.clear('parties');
            return { success: true };
        },

        /* ============================================
           PAYMENTS
           ============================================ */
        async addPayment(payment) {
            const client = getClient();
            const tenantId = requireTenant();
            const id = payment.id || fallbackUuid();
            const now = new Date().toISOString();
            const idempotency_key = payment.idempotency_key || id;

            const payload = {
                id, tenant_id: tenantId,
                type: payment.type,
                amount: Math.abs(Number(payment.amount) || 0),
                party_id: payment.party_id,
                payment_method: payment.payment_method || 'cash',
                reference: payment.reference || null,
                notes: payment.notes || null,
                date: payment.date || localDateStr(),
                created_by: window.Auth?.user?.id || null,
                created_at: now,
                device_id: getDeviceId(),
                idempotency_key
            };

            if (payload.amount <= 0) {
                throw new Error('المبلغ يجب أن يكون أكبر من صفر');
            }

            // ✅ لا تغيير محلي قبل نجاح RPC أو queue
            if (navigator.onLine && client) {
                try {
                    const { error } = await client.rpc('add_payment_atomic', { p_payment: payload });
                    if (error) throw error;
                } catch (e) {
                    if (isBusinessError(e)) throw e;
                    await SyncQueue.enqueue({ type: 'add_payment', id, payload });
                }
            } else {
                await SyncQueue.enqueue({ type: 'add_payment', id, payload });
            }

            // الآن نُطبّق محليًا
            await this.local.put('transactions', payload);
            const party = await this.local.get('parties', payment.party_id);
            if (party && party.tenant_id === tenantId) {
                const delta = payment.type === 'payment_in'
                    ? payload.amount
                    : -payload.amount;
                party.balance = round3((Number(party.balance) || 0) + delta);
                party.updated_at = now;
                await this.local.put('parties', party);
            }

            MemCache.clear('parties');
            MemCache.clear('transactions');
            return { success: true, id };
        },

        async getPayments(partyId = null) {
            const tenantId = getTenantId();

            if (!navigator.onLine || !this.client) {
                const all = await this.local.getAll('transactions');
                const local = all.filter(t => !tenantId || t.tenant_id === tenantId);
                return partyId ? local.filter(t => t.party_id === partyId) : local;
            }

            let q = this.client.from('transactions').select('*')
                .order('date', { ascending: false });
            if (partyId) q = q.eq('party_id', partyId);
            const { data, error } = await q;
            if (error) throw error;
            await this.local.putMany('transactions', data || []);
            return data || [];
        },

        /* ============================================
           INVOICES
           ============================================ */
        async getInvoices(force = false) {
            if (!force) {
                const c = MemCache.get('invoices', 30000);
                if (c?.length) return c;
            }

            const tenantId = getTenantId();

            if (!navigator.onLine || !this.client) {
                const all = await this.local.getAll('invoices');
                const local = all.filter(i => !tenantId || i.tenant_id === tenantId);
                local.sort((a,b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
                return local;
            }

            const { data, error } = await this.client.from('invoices')
                .select('*').is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;

            if (tenantId) {
                try { await this.local.deleteByTenant('invoices', tenantId); }
                catch (e) { console.warn('deleteByTenant failed', e); }
            }

            await this.local.putMany('invoices', data || []);
            MemCache.set('invoices', data || []);
            return data || [];
        },

        async getInvoicesLight(force = false) {
            const tenantId = getTenantId();

            if (!navigator.onLine || !this.client) {
                const all = await this.local.getAll('invoices');
                const local = all.filter(i => !tenantId || i.tenant_id === tenantId);
                local.sort((a,b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
                return local.map(i => ({ ...i, items: undefined }));
            }

            const { data, error } = await this.client.from('invoices')
                .select('id, tenant_id, invoice_number, type, date, customer_id, customer_name, supplier_id, supplier_name, subtotal, discount, total, cash_paid, transfer_paid, card_paid, used_balance, paid, remaining, change_amount, payment_method, status, notes, created_at, updated_at, created_by, device_id')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async getInvoiceById(id) {
            if (navigator.onLine && this.client) {
                try {
                    const { data, error } = await this.client.from('invoices')
                        .select('*').eq('id', id).maybeSingle();
                    if (!error && data) return data;
                } catch { /* ignore */ }
            }
            return await this.local.get('invoices', id);
        },

        /* ============================================
           CREATE INVOICE — RPC ذرّي
           ============================================ */
        async createInvoice(invoice) {
            if (!invoice.items?.length) throw new Error('لا توجد أصناف في الفاتورة');

            const tenantId = requireTenant();
            const id = invoice.id || fallbackUuid();
            const now = new Date().toISOString();
            const idempotency_key = invoice.idempotency_key || id;

            const normalizedItems = invoice.items.map(item => {
                const productId = item.productId || item.product_id;
                const unitName  = item.unitName  || item.unit_name;
                return {
                    productId, product_id: productId,
                    unitName,  unit_name:  unitName,
                    quantity: Number(item.quantity) || 0,
                    price:    Number(item.price) || 0,
                    cost:     Number(item.cost) || 0,
                    factor:   Number(item.factor) || 1
                };
            });

            const payload = {
                id, tenant_id: tenantId,
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
                device_id: getDeviceId(),
                idempotency_key
            };

            if (navigator.onLine && this.client) {
                try {
                    const { data, error } = await this.client.rpc(
                        'create_invoice_atomic', { p_invoice: payload }
                    );
                    if (error) throw error;

                    await this.local.put('invoices', {
                        ...payload,
                        invoice_number: data?.invoice_number || payload.invoice_number,
                        synced_at: now
                    });
                    await this._applyLocalEffects(payload);

                    MemCache.clear();
                    return {
                        success: true, id,
                        invoice_number: data?.invoice_number || payload.invoice_number,
                        deduplicated: data?.deduplicated === true
                    };
                } catch (cloudErr) {
                    if (isBusinessError(cloudErr)) throw cloudErr;
                    await SyncQueue.enqueue({ type: 'create_invoice', id, payload });
                }
            } else {
                await SyncQueue.enqueue({ type: 'create_invoice', id, payload });
            }

            await this.local.put('invoices', payload);
            await this._applyLocalEffects(payload);
            MemCache.clear();
            return { success: true, id, invoice_number: payload.invoice_number };
        },

        // ✅ أغلفة توافقية
        async createSaleInvoice(invoiceData) {
            return this.createInvoice({ ...invoiceData, type: 'sale' });
        },

        async createPurchaseInvoice(invoiceData) {
            return this.createInvoice({ ...invoiceData, type: 'purchase' });
        },

        /* ============================================
           PURCHASES — كعرض مُفلتر من invoices
           ============================================ */
        async getPurchases(force = false) {
            const all = await this.getInvoices(force);
            return all.filter(i => i.type === 'purchase' || i.type === 'return_purchase');
        },

        async getPurchasesLight(force = false) {
            const all = await this.getInvoicesLight(force);
            return all.filter(i => i.type === 'purchase' || i.type === 'return_purchase');
        },

        async getPurchaseById(id) {
            return this.getInvoiceById(id);
        },

        /* ============================================
           VOID INVOICE — RPC ذرّي
           ============================================ */
        async voidInvoice(id) {
            const tenantId = requireTenant();
            if (!id) throw new Error('معرّف الفاتورة مطلوب');

            if (navigator.onLine && this.client) {
                try {
                    const { data, error } = await this.client.rpc(
                        'void_invoice_atomic', { p_invoice_id: id }
                    );
                    if (error) throw error;

                    // حدّث محليًا
                    const local = await this.local.get('invoices', id);
                    if (local) {
                        local.status = 'voided';
                        local.updated_at = new Date().toISOString();
                        await this.local.put('invoices', local);
                        await this._reverseLocalEffects(local);
                    }

                    MemCache.clear();
                    return { success: true, id, data };
                } catch (e) {
                    if (isBusinessError(e)) throw e;
                    await SyncQueue.enqueue({ type: 'void_invoice', id, payload: { id } });
                }
            } else {
                await SyncQueue.enqueue({ type: 'void_invoice', id, payload: { id } });
            }

            // محليًا
            const local = await this.local.get('invoices', id);
            if (local) {
                local.status = 'voided';
                local.updated_at = new Date().toISOString();
                await this.local.put('invoices', local);
                await this._reverseLocalEffects(local);
            }
            MemCache.clear();
            return { success: true, id };
        },

        /* ============================================
           Local Effects
           ============================================ */
        async _applyLocalEffects(invoice) {
            const status = invoice.status || 'paid';
            const type = invoice.type;

            if (status !== 'held' && status !== 'voided') {
                let sign = 0;
                if (type === 'sale') sign = -1;
                else if (type === 'purchase') sign = +1;
                else if (type === 'return_sale') sign = +1;
                else if (type === 'return_purchase') sign = -1;

                if (sign !== 0) {
                    for (const item of invoice.items) {
                        const pid = item.productId || item.product_id;
                        const uname = item.unitName || item.unit_name;
                        await this._applyLocalStockDelta(pid, uname,
                            sign * (Number(item.quantity) || 0), invoice.tenant_id);
                    }
                }
            }

            if (invoice.customer_id && ['sale','return_sale'].includes(type)) {
                const cust = await this.local.get('parties', invoice.customer_id);
                if (cust && cust.tenant_id === invoice.tenant_id) {
                    const oldBal = Number(cust.balance) || 0;
                    let delta = 0;
                    if (type === 'sale') {
                        const remaining = Number(invoice.remaining) || 0;
                        const used      = Number(invoice.used_balance) || 0;
                        delta = -remaining - used;
                    } else {
                        delta = Number(invoice.total) || 0;
                    }
                    cust.balance = round3(oldBal + delta);
                    cust.updated_at = new Date().toISOString();
                    await this.local.put('parties', cust);
                }
            }

            if (invoice.supplier_id && ['purchase','return_purchase'].includes(type)) {
                const sup = await this.local.get('parties', invoice.supplier_id);
                if (sup && sup.tenant_id === invoice.tenant_id) {
                    const oldBal = Number(sup.balance) || 0;
                    let delta = 0;
                    if (type === 'purchase') {
                        delta = (Number(invoice.total) || 0) - (Number(invoice.paid) || 0);
                    } else {
                        delta = -(Number(invoice.total) || 0);
                    }
                    sup.balance = round3(oldBal + delta);
                    sup.updated_at = new Date().toISOString();
                    await this.local.put('parties', sup);
                }
            }
        },

        // ✅ عكس تأثيرات الفاتورة (للإلغاء)
        async _reverseLocalEffects(invoice) {
            const type = invoice.type;

            // عكس المخزون
            let sign = 0;
            if (type === 'sale') sign = +1;
            else if (type === 'purchase') sign = -1;
            else if (type === 'return_sale') sign = -1;
            else if (type === 'return_purchase') sign = +1;

            if (sign !== 0 && Array.isArray(invoice.items)) {
                for (const item of invoice.items) {
                    const pid = item.productId || item.product_id;
                    const uname = item.unitName || item.unit_name;
                    await this._applyLocalStockDelta(pid, uname,
                        sign * (Number(item.quantity) || 0), invoice.tenant_id);
                }
            }

            // عكس رصيد العميل
            if (invoice.customer_id && ['sale','return_sale'].includes(type)) {
                const cust = await this.local.get('parties', invoice.customer_id);
                if (cust && cust.tenant_id === invoice.tenant_id) {
                    const oldBal = Number(cust.balance) || 0;
                    let delta = 0;
                    if (type === 'sale') {
                        const remaining = Number(invoice.remaining) || 0;
                        const used      = Number(invoice.used_balance) || 0;
                        delta = +remaining + used;
                    } else {
                        delta = -(Number(invoice.total) || 0);
                    }
                    cust.balance = round3(oldBal + delta);
                    cust.updated_at = new Date().toISOString();
                    await this.local.put('parties', cust);
                }
            }

            // عكس رصيد المورد
            if (invoice.supplier_id && ['purchase','return_purchase'].includes(type)) {
                const sup = await this.local.get('parties', invoice.supplier_id);
                if (sup && sup.tenant_id === invoice.tenant_id) {
                    const oldBal = Number(sup.balance) || 0;
                    let delta = 0;
                    if (type === 'purchase') {
                        delta = -((Number(invoice.total) || 0) - (Number(invoice.paid) || 0));
                    } else {
                        delta = (Number(invoice.total) || 0);
                    }
                    sup.balance = round3(oldBal + delta);
                    sup.updated_at = new Date().toISOString();
                    await this.local.put('parties', sup);
                }
            }
        },

        async _applyLocalStockDelta(productId, unitName, qtyInSoldUnit, tenantId) {
            const product = await this.local.get('products', productId);
            if (!product?.units?.length) return;
            if (tenantId && product.tenant_id && product.tenant_id !== tenantId) return;

            const baseUnit = product.units.find(u => u.isBase) || product.units[0];
            const soldUnit = product.units.find(u => u.name === unitName) || baseUnit;
            const factor = soldUnit === baseUnit ? 1 : (Number(soldUnit.factor) || 1);
            const deltaBase = Number(qtyInSoldUnit) * factor;
            const oldStock = Number(baseUnit.stock) || 0;
            const newStock = oldStock + deltaBase;

            if (newStock < 0) {
                console.warn(`⚠️ مخزون سالب محلي: ${product.name} (${oldStock} → ${newStock})`);
            }

            baseUnit.stock = newStock;
            product.stock_updated_at = new Date().toISOString();
            await this.local.put('products', product);
            MemCache.clear('products');
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
                    const { data, error } = await this.client.from('settings')
                        .select('data').eq('tenant_id', tenantId).maybeSingle();
                    if (!error && data) {
                        await this.local.put('settings', { id: 'app_settings', data: data.data });
                        return data.data;
                    }
                } catch { /* ignore */ }
            }
            return {};
        },

        async saveSettings(data) {
            const tenantId = requireTenant();
            await this.local.put('settings', { id: 'app_settings', data });

            if (navigator.onLine && this.client) {
                try {
                    const { error } = await this.client.from('settings')
                        .upsert({ tenant_id: tenantId, data }, { onConflict: 'tenant_id' });
                    if (error) throw error;
                } catch (e) {
                    if (isBusinessError(e)) throw e;
                    await SyncQueue.enqueue({
                        type: 'save_settings', id: tenantId,
                        payload: { tenant_id: tenantId, data }
                    });
                }
            } else {
                await SyncQueue.enqueue({
                    type: 'save_settings', id: tenantId,
                    payload: { tenant_id: tenantId, data }
                });
            }
            return data;
        },

        /* ============================================
           Invoice Numbers
           ============================================ */
        async generateInvoiceNumber() {
            const deviceId = getDeviceId();

            if (navigator.onLine && this.client) {
                try {
                    const { data, error } = await this.client
                        .rpc('next_invoice_number', { p_device_id: deviceId });
                    if (!error && data) return data;
                } catch (e) {
                    console.warn('Server invoice number failed', e);
                }
            }

            const year = new Date().getFullYear().toString().slice(-2);
            const key = `invoice_counter_${year}_${deviceId}`;
            let current = parseInt(localStorage.getItem(key) || '8999', 10);
            if (!Number.isFinite(current) || current < 8999) current = 8999;
            const next = current + 1;
            localStorage.setItem(key, String(next));

            return `${year}-${deviceId.slice(0, 4).toUpperCase()}-${String(next).padStart(4, '0')}`;
        },

        /* ============================================
           Stock Movements / Sync Status
           ============================================ */
        async getStockMovements(productId = null, limit = 100) {
            if (!navigator.onLine || !this.client) return [];
            try {
                let q = this.client.from('stock_movements').select('*')
                    .order('created_at', { ascending: false }).limit(limit);
                if (productId) q = q.eq('product_id', productId);
                const { data, error } = await q;
                if (error) throw error;
                return data || [];
            } catch { return []; }
        },

        async getPendingSyncCount() { return await SyncQueue.pendingCount(); },

        async getFailedSync() {
            return await this.local.getAll('failed_sync') || [];
        },

        async getFailedSyncCount() {
            return (await this.getFailedSync()).length;
        },

        async clearFailedSync() { return await SyncQueue.clearFailed(); },

        clearCache() { MemCache.clear(); },

        /* ============================================
           Wipe
           ============================================ */
        async wipeLocalData({ includePendingQueue = false } = {}) {
            await this.local.clear('products');
            await this.local.clear('parties');
            await this.local.clear('invoices');
            await this.local.clear('transactions');
            await this.local.clear('settings');
            if (includePendingQueue) {
                await this.local.clear('sync_queue');
                await this.local.clear('failed_sync');
            }
            MemCache.clear();
        }
    };

    window.addEventListener('load', () => {
        window.DB.init().catch(e => console.error('DB init error', e));
    });

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('message', (event) => {
            if (event.data?.type === 'SYNC_NOW' && window.DB?.flushSyncQueue) {
                window.DB.flushSyncQueue().catch(() => {});
            }
        });
    }
})();
