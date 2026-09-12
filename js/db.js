/* =============================================
   db.js - Data Layer (Supabase + IndexedDB)
   Version: 3.1.0 - مع التحصيل والسداد
   ============================================= */
(function() {
    'use strict';
    
    const CFG = window.APP_CONFIG;
    
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
                    const stores = ['products', 'parties', 'invoices', 'settings', 'transactions'];
                    
                    stores.forEach(name => {
                        if (!db.objectStoreNames.contains(name)) {
                            const store = db.createObjectStore(name, { keyPath: 'id' });
                            
                            if (name === 'invoices') {
                                store.createIndex('date', 'date', { unique: false });
                                store.createIndex('type', 'type', { unique: false });
                                store.createIndex('status', 'status', { unique: false });
                                store.createIndex('customer_id', 'customer_id', { unique: false });
                                store.createIndex('supplier_id', 'supplier_id', { unique: false });
                            }
                            
                            if (name === 'products') {
                                store.createIndex('barcode', 'barcode', { unique: false });
                                store.createIndex('category', 'category', { unique: false });
                            }
                            
                            if (name === 'parties') {
                                store.createIndex('type', 'type', { unique: false });
                                store.createIndex('phone', 'phone', { unique: false });
                            }
                            
                            if (name === 'transactions') {
                                store.createIndex('party_id', 'party_id', { unique: false });
                                store.createIndex('date', 'date', { unique: false });
                                store.createIndex('type', 'type', { unique: false });
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
                
                req.onerror = () => {
                    console.warn('⚠️ IndexedDB failed');
                    resolve(this);
                };
            });
        }
        
        async _ready() {
            if (!this.ready) await this.initPromise;
        }
        
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
        
        async put(store, data) {
            await this._ready();
            if (!this.db) return data;
            return new Promise((resolve) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).put(data);
                tx.oncomplete = () => resolve(data);
                tx.onerror = () => resolve(data);
            });
        }
        
        async putMany(store, items) {
            await this._ready();
            if (!this.db || !items?.length) return items;
            return new Promise((resolve) => {
                const tx = this.db.transaction(store, 'readwrite');
                const s = tx.objectStore(store);
                items.forEach(item => s.put(item));
                tx.oncomplete = () => resolve(items);
                tx.onerror = () => resolve(items);
            });
        }
        
        async delete(store, id) {
            await this._ready();
            if (!this.db) return;
            return new Promise((resolve) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).delete(id);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            });
        }
        
        async clear(store) {
            await this._ready();
            if (!this.db) return;
            return new Promise((resolve) => {
                const tx = this.db.transaction(store, 'readwrite');
                tx.objectStore(store).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
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
            supabaseClient = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
                auth: {
                    storage: localStorage,
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
            console.log('✅ Supabase client initialized');
            return supabaseClient;
        } catch (e) {
            console.error('❌ Supabase init failed', e);
            return null;
        }
    }
    
    /* ============================================
       Memory Cache
       ============================================ */
    const MemCache = {
        products: [],
        parties: [],
        invoices: [],
        transactions: [],
        _time: {},
        set(key, data) {
            this[key] = data;
            this._time[key] = Date.now();
        },
        get(key, maxAge = 60000) {
            if (!this._time[key]) return null;
            if (Date.now() - this._time[key] > maxAge) return null;
            return this[key];
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
       DB API
       ============================================ */
    window.DB = {
        local: null,
        client: null,
        
        async init() {
            this.local = new LocalDB();
            await this.local.initPromise;
            this.client = initSupabase();
            console.log('✅ DB initialized');
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
                    units: (p.product_units || []).map(u => ({
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
                tenant_id: window.Auth?.user?.tenant_id || null,
                name: product.name,
                code: product.code || null,
                barcode: product.barcode || null,
                category: product.category || null,
                description: product.description || null,
                is_active: true,
                updated_at: now
            };
            
            // Save locally
            await this.local.put('products', { ...payload, units: product.units || [] });
            
            // Sync to cloud
            if (navigator.onLine && this.client) {
                const { error } = await this.client
                    .from('products')
                    .upsert(payload, { onConflict: 'id' });
                
                if (error) throw error;
                
                // Save units
                if (product.units?.length) {
                    const unitsPayload = product.units.map(u => ({
                        id: u.id || U.uuid(),
                        product_id: id,
                        unit_name: u.name,
                        barcode: u.barcode || null,
                        price: u.price || 0,
                        cost: u.cost || 0,
                        factor: u.factor || 1,
                        stock: u.stock || 0,
                        min_price: u.minPrice || 0,
                        max_price: u.maxPrice || 0,
                        is_base: u.isBase || false
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
           PARTIES (Customers + Suppliers)
           ============================================ */
        async getParties(type = null, force = false) {
            if (!force) {
                const cached = MemCache.get('parties');
                if (cached?.length) {
                    return type ? cached.filter(p => p.type === type || p.type === 'both') : cached;
                }
            }
            
            if (!navigator.onLine || !this.client) {
                const local = await this.local.getAll('parties');
                const filtered = type ? local.filter(p => p.type === type || p.type === 'both') : local;
                MemCache.set('parties', local);
                return filtered;
            }
            
            try {
                let query = this.client
                    .from('parties')
                    .select('*')
                    .is('deleted_at', null)
                    .order('name');
                
                if (type) query = query.or(`type.eq.${type},type.eq.both`);
                
                const { data, error } = await query;
                if (error) throw error;
                
                await this.local.putMany('parties', data || []);
                MemCache.set('parties', data || []);
                return data || [];
            } catch (e) {
                console.warn('Cloud parties fetch failed', e);
                const local = await this.local.getAll('parties');
                return type ? local.filter(p => p.type === type || p.type === 'both') : local;
            }
        },
        
        async saveParty(party) {
            const id = party.id || U.uuid();
            const now = new Date().toISOString();
            
            const payload = {
                id,
                tenant_id: party.tenant_id || window.Auth?.user?.tenant_id || null,
                name: party.name,
                type: party.type || 'customer',
                phone: party.phone || null,
                email: party.email || null,
                address: party.address || null,
                balance: party.balance || 0,
                credit_limit: party.credit_limit || 0,
                notes: party.notes || null,
                is_active: true,
                updated_at: now
            };
            
            await this.local.put('parties', payload);
            
            if (navigator.onLine && this.client) {
                const { error } = await this.client
                    .from('parties')
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
                party.balance = newBalance;
                party.updated_at = new Date().toISOString();
                await this.local.put('parties', party);
            }
            
            if (navigator.onLine && this.client) {
                await this.client.from('parties')
                    .update({ balance: newBalance })
                    .eq('id', partyId);
            }
            
            MemCache.clear('parties');
        },
        
        /* ============================================
           PAYMENTS / COLLECTIONS (تحصيل وسداد)
           ============================================ */
        async addPayment(payment) {
            const client = getClient();
            const id = U.uuid();
            const now = new Date().toISOString();

            const payload = {
                id,
                tenant_id: window.Auth?.user?.tenant_id || null,
                type: payment.type, // 'payment_in' (تحصيل من عميل) أو 'payment_out' (سداد لمورد)
                amount: Math.abs(Number(payment.amount) || 0),
                party_id: payment.party_id,
                payment_method: payment.payment_method || 'cash',
                reference: payment.reference || null,
                notes: payment.notes || null,
                date: payment.date || U.today(),
                created_by: window.Auth?.user?.id || null,
                created_at: now
            };

            // حفظ محلي
            await this.local.put('transactions', payload);

            // حفظ في السحابة
            if (navigator.onLine && client) {
                const { error } = await client.from('transactions').insert(payload);
                if (error) {
                    console.warn('Cloud payment save failed:', error);
                    throw error;
                }
            }

            // تحديث رصيد الطرف
            const party = await this.local.get('parties', payment.party_id);
            if (party) {
                const currentBalance = Number(party.balance) || 0;
                // payment_in: العميل يدفع لنا → رصيده يزيد (يقل دينه)
                // payment_out: نحن ندفع للمورد → رصيده يقل (يقل دينه علينا)
                const newBalance = currentBalance + (payment.type === 'payment_in' ? payload.amount : -payload.amount);
                
                party.balance = U.round(newBalance);
                party.updated_at = now;
                
                await this.local.put('parties', party);

                if (navigator.onLine && client) {
                    await client.from('parties').update({ balance: party.balance }).eq('id', party.id);
                }
            }

            // إبطال الكاش
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
                return partyId ? local.filter(t => t.party_id === partyId) : local;
            }
            
            try {
                let query = this.client
                    .from('transactions')
                    .select('*')
                    .order('date', { ascending: false });
                
                if (partyId) query = query.eq('party_id', partyId);
                
                const { data, error } = await query;
                if (error) throw error;
                
                await this.local.putMany('transactions', data || []);
                return data || [];
            } catch (e) {
                console.warn('Cloud payments fetch failed', e);
                const local = await this.local.getAll('transactions');
                return partyId ? local.filter(t => t.party_id === partyId) : local;
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
                local.sort((a, b) => new Date(b.created_at || b.date) - new Date(a.created_at || a.date));
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
                return await this.local.getAll('invoices');
            }
        },
        
        async getInvoiceById(id) {
            if (navigator.onLine && this.client) {
                try {
                    const { data, error } = await this.client
                        .from('invoices')
                        .select('*')
                        .eq('id', id)
                        .maybeSingle();
                    if (!error && data) return data;
                } catch {}
            }
            return await this.local.get('invoices', id);
        },
        
        async createInvoice(invoice) {
            // Validation
            if (!invoice.items?.length) {
                throw new Error('لا توجد أصناف في الفاتورة');
            }
            
            // التحقق من العميل
            if (invoice.customer_id && navigator.onLine && this.client) {
                const { data: exists } = await this.client
                    .from('parties')
                    .select('id')
                    .eq('id', invoice.customer_id)
                    .maybeSingle();
                
                if (!exists) {
                    const localCustomer = await this.local.get('parties', invoice.customer_id);
                    if (localCustomer) {
                        const { error: syncErr } = await this.client
                            .from('parties')
                            .upsert(localCustomer, { onConflict: 'id' });
                        if (syncErr) {
                            invoice.customer_id = null;
                            invoice.customer_name = 'نقدي';
                        }
                    } else {
                        invoice.customer_id = null;
                        invoice.customer_name = 'نقدي';
                    }
                }
            }
            
            const id = invoice.id || U.uuid();
            const now = new Date().toISOString();
            
            const payload = {
                id,
                tenant_id: window.Auth?.user?.tenant_id || null,
                invoice_number: invoice.invoice_number,
                type: invoice.type || 'sale',
                date: invoice.date || U.today(),
                customer_id: invoice.customer_id || null,
                customer_name: invoice.customer_name || 'نقدي',
                supplier_id: invoice.supplier_id || null,
                supplier_name: invoice.supplier_name || null,
                items: invoice.items || [],
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
                updated_at: now
            };
            
            // Save locally first
            await this.local.put('invoices', payload);
            
            // Sync to cloud
            if (navigator.onLine && this.client) {
                const { error } = await this.client
                    .from('invoices')
                    .insert(payload);
                
                if (error) {
                    console.error('Cloud save failed', error);
                    throw error;
                }
            }
            
            // Update customer balance
            if (payload.customer_id && payload.remaining > 0) {
                const localCust = await this.local.get('parties', payload.customer_id);
                if (localCust) {
                    const newBalance = (localCust.balance || 0) - payload.remaining;
                    await this.updatePartyBalance(payload.customer_id, newBalance);
                }
            }
            
            MemCache.clear('invoices');
            return { success: true, id, invoice_number: payload.invoice_number };
        },
        
        /* ============================================
           SETTINGS
           ============================================ */
        async getSettings() {
            const local = await this.local.get('settings', 'app_settings');
            if (local) return local.data || {};
            
            if (navigator.onLine && this.client) {
                const tenantId = window.Auth?.user?.tenant_id;
                if (!tenantId) return {};
                
                try {
                    const { data, error } = await this.client
                        .from('settings')
                        .select('data')
                        .eq('tenant_id', tenantId)
                        .maybeSingle();
                    
                    if (!error && data) {
                        await this.local.put('settings', { id: 'app_settings', data: data.data });
                        return data.data;
                    }
                } catch {}
            }
            
            return {};
        },
        
        async saveSettings(data) {
            const tenantId = window.Auth?.user?.tenant_id;
            if (!tenantId) throw new Error('No tenant');
            
            await this.local.put('settings', { id: 'app_settings', data });
            
            if (navigator.onLine && this.client) {
                const { error } = await this.client
                    .from('settings')
                    .upsert({ tenant_id: tenantId, data }, { onConflict: 'tenant_id' });
                if (error) throw error;
            }
            
            return data;
        },
        
        /* ============================================
           INVOICE NUMBER
           ============================================ */
        async generateInvoiceNumber() {
            if (navigator.onLine && this.client) {
                try {
                    const year = new Date().getFullYear().toString().slice(-2);
                    const { data, error } = await this.client.rpc('next_sequence', {
                        p_name: 'inv_' + year
                    });
                    if (error) throw error;
                    return data;
                } catch (e) {
                    console.warn('Server number generation failed, using local', e);
                }
            }
            
            // Local fallback
            const year = new Date().getFullYear().toString().slice(-2);
            const key = 'hesaby_counter_' + year;
            const current = parseInt(localStorage.getItem(key) || '0', 10);
            const next = current + 1;
            localStorage.setItem(key, String(next));
            return year + '-' + String(next).padStart(4, '0');
        },
        
        /* ============================================
           MISC
           ============================================ */
        clearCache() {
            MemCache.clear();
        }
    };
    
    // Helper
    function getClient() {
        return window.DB?.client || supabaseClient;
    }
    
    // Auto-init on load
    window.addEventListener('load', () => {
        window.DB.init().catch(e => console.error('DB init error', e));
    });
    
    console.log('✅ db.js loaded');
})();
