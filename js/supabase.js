/* =============================================
   supabase.js - إصدار متين مع دعم Offline
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
        delete cleaned.updated_at;
        return cleaned;
    }

    // ==================== طبقة Offline الآمنة ====================
    function getLocalDB() {
        return (window.localDB && window.localDB.ready) ? window.localDB : null;
    }

    async function getWithFallback(storeName, cloudFetcher) {
        const local = getLocalDB();
        
        // ✅ إذا كان هناك تخزين محلي جاهز، اقرأ منه أولاً (لأداء أفضل)
        if (local) {
            try {
                const localData = await local.getAll(storeName);
                if (localData && localData.length > 0) {
                    console.log(`📦 ${storeName}: عرض ${localData.length} عنصر من IndexedDB`);
                    // تحديث في الخلفية من السحابة
                    if (navigator.onLine) {
                        cloudFetcher().then(cloudData => {
                            if (cloudData) {
                                cloudData.forEach(item => local.put(storeName, cleanObject(item)).catch(()=>{}));
                            }
                        }).catch(()=>{});
                    }
                    return localData;
                }
            } catch (e) { /* نتجاهل أخطاء IndexedDB */ }
        }

        // ✅ لا توجد بيانات محلية أو فشلت، نجلب من السحابة
        if (navigator.onLine && supabaseClient) {
            try {
                const data = await cloudFetcher();
                if (local && data && Array.isArray(data)) {
                    for (const item of data) {
                        await local.put(storeName, cleanObject(item)).catch(()=>{});
                    }
                }
                return data;
            } catch (error) {
                console.warn(`فشل جلب ${storeName} من السحابة:`, error);
                return [];
            }
        } else {
            // لا إنترنت ولا LocalDB: إرجاع مصفوفة فارغة
            return [];
        }
    }

    async function saveWithFallback(storeName, data, cloudSaver) {
        const local = getLocalDB();
        
        // ✅ حفظ محلي دائماً (إن أمكن)
        if (local) {
            await local.put(storeName, cleanObject(data)).catch(()=>{});
        }
        
        if (navigator.onLine && supabaseClient) {
            try {
                return await cloudSaver(data);
            } catch (error) {
                console.warn(`فشل حفظ ${storeName} في السحابة:`, error);
                if (local) {
                    await local.addToSyncQueue?.({
                        type: data.id ? 'UPDATE' : 'INSERT',
                        table: storeName,
                        data: cleanObject(data)
                    }).catch(()=>{});
                }
                return data;
            }
        } else {
            if (local) {
                await local.addToSyncQueue?.({
                    type: data.id ? 'UPDATE' : 'INSERT',
                    table: storeName,
                    data: cleanObject(data)
                }).catch(()=>{});
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
            const local = getLocalDB();
            if (local) await local.delete('products', id).catch(()=>{});
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
                const { data, error } = await supabaseClient.from('parties').upsert(cleanObject(party), { onConflict: 'id' }).select().single();
                if (error) throw error;
                return data;
            });
        },
        async deleteParty(id) {
            const local = getLocalDB();
            if (local) await local.delete('parties', id).catch(()=>{});
            if (navigator.onLine) {
                const { error } = await supabaseClient.from('parties').delete().eq('id', id);
                if (error) throw error;
            }
        },

        // ... (باقي الدوال مثل getInvoices, getPurchases, getTransactions, etc. دون تغيير عن الإصدار السابق) ...

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

    console.log('✅ نظام حسابي مع دعم Offline متين جاهز');
})();
