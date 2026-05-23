/* =============================================
   supabase.js - النواة المُوحَّدة (SaaS Multi-Tenant)
   الإصدار 3.2 - إنتاجي كامل، مقاوم للأخطاء، مع وضع الطوارئ والمزامنة
   ============================================= */
(function() {
    'use strict';

    // ==================== الضبط ====================
    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    // ضمان وجود كائنات عالمية حتى لو فشل كل شيء
    window.App = window.App || {};
    window.DB = window.DB || {};

    let supabaseClient = null;
    let initialized = false;
    let initError = null;

    // ==================== التخزين المؤقت للجلسة ====================
    const SessionStore = {
        _user: null,
        _tenantId: null,
        _settings: null,
        _cache: new Map(),

        set user(val) {
            this._user = val;
            this._tenantId = val?.tenant_id || null;
            if (val) {
                const session = {
                    id: val.id,
                    email: val.email,
                    fullName: val.fullName,
                    role: val.role,
                    tenant_id: val.tenant_id,
                    loginTime: new Date().toLocaleString('ar-EG')
                };
                localStorage.setItem('app_session', JSON.stringify(session));
            } else {
                localStorage.removeItem('app_session');
                this._cache.clear();
                this._settings = null;
            }
        },
        get user() { return this._user; },
        get tenantId() { return this._tenantId; },
        invalidate(key) {
            if (key) this._cache.delete(key);
            else this._cache.clear();
        }
    };

    // ==================== مساعد IndexedDB ====================
    function getLocalDB() {
        return (window.localDB && window.localDB.ready) ? window.localDB : null;
    }

    // ==================== طبقة Offline ====================
    const OfflineLayer = {
        async get(storeName, cloudFetcher, forceRefresh = false) {
            const local = getLocalDB();
            const cacheKey = `offline_${storeName}`;

            if (!forceRefresh && SessionStore._cache.has(cacheKey)) {
                console.log(`⚡ ${storeName}: من الذاكرة المؤقتة`);
                return SessionStore._cache.get(cacheKey);
            }

            if (local && !forceRefresh) {
                try {
                    const localData = await local.getAll(storeName);
                    if (localData && localData.length > 0) {
                        console.log(`📦 ${storeName}: ${localData.length} عنصر من IndexedDB`);
                        SessionStore._cache.set(cacheKey, localData);
                        if (navigator.onLine && supabaseClient && cloudFetcher) {
                            this._backgroundSync(storeName, cloudFetcher, local).catch(() => {});
                        }
                        return localData;
                    }
                } catch (e) {
                    console.warn(`خطأ في قراءة ${storeName} من IndexedDB:`, e);
                }
            }

            if (navigator.onLine && supabaseClient && cloudFetcher) {
                try {
                    const data = await cloudFetcher();
                    if (data && Array.isArray(data)) {
                        SessionStore._cache.set(cacheKey, data);
                        if (local) await this._bulkPut(local, storeName, data);
                    }
                    return data;
                } catch (error) {
                    console.warn(`فشل جلب ${storeName} من السحابة:`, error);
                    return local ? await local.getAll(storeName) : [];
                }
            }
            return local ? await local.getAll(storeName) : [];
        },

        async save(storeName, data, cloudSaver) {
            const local = getLocalDB();
            data._updated_at = Date.now();

            if (local) {
                await local.put(storeName, data).catch(e =>
                    console.warn(`فشل حفظ ${storeName} محلياً:`, e)
                );
            }

            SessionStore._cache.delete(`offline_${storeName}`);

            if (navigator.onLine && supabaseClient && cloudSaver) {
                try {
                    const result = await cloudSaver(data);
                    if (local && local.removeFromSyncQueue) {
                        await local.removeFromSyncQueue(data.id).catch(() => {});
                    }
                    return result;
                } catch (error) {
                    console.warn(`فشل حفظ ${storeName} في السحابة:`, error);
                    await this._queueForSync(storeName, data);
                    return data;
                }
            } else {
                await this._queueForSync(storeName, data);
                return data;
            }
        },

        async _backgroundSync(storeName, cloudFetcher, local) {
            try {
                const cloudData = await cloudFetcher();
                if (cloudData && cloudData.length > 0) {
                    await this._bulkPut(local, storeName, cloudData);
                    SessionStore._cache.set(`offline_${storeName}`, cloudData);
                }
            } catch (e) { /* صامت */ }
        },

        async _bulkPut(local, storeName, items) {
            await local.clear(storeName);
            const BATCH = 50;
            for (let i = 0; i < items.length; i += BATCH) {
                const batch = items.slice(i, i + BATCH);
                await Promise.all(batch.map(item =>
                    local.put(storeName, item).catch(e =>
                        console.warn(`فشل تخزين ${storeName}:`, e)
                    )
                ));
            }
        },

        async _queueForSync(table, data) {
            const local = getLocalDB();
            if (local && local.addToSyncQueue) {
                await local.addToSyncQueue({
                    type: data.id ? 'UPDATE' : 'INSERT',
                    table,
                    data
                }).catch(e => console.warn('فشل إضافة إلى طابور المزامنة:', e));
            }
        }
    };

    // ==================== محرك المزامنة ====================
    const SyncEngine = {
        _processing: false,
        async process() {
            if (this._processing) return;
            const local = getLocalDB();
            if (!local || !local.getSyncQueue) return;
            if (!navigator.onLine) return;

            this._processing = true;
            try {
                const queue = await local.getSyncQueue().catch(() => []);
                if (!queue.length) return;

                console.log(`🔄 معالجة ${queue.length} عملية مؤجلة...`);
                const CONCURRENT = 5;
                for (let i = 0; i < queue.length; i += CONCURRENT) {
                    const batch = queue.slice(i, i + CONCURRENT);
                    await Promise.allSettled(batch.map(item => this._processItem(item)));
                }
                console.log('✅ انتهت معالجة الطابور');
            } finally {
                this._processing = false;
            }
        },

        async _processItem(item) {
            try {
                const handler = {
                    products: window.DB.saveProduct,
                    parties: window.DB.saveParty,
                    reps: window.DB.saveRep,
                    invoices: window.DB.saveInvoice,
                    purchases: window.DB.savePurchase,
                    transactions: window.DB.saveTransaction,
                    returns: window.DB.saveReturn,
                    journal_entries: window.DB.saveJournalEntry
                }[item.table];
                if (handler) {
                    await handler(item.data);
                } else {
                    console.warn('عملية غير معروفة في الطابور:', item);
                }
            } catch (e) {
                console.warn('فشل مزامنة عنصر:', e);
            }
        }
    };

    // ==================== التهيئة الفعلية ====================
    function tryInitSupabase() {
        if (typeof supabase === 'undefined') {
            console.warn('⚠️ Supabase library not loaded yet.');
            return false;
        }
        try {
            supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    storage: localStorage,
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                },
                realtime: {
                    params: { eventsPerSecond: 10 }
                },
                global: {
                    headers: { 'X-Client-Info': 'supplier-portal/3.2' }
                }
            });
            window.supabase = supabaseClient;
            console.log('✅ Supabase client initialized');
            return true;
        } catch (e) {
            console.error('❌ Failed to initialize Supabase:', e);
            initError = e;
            return false;
        }
    }

    // ==================== إعداد التطبيق الكامل ====================
    function setupFullApp() {
        if (initialized) return;
        initialized = true;

        // تعريف دوال App الأساسية
        window.App = {
            async getCurrentUser() {
                if (SessionStore.user) {
                    this._refreshSession().catch(() => {});
                    return SessionStore.user;
                }
                if (!supabaseClient) return null;

                try {
                    const { data: { session } } = await supabaseClient.auth.getSession();
                    if (!session) {
                        SessionStore.user = null;
                        return null;
                    }

                    const { data: profile, error } = await supabaseClient
                        .from('profiles')
                        .select('*, tenants!inner(plan)')
                        .eq('id', session.user.id)
                        .single();

                    if (error || !profile) {
                        SessionStore.user = null;
                        return null;
                    }

                    const user = {
                        id: session.user.id,
                        email: session.user.email,
                        fullName: profile.full_name,
                        role: profile.role,
                        tenant_id: profile.tenant_id,
                        plan: profile.tenants?.plan
                    };
                    SessionStore.user = user;
                    return user;
                } catch (error) {
                    console.error('❌ فشل جلب المستخدم:', error);
                    SessionStore.user = null;
                    return null;
                }
            },

            async _refreshSession() {
                if (!supabaseClient) return;
                const { data: { session } } = await supabaseClient.auth.getSession();
                if (!session || !session.user || SessionStore.user?.id !== session.user.id) {
                    SessionStore.user = null;
                }
            },

            async getTenantId() {
                if (SessionStore.tenantId) return SessionStore.tenantId;
                await this.getCurrentUser();
                return SessionStore.tenantId;
            },

            async login(email, password) {
                if (!supabaseClient) throw new Error('الخادم غير متاح حالياً');
                const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (authError) throw authError;

                const userId = authData.user.id;
                let { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (!profile) {
                    const { data: newProfile, error: insertError } = await supabaseClient
                        .from('profiles')
                        .insert({ id: userId, full_name: email, role: 'admin' })
                        .select()
                        .single();
                    if (insertError) throw insertError;
                    profile = newProfile;
                }

                if (profile.role !== 'super_admin' && !profile.tenant_id) {
                    const tenantName = `متجر ${profile.full_name || email}`;
                    const { data: newTenantId, error: tenantError } = await supabaseClient.rpc('create_my_tenant', { p_tenant_name: tenantName });
                    if (tenantError) throw new Error('فشل إنشاء المتجر');
                    profile.tenant_id = newTenantId;
                }

                const userInfo = {
                    id: userId,
                    email: authData.user.email,
                    fullName: profile.full_name || email,
                    role: profile.role,
                    tenant_id: profile.tenant_id,
                    plan: undefined
                };
                SessionStore.user = userInfo;

                let redirectUrl = './dashboard.html';
                if (userInfo.role === 'rep') redirectUrl = './pos.html';
                else if (userInfo.role === 'super_admin') redirectUrl = './admin.html';

                return { success: true, redirectUrl, user: userInfo };
            },

            async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') {
                if (!supabaseClient) throw new Error('الخادم غير متاح حالياً');
                const { data: authData, error: signUpError } = await supabaseClient.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: fullName, phone: phone } }
                });
                if (signUpError) throw signUpError;
                if (!authData.user) throw new Error('فشل إنشاء المستخدم');

                const tenantNameFinal = tenantName || `متجر ${fullName}`;
                const { data: tenantId, error: tenantError } = await supabaseClient.rpc('create_my_tenant', { p_tenant_name: tenantNameFinal });
                if (tenantError) throw tenantError;

                await supabaseClient.from('profiles').upsert({
                    id: authData.user.id,
                    full_name: fullName,
                    role: role,
                    phone: phone,
                    tenant_id: tenantId
                }, { onConflict: 'id' });

                await supabaseClient.auth.signInWithPassword({ email, password });
                return { success: true, message: 'تم إنشاء الحساب بنجاح.' };
            },

            async logout() {
                if (supabaseClient) await supabaseClient.auth.signOut();
                SessionStore.user = null;
                window.location.href = './index.html';
            },

            async requireAuth() {
                if (SessionStore.user) {
                    this.getCurrentUser().then(user => {
                        if (!user) this._redirectToLogin();
                        else if (user.role !== 'super_admin' && user.tenant_id) {
                            this.checkTenantStatus(user.tenant_id).catch(() => {});
                        }
                    }).catch(() => {});
                    return true;
                }

                try {
                    const user = await this.getCurrentUser();
                    if (!user) {
                        this._redirectToLogin();
                        return false;
                    }
                    if (user.role !== 'super_admin' && user.tenant_id) {
                        await this.checkTenantStatus(user.tenant_id);
                    }
                    return true;
                } catch (error) {
                    console.error('فشل التحقق من الجلسة:', error);
                    this._redirectToLogin();
                    return false;
                }
            },

            _redirectToLogin() {
                if (window.location.pathname.indexOf('index.html') === -1) {
                    window.location.href = './index.html';
                }
            },

            async checkTenantStatus(tenantId) {
                if (!supabaseClient) return;
                try {
                    const { data: tenant } = await supabaseClient
                        .from('tenants')
                        .select('plan')
                        .eq('id', tenantId)
                        .single();
                    if (tenant && tenant.plan === 'expired') {
                        window.location.href = './expired.html';
                    }
                } catch (e) {
                    console.warn('فشل التحقق من حالة المتجر:', e);
                }
            },

            async requireRole(allowedRoles) {
                let user = SessionStore.user || await this.getCurrentUser();
                if (!user) {
                    this._redirectToLogin();
                    return false;
                }
                const userRole = (user.role || '').toLowerCase();
                const allowed = allowedRoles.map(r => r.toLowerCase());
                if (!allowed.includes(userRole)) {
                    alert('غير مسموح لك بالوصول إلى هذه الصفحة');
                    if (userRole === 'admin') window.location.href = './dashboard.html';
                    else if (userRole === 'rep') window.location.href = './pos.html';
                    else window.location.href = './index.html';
                    return false;
                }
                return true;
            },

            initUserInterface() {
                const session = JSON.parse(localStorage.getItem('app_session') || '{}');
                if (session && session.fullName) {
                    const nameEl = document.getElementById('userName');
                    const avatarEl = document.getElementById('userAvatar');
                    const timeEl = document.getElementById('loginTime');
                    if (nameEl) nameEl.textContent = session.fullName || session.email;
                    if (avatarEl) avatarEl.textContent = (session.fullName || 'U').charAt(0).toUpperCase();
                    if (timeEl) timeEl.textContent = session.loginTime || 'اليوم';
                }
            }
        };

        // تعريف دوال DB الكاملة
        window.DB = {
            async getProducts(forceRefresh) {
                return OfflineLayer.get('products', async () => {
                    const { data, error } = await supabaseClient
                        .from('products')
                        .select('*, product_units(*)')
                        .order('name');
                    if (error) throw error;
                    return data;
                }, forceRefresh);
            },
            saveProduct: p => OfflineLayer.save('products', { ...p, id: p.id || crypto.randomUUID() }, async (product) => {
                const { data, error } = await supabaseClient
                    .from('products')
                    .upsert(product, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }),
            async deleteProduct(id) {
                const local = getLocalDB();
                if (local) await local.delete('products', id).catch(() => {});
                SessionStore.invalidate('offline_products');
                if (navigator.onLine && supabaseClient) {
                    const { error } = await supabaseClient.from('products').delete().eq('id', id);
                    if (error) throw error;
                }
            },

            async getParties(type) {
                return OfflineLayer.get('parties', async () => {
                    let q = supabaseClient.from('parties').select('*').order('name');
                    if (type) q = q.eq('type', type);
                    const { data, error } = await q;
                    if (error) throw error;
                    return data;
                });
            },
            saveParty: p => OfflineLayer.save('parties', { ...p, id: p.id || crypto.randomUUID() }, async (party) => {
                const { data, error } = await supabaseClient
                    .from('parties')
                    .upsert(party, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }),
            async deleteParty(id) {
                const local = getLocalDB();
                if (local) await local.delete('parties', id).catch(() => {});
                if (navigator.onLine && supabaseClient) {
                    const { error } = await supabaseClient.from('parties').delete().eq('id', id);
                    if (error) throw error;
                }
            },

            getReps: () => OfflineLayer.get('reps', async () => {
                const { data, error } = await supabaseClient
                    .from('reps')
                    .select('*')
                    .order('name');
                if (error) throw error;
                return data;
            }),
            saveRep: r => OfflineLayer.save('reps', { ...r, id: r.id || crypto.randomUUID() }, async (rep) => {
                const { data, error } = await supabaseClient
                    .from('reps')
                    .upsert(rep, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }),

            getInvoices: () => OfflineLayer.get('invoices', async () => {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            }),
            saveInvoice: inv => OfflineLayer.save('invoices', { ...inv, id: inv.id || crypto.randomUUID() }, async (invoice) => {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .upsert(invoice, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }),
            async getInvoicesLight() {
                if (!supabaseClient) return this._localLightFallback('invoices');
                try {
                    const { data, error } = await supabaseClient
                        .from('invoices')
                        .select('id, invoice_number, date, created_at, type, customer_id, customer_name, total, paid, remaining, status')
                        .order('created_at', { ascending: false });
                    if (error) throw error;
                    return data;
                } catch (e) {
                    return this._localLightFallback('invoices');
                }
            },
            async getInvoiceById(id) {
                if (!supabaseClient) throw new Error('غير متصل');
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (error) throw error;
                return data;
            },
            async createSaleInvoice(invoiceData) {
                if (!supabaseClient) throw new Error('غير متصل');
                const { data, error } = await supabaseClient.rpc('create_sale_invoice', { p_data: invoiceData });
                if (error) throw new Error(error.message);
                if (!data.success) throw new Error(data.error);
                SessionStore.invalidate('offline_invoices');
                SessionStore.invalidate('offline_products');
                return data;
            },

            getPurchases: () => OfflineLayer.get('purchases', async () => {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .select('*')
                    .order('created_at', { ascending: false });
                if (error) throw error;
                return data;
            }),
            savePurchase: pur => OfflineLayer.save('purchases', { ...pur, id: pur.id || crypto.randomUUID() }, async (purchase) => {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .upsert(purchase, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }),
            async createPurchaseInvoice(purchaseData) {
                if (!supabaseClient) throw new Error('غير متصل');
                const { data, error } = await supabaseClient.rpc('create_purchase_invoice', { p_data: purchaseData });
                if (error) throw new Error(error.message);
                if (!data.success) throw new Error(data.error);
                SessionStore.invalidate('offline_purchases');
                SessionStore.invalidate('offline_products');
                return data;
            },
            async getPurchasesLight() {
                if (!supabaseClient) return this._localLightFallback('purchases');
                try {
                    const { data, error } = await supabaseClient
                        .from('purchases')
                        .select('id, date, created_at, supplier_id, supplier_name, total, paid, remaining, status')
                        .order('created_at', { ascending: false });
                    if (error) throw error;
                    return data;
                } catch (e) {
                    return this._localLightFallback('purchases');
                }
            },
            async getPurchaseById(id) {
                if (!supabaseClient) throw new Error('غير متصل');
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .select('*')
                    .eq('id', id)
                    .single();
                if (error) throw error;
                return data;
            },

            getTransactions: () => OfflineLayer.get('transactions', async () => {
                const { data, error } = await supabaseClient
                    .from('transactions')
                    .select('*')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            }),
            saveTransaction: t => OfflineLayer.save('transactions', { ...t, id: t.id || crypto.randomUUID() }, async (trans) => {
                const { data, error } = await supabaseClient
                    .from('transactions')
                    .upsert(trans, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }),

            getReturns: (type) => OfflineLayer.get('returns', async () => {
                let q = supabaseClient.from('returns').select('*').order('date', { ascending: false });
                if (type) q = q.eq('type', type);
                const { data, error } = await q;
                if (error) throw error;
                return data;
            }),
            saveReturn: r => OfflineLayer.save('returns', { ...r, id: r.id || crypto.randomUUID() }, async (ret) => {
                const { data, error } = await supabaseClient
                    .from('returns')
                    .upsert(ret, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }),

            async getSettings() {
                if (SessionStore._settings) return SessionStore._settings;
                if (!supabaseClient) return {};
                const tenantId = await App.getTenantId();
                if (!tenantId) return {};
                try {
                    const { data, error } = await supabaseClient
                        .from('settings')
                        .select('data')
                        .eq('tenant_id', tenantId)
                        .single();
                    if (error && error.code !== 'PGRST116') throw error;
                    SessionStore._settings = data?.data || {};
                    return SessionStore._settings;
                } catch (e) {
                    console.warn('فشل جلب الإعدادات:', e);
                    return {};
                }
            },
            async saveSettings(s) {
                if (!supabaseClient) throw new Error('غير متصل');
                const tenantId = await App.getTenantId();
                if (!tenantId) throw new Error('لا يوجد مستأجر');
                const { data, error } = await supabaseClient
                    .from('settings')
                    .upsert({ tenant_id: tenantId, data: s }, { onConflict: 'tenant_id' })
                    .select()
                    .single();
                if (error) throw error;
                SessionStore._settings = data.data;
                return data.data;
            },

            getJournalEntries: () => OfflineLayer.get('journal_entries', async () => {
                const { data, error } = await supabaseClient
                    .from('journal_entries')
                    .select('*')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            }),
            saveJournalEntry: e => OfflineLayer.save('journal_entries', { ...e, id: e.id || crypto.randomUUID() }, async (entry) => {
                const { data, error } = await supabaseClient
                    .from('journal_entries')
                    .upsert(entry, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            }),

            getAccounts: () => OfflineLayer.get('accounts', async () => {
                const { data, error } = await supabaseClient
                    .from('accounts')
                    .select('*')
                    .order('name');
                if (error) throw error;
                return data;
            }),

            async getAllTenantsData() {
                if (!supabaseClient) throw new Error('غير متصل');
                const { data, error } = await supabaseClient.rpc('get_all_tenants_data');
                if (error) throw error;
                return data || [];
            },
            async deleteTenant(tenantId) {
                if (!supabaseClient) throw new Error('غير متصل');
                const { error } = await supabaseClient.rpc('delete_tenant', { p_tenant_id: tenantId });
                if (error) throw error;
            },

            async generateInvoiceNumber() {
                if (!supabaseClient) throw new Error('غير متصل');
                const tenantId = await App.getTenantId();
                if (!tenantId) throw new Error('لا يوجد مستأجر');

                const year = new Date().getFullYear().toString().slice(-2);
                const seqName = `inv_${year}`;

                const { data, error } = await supabaseClient.rpc('next_sequence', {
                    p_tenant_id: tenantId,
                    p_name: seqName
                });

                if (error) {
                    const { data: seqData } = await supabaseClient
                        .from('sequences')
                        .select('value')
                        .eq('tenant_id', tenantId)
                        .eq('name', seqName)
                        .single();

                    let newValue = 1;
                    if (seqData) {
                        newValue = (seqData.value || 0) + 1;
                        await supabaseClient
                            .from('sequences')
                            .update({ value: newValue })
                            .eq('tenant_id', tenantId)
                            .eq('name', seqName);
                    } else {
                        await supabaseClient
                            .from('sequences')
                            .insert({ tenant_id: tenantId, name: seqName, value: 1 });
                    }
                    return `${year}-${String(newValue).padStart(4, '0')}`;
                }
                return data;
            },

            async _localLightFallback(store) {
                const local = getLocalDB();
                if (local) {
                    const all = await local.getAll(store);
                    const fields = store === 'invoices'
                        ? ['id', 'invoice_number', 'date', 'created_at', 'type', 'customer_id', 'customer_name', 'total', 'paid', 'remaining', 'status']
                        : ['id', 'date', 'created_at', 'supplier_id', 'supplier_name', 'total', 'paid', 'remaining', 'status'];
                    return all
                        .map(item => Object.fromEntries(fields.map(f => [f, item[f]])))
                        .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
                }
                return [];
            }
        };

        // مراقبة أحداث المصادقة
        if (supabaseClient) {
            supabaseClient.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
                    SessionStore.user = null;
                } else if (event === 'SIGNED_IN' && session) {
                    window.App.getCurrentUser().catch(() => {});
                }
            });
        }

        // أحداث الاتصال
        window.addEventListener('online', () => {
            console.log('🌐 عاد الاتصال بالإنترنت');
            SyncEngine.process();
        });
        window.addEventListener('offline', () => {
            console.log('⚠️ انقطع الاتصال - وضع offline نشط');
        });

        // معالجة الطابور عند البداية
        if (navigator.onLine) SyncEngine.process();

        console.log('✅ نظام متعدد المستأجرين جاهز (v3.2)');
    }

    // ==================== وضع الطوارئ ====================
    function setupFallbackApp() {
        window.App = {
            getCurrentUser: async () => null,
            getTenantId: async () => null,
            login: async () => { throw new Error('الخادم غير متاح حالياً. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.'); },
            signup: async () => { throw new Error('الخادم غير متاح حالياً. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.'); },
            logout: () => { window.location.href = './index.html'; },
            requireAuth: async () => false,
            requireRole: async () => false,
            initUserInterface: () => {},
            checkTenantStatus: async () => {}
        };
        window.DB = {
            getProducts: async () => [],
            getInvoices: async () => [],
            getInvoicesLight: async () => [],
            getPurchases: async () => [],
            getPurchasesLight: async () => [],
            getParties: async () => [],
            getReps: async () => [],
            getTransactions: async () => [],
            getReturns: async () => [],
            getJournalEntries: async () => [],
            getAccounts: async () => [],
            getSettings: async () => ({}),
            saveSettings: async () => {},
            saveProduct: async () => {},
            saveParty: async () => {},
            saveInvoice: async () => {},
            savePurchase: async () => {},
            saveTransaction: async () => {},
            saveReturn: async () => {},
            saveRep: async () => {},
            saveJournalEntry: async () => {},
            createSaleInvoice: async () => { throw new Error('غير متصل'); },
            createPurchaseInvoice: async () => { throw new Error('غير متصل'); },
            generateInvoiceNumber: async () => { throw new Error('غير متصل'); },
            getAllTenantsData: async () => [],
            deleteTenant: async () => {},
            deleteProduct: async () => {},
            deleteParty: async () => {},
            getInvoiceById: async () => { throw new Error('غير متصل'); },
            getPurchaseById: async () => { throw new Error('غير متصل'); }
        };
    }

    // ==================== بدء التشغيل ====================
    if (tryInitSupabase()) {
        setupFullApp();
    } else {
        console.warn('⚠️ تشغيل وضع الطوارئ - وظائف محدودة');
        setupFallbackApp();

        // إعادة المحاولة كل 1.5 ثانية لمدة 15 ثانية
        let retryCount = 0;
        const retryInterval = setInterval(() => {
            if (initialized || retryCount >= 10) {
                clearInterval(retryInterval);
                return;
            }
            if (typeof supabase !== 'undefined') {
                if (tryInitSupabase()) {
                    setupFullApp();
                    clearInterval(retryInterval);
                    console.log('✅ تم استعادة الاتصال بالنواة');
                }
            }
            retryCount++;
        }, 1500);

        // محاولة عند اكتمال تحميل الصفحة
        window.addEventListener('load', () => {
            if (!initialized && typeof supabase !== 'undefined') {
                if (tryInitSupabase()) {
                    setupFullApp();
                    console.log('✅ تم استعادة الاتصال عند تحميل الصفحة');
                }
            }
        });
    }

})();
