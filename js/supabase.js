/* =============================================
   supabase.js - النواة المُوحَّدة (SaaS Multi-Tenant)
   الإصدار 2.1 - آمن، معزول، معالجة الوميض، يدعم Offline
   ============================================= */
(function() {
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

    // ==================== الأدوات المساعدة ====================
    function cleanObject(obj) {
        const cleaned = { ...obj };
        delete cleaned.updated_at;
        return cleaned;
    }

    function getLocalDB() {
        return (window.localDB && window.localDB.ready) ? window.localDB : null;
    }

    // دالة مساعدة داخلية للحصول على tenant_id من الجلسة (للاستخدامات الخاصة فقط)
    async function getCurrentTenantId() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return null;
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('tenant_id')
            .eq('id', user.id)
            .single();
        return profile?.tenant_id || null;
    }

    // ==================== طبقة Offline (محسّنة) ====================
    async function getWithFallback(storeName, cloudFetcher) {
        const local = getLocalDB();
        if (local) {
            try {
                const localData = await local.getAll(storeName);
                if (localData && localData.length > 0) {
                    console.log(`📦 ${storeName}: عرض ${localData.length} عنصر من IndexedDB`);
                    if (navigator.onLine && supabaseClient) {
                        cloudFetcher().then(async (cloudData) => {
                            if (cloudData && Array.isArray(cloudData)) {
                                for (const item of cloudData) {
                                    await local.put(storeName, cleanObject(item)).catch(() => {});
                                }
                            }
                        }).catch(() => {});
                    }
                    return localData;
                }
            } catch (e) { /* تجاهل */ }
        }

        if (navigator.onLine && supabaseClient) {
            try {
                const data = await cloudFetcher();
                if (local && data && Array.isArray(data)) {
                    await local.clear(storeName);
                    for (const item of data) {
                        await local.put(storeName, cleanObject(item)).catch(() => {});
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
        const cleanData = cleanObject(data);
        if (local) {
            await local.put(storeName, cleanData).catch(() => {});
        }
        if (navigator.onLine && supabaseClient) {
            try {
                const result = await cloudSaver(cleanData);
                if (local && local.removeFromSyncQueue) {
                    await local.removeFromSyncQueue(cleanData.id).catch(() => {});
                }
                return result;
            } catch (error) {
                console.warn(`فشل حفظ ${storeName} في السحابة:`, error);
                if (local && local.addToSyncQueue) {
                    await local.addToSyncQueue({
                        type: cleanData.id ? 'UPDATE' : 'INSERT',
                        table: storeName,
                        data: cleanData
                    }).catch(() => {});
                }
                return cleanData;
            }
        } else {
            if (local && local.addToSyncQueue) {
                await local.addToSyncQueue({
                    type: cleanData.id ? 'UPDATE' : 'INSERT',
                    table: storeName,
                    data: cleanData
                }).catch(() => {});
            }
            return cleanData;
        }
    }

    // ==================== المصادقة والصلاحيات ====================
    window.App = {
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

                let redirectUrl = './dashboard.html';
                if (profile.role === 'rep') redirectUrl = './pos.html';
                else if (profile.role === 'super_admin') redirectUrl = './admin.html';

                const sessionInfo = {
                    id: userId,
                    email: authData.user.email,
                    fullName: profile.full_name || email,
                    role: profile.role,
                    tenant_id: profile.tenant_id,
                    loginTime: new Date().toLocaleString('ar-EG')
                };
                localStorage.setItem('app_session', JSON.stringify(sessionInfo));

                return { success: true, redirectUrl, user: sessionInfo };
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
            localStorage.removeItem('app_session');
            window.location.href = './index.html';
        },

        async getCurrentUser() {
            const { data: { user } } = await supabaseClient.auth.getUser();
            if (!user) return null;
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('*, tenants(plan)')
                .eq('id', user.id)
                .single();
            if (!profile) return null;
            return {
                id: user.id,
                email: user.email,
                fullName: profile.full_name,
                role: profile.role,
                tenant_id: profile.tenant_id,
                plan: profile.tenants?.plan
            };
        },

        async getTenantId() {
            const user = await this.getCurrentUser();
            return user?.tenant_id || null;
        },

        async requireAuth() {
            const user = await this.getCurrentUser();
            if (!user) {
                window.location.href = './index.html';
                return false;
            }
            if (user.role !== 'super_admin' && user.tenant_id) {
                await this.checkTenantStatus(user.tenant_id);
            }
            // تحديث session المحلية (للتوافق مع requireRole و initUserInterface)
            localStorage.setItem('app_session', JSON.stringify({
                ...user,
                loginTime: new Date().toLocaleString('ar-EG')
            }));
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

        requireRole(allowedRoles) {
            const session = JSON.parse(localStorage.getItem('app_session') || '{}');
            const userRole = (session.role || '').toLowerCase();
            const allowed = allowedRoles.map(r => r.toLowerCase());
            if (!allowed.includes(userRole)) {
                alert('غير مسموح لك بالوصول إلى هذه الصفحة');
                window.location.href = userRole === 'admin' ? './dashboard.html' : './pos.html';
                return false;
            }
            return true;
        },

        initUserInterface() {
            const session = JSON.parse(localStorage.getItem('app_session') || '{}');
            if (session) {
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
                    .upsert(cleanObject(product), { onConflict: 'id' })
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
                    .upsert(cleanObject(party), { onConflict: 'id' })
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
                    .upsert(cleanObject(rep), { onConflict: 'id' })
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
        async getInvoicesLight() {
            return getWithFallback('invoices', async () => {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .select('id, date, type, customer_id, total, paid, remaining, status')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
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
        async getPurchasesLight() {
            return getWithFallback('purchases', async () => {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .select('id, date, supplier_id, total, paid, remaining, status')
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
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
                    .upsert(cleanObject(trans), { onConflict: 'id' })
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
                    .upsert(cleanObject(ret), { onConflict: 'id' })
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
                    .upsert(cleanObject(e), { onConflict: 'id' })
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

    console.log('✅ نظام آمن متعدد المستأجرين جاهز (v2.1)');
})();
