/* =============================================
   db.js - Data Layer (Supabase + IndexedDB)
   Version: 3.2.0 - Stock Deduction + Balance Fix
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
    
    function getClient() { return window.DB?.client || supabaseClient; }
    
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
            
            await this.local.put('products', { ...payload, units: product.units || [] });
            
            if (navigator.onLine && this.client) {
                const { error } = await this.client.from('products').upsert(payload, { onConflict: 'id' });
                if (error) throw error;
                
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
                await this.client.from('products').update({ deleted_at: new Date().toISOString() }).eq('id', id);
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
                let query = this.client.from('parties').select('*').is('deleted_at', null).order('name');
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
                const { error } = await this.client.from('parties').upsert(payload, { onConflict: 'id' });
                if (error) throw error;
            }
            
            MemCache.clear('parties');
            return { success: true, id };
        },
        
        async deleteParty(id) {
            await this.local.delete('parties', id);
            if (navigator.onLine && this.client) {
                await this.client.from('parties').update({ deleted_at: new Date().toISOString() }).eq('id', id);
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
                await this.client.from('parties').update({ balance: U.round(newBalance) }).eq('id', partyId);
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
                tenant_id: window.Auth?.user?.tenant_id || null,
                type: payment.type,
                amount: Math.abs(Number(payment.amount) || 0),
                party_id: payment.party_id,
                payment_method: payment.payment_method || 'cash',
                reference: payment.reference || null,
                notes: payment.notes || null,
                date: payment.date || U.today(),
                created_by: window.Auth?.user?.id || null,
                created_at: now
            };

            await this.local.put('transactions', payload);

            if (navigator.onLine && client) {
                const { error } = await client.from('transactions').insert(payload);
                if (error) throw error;
            }

            const party = await this.local.get('parties', payment.party_id);
            if (party) {
                const currentBalance = Number(party.balance) || 0;
                const newBalance = currentBalance + (payment.type === 'payment_in' ? payload.amount : -payload.amount);
                party.balance = U.round(newBalance);
                party.updated_at = now;
                await this.local.put('parties', party);
                
                if (navigator.onLine && client) {
                    await client.from('parties').update({ balance: party.balance }).eq('id', party.id);
                }
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
                return partyId ? local.filter(t => t.party_id === partyId) : local;
            }
            
            try {
                let query = this.client.from('transactions').select('*').order('date', { ascending: false });
                if (partyId) query = query.eq('party_id', partyId);
                
                const { data, error } = await query;
                if (error) throw error;
                
                await this.local.putMany('transactions', data || []);
                return data || [];
            } catch (e) {
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
                    const { data, error } = await this.client.from('invoices').select('*').eq('id', id).maybeSingle();
                    if (!error && data) return data;
                } catch {}
            }
            return await this.local.get('invoices', id);
        },
        
        /* ============================================
           ✅ إنشاء فاتورة (مع خصم المخزون + تحديث رصيد العميل)
           ============================================ */
        async createInvoice(invoice) {
            if (!invoice.items?.length) {
                throw new Error('لا توجد أصناف في الفاتورة');
            }
            
            // التحقق من وجود العميل في السحابة
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
            
            // 1. حفظ الفاتورة محلياً
            await this.local.put('invoices', payload);
            
            // 2. حفظ في السحابة
            if (navigator.onLine && this.client) {
                const { error } = await this.client.from('invoices').insert(payload);
                if (error) {
                    console.error('Cloud save failed', error);
                    throw error;
                }
            }
            
            // 3. ✅ خصم المخزون (فاتورة بيع فقط)
            if (payload.type === 'sale' && payload.status !== 'held') {
                await this._deductStockFromItems(payload.items);
            }
            
            // 4. ✅ إرجاع المخزون (فاتورة مرتجع شراء أو مرتجع بيع عكسي)
            if (payload.type === 'return_purchase') {
                await this._deductStockFromItems(payload.items);
            }
            if (payload.type === 'return_sale') {
                await this._addStockToItems(payload.items);
            }
            
            // 5. ✅ تحديث رصيد العميل
            if (payload.customer_id) {
                await this._updateCustomerBalance(payload);
            }
            
            // 6. ✅ تحديث رصيد المورد
            if (payload.supplier_id) {
                await this._updateSupplierBalance(payload);
            }
            
            MemCache.clear('invoices');
            MemCache.clear('products');
            MemCache.clear('parties');
            
            return { success: true, id, invoice_number: payload.invoice_number };
        },
        
        /* ============================================
           Helper: خصم المخزون
           ============================================ */
        async _deductStockFromItems(items) {
            const client = getClient();
            const updates = []; // {product_id, unit_name, new_stock}
            
            for (const item of items) {
                const product = await this.local.get('products', item.productId);
                if (!product?.units?.length) continue;
                
                const baseUnit = product.units[0];
                const selectedUnit = product.units.find(u => u.name === item.unitName) || baseUnit;
                const factor = selectedUnit.factor || 1;
                
                // حساب الكمية بالوحدة الأساسية
                const deductQty = (item.unitName === baseUnit.name)
                    ? item.quantity
                    : item.quantity * factor;
                
                // تحديث المخزون الأساسي
                const oldStock = Number(baseUnit.stock) || 0;
                baseUnit.stock = Math.max(0, oldStock - deductQty);
                
                // حفظ محلياً
                await this.local.put('products', product);
                
                // تسجيل للتحديث السحابي
                updates.push({
                    id: baseUnit.id,
                    product_id: product.id,
                    unit_name: baseUnit.name,
                    stock: baseUnit.stock
                });
            }
            
            // تحديث السحابة
            if (navigator.onLine && client && updates.length) {
                for (const u of updates) {
                    try {
                        // نستخدم update مباشر بدلاً من upsert لتجنب فقدان بيانات
                        await client
                            .from('product_units')
                            .update({ stock: u.stock })
                            .eq('product_id', u.product_id)
                            .eq('unit_name', u.unit_name);
                    } catch (e) {
                        console.warn('Failed to update stock for', u.product_id, e);
                    }
                }
            }
            
            MemCache.clear('products');
        },
        
        /* ============================================
           Helper: إرجاع المخزون
           ============================================ */
        async _addStockToItems(items) {
            const client = getClient();
            const updates = [];
            
            for (const item of items) {
                const product = await this.local.get('products', item.productId);
                if (!product?.units?.length) continue;
                
                const baseUnit = product.units[0];
                const selectedUnit = product.units.find(u => u.name === item.unitName) || baseUnit;
                const factor = selectedUnit.factor || 1;
                
                const addQty = (item.unitName === baseUnit.name)
                    ? item.quantity
                    : item.quantity * factor;
                
                baseUnit.stock = (Number(baseUnit.stock) || 0) + addQty;
                
                await this.local.put('products', product);
                
                updates.push({
                    product_id: product.id,
                    unit_name: baseUnit.name,
                    stock: baseUnit.stock
                });
            }
            
            if (navigator.onLine && client && updates.length) {
                for (const u of updates) {
                    try {
                        await client
                            .from('product_units')
                            .update({ stock: u.stock })
                            .eq('product_id', u.product_id)
                            .eq('unit_name', u.unit_name);
                    } catch (e) {
                        console.warn('Failed to return stock', e);
                    }
                }
            }
            
            MemCache.clear('products');
        },
        
        /* ============================================
           Helper: تحديث رصيد العميل بشكل صحيح
           
           المنطق:
           - Balance موجب = العميل دائن (له رصيد عندنا)
           - Balance سالب = العميل مدين (علينا من العميل)
           
           عند الفاتورة:
           - remaining > 0 (دين جديد) → ينقص الرصيد (يصبح أكثر سالباً)
           - change_amount > 0 (فائض) → يزيد الرصيد (يصبح أكثر موجباً)
           - used_balance > 0 (استخدام رصيد سابق) → ينقص الرصيد
           ============================================ */
        async _updateCustomerBalance(invoice) {
            const cust = await this.local.get('parties', invoice.customer_id);
            if (!cust) return;
            
            const oldBalance = Number(cust.balance) || 0;
            const remaining = Number(invoice.remaining) || 0;
            const changeAmount = Number(invoice.change_amount) || 0;
            const usedBalance = Number(invoice.used_balance) || 0;
            
            // ✅ حساب صافي التغيير:
            // الفائض يُضاف للرصيد (له أكثر)
            // المتبقي يُخصم من الرصيد (عليه أكثر)
            // استخدام رصيد يُخصم من الرصيد (له أقل)
            const balanceDelta = changeAmount - remaining - usedBalance;
            
            const newBalance = U.round(oldBalance + balanceDelta);
            
            await this.updatePartyBalance(invoice.customer_id, newBalance);
            
            console.log(`💰 Customer Balance Update:
                Old: ${oldBalance}
                Change: ${balanceDelta} (فائض:${changeAmount} - متبقي:${remaining} - مستخدم:${usedBalance})
                New: ${newBalance}`);
        },
        
        /* ============================================
           Helper: تحديث رصيد المورد
           ============================================ */
        async _updateSupplierBalance(invoice) {
            const sup = await this.local.get('parties', invoice.supplier_id);
            if (!sup) return;
            
            const oldBalance = Number(sup.balance) || 0;
            const total = Number(invoice.total) || 0;
            const paid = Number(invoice.paid) || 0;
            
            // عند الشراء: نحن مدينون للمورد
            // remaining يُخصم من رصيده (نحن نستحق له أكثر)
            const newBalance = U.round(oldBalance - (total - paid));
            
            await this.updatePartyBalance(invoice.supplier_id, newBalance);
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
                        .from('settings').select('data').eq('tenant_id', tenantId).maybeSingle();
                    
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
            
            const year = new Date().getFullYear().toString().slice(-2);
            const key = 'hesaby_counter_' + year;
            const current = parseInt(localStorage.getItem(key) || '0', 10);
            const next = current + 1;
            localStorage.setItem(key, String(next));
            return year + '-' + String(next).padStart(4, '0');
        },
        
        clearCache() {
            MemCache.clear();
        }
    };
    
    window.addEventListener('load', () => {
        window.DB.init().catch(e => console.error('DB init error', e));
    });
    
    console.log('✅ db.js loaded (v3.2.0 - stock + balance fix)');
})();
