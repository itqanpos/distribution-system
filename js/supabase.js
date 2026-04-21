// js/supabase.js
// الإصدار النهائي مع الصلاحيات المتقدمة
(function() {
    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase library not loaded.');
        return;
    }

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabase = supabaseClient;
    console.log('✅ Supabase client initialized');

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
                    email,
                    password,
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

                return { success: true, message: 'تم إنشاء الحساب. يرجى تأكيد البريد الإلكتروني إن طُلب.' };
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
            if (!this.getCurrentUser()) {
                window.location.href = './index.html';
                return false;
            }
            return true;
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
        async getProducts() { const { data, e } = await supabaseClient.from('products').select('*').order('name'); if (e) throw e; return data; },
        async saveProduct(p) {
            if (p.units && typeof p.units === 'string') { try { p.units = JSON.parse(p.units); } catch { p.units = []; } }
            if (!p.id) p.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('products').upsert(p, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },
        async deleteProduct(id) { const { e } = await supabaseClient.from('products').delete().eq('id', id); if (e) throw e; },

        async getParties(type = null) {
            let q = supabaseClient.from('parties').select('*').order('name');
            if (type) q = q.eq('type', type);
            const { data, e } = await q; if (e) throw e; return data;
        },
        async saveParty(p) {
            if (!p.id) p.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('parties').upsert(p, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },
        async deleteParty(id) { const { e } = await supabaseClient.from('parties').delete().eq('id', id); if (e) throw e; },

        async getReps() { const { data, e } = await supabaseClient.from('reps').select('*').order('name'); if (e) throw e; return data; },
        async saveRep(r) {
            if (!r.id) r.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('reps').upsert(r, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },
        async deleteRep(id) { const { e } = await supabaseClient.from('reps').delete().eq('id', id); if (e) throw e; },

        async getInvoices() { const { data, e } = await supabaseClient.from('invoices').select('*').order('date', { ascending: false }); if (e) throw e; return data; },
        async saveInvoice(inv) {
            if (!inv.id) inv.id = crypto.randomUUID();
            inv.type = 'sale';
            const { data, e } = await supabaseClient.from('invoices').upsert(inv, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },

        async getPurchases() { const { data, e } = await supabaseClient.from('purchases').select('*').order('date', { ascending: false }); if (e) throw e; return data; },
        async savePurchase(p) {
            if (!p.id) p.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('purchases').upsert(p, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },

        async getTransactions() { const { data, e } = await supabaseClient.from('transactions').select('*').order('timestamp', { ascending: false }); if (e) throw e; return data; },
        async saveTransaction(t) {
            if (!t.id) t.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('transactions').upsert(t, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },

        async getReturns(type = null) {
            let q = supabaseClient.from('returns').select('*').order('date', { ascending: false });
            if (type) q = q.eq('type', type);
            const { data, e } = await q; if (e) throw e; return data;
        },
        async saveReturn(r) {
            if (!r.id) r.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('returns').upsert(r, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },

        async getEmployees() { const { data, e } = await supabaseClient.from('employees').select('*').order('name'); if (e) throw e; return data; },
        async saveEmployee(emp) {
            if (!emp.id) emp.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('employees').upsert(emp, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },

        async getLoans() { const { data, e } = await supabaseClient.from('loans').select('*').order('date', { ascending: false }); if (e) throw e; return data; },
        async saveLoan(l) {
            if (!l.id) l.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('loans').upsert(l, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },

        async getExpenses() { const { data, e } = await supabaseClient.from('expenses').select('*').order('date', { ascending: false }); if (e) throw e; return data; },
        async saveExpense(exp) {
            if (!exp.id) exp.id = crypto.randomUUID();
            const { data, e } = await supabaseClient.from('expenses').upsert(exp, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        },

        async getSettings() {
            const { data, e } = await supabaseClient.from('settings').select('data').eq('id', 'main').single();
            if (e && e.code !== 'PGRST116') throw e;
            return data ? data.data : {};
        },
        async saveSettings(s) {
            const { data, e } = await supabaseClient.from('settings').upsert({ id: 'main', data: s }, { onConflict: 'id' }).select().single();
            if (e) throw e; return data;
        }
    };

    window.Utils = {
        formatMoney(amount, currency = 'ج.م') {
            if (amount === null || amount === undefined) amount = 0;
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        getToday() { return new Date().toISOString().split('T')[0]; }
    };

    console.log('✅ Secure Supabase module ready');
})();
