/* =============================================
   supabase.js - النواة المُوحَّدة (SaaS Multi-Tenant)
   الإصدار 2.5 - إصلاحات أمنية، تحسين أداء، دعم تعليق الفواتير
   ============================================= */
(function() {
    // ⚠️ تحذير أمني هام:
    // هذا التطبيق يعتمد على Row Level Security (RLS) في Supabase
    // لحماية بيانات المستأجرين. تأكد من تفعيل السياسات المناسبة
    // على جميع الجداول قبل النشر.
    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase library not loaded.');
        return;
    }

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { storage: localStorage, persistSession: true, autoRefreshToken: true }
    });
    window.supabase = supabaseClient;
    console.log('✅ Supabase client initialized');

    // ==================== الأداة المساعدة للذاكرة المؤقتة ====================
    let _currentUser = null;

    function setCurrentUser(user) {
        _currentUser = user;
        if (user) {
            localStorage.setItem('app_session', JSON.stringify({
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                tenant_id: user.tenant_id,
                loginTime: new Date().toLocaleString('ar-EG')
            }));
        } else {
            localStorage.removeItem('app_session');
        }
    }

    function getLocalDB() {
        return (window.localDB && window.localDB.ready) ? window.localDB : null;
    }

    // ==================== طبقة Offline محسّنة ====================
    async function getWithFallback(storeName, cloudFetcher) {
        const local = getLocalDB();
        if (local) {
            try {
                const localData = await local.getAll(storeName);
                if (localData && localData.length > 0) {
                    console.log(`📦 ${storeName}: عرض ${localData.length} عنصر من IndexedDB`);
                    if (navigator.onLine && supabaseClient) {
                        // مزامنة خلفية متوازية
                        cloudFetcher().then(async (cloudData) => {
                            if (cloudData && Array.isArray(cloudData) && cloudData.length > 0) {
                                const batchSize = 50;
                                for (let i = 0; i < cloudData.length; i += batchSize) {
                                    const batch = cloudData.slice(i, i + batchSize);
                                    await Promise.all(batch.map(item =>
                                        local.put(storeName, item).catch(e =>
                                            console.warn(`فشل تخزين ${storeName} محلياً:`, e)
                                        )
                                    ));
                                }
                            }
                        }).catch(() => {});
                    }
                    return localData;
                }
            } catch (e) {
                console.warn(`خطأ في قراءة ${storeName} من IndexedDB:`, e);
            }
        }

        if (navigator.onLine && supabaseClient) {
            try {
                const data = await cloudFetcher();
                if (local && data && Array.isArray(data)) {
                    await local.clear(storeName);
                    if (data.length > 0) {
                        const batchSize = 50;
                        for (let i = 0; i < data.length; i += batchSize) {
                            const batch = data.slice(i, i + batchSize);
                            await Promise.all(batch.map(item =>
                                local.put(storeName, item).catch(e =>
                                    console.warn(`فشل تخزين ${storeName} محلياً:`, e)
                                )
                            ));
                        }
                    }
                }
                return data;
            } catch (error) {
                console.warn(`فشل جلب ${storeName} من السحابة:`, error);
                return local ? await local.getAll(storeName) : [];
            }
        }
        return [];
    }

    async function saveWithFallback(storeName, data, cloudSaver) {
        const local = getLocalDB();
        if (local) {
            await local.put(storeName, { ...data }).catch(e =>
                console.warn(`فشل حفظ ${storeName} محلياً:`, e)
            );
        }
        if (navigator.onLine && supabaseClient) {
            try {
                const result = await cloudSaver(data);
                if (local && local.removeFromSyncQueue) {
                    await local.removeFromSyncQueue(data.id).catch(() => {});
                }
                return result;
            } catch (error) {
                console.warn(`فشل حفظ ${storeName} في السحابة:`, error);
                if (local && local.addToSyncQueue) {
                    await local.addToSyncQueue({
                        type: data.id ? 'UPDATE' : 'INSERT',
                        table: storeName,
                        data: data
                    }).catch(e => console.warn('فشل إضافة إلى طابور المزامنة:', e));
                }
                return data;
            }
        } else {
            if (local && local.addToSyncQueue) {
                await local.addToSyncQueue({
                    type: data.id ? 'UPDATE' : 'INSERT',
                    table: storeName,
                    data: data
                }).catch(e => console.warn('فشل إضافة إلى طابور المزامنة:', e));
            }
            return data;
        }
    }

    async function processSyncQueue() {
        const local = getLocalDB();
        if (!local || !local.getSyncQueue) return;
        if (!navigator.onLine) return;

        const queue = await local.getSyncQueue().catch(() => []);
        if (!queue || queue.length === 0) return;

        console.log(`🔄 معالجة ${queue.length} عملية مؤجلة...`);
        
        const CONCURRENT_LIMIT = 5;
        for (let i = 0; i < queue.length; i += CONCURRENT_LIMIT) {
            const batch = queue.slice(i, i + CONCURRENT_LIMIT);
            await Promise.all(batch.map(async (item) => {
                try {
                    if (item.table === 'products') {
                        await window.DB.saveProduct(item.data);
                    } else if (item.table === 'parties') {
                        await window.DB.saveParty(item.data);
                    } else if (item.table === 'transactions') {
                        await window.DB.saveTransaction(item.data);
                    } else if (item.table === 'invoices') {
                        await window.DB.saveInvoice(item.data);
                    } else if (item.table === 'purchases') {
                        await window.DB.savePurchase(item.data);
                    } else {
                        console.warn('عملية غير معروفة في الطابور:', item);
                    }
                } catch (e) {
                    console.warn('فشل مزامنة عنصر:', e);
                }
            }));
        }
        console.log('✅ انتهت معالجة الطابور');
    }

    window.addEventListener('online', () => {
        console.log('🌐 عاد الاتصال بالإنترنت');
        processSyncQueue();
    });

    // ==================== المصادقة والصلاحيات ====================
    window.App = {
        async getCurrentUser() {
            // التحقق من الجلسة أولاً
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session) {
                setCurrentUser(null);
                return null;
            }
            const user = session.user;
            
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('*, tenants(plan)')
                .eq('id', user.id)
                .single();
            if (!profile) {
                setCurrentUser(null);
                return null;
            }
            const fullUser = {
                id: user.id,
                email: user.email,
                fullName: profile.full_name,
                role: profile.role,
                tenant_id: profile.tenant_id,
                plan: profile.tenants?.plan
            };
            setCurrentUser(fullUser);
            return fullUser;
        },

        async getTenantId() {
            if (_currentUser && _currentUser.tenant_id) {
                return _currentUser.tenant_id;
            }
            const user = await this.getCurrentUser();
            return user?.tenant_id || null;
        },

        async login(email, password) {
            try {
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
                    console.log('🔄 إنشاء متجر تلقائي...');
                    const tenantName = `متجر ${profile.full_name || email}`;
                    const { data: newTenantId, error: tenantError } = await supabaseClient.rpc('create_my_tenant', { p_tenant_name: tenantName });
                    if (tenantError) {
                        console.error('❌ فشل إنشاء المتجر:', tenantError);
                        throw new Error('فشل إنشاء المتجر');
                    }
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
                setCurrentUser(userInfo);

                let redirectUrl = './dashboard.html';
                if (userInfo.role === 'rep') redirectUrl = './pos.html';
                else if (userInfo.role === 'super_admin') redirectUrl = './admin.html';

                return { success: true, redirectUrl, user: userInfo };
            } catch (err) {
                console.error('Login error:', err);
                return { success: false, message: err.message };
            }
        },

        async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') {
            try {
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
            } catch (err) {
                console.error('Signup error:', err);
                return { success: false, message: err.message };
            }
        },

        async logout() {
            await supabaseClient.auth.signOut();
            setCurrentUser(null);
            window.location.href = './index.html';
        },

        async requireAuth() {
            if (_currentUser) {
                this.getCurrentUser().then(async (user) => {
                    if (!user) {
                        setCurrentUser(null);
                        if (window.location.pathname.indexOf('index.html') === -1) {
                            window.location.href = './index.html';
                        }
                    } else if (user.role !== 'super_admin' && user.tenant_id) {
                        this.checkTenantStatus(user.tenant_id).catch(() => {});
                    }
                }).catch(() => {});
                return true;
            }

            const user = await this.getCurrentUser();
            if (!user) {
                if (window.location.pathname.indexOf('index.html') === -1) {
                    window.location.href = './index.html';
                }
                return false;
            }
            if (user.role !== 'super_admin' && user.tenant_id) {
                await this.checkTenantStatus(user.tenant_id);
            }
            return true;
        },

        async checkTenantStatus(tenantId) {
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
            let user = _currentUser;
            if (!user) {
                user = await this.getCurrentUser();
            }
            if (!user) {
                window.location.href = './index.html';
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

    // ==================== دوال قاعدة البيانات ====================
    window.DB = {
        async getProducts() {
            return getWithFallback('products', async () => {
                const { data, error } = await supabaseClient
                    .from('products')
                    .select('*, product_units(*)')
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
                    .upsert(product, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },
        async deleteProduct(id) {
            const local = getLocalDB();
            if (local) await local.delete('products', id).catch(() => {});
            if (navigator.onLine) {
                const { error } = await supabaseClient.from('products').delete().eq('id', id);
                if (error) throw error;
            }
        },

        async getParties(type = null) {
            return getWithFallback('parties', async () => {
                let q = supabaseClient.from('parties').select('*').order('name');
                if (type) q = q.eq('type', type);
                const { data, error } = await q;
                if (error) throw error;
                return data;
            });
        },
        async saveParty(p) {
            if (!p.id) p.id = crypto.randomUUID();
            return saveWithFallback('parties', p, async (party) => {
                const { data, error } = await supabaseClient
                    .from('parties')
                    .upsert(party, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },
        async deleteParty(id) {
            const local = getLocalDB();
            if (local) await local.delete('parties', id).catch(() => {});
            if (navigator.onLine) {
                const { error } = await supabaseClient.from('parties').delete().eq('id', id);
                if (error) throw error;
            }
        },

        async getReps() {
            return getWithFallback('reps', async () => {
                const { data, error } = await supabaseClient
                    .from('reps')
                    .select('*')
                    .order('name');
                if (error) throw error;
                return data;
            });
        },
        async saveRep(r) {
            if (!r.id) r.id = crypto.randomUUID();
            return saveWithFallback('reps', r, async (rep) => {
                const { data, error } = await supabaseClient
                    .from('reps')
                    .upsert(rep, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        async getInvoices() {
            return getWithFallback('invoices', async () => {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .select('*')
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
                    .upsert(invoice, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },
        async getInvoicesLight() {
            // إرجاع بيانات خفيفة بدون تخزينها بشكل منفصل لتجنب التضارب
            try {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .select('id, date, type, customer_id, total, paid, remaining, status')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            } catch (e) {
                const local = getLocalDB();
                if (local) {
                    const all = await local.getAll('invoices');
                    return all.map(({ id, date, type, customer_id, total, paid, remaining, status }) =>
                        ({ id, date, type, customer_id, total, paid, remaining, status })
                    );
                }
                return [];
            }
        },
        async getInvoiceById(id) {
            const { data, error } = await supabaseClient
                .from('invoices')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },

        async createSaleInvoice(invoiceData) {
            const { data, error } = await supabaseClient.rpc('create_sale_invoice', { p_data: invoiceData });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            return data;
        },

        async createPurchaseInvoice(purchaseData) {
            const { data, error } = await supabaseClient.rpc('create_purchase_invoice', { p_data: purchaseData });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            return data;
        },

        async getPurchases() {
            return getWithFallback('purchases', async () => {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .select('*')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async savePurchase(pur) {
            if (!pur.id) pur.id = crypto.randomUUID();
            return saveWithFallback('purchases', pur, async (purchase) => {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .upsert(purchase, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },
        async getPurchasesLight() {
            try {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .select('id, date, supplier_id, total, paid, remaining, status')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            } catch (e) {
                const local = getLocalDB();
                if (local) {
                    const all = await local.getAll('purchases');
                    return all.map(({ id, date, supplier_id, total, paid, remaining, status }) =>
                        ({ id, date, supplier_id, total, paid, remaining, status })
                    );
                }
                return [];
            }
        },
        async getPurchaseById(id) {
            const { data, error } = await supabaseClient
                .from('purchases')
                .select('*')
                .eq('id', id)
                .single();
            if (error) throw error;
            return data;
        },

        async getTransactions() {
            return getWithFallback('transactions', async () => {
                const { data, error } = await supabaseClient
                    .from('transactions')
                    .select('*')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveTransaction(t) {
            if (!t.id) t.id = crypto.randomUUID();
            return saveWithFallback('transactions', t, async (trans) => {
                const { data, error } = await supabaseClient
                    .from('transactions')
                    .upsert(trans, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        async getReturns(type = null) {
            return getWithFallback('returns', async () => {
                let q = supabaseClient.from('returns').select('*').order('date', { ascending: false });
                if (type) q = q.eq('type', type);
                const { data, error } = await q;
                if (error) throw error;
                return data;
            });
        },
        async saveReturn(r) {
            if (!r.id) r.id = crypto.randomUUID();
            return saveWithFallback('returns', r, async (ret) => {
                const { data, error } = await supabaseClient
                    .from('returns')
                    .upsert(ret, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        async getSettings() {
            try {
                const { data, error } = await supabaseClient
                    .from('settings')
                    .select('data')
                    .single();
                if (error && error.code !== 'PGRST116') throw error;
                return data?.data || {};
            } catch (e) {
                return {};
            }
        },
        async saveSettings(s) {
            const { data, error } = await supabaseClient
                .from('settings')
                .upsert({ data: s }, { onConflict: 'tenant_id' })
                .select()
                .single();
            if (error) throw error;
            return data.data;
        },

        async getJournalEntries() {
            return getWithFallback('journal_entries', async () => {
                const { data, error } = await supabaseClient
                    .from('journal_entries')
                    .select('*')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveJournalEntry(entry) {
            if (!entry.id) entry.id = crypto.randomUUID();
            return saveWithFallback('journal_entries', entry, async (e) => {
                const { data, error } = await supabaseClient
                    .from('journal_entries')
                    .upsert(e, { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        async getAccounts() {
            return getWithFallback('accounts', async () => {
                const { data, error } = await supabaseClient
                    .from('accounts')
                    .select('*')
                    .order('name');
                if (error) throw error;
                return data;
            });
        },

        async getAllTenantsData() {
            const { data, error } = await supabaseClient.rpc('get_all_tenants_data');
            if (error) throw error;
            return data || [];
        },
        async deleteTenant(tenantId) {
            const { error } = await supabaseClient.rpc('delete_tenant', { p_tenant_id: tenantId });
            if (error) throw error;
        },

        generateInvoiceNumber: async function() {
            const { data, error } = await supabaseClient.rpc('next_invoice_number');
            if (error) throw error;
            return data;
        }
    };

    // ==================== مراقبة تغيرات الجلسة ====================
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
            setCurrentUser(null);
        } else if (event === 'SIGNED_IN' && session) {
            window.App.getCurrentUser().catch(() => {});
        }
    });

    console.log('✅ نظام آمن متعدد المستأجرين جاهز (v2.5)');
})();
