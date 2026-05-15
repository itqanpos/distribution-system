/* =============================================
   supabase.js - الإصدار النهائي المُوحَّد (SaaS)
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

    function getCurrentTenantId() {
        const session = localStorage.getItem('app_session');
        if (session) {
            const user = JSON.parse(session);
            return user.tenant_id || null;
        }
        return null;
    }

    // ==================== طبقة Offline ====================
    async function getWithFallback(storeName, cloudFetcher) {
        const local = getLocalDB();
        if (local) {
            try {
                const localData = await local.getAll(storeName);
                if (localData && localData.length > 0) {
                    console.log(`📦 ${storeName}: عرض ${localData.length} عنصر من IndexedDB`);
                    if (navigator.onLine && supabaseClient) {
                        cloudFetcher().then(cloudData => {
                            if (cloudData && Array.isArray(cloudData)) {
                                for (const item of cloudData) {
                                    local.put(storeName, cleanObject(item)).catch(() => {});
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
        if (local) {
            await local.put(storeName, cleanObject(data)).catch(() => {});
        }
        if (navigator.onLine && supabaseClient) {
            try {
                const result = await cloudSaver(data);
                return result;
            } catch (error) {
                console.warn(`فشل حفظ ${storeName} في السحابة:`, error);
                if (local) {
                    await local.addToSyncQueue?.({
                        type: data.id ? 'UPDATE' : 'INSERT',
                        table: storeName,
                        data: cleanObject(data)
                    }).catch(() => {});
                }
                return data;
            }
        } else {
            if (local) {
                await local.addToSyncQueue?.({
                    type: data.id ? 'UPDATE' : 'INSERT',
                    table: storeName,
                    data: cleanObject(data)
                }).catch(() => {});
            }
            return data;
        }
    }

    // ==================== المصادقة والصلاحيات ====================
    window.App = {
        async login(email, password) {
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;

                let profile = null;
                const { data: existingProfile } = await supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();

                if (existingProfile) {
                    profile = existingProfile;
                } else {
                    const { data: newProfile, error: insertError } = await supabaseClient
                        .from('profiles')
                        .upsert({
                            id: data.user.id,
                            full_name: data.user.user_metadata?.full_name || data.user.email,
                            role: 'admin',
                            tenant_id: null
                        }, { onConflict: 'id' })
                        .select()
                        .single();
                    if (insertError) throw insertError;
                    profile = newProfile;
                }

                if (profile.role !== 'super_admin' && !profile.tenant_id) {
                    console.log('🔄 إنشاء Tenant تلقائي للمستخدم...');
                    const { data: tenant, error: tenantError } = await supabaseClient
                        .from('tenants')
                        .insert({ name: `متجر ${profile.full_name || data.user.email}`, plan: 'trial' })
                        .select()
                        .single();
                    if (tenantError) {
                        console.error('❌ فشل إنشاء tenant:', tenantError);
                        throw new Error('فشل إنشاء المتجر تلقائياً');
                    }
                    console.log('✅ تم إنشاء Tenant:', tenant.id);
                    const { error: updateError } = await supabaseClient
                        .from('profiles')
                        .update({ tenant_id: tenant.id })
                        .eq('id', data.user.id);
                    if (updateError) {
                        console.error('❌ فشل ربط tenant بالبروفايل:', updateError);
                    } else {
                        profile.tenant_id = tenant.id;
                    }
                }

                const session = {
                    id: data.user.id,
                    email: data.user.email,
                    fullName: profile.full_name || data.user.email,
                    role: profile.role || 'admin',
                    avatar: (profile.full_name || data.user.email).charAt(0).toUpperCase(),
                    tenant_id: profile.tenant_id || null,
                    loginTime: new Date().toLocaleString('ar-EG')
                };
                localStorage.setItem('app_session', JSON.stringify(session));

                let redirectUrl = './dashboard.html';
                if (profile.role === 'rep') redirectUrl = './pos.html';
                else if (profile.role === 'super_admin') redirectUrl = './admin.html';

                return { success: true, redirectUrl, user: session };
            } catch (err) {
                console.error('Login error:', err);
                return { success: false, message: err.message };
            }
        },

        async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') {
            try {
                const { data: tenant, error: tenantError } = await supabaseClient
                    .from('tenants')
                    .insert({ name: tenantName || `متجر ${fullName}`, plan: 'trial' })
                    .select()
                    .single();
                if (tenantError) throw tenantError;

                const { data, error } = await supabaseClient.auth.signUp({
                    email, password,
                    options: { data: { full_name: fullName, phone: phone } }
                });
                if (error) throw error;

                if (data.user) {
                    await supabaseClient.from('profiles').upsert({
                        id: data.user.id,
                        full_name: fullName,
                        role: role,
                        phone: phone,
                        tenant_id: tenant.id
                    }, { onConflict: 'id' });

                    const { data: loginData, error: loginError } = await supabaseClient.auth.signInWithPassword({ email, password });
                    if (!loginError && loginData.user) {
                        localStorage.setItem('app_session', JSON.stringify({
                            id: data.user.id, email, fullName, role,
                            avatar: fullName.charAt(0).toUpperCase(),
                            tenant_id: tenant.id,
                            loginTime: new Date().toLocaleString('ar-EG')
                        }));
                        return { success: true, message: 'تم إنشاء الحساب وتوجيهك.' };
                    } else {
                        return { success: true, message: 'تم الإنشاء. يرجى تفعيل البريد الإلكتروني.' };
                    }
                }
                return { success: false, message: 'حدث خطأ غير متوقع.' };
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

        getCurrentUser() {
            const session = localStorage.getItem('app_session');
            return session ? JSON.parse(session) : null;
        },

        requireAuth() {
            const user = this.getCurrentUser();
            if (!user) {
                window.location.href = './index.html';
                return false;
            }
            
            // ✅ التحقق من صلاحية المتجر (للمستخدمين العاديين فقط)
            if (user.role !== 'super_admin' && user.tenant_id) {
                this.checkTenantStatus(user.tenant_id);
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
                    // ✅ توجيه إلى صفحة انتهاء الاشتراك بدلاً من تنبيه بسيط
                    window.location.href = './expired.html';
                }
            } catch (e) {
                console.warn('فشل التحقق من حالة المتجر:', e);
            }
        },

        requireRole(allowedRoles) {
            const user = this.getCurrentUser();
            if (!user) {
                window.location.href = './index.html';
                return false;
            }
            const userRole = (user.role || '').toLowerCase();
            const allowed = allowedRoles.map(r => r.toLowerCase());
            if (!allowed.includes(userRole)) {
                alert('غير مسموح لك بالوصول إلى هذه الصفحة');
                window.location.href = userRole === 'admin' ? './dashboard.html' : './pos.html';
                return false;
            }
            return true;
        },

        initUserInterface() {
            const user = this.getCurrentUser();
            if (user) {
                const nameEl = document.getElementById('userName');
                const avatarEl = document.getElementById('userAvatar');
                const timeEl = document.getElementById('loginTime');
                if (nameEl) nameEl.textContent = user.fullName || user.email;
                if (avatarEl) avatarEl.textContent = user.avatar || 'U';
                if (timeEl) timeEl.textContent = user.loginTime || 'اليوم';
            }
        }
    };

    // ==================== دوال قاعدة البيانات (SaaS) ====================
    window.DB = {
        // ---------- المنتجات ----------
        async getProducts() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
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
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            p.tenant_id = tenantId;
            if (p.units && typeof p.units === 'string') { try { p.units = JSON.parse(p.units); } catch { p.units = []; } }
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

        // ---------- الأطراف (عملاء وموردين) ----------
        async getParties(type = null) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('parties', async () => {
                let q = supabaseClient.from('parties').select('*').eq('tenant_id', tenantId).order('name');
                if (type) q = q.eq('type', type);
                const { data, error } = await q;
                if (error) throw error;
                return data;
            });
        },
        async saveParty(p) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            p.tenant_id = tenantId;
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

        // ---------- المندوبين ----------
        async getReps() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('reps', async () => {
                const { data, error } = await supabaseClient
                    .from('reps')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('name');
                if (error) throw error;
                return data;
            });
        },
        async saveRep(r) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            r.tenant_id = tenantId;
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

        // ---------- الفواتير (كاملة + خفيفة) ----------
        async getInvoices() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
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
        async getInvoicesLight() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('invoices', async () => {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .select('id, date, type, customer_id, customer_name, total, paid, remaining, status, invoice_number, items, subtotal, discount, used_customer_balance')
                    .eq('tenant_id', tenantId)
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        // @deprecated – استخدم InvoiceService.createSaleInvoice بدلاً منها (تستخدم دالة الخادم)
        async saveInvoice(inv) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            inv.tenant_id = tenantId;
            if (!inv.id) inv.id = crypto.randomUUID();
            inv.type = inv.type || 'sale';
            return saveWithFallback('invoices', inv, async (invoice) => {
                const { data, error } = await supabaseClient
                    .from('invoices')
                    .upsert(cleanObject(invoice), { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        // ---------- المشتريات (كاملة + خفيفة) ----------
        async getPurchases() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('purchases', async () => {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async getPurchasesLight() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('purchases', async () => {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .select('id, date, supplier_name, supplier_id, total, paid, remaining, status, invoice_number, items')
                    .eq('tenant_id', tenantId)
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async savePurchase(p) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            p.tenant_id = tenantId;
            if (!p.id) p.id = crypto.randomUUID();
            return saveWithFallback('purchases', p, async (purchase) => {
                const { data, error } = await supabaseClient
                    .from('purchases')
                    .upsert(cleanObject(purchase), { onConflict: 'id' })
                    .select()
                    .single();
                if (error) throw error;
                return data;
            });
        },

        // ---------- المعاملات المالية ----------
        async getTransactions() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('transactions', async () => {
                const { data, error } = await supabaseClient
                    .from('transactions')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('timestamp', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveTransaction(t) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            t.tenant_id = tenantId;
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

        // ---------- المرتجعات ----------
        async getReturns(type = null) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('returns', async () => {
                let q = supabaseClient.from('returns').select('*').eq('tenant_id', tenantId).order('date', { ascending: false });
                if (type) q = q.eq('type', type);
                const { data, error } = await q;
                if (error) throw error;
                return data;
            });
        },
        async saveReturn(r) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            r.tenant_id = tenantId;
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

        // ---------- الإعدادات ----------
        async getSettings() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return {};
            const local = getLocalDB();
            if (local) {
                const s = await local.getById('settings', 'main').catch(() => null);
                if (s) return s.data || s;
            }
            if (navigator.onLine && supabaseClient) {
                try {
                    const { data, error } = await supabaseClient
                        .from('settings')
                        .select('data')
                        .eq('tenant_id', tenantId)
                        .eq('id', 'main')
                        .single();
                    if (error && error.code !== 'PGRST116') throw error;
                    const settings = data ? data.data : {};
                    if (local) await local.put('settings', { id: 'main', data: settings, tenant_id: tenantId });
                    return settings;
                } catch (e) { return {}; }
            }
            return {};
        },
        async saveSettings(s) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            const data = { id: 'main', data: s, tenant_id: tenantId };
            const local = getLocalDB();
            if (local) await local.put('settings', data);
            if (navigator.onLine && supabaseClient) {
                try {
                    const { data: result, error } = await supabaseClient
                        .from('settings')
                        .upsert(data, { onConflict: 'id' })
                        .select()
                        .single();
                    if (error) throw error;
                    return result.data;
                } catch (e) {
                    if (local) await local.addToSyncQueue?.({ type: 'UPDATE', table: 'settings', data: data }).catch(() => {});
                    return s;
                }
            }
            return s;
        },

        // ---------- القيود المحاسبية ----------
        async getJournalEntries() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('journal_entries', async () => {
                const { data, error } = await supabaseClient
                    .from('journal_entries')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveJournalEntry(entry) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) throw new Error('No tenant');
            entry.tenant_id = tenantId;
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

        // ---------- الحسابات ----------
        async getAccounts() {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];
            return getWithFallback('accounts', async () => {
                const { data, error } = await supabaseClient
                    .from('accounts')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('name');
                if (error) throw error;
                return data;
            });
        },

        // ---------- دوال المشرف العام ----------
        async getAllTenantsData() {
            const { data, error } = await supabaseClient.rpc('get_all_tenants_data');
            if (error) {
                const { data: tenants } = await supabaseClient
                    .from('tenants')
                    .select('*')
                    .order('created_at', { ascending: false });
                return tenants || [];
            }
            return data || [];
        },
        async deleteTenant(tenantId) {
            const tables = ['invoices', 'purchases', 'transactions', 'returns', 'products', 'parties', 'reps', 'settings', 'journal_entries', 'accounts'];
            for (const table of tables) {
                await supabaseClient.from(table).delete().eq('tenant_id', tenantId);
            }
            await supabaseClient.from('tenants').delete().eq('id', tenantId);
        },

        // ---------- توليد رقم الفاتورة (معزول) ----------
        generateInvoiceNumber: async function() {
            const tenantId = getCurrentTenantId();
            const fallback = () => {
                const year = new Date().getFullYear().toString().slice(-2);
                const storageKey = `inv_counter_${tenantId}_${year}`;
                let num = parseInt(localStorage.getItem(storageKey) || '0', 10) + 1;
                localStorage.setItem(storageKey, num.toString());
                return year + '-' + String(num).padStart(4, '0');
            };
            if (navigator.onLine && supabaseClient && tenantId) {
                try {
                    const { data, error } = await supabaseClient.rpc('next_invoice_number', { p_tenant_id: tenantId });
                    if (!error && data) return data;
                } catch (e) { console.warn('فشل RPC للرقم التسلسلي:', e); }
            }
            return fallback();
        }
    };

    console.log('✅ نظام حسابي SaaS مع دعم Offline كامل جاهز');
})();
