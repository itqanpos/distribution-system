// js/supabase.js
// الإصدار النهائي المتوافق تماماً مع جداول Supabase
(function() {
    // ==================== بيانات مشروع Supabase ====================
    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase library not loaded.');
        alert('خطأ: مكتبة Supabase غير محملة.');
        return;
    }

    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabase = supabaseClient;
    console.log('✅ Supabase client initialized');

    // ==================== المصادقة ====================
    window.App = {
        getCurrentUser() {
            const session = localStorage.getItem('app_session');
            return session ? JSON.parse(session) : null;
        },

        async login(username, password) {
            try {
                const { data, error } = await supabaseClient
                    .from('users')
                    .select('*')
                    .eq('username', username)
                    .eq('password', password)
                    .single();

                if (error) throw error;
                if (!data) return { success: false, message: 'Invalid username or password' };

                const session = {
                    id: data.id,
                    username: data.username,
                    fullName: data.full_name,
                    role: data.role,
                    avatar: data.full_name?.charAt(0).toUpperCase() || 'U',
                    loginTime: new Date().toLocaleString('en-US')
                };
                localStorage.setItem('app_session', JSON.stringify(session));

                const redirectUrl = data.role === 'admin' ? './dashboard.html' : './pos.html';
                return { success: true, redirectUrl, user: session };
            } catch (err) {
                console.error('Login error:', err);
                return { success: false, message: 'An error occurred. Please try again.' };
            }
        },

        logout() {
            localStorage.removeItem('app_session');
            window.location.href = './index.html';
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
            if (!user || !allowedRoles.includes(user.role)) {
                alert('Access Denied');
                window.location.href = './dashboard.html';
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
                if (nameEl) nameEl.textContent = user.fullName || user.username;
                if (avatarEl) avatarEl.textContent = user.avatar || 'U';
                if (timeEl) timeEl.textContent = user.loginTime || 'Today';
            }
        }
    };

    // ==================== دوال قاعدة البيانات (متوافقة مع أسماء الأعمدة الفعلية) ====================
    window.DB = {
        // ---- المنتجات ----
        async getProducts() {
            const { data, error } = await supabaseClient.from('products').select('*').order('name');
            if (error) throw error;
            return data;
        },
        async saveProduct(product) {
            // التأكد من أن units هو JSON صالح
            if (product.units && typeof product.units === 'string') {
                try { product.units = JSON.parse(product.units); } catch { product.units = []; }
            }
            if (!product.units) product.units = [{ name: 'قطعة', price: 0, stock: 0, factor: 1 }];
            
            const clean = { ...product };
            if (!clean.id) clean.id = 'PRD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
            
            const { data, error } = await supabaseClient
                .from('products')
                .upsert(clean, { onConflict: 'id' })
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
            if (!party.id) party.id = 'PTY-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
            if (!rep.id) rep.id = 'REP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
            if (!invoice.id) invoice.id = 'INV-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
            if (!purchase.id) purchase.id = 'PUR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
            if (!trans.id) trans.id = 'TRX-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
            if (!ret.id) ret.id = 'RET-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
            if (!emp.id) emp.id = 'EMP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
            if (!loan.id) loan.id = 'LOAN-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
            if (!exp.id) exp.id = 'EXP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
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
        },

        // ---- المستخدمين ----
        async getUsers() {
            const { data, error } = await supabaseClient.from('users').select('*').order('username');
            if (error) throw error;
            return data;
        },
        async saveUser(user) {
            if (!user.id) user.id = 'USR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
            const { data, error } = await supabaseClient.from('users').upsert(user, { onConflict: 'id' }).select().single();
            if (error) throw error;
            return data;
        },
        async deleteUser(id) {
            const { error } = await supabaseClient.from('users').delete().eq('id', id);
            if (error) throw error;
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
        },
        showToast(message, type = 'info') {
            alert(message); // يمكن تحسينها لاحقاً
        },
        async confirmDelete(message = 'هل أنت متأكد؟') {
            return confirm(message);
        }
    };

    console.log('✅ DB module ready');
})();
