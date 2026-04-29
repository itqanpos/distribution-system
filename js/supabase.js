/* =============================================
   supabase.js - مع دعم Offline كامل وشفاف
   ============================================= */
(function() {
    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase library not loaded.');
        return;
    }

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            storage: localStorage,
            persistSession: true,
            autoRefreshToken: true,
        }
    });
    window.supabase = supabaseClient;
    console.log('✅ Supabase client initialized');

    // ==================== الأدوات المساعدة ====================
    function cleanObject(obj) {
        const cleaned = { ...obj };
        delete cleaned.updated_at; // إزالة أي updated_at غير موجود في بعض الجداول
        return cleaned;
    }

    // ==================== الطبقة المحلية (Offline) ====================
    const local = window.localDB;
    const syncer = window.syncManager;

    async function getWithFallback(storeName, cloudFetcher) {
        // ✅ تحسين: إذا كان localDB موجوداً، نقرأ منه أولاً لنضمن السرعة
        if (local) {
            try {
                const localData = await local.getAll(storeName);
                // إذا كانت البيانات المحلية غير فارغة، نعرضها فوراً
                if (localData && localData.length > 0) {
                    console.log(`📦 ${storeName}: تم العرض من IndexedDB (${localData.length} عنصر)`);
                    // لكننا نحاول تحديثها من السحابة في الخلفية
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
            } catch (e) { /* نتجاهل ونكمل */ }
        }

        // إذا لم توجد بيانات محلية، نلجأ للسحابة
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
                console.warn(`فشل جلب ${storeName} من السحابة، الرجوع للمحلي:`, error);
                return local ? await local.getAll(storeName) : [];
            }
        } else {
            return local ? await local.getAll(storeName) : [];
        }
    }

    async function saveWithFallback(storeName, data, cloudSaver) {
        // ✅ حفظ محلي دائماً (حتى لو كنا متصلين)
        if (local) {
            await local.put(storeName, cleanObject(data)).catch(() => {});
        }
        // محاولة الحفظ السحابي
        if (navigator.onLine && supabaseClient) {
            try {
                const result = await cloudSaver(data);
                return result;
            } catch (error) {
                console.warn(`فشل حفظ ${storeName} في السحابة، أُضيف لطابور المزامنة:`, error);
                if (local) {
                    await local.addToSyncQueue?.({
                        type: data.id ? 'UPDATE' : 'INSERT',
                        table: storeName,
                        data: cleanObject(data)
                    }).catch(() => {});
                }
                return data; // نُرجع البيانات المحفوظة محلياً
            }
        } else {
            // غير متصل: أضف إلى طابور المزامنة
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
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('*')
                    .eq('id', data.user.id)
                    .single();
                const session = {
                    id: data.user.id,
                    email: data.user.email,
                    fullName: profile?.full_name || data.user.email,
                    role: profile?.role || 'rep',
                    avatar: profile?.full_name?.charAt(0).toUpperCase() || 'U',
                    loginTime: new Date().toLocaleString('en-US')
                };
                localStorage.setItem('app_session', JSON.stringify(session));
                const redirectUrl = session.role === 'admin' ? './dashboard.html' : './pos.html';
                return { success: true, redirectUrl, user: session };
            } catch (err) {
                console.error('Login error:', err);
                return { success: false, message: err.message };
            }
        },

        async signup(email, password, fullName, role = 'rep') {
            try {
                const { data, error } = await supabaseClient.auth.signUp({
                    email, password,
                    options: { data: { full_name: fullName } }
                });
                if (error) throw error;
                if (data.user) {
                    await supabaseClient.from('profiles').upsert({
                        id: data.user.id,
                        full_name: fullName,
                        role: role
                    }, { onConflict: 'id' });
                }
                return { success: true, message: 'تم إنشاء الحساب.' };
            } catch (err) {
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
            if (!this.getCurrentUser()) {
                window.location.href = './index.html';
                return false;
            }
            return true;
        },

        requireRole(allowedRoles) {
            const user = this.getCurrentUser();
            if (!user) { window.location.href = './index.html'; return false; }
            const userRole = (user.role || '').toLowerCase();
            const allowed = allowedRoles.map(r => r.toLowerCase());
            if (!allowed.includes(userRole)) {
                alert('غير مسموح لك بالوصول إلى هذه الصفحة');
                window.location.href = userRole === 'admin' ? './dashboard.html' : './pos.html';
                return false;
            }
            return true;
        },

        hasPermission(permission) {
            const user = this.getCurrentUser();
            if (!user) return false;
            if (user.role === 'admin') return true;
            const repPermissions = ['pos', 'view_products', 'view_customers', 'view_invoices', 'view_sales', 'view_reports', 'create_invoice', 'hold_invoice', 'return_sale'];
            return repPermissions.includes(permission);
        },

        requirePermission(permission) {
            if (!this.hasPermission(permission)) {
                alert('ليس لديك صلاحية لتنفيذ هذا الإجراء.');
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

    // ==================== دوال قاعدة البيانات ====================
    window.DB = {
        // ---- المنتجات ----
        async getProducts() {
            return getWithFallback('products', async () => {
                const { data, error } = await supabaseClient.from('products').select('*').order('name');
                if (error) throw error;
                return data;
            });
        },
        async saveProduct(p) {
            if (p.units && typeof p.units === 'string') { try { p.units = JSON.parse(p.units); } catch { p.units = []; } }
            if (!p.id) p.id = crypto.randomUUID();
            return saveWithFallback('products', p, async (product) => {
                const { data, error } = await supabaseClient.from('products').upsert(cleanObject(product), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },
        async deleteProduct(id) {
            if (local) await local.delete('products', id).catch(() => {});
            if (navigator.onLine) {
                const { error } = await supabaseClient.from('products').delete().eq('id', id);
                if (error) throw error;
            } else if (local) {
                await local.addToSyncQueue?.({ type: 'DELETE', table: 'products', data: { id } }).catch(() => {});
            }
        },

        // ---- الأطراف (عملاء وموردين) ----
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
                const { data, error } = await supabaseClient.from('parties').upsert(cleanObject(party), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },
        async deleteParty(id) {
            if (local) await local.delete('parties', id).catch(() => {});
            if (navigator.onLine) {
                const { error } = await supabaseClient.from('parties').delete().eq('id', id);
                if (error) throw error;
            } else if (local) {
                await local.addToSyncQueue?.({ type: 'DELETE', table: 'parties', data: { id } }).catch(() => {});
            }
        },

        // ---- المندوبين ----
        async getReps() {
            return getWithFallback('reps', async () => {
                const { data, error } = await supabaseClient.from('reps').select('*').order('name');
                if (error) throw error;
                return data;
            });
        },
        async saveRep(r) {
            if (!r.id) r.id = crypto.randomUUID();
            return saveWithFallback('reps', r, async (rep) => {
                const { data, error } = await supabaseClient.from('reps').upsert(cleanObject(rep), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },
        async deleteRep(id) {
            if (local) await local.delete('reps', id).catch(() => {});
            if (navigator.onLine) {
                const { error } = await supabaseClient.from('reps').delete().eq('id', id);
                if (error) throw error;
            } else if (local) {
                await local.addToSyncQueue?.({ type: 'DELETE', table: 'reps', data: { id } }).catch(() => {});
            }
        },

        // ---- الفواتير (أهم دالة) ----
        async getInvoices() {
            return getWithFallback('invoices', async () => {
                const { data, error } = await supabaseClient.from('invoices').select('*').order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveInvoice(inv) {
            if (!inv.id) inv.id = crypto.randomUUID();
            inv.type = inv.type || 'sale';
            return saveWithFallback('invoices', inv, async (invoice) => {
                const { data, error } = await supabaseClient.from('invoices').upsert(cleanObject(invoice), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },

        // ---- المشتريات ----
        async getPurchases() {
            return getWithFallback('purchases', async () => {
                const { data, error } = await supabaseClient.from('purchases').select('*').order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async savePurchase(p) {
            if (!p.id) p.id = crypto.randomUUID();
            return saveWithFallback('purchases', p, async (purchase) => {
                const { data, error } = await supabaseClient.from('purchases').upsert(cleanObject(purchase), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },

        // ---- المعاملات المالية ----
        async getTransactions() {
            return getWithFallback('transactions', async () => {
                const { data, error } = await supabaseClient.from('transactions').select('*').order('timestamp', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveTransaction(t) {
            if (!t.id) t.id = crypto.randomUUID();
            return saveWithFallback('transactions', t, async (trans) => {
                const { data, error } = await supabaseClient.from('transactions').upsert(cleanObject(trans), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },

        // ---- المرتجعات ----
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
                const { data, error } = await supabaseClient.from('returns').upsert(cleanObject(ret), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },

        // ---- موظفين وسلف ----
        async getEmployees() {
            return getWithFallback('employees', async () => {
                const { data, error } = await supabaseClient.from('employees').select('*').order('name');
                if (error) throw error;
                return data;
            });
        },
        async saveEmployee(emp) {
            if (!emp.id) emp.id = crypto.randomUUID();
            return saveWithFallback('employees', emp, async (employee) => {
                const { data, error } = await supabaseClient.from('employees').upsert(cleanObject(employee), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },
        async getLoans() {
            return getWithFallback('loans', async () => {
                const { data, error } = await supabaseClient.from('loans').select('*').order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveLoan(l) {
            if (!l.id) l.id = crypto.randomUUID();
            return saveWithFallback('loans', l, async (loan) => {
                const { data, error } = await supabaseClient.from('loans').upsert(cleanObject(loan), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },

        // ---- المصروفات ----
        async getExpenses() {
            return getWithFallback('expenses', async () => {
                const { data, error } = await supabaseClient.from('expenses').select('*').order('date', { ascending: false });
                if (error) throw error;
                return data;
            });
        },
        async saveExpense(exp) {
            if (!exp.id) exp.id = crypto.randomUUID();
            return saveWithFallback('expenses', exp, async (expense) => {
                const { data, error } = await supabaseClient.from('expenses').upsert(cleanObject(expense), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },

        // ---- الإعدادات ----
        async getSettings() {
            if (local) {
                const localSettings = await local.getById('settings', 'main');
                if (localSettings) return localSettings.data || localSettings;
            }
            if (navigator.onLine) {
                try {
                    const { data, error } = await supabaseClient.from('settings').select('data').eq('id', 'main').single();
                    if (error && error.code !== 'PGRST116') throw error;
                    const settings = data ? data.data : {};
                    if (local) await local.put('settings', { id: 'main', data: settings });
                    return settings;
                } catch (e) { return {}; }
            }
            return {};
        },
        async saveSettings(s) {
            const data = { id: 'main', data: s };
            if (local) await local.put('settings', data);
            if (navigator.onLine) {
                try {
                    const { data: result, error } = await supabaseClient.from('settings').upsert(data, { onConflict: 'id' }).select().single();
                    if (error) throw error;
                    return result.data;
                } catch (e) {
                    if (local) await local.addToSyncQueue?.({ type: 'UPDATE', table: 'settings', data }).catch(() => {});
                    return s;
                }
            } else {
                if (local) await local.addToSyncQueue?.({ type: 'UPDATE', table: 'settings', data }).catch(() => {});
                return s;
            }
        },

        // ---- صلاحيات المستخدم ----
        async getUserRole(userId) {
            if (local) {
                const profiles = await local.getAll('profiles');
                const profile = profiles.find(p => p.id === userId);
                if (profile) return profile.role || 'user';
            }
            if (navigator.onLine) {
                try {
                    const { data, error } = await supabaseClient.from('profiles').select('role').eq('id', userId).single();
                    if (error) return 'user';
                    return data?.role || 'user';
                } catch (e) { return 'user'; }
            }
            return 'user';
        },

        // ========== توليد رقم الفاتورة ==========
        generateInvoiceNumber: async function() {
            const now = new Date();
            const year = now.getFullYear().toString().slice(-2);
            const storageKey = `inv_counter_${year}`;
            let currentNumber = parseInt(localStorage.getItem(storageKey) || '0', 10);
            currentNumber += 1;
            localStorage.setItem(storageKey, currentNumber.toString());
            return year + '-' + String(currentNumber).padStart(4, '0');
        }
    };

    console.log('✅ نظام حسابي مع دعم Offline كامل جاهز');
})();
