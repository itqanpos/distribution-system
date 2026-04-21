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
                const { data, error } = await supabaseClient.auth.signUp({ email, password });
                if (error) throw error;

                if (data.user) {
                    await supabaseClient.from('profiles').insert([{
                        id: data.user.id,
                        full_name: fullName,
                        role: role
                    }]);
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
        // ---- المنتجات ----
        async getProducts() {
            const { data, error } = await supabaseClient.from('products').select('*').order('name');
            if (error) throw error;
            return data;
        },
        async saveProduct(product) {
            if (product.units && typeof product.units === 'string') {
                try { product.units = JSON.parse(product.units); } catch { product.units = []; }
            }
            if (!product.id) product.id = crypto.randomUUID();
            const { data, error } = await supabaseClient
                .from('products')
                .upsert(product, { onConflict: 'id' })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        async deleteProduct(id) {
            const { error } = await supabaseClient.from('products').delete().eq('id', id);
            if (error) throw error;
        },

        // ---- الأطراف (عملاء وموردين) ----
        async getParties(type = null) {
            let query = supabaseClient.from('parties').select('*').order('name');
            if (type) query = query.eq('type', type);
            const { data, error } = await query;
            if (error) throw error;
            return data;
        },
        async saveParty(party) {
            if (!party.id) party.id = crypto.randomUUID();
            const { data, error } = await supabaseClient
                .from('parties')
                .upsert(party, { onConflict: 'id' })
                .select()
                .single();
            if (error) throw error;
            return data;
        },
        async deleteParty(id) {
            const { error } = await supabaseClient.from('parties').delete().eq('id', id);
            if (error) throw error;
        },

        // ---- المندوبين ----
        async getReps() {
            const { data, error } = await supabaseClient.from('reps').select('*').order('name');
            if (error) throw error;
            return data;
        },
        async saveRep(rep) {
            if (!rep.id) rep.id = crypto.randomUUID();
            const { data, error } = await supabaseClient.from('reps').upsert(rep, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },
        async deleteRep(id) {
            const { error } = await supabaseClient.from('reps').delete().eq('id', id);
            if (error) throw error;
        },

        // ---- الفواتير (مبيعات) ----
        async getInvoices() {
            const { data, error } = await supabaseClient.from('invoices').select('*').order('date', { ascending: false });
            if (error) throw error;
            return data;
        },
        async saveInvoice(invoice) {
            if (!invoice.id) invoice.id = crypto.randomUUID();
            invoice.type = 'sale';
            const { data, error } = await supabaseClient.from('invoices').upsert(invoice, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },

        // ---- المشتريات ----
        async getPurchases() {
            const { data, error } = await supabaseClient.from('purchases').select('*').order('date', { ascending: false });
            if (error) throw error;
            return data;
        },
        async savePurchase(purchase) {
            if (!purchase.id) purchase.id = crypto.randomUUID();
            const { data, error } = await supabaseClient.from('purchases').upsert(purchase, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },

        // ---- حركات الصندوق ----
        async getTransactions() {
            const { data, error } = await supabaseClient.from('transactions').select('*').order('timestamp', { ascending: false });
            if (error) throw error;
            return data;
        },
        async saveTransaction(trans) {
            if (!trans.id) trans.id = crypto.randomUUID();
            const { data, error } = await supabaseClient.from('transactions').upsert(trans, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },

        // ---- المرتجعات ----
        async getReturns(type = null) {
            let query = supabaseClient.from('returns').select('*').order('date', { ascending: false });
            if (type) query = query.eq('type', type);
            const { data, error } = await query;
            if (error) throw error;
            return data;
        },
        async saveReturn(ret) {
            if (!ret.id) ret.id = crypto.randomUUID();
            const { data, error } = await supabaseClient.from('returns').upsert(ret, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },

        // ---- الموظفين ----
        async getEmployees() {
            const { data, error } = await supabaseClient.from('employees').select('*').order('name');
            if (error) throw error;
            return data;
        },
        async saveEmployee(emp) {
            if (!emp.id) emp.id = crypto.randomUUID();
            const { data, error } = await supabaseClient.from('employees').upsert(emp, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },

        // ---- السلف ----
        async getLoans() {
            const { data, error } = await supabaseClient.from('loans').select('*').order('date', { ascending: false });
            if (error) throw error;
            return data;
        },
        async saveLoan(loan) {
            if (!loan.id) loan.id = crypto.randomUUID();
            const { data, error } = await supabaseClient.from('loans').upsert(loan, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },

        // ---- المصروفات ----
        async getExpenses() {
            const { data, error } = await supabaseClient.from('expenses').select('*').order('date', { ascending: false });
            if (error) throw error;
            return data;
        },
        async saveExpense(exp) {
            if (!exp.id) exp.id = crypto.randomUUID();
            const { data, error } = await supabaseClient.from('expenses').upsert(exp, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },

        // ---- الإعدادات ----
        async getSettings() {
            const { data, error } = await supabaseClient.from('settings').select('data').eq('id', 'main').single();
            if (error && error.code !== 'PGRST116') throw error;
            return data ? data.data : {};
        },
        async saveSettings(settingsData) {
            const { data, error } = await supabaseClient
                .from('settings')
                .upsert({ id: 'main', data: settingsData }, { onConflict: 'id' })
                .select()
                .single();
            if (error) throw error;
            return data;
        }
    };

    // ==================== دوال مساعدة ====================
    window.Utils = {
        formatMoney(amount, currency = 'ج.م') {
            if (amount === null || amount === undefined) amount = 0;
            return Number(amount).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }) + ' ' + currency;
        },
        getToday() {
            return new Date().toISOString().split('T')[0];
        }
    };

    console.log('✅ Secure Supabase module with permissions ready');
})();
