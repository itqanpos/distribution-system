/* =============================================
   auth.js - Authentication
   ============================================= */
(function() {
    'use strict';
    
    window.Auth = {
        user: null,
        _listeners: [],
        
        async init() {
            if (!window.DB?.client) {
                setTimeout(() => this.init(), 500);
                return;
            }
            
            window.DB.client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') {
                    this.user = null;
                    this._notify(null);
                } else if (event === 'SIGNED_IN' && session) {
                    this.getCurrentUser().then(u => this._notify(u));
                }
            });
            
            await this.getCurrentUser();
        },
        
        _notify(user) {
            this._listeners.forEach(fn => {
                try { fn(user); } catch (e) { console.error(e); }
            });
        },
        
        onChange(fn) {
            this._listeners.push(fn);
            if (this.user) fn(this.user);
        },
        
        async getCurrentUser() {
            if (!window.DB?.client) return null;
            
            try {
                const { data: { session } } = await window.DB.client.auth.getSession();
                if (!session) {
                    this.user = null;
                    return null;
                }
                
                const { data: profile, error } = await window.DB.client
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .maybeSingle();
                
                if (error && error.code !== 'PGRST116') {
                    console.error('Profile fetch error', error);
                }
                
                this.user = {
                    id: session.user.id,
                    email: session.user.email,
                    fullName: profile?.full_name || session.user.email,
                    role: profile?.role || 'rep',
                    tenant_id: profile?.tenant_id || null,
                    phone: profile?.phone || null
                };
                
                return this.user;
            } catch (e) {
                console.error('getCurrentUser failed', e);
                return null;
            }
        },
        
        async login(email, password) {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email || !password) throw new Error('يرجى إدخال البريد وكلمة المرور');
            
            const { data, error } = await window.DB.client.auth.signInWithPassword({ email, password });
            if (error) throw new Error(this._translateError(error.message));
            
            const user = await this.getCurrentUser();
            this._notify(user);
            
            return { success: true, user, redirect: this.getRedirect(user) };
        },
        
        async signup(email, password, fullName, storeName, phone = '') {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email || !password || !fullName) throw new Error('يرجى إكمال البيانات المطلوبة');
            if (password.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');
            
            const { data: authData, error: authError } = await window.DB.client.auth.signUp({
                email, password,
                options: { data: { full_name: fullName, phone } }
            });
            
            if (authError) throw new Error(this._translateError(authError.message));
            if (!authData.user) throw new Error('فشل إنشاء المستخدم');
            
            const { error: profileError } = await window.DB.client.from('profiles').upsert({
                id: authData.user.id,
                full_name: fullName,
                email,
                phone,
                role: 'admin'
            }, { onConflict: 'id' });
            
            if (profileError) console.warn('Profile create warning', profileError);
            
            const { error: signInError } = await window.DB.client.auth.signInWithPassword({ email, password });
            if (signInError) throw new Error(this._translateError(signInError.message));
            
            try {
                const { error: tenantError } = await window.DB.client.rpc('create_my_tenant', {
                    p_tenant_name: storeName || `متجر ${fullName}`
                });
                if (tenantError) console.warn('Tenant create warning', tenantError);
            } catch (e) {
                console.warn('Tenant creation failed', e);
            }
            
            const user = await this.getCurrentUser();
            this._notify(user);
            
            return { success: true, user };
        },
        
        async logout() {
            if (!window.DB?.client) return;
            await window.DB.client.auth.signOut();
            this.user = null;
            this._notify(null);
        },
        
        async requireAuth() {
            const user = await this.getCurrentUser();
            if (!user) {
                if (!location.pathname.includes('index.html') && location.pathname !== '/') {
                    location.href = './index.html';
                }
                return null;
            }
            return user;
        },
        
        async requireRole(roles = []) {
            const user = await this.getCurrentUser();
            if (!user) return false;
            if (!roles.length) return true;
            return roles.includes(user.role);
        },
        
        getRedirect(user) {
            if (!user) return './index.html';
            if (user.role === 'rep') return './pos.html';
            return './dashboard.html';
        },
        
        _translateError(msg) {
            const map = {
                'Invalid login credentials': 'بيانات الدخول غير صحيحة',
                'Email not confirmed': 'يرجى تأكيد البريد الإلكتروني',
                'User already registered': 'البريد مسجل مسبقاً',
                'Password should be at least 6 characters': 'كلمة المرور قصيرة جداً',
                'Email rate limit exceeded': 'محاولات كثيرة، حاول لاحقاً'
            };
            for (const [k, v] of Object.entries(map)) {
                if (msg?.includes(k)) return v;
            }
            return msg || 'حدث خطأ';
        }
    };
    
    window.addEventListener('load', () => {
        setTimeout(() => window.Auth.init(), 300);
    });
    
    console.log('✅ auth.js loaded');
})();
