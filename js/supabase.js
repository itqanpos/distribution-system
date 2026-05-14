/* =============================================================
   supabase.js - الإصدار المطور (SaaS & Offline Priority)
   ============================================================= */
(function() {
    // إعدادات الاتصال بالسحابة
    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase library not loaded. Check your script tags.');
        return;
    }

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { storage: localStorage, persistSession: true, autoRefreshToken: true }
    });
    window.supabase = supabaseClient;

    // ==================== الأدوات المساعدة (Utilities) ====================
    
    // تنظيف الكائنات قبل الحفظ لضمان عدم إرسال حقول برمجية غير مرغوبة
    function cleanObject(obj) {
        if (!obj) return null;
        const cleaned = { ...obj };
        delete cleaned.updated_at;
        // التأكد من تحويل المصفوفات أو الكائنات المعقدة إلى JSON إذا لزم الأمر
        for (const key in cleaned) {
            if (Array.isArray(cleaned[key]) || (typeof cleaned[key] === 'object' && cleaned[key] !== null)) {
                cleaned[key] = JSON.stringify(cleaned[key]);
            }
        }
        return cleaned;
    }

    function getLocalDB() {
        return (window.localDB && window.localDB.ready) ? window.localDB : null;
    }

    function getCurrentTenantId() {
        const session = localStorage.getItem('app_session');
        if (session) {
            try {
                const user = JSON.parse(session);
                return user.tenant_id || null;
            } catch (e) { return null; }
        }
        return null;
    }

    // ==================== طبقة المزامنة (Offline Layer) ====================
    
    async function getWithFallback(storeName, cloudFetcher) {
        const local = getLocalDB();
        const tenantId = getCurrentTenantId();

        // 1. محاولة الجلب من التخزين المحلي أولاً لسرعة الاستجابة
        if (local) {
            try {
                let localData = await local.getAll(storeName);
                // تصفية البيانات محلياً لضمان عزل الـ Tenant حتى في وضع الأوفلاين
                if (tenantId) {
                    localData = localData.filter(item => item.tenant_id === tenantId);
                }

                if (localData && localData.length > 0) {
                    // إذا كان الجهاز متصلاً، نحدث البيانات في الخلفية
                    if (navigator.onLine) {
                        cloudFetcher().then(cloudData => {
                            if (Array.isArray(cloudData)) {
                                cloudData.forEach(item => local.put(storeName, item).catch(() => {}));
                            }
                        }).catch(err => console.warn('Background sync failed:', err));
                    }
                    return localData;
                }
            } catch (e) { console.error(`Local fetch error for ${storeName}:`, e); }
        }

        // 2. الجلب من السحابة إذا لم توجد بيانات محلية أو فشل التخزين المحلي
        if (navigator.onLine) {
            try {
                const data = await cloudFetcher();
                if (local && Array.isArray(data)) {
                    for (const item of data) {
                        await local.put(storeName, item).catch(() => {});
                    }
                }
                return data;
            } catch (error) {
                console.warn(`Cloud fetch failed for ${storeName}:`, error);
                return [];
            }
        }
        return [];
    }

    async function saveWithFallback(storeName, data, cloudSaver) {
        const local = getLocalDB();
        const tenantId = getCurrentTenantId();
        
        // إجبار وجود معرف المتجر لضمان عزل البيانات
        if (tenantId) data.tenant_id = tenantId;

        // الحفظ محلياً أولاً لضمان عدم ضياع البيانات
        if (local) {
            await local.put(storeName, data).catch(() => {});
        }

        if (navigator.onLine) {
            try {
                return await cloudSaver(data);
            } catch (error) {
                console.warn(`Sync to cloud failed for ${storeName}, queued for later:`, error);
                if (local && local.addToSyncQueue) {
                    await local.addToSyncQueue({
                        type: data.id ? 'UPDATE' : 'INSERT',
                        table: storeName,
                        data: data
                    }).catch(() => {});
                }
                return data;
            }
        } else {
            // وضع قائمة الانتظار للمزامنة اللاحقة
            if (local && local.addToSyncQueue) {
                await local.addToSyncQueue({
                    type: 'OFFLINE_SAVE',
                    table: storeName,
                    data: data
                }).catch(() => {});
            }
            return data;
        }
    }

    // ==================== نظام الهوية والمصادقة (SaaS Auth) ====================
    
    window.App = {
        async login(email, password) {
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;

                // جلب بيانات البروفايل والمتجر
                const { data: profile, error: pError } = await supabaseClient
                    .from('profiles')
                    .select('*, tenants(id, name)')
                    .eq('id', data.user.id)
                    .single();

                if (pError) throw pError;

                // إعداد جلسة المستخدم مع أرقام إنجليزية للتوقيت
                const session = {
                    id: data.user.id,
                    email: data.user.email,
                    fullName: profile.full_name || data.user.email,
                    role: profile.role || 'admin',
                    avatar: (profile.full_name || 'U').charAt(0).toUpperCase(),
                    tenant_id: profile.tenant_id,
                    tenant_name: profile.tenants?.name || 'متجري',
                    loginTime: new Date().toLocaleString('en-US') // أرقام إنجليزية دائماً
                };

                localStorage.setItem('app_session', JSON.stringify(session));

                let redirectUrl = './dashboard.html';
                if (profile.role === 'rep') redirectUrl = './pos.html';
                else if (profile.role === 'super_admin') redirectUrl = './admin.html';

                return { success: true, redirectUrl, user: session };
            } catch (err) {
                console.error('Login error:', err);
                return { success: false, message: 'خطأ في الدخول: ' + err.message };
            }
        },

        async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') {
            try {
                // 1. إنشاء المستأجر (Tenant)
                const { data: tenant, error: tError } = await supabaseClient
                    .from('tenants')
                    .insert({ name: tenantName || `متجر ${fullName}`, plan: 'trial' })
                    .select()
                    .single();
                if (tError) throw tError;

                // 2. إنشاء الحساب
                const { data: authData, error: aError } = await supabaseClient.auth.signUp({
                    email, password,
                    options: { data: { full_name: fullName } }
                });
                if (aError) throw aError;

                // 3. إنشاء البروفايل وربطه بالـ Tenant
                if (authData.user) {
                    const { error: prError } = await supabaseClient.from('profiles').insert({
                        id: authData.user.id,
                        full_name: fullName,
                        role: role,
                        phone: phone,
                        tenant_id: tenant.id
                    });
                    if (prError) throw prError;

                    return { success: true, message: 'تم إنشاء الحساب بنجاح، يمكنك تسجيل الدخول الآن.' };
                }
                return { success: false, message: 'فشل إنشاء المستخدم.' };
            } catch (err) {
                return { success: false, message: err.message };
            }
        },

        logout() {
            supabaseClient.auth.signOut();
            localStorage.removeItem('app_session');
            localStorage.removeItem('pos_current_cart');
            window.location.href = './index.html';
        },

        getCurrentUser() {
            try {
                const session = localStorage.getItem('app_session');
                return session ? JSON.parse(session) : null;
            } catch (e) { return null; }
        },

        getTenantId() {
            const user = this.getCurrentUser();
            return user ? user.tenant_id : null;
        },

        requireAuth() {
            if (!this.getCurrentUser()) {
                window.location.href = './index.html';
                return false;
            }
            return true;
        },

        initUserInterface() {
            const user = this.getCurrentUser();
            if (user) {
                const els = {
                    'userName': user.fullName,
                    'userAvatar': user.avatar,
                    'loginTime': user.loginTime,
                    'sidebarTenantName': user.tenant_name
                };
                for (let id in els) {
                    const el = document.getElementById(id);
                    if (el) el.textContent = els[id];
                }
            }
        }
    };

    // ==================== طبقة البيانات الموحدة (Data Layer) ====================
    
    window.DB = {
        // --- المنتجات ---
        async getProducts() {
            const tenantId = getCurrentTenantId();
            return getWithFallback('products', async () => {
                const { data, error } = await supabaseClient
                    .from('products')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('name');
                if (error) throw error;
                return data;
            });
        },
        async saveProduct(p) {
            if (!p.id) p.id = crypto.randomUUID();
            return saveWithFallback('products', p, async (product) => {
                const { data, error } = await supabaseClient
                    .from('products')
                    .upsert(cleanObject(product))
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        // --- الأطراف (عملاء/موردين) ---
        async getParties(type = null) {
            const tenantId = getCurrentTenantId();
            return getWithFallback('parties', async () => {
                let query = supabaseClient.from('parties').select('*').eq('tenant_id', tenantId);
                if (type) query = query.eq('type', type);
                const { data, error } = await query.order('name');
                if (error) throw error;
                return data;
            });
        },
        async saveParty(p) {
            if (!p.id) p.id = crypto.randomUUID();
            return saveWithFallback('parties', p, async (party) => {
                const { data, error } = await supabaseClient
                    .from('parties')
                    .upsert(cleanObject(party))
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        // --- الفواتير ---
        async getInvoices() {
            const tenantId = getCurrentTenantId();
            return getWithFallback('invoices', async () => {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveInvoice(inv) {
            if (!inv.id) inv.id = crypto.randomUUID();
            return saveWithFallback('invoices', inv, async (invoice) => {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .upsert(cleanObject(invoice))
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        // --- المعاملات المالية ---
        async saveTransaction(t) {
            if (!t.id) t.id = crypto.randomUUID();
            if (!t.timestamp) t.timestamp = new Date().toISOString();
            return saveWithFallback('transactions', t, async (trans) => {
                const { data, error } = await supabaseClient
                    .from('transactions')
                    .upsert(cleanObject(trans))
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        // --- الإعدادات ---
        async getSettings() {
            const tenantId = getCurrentTenantId();
            const { data } = await supabaseClient
                .from('settings')
                .select('data')
                .eq('tenant_id', tenantId)
                .eq('id', 'main')
                .single();
            return data ? data.data : {};
        },
        async saveSettings(s) {
            const tenantId = getCurrentTenantId();
            const { error } = await supabaseClient
                .from('settings')
                .upsert({ id: 'main', tenant_id: tenantId, data: s });
            if (error) throw error;
            return s;
        },

        // --- توليد أرقام الفواتير ---
        async generateInvoiceNumber() {
            const tenantId = getCurrentTenantId();
            const year = new Date().getFullYear().toString().slice(-2);
            
            // في وضع الأونلاين، نستخدم وظيفة من قاعدة البيانات لضمان عدم التكرار
            if (navigator.onLine) {
                try {
                    const { data, error } = await supabaseClient.rpc('get_next_invoice_number', { 
                        p_tenant_id: tenantId,
                        p_year: year 
                    });
                    if (!error && data) return data;
                } catch (e) {}
            }

            // Fallback: التوليد محلياً بناءً على آخر رقم مخزن للمستأجر
            const storageKey = `inv_counter_${tenantId}_${year}`;
            let lastNum = parseInt(localStorage.getItem(storageKey) || '0', 10);
            lastNum++;
            localStorage.setItem(storageKey, lastNum.toString());
            return `${year}-${String(lastNum).padStart(4, '0')}`;
        }
    };

    console.log('✅ Itqan Cloud System (SaaS) Initialized');
})();
