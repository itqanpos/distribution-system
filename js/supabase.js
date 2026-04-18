// js/supabase.js
// الإصدار الاحترافي - Supabase Client مع بيانات مشروعك
(function() {
    // ==================== بيانات مشروع Supabase الخاص بك ====================
    const SUPABASE_URL = 'https://emvqitmpdkkuyjzegyxf.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVtdnFpdG1wZGtrdXlqemVneXhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTY2NjUsImV4cCI6MjA5MTc3MjY2NX0.gEeUDMmqNQj0Tb3b1WBlXxCsJaD_ZMxxmx_8mPYNVcU';

    // تأكد من وجود مكتبة Supabase
    if (typeof supabase === 'undefined') {
        console.error('❌ Supabase library not loaded. Make sure to include @supabase/supabase-js');
        alert('خطأ: مكتبة Supabase غير محملة. تأكد من اتصالك بالإنترنت.');
        return;
    }

    // إنشاء عميل Supabase
    const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabase = supabaseClient;
    console.log('✅ Supabase client initialized');

    // ==================== دوال المصادقة والجلسات ====================
    window.App = {
        getCurrentUser() {
            const session = localStorage.getItem('app_session');
            if (session) {
                try { return JSON.parse(session); } catch { return null; }
            }
            return null;
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
            const user = this.getCurrentUser();
            if (!user) {
                window.location.href = './index.html';
                return false;
            }
            return true;
        },

        requireRole(allowedRoles) {
            const user = this.getCurrentUser();
            if (!user || !allowedRoles.includes(user.role)) {
                alert('Access Denied: You do not have permission to view this page.');
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

    // ==================== دوال قاعدة البيانات (Supabase) ====================
    window.DB = {
        // المنتجات
        async getProducts() {
            const { data, error } = await supabaseClient.from('products').select('*').order('name');
            if (error) throw error;
            return data;
        },
        async saveProduct(product) {
            if (product.units && typeof product.units === 'string') {
                try { product.units = JSON.parse(product.units); } catch { product.units = []; }
            }
            if (!product.id) {
                product.id = 'PRD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
                const { data, error } = await supabaseClient.from('products').insert([product]).select();
                if (error) throw error;
                return data[0];
            } else {
                const { data, error } = await supabaseClient.from('products').update(product).eq('id', product.id).select();
                if (error) throw error;
                return data[0];
            }
        },
        async deleteProduct(id) {
            const { error } = await supabaseClient.from('products').delete().eq('id', id);
            if (error) throw error;
        },

        // الأطراف (عملاء وموردين)
        async getParties(type = null) {
            let query = supabaseClient.from('parties').select('*').order('name');
            if (type) query = query.eq('type', type);
            const { data, error } = await query;
            if (error) throw error;
            return data;
        },
        async saveParty(party) {
            if (!party.id) {
                party.id = 'PTY-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
                const { data, error } = await supabaseClient.from('parties').insert([party]).select();
                if (error) throw error;
                return data[0];
            } else {
                const { data, error } = await supabaseClient.from('parties').update(party).eq('id', party.id).select();
                if (error) throw error;
                return data[0];
            }
        },
        async deleteParty(id) {
            const { error } = await supabaseClient.from('parties').delete().eq('id', id);
            if (error) throw error;
        },

        // الفواتير (مبيعات)
        async getInvoices() {
            const { data, error } = await supabaseClient.from('invoices').select('*').order('date', { ascending: false });
            if (error) throw error;
            return data;
        },
        async saveInvoice(invoice) {
            if (!invoice.id) {
                invoice.id = 'INV-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
                const { data, error } = await supabaseClient.from('invoices').insert([invoice]).select();
                if (error) throw error;
                return data[0];
            } else {
                const { data, error } = await supabaseClient.from('invoices').update(invoice).eq('id', invoice.id).select();
                if (error) throw error;
                return data[0];
            }
        },

        // المشتريات
        async getPurchases() {
            const { data, error } = await supabaseClient.from('purchases').select('*').order('date', { ascending: false });
            if (error) throw error;
            return data;
        },
        async savePurchase(purchase) {
            if (!purchase.id) {
                purchase.id = 'PUR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
                const { data, error } = await supabaseClient.from('purchases').insert([purchase]).select();
                if (error) throw error;
                return data[0];
            } else {
                const { data, error } = await supabaseClient.from('purchases').update(purchase).eq('id', purchase.id).select();
                if (error) throw error;
                return data[0];
            }
        },

        // حركات الصندوق
        async getTransactions() {
            const { data, error } = await supabaseClient.from('transactions').select('*').order('timestamp', { ascending: false });
            if (error) throw error;
            return data;
        },
        async saveTransaction(transaction) {
            if (!transaction.id) {
                transaction.id = 'TRX-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
                const { data, error } = await supabaseClient.from('transactions').insert([transaction]).select();
                if (error) throw error;
                return data[0];
            } else {
                const { data, error } = await supabaseClient.from('transactions').update(transaction).eq('id', transaction.id).select();
                if (error) throw error;
                return data[0];
            }
        },
        async getCashBalance() {
            const { data, error } = await supabaseClient.from('transactions').select('type, amount');
            if (error) throw error;
            let balance = 0;
            data.forEach(t => {
                if (t.type === 'income') balance += t.amount;
                else balance -= t.amount;
            });
            return balance;
        },

        // الإعدادات
        async getSettings() {
            const { data, error } = await supabaseClient.from('settings').select('data').eq('id', 'main').single();
            if (error && error.code !== 'PGRST116') throw error;
            return data ? data.data : {};
        },
        async saveSettings(settingsData) {
            const { data, error } = await supabaseClient.from('settings').upsert({ id: 'main', data: settingsData }).select();
            if (error) throw error;
            return data[0];
        },

        // المستخدمين
        async getUsers() {
            const { data, error } = await supabaseClient.from('users').select('*').order('username');
            if (error) throw error;
            return data;
        },
        async saveUser(user) {
            if (!user.id) {
                user.id = 'USR-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
                const { data, error } = await supabaseClient.from('users').insert([user]).select();
                if (error) throw error;
                return data[0];
            } else {
                const { data, error } = await supabaseClient.from('users').update(user).eq('id', user.id).select();
                if (error) throw error;
                return data[0];
            }
        },
        async deleteUser(id) {
            const { error } = await supabaseClient.from('users').delete().eq('id', id);
            if (error) throw error;
        }
    };

    // ==================== دوال مساعدة ====================
    window.Utils = {
        formatMoney(amount, currency = 'EGP') {
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
            // يمكن استبدالها بمكتبة توست احترافية لاحقًا
            alert(message);
        },
        async confirmDelete(message = 'Are you sure?') {
            return confirm(message);
        }
    };

    console.log('✅ Supabase module ready with your project data');
})();
