/* =============================================
   auth.js - Authentication (Fixed Signup)
   Version: 3.0.1
   ============================================= */
(function() {
    'use strict';
    
    window.Auth = {
        user: null,
        _listeners: [],
        
        /* ============================================
           Init
           ============================================ */
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
            console.log('✅ Auth initialized');
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
        
        /* ============================================
           Get Current User
           ============================================ */
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
                    role: profile?.role || 'admin',
                    tenant_id: profile?.tenant_id || null,
                    phone: profile?.phone || null
                };
                
                return this.user;
            } catch (e) {
                console.error('getCurrentUser failed', e);
                return null;
            }
        },
        
        /* ============================================
           Login
           ============================================ */
        async login(email, password) {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email || !password) throw new Error('يرجى إدخال البريد وكلمة المرور');
            
            const { data, error } = await window.DB.client.auth.signInWithPassword({ 
                email, 
                password 
            });
            
            if (error) throw new Error(this._translateError(error.message));
            
            const user = await this.getCurrentUser();
            this._notify(user);
            
            return { 
                success: true, 
                user, 
                redirect: this.getRedirect(user) 
            };
        },
        
        /* ============================================
           Signup (FIXED - Login first, then create profile)
           ============================================ */
        async signup(email, password, fullName, storeName, phone = '') {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email || !password || !fullName) {
                throw new Error('يرجى إكمال البيانات المطلوبة');
            }
            if (password.length < 6) {
                throw new Error('كلمة المرور 6 أحرف على الأقل');
            }
            
            console.log('📝 [1/5] إنشاء مستخدم Auth...');
            
            // ✅ 1. إنشاء مستخدم Auth
            const { data: authData, error: authError } = await window.DB.client.auth.signUp({
                email, 
                password,
                options: { 
                    data: { 
                        full_name: fullName, 
                        phone: phone 
                    } 
                }
            });
            
            if (authError) {
                console.error('Auth signup error:', authError);
                throw new Error(this._translateError(authError.message));
            }
            if (!authData.user) {
                throw new Error('فشل إنشاء المستخدم');
            }
            
            console.log('✅ [1/5] تم إنشاء مستخدم Auth:', authData.user.id);
            
            // ✅ 2. إذا كان المستخدم يحتاج تأكيد بريد، تنبيه
            if (!authData.session) {
                console.warn('⚠️ يحتاج تأكيد بريد إلكتروني');
                // نحاول تسجيل الدخول
                const { error: signInError } = await window.DB.client.auth.signInWithPassword({ 
                    email, 
                    password 
                });
                
                if (signInError) {
                    // إذا فشل تسجيل الدخول بسبب التحقق من البريد
                    if (signInError.message.includes('Email not confirmed')) {
                        throw new Error('يرجى تأكيد بريدك الإلكتروني أولاً ثم تسجيل الدخول');
                    }
                    throw new Error(this._translateError(signInError.message));
                }
            }
            
            console.log('📝 [2/5] تسجيل الدخول...');
            
            // ✅ 3. تسجيل الدخول للتأكد من وجود session
            const { error: signInError } = await window.DB.client.auth.signInWithPassword({ 
                email, 
                password 
            });
            
            if (signInError) {
                console.warn('Sign in after signup failed:', signInError);
                // لا نرمي خطأ - المستخدم مُنشأ لكن الجلسة قد تحتاج انتظار
            }
            
            // ✅ 4. إنشاء profile (المستخدم الآن مسجل → RLS يعمل)
            console.log('📝 [3/5] إنشاء profile...');
            
            await new Promise(r => setTimeout(r, 300));
            
            const { error: profileError } = await window.DB.client
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    full_name: fullName,
                    email: email,
                    phone: phone,
                    role: 'admin'
                }, { onConflict: 'id' });
            
            if (profileError) {
                console.warn('⚠️ Profile create failed, retrying...', profileError);
                await new Promise(r => setTimeout(r, 800));
                
                const { error: retryError } = await window.DB.client
                    .from('profiles')
                    .upsert({
                        id: authData.user.id,
                        full_name: fullName,
                        email: email,
                        phone: phone,
                        role: 'admin'
                    }, { onConflict: 'id' });
                
                if (retryError) {
                    console.error('❌ Profile retry failed:', retryError);
                }
            } else {
                console.log('✅ [3/5] تم إنشاء profile');
            }
            
            // ✅ 5. إنشاء المتجر
            console.log('📝 [4/5] إنشاء المتجر...');
            
            const tenantName = storeName || `متجر ${fullName}`;
            
            try {
                const { data: tenantId, error: tenantError } = await window.DB.client.rpc(
                    'create_my_tenant', 
                    { p_tenant_name: tenantName }
                );
                
                if (tenantError) {
                    console.warn('⚠️ Tenant creation error:', tenantError);
                } else {
                    console.log('✅ [4/5] تم إنشاء المتجر:', tenantId);
                }
            } catch (e) {
                console.warn('⚠️ Tenant creation exception:', e);
            }
            
            // ✅ 6. تحميل بيانات المستخدم النهائية
            console.log('📝 [5/5] تحميل بيانات المستخدم...');
            
            await new Promise(r => setTimeout(r, 500));
            
            const user = await this.getCurrentUser();
            this._notify(user);
            
            console.log('✅ Signup complete:', user);
            
            return { 
                success: true, 
                user 
            };
        },
        
        /* ============================================
           Logout
           ============================================ */
        async logout() {
            if (!window.DB?.client) return;
            
            try {
                await window.DB.client.auth.signOut();
            } catch (e) {
                console.warn('Logout error:', e);
            }
            
            this.user = null;
            this._notify(null);
            
            // توجيه
            if (!location.pathname.includes('index.html') && location.pathname !== '/') {
                location.href = './index.html';
            }
        },
        
        /* ============================================
           Auth Guards
           ============================================ */
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
        
        /* ============================================
           Error Translation
           ============================================ */
        _translateError(msg) {
            const map = {
                'Invalid login credentials': 'بيانات الدخول غير صحيحة',
                'Email not confirmed': 'يرجى تأكيد البريد الإلكتروني أولاً',
                'User already registered': 'البريد مسجل مسبقاً. جرّب تسجيل الدخول',
                'Password should be at least 6 characters': 'كلمة المرور قصيرة جداً',
                'Email rate limit exceeded': 'محاولات كثيرة، حاول لاحقاً',
                'Signup requires a valid password': 'كلمة المرور غير صحيحة',
                'Unable to validate email address: invalid format': 'صيغة البريد الإلكتروني غير صحيحة',
                'For security purposes, you can only request this after': 'لأسباب أمنية، حاول بعد قليل',
                'duplicate key value': 'هذا الحساب موجود مسبقاً'
            };
            
            for (const [key, value] of Object.entries(map)) {
                if (msg?.includes(key)) return value;
            }
            
            return msg || 'حدث خطأ غير متوقع';
        }
    };
    
    /* ============================================
       Auto Init on Load
       ============================================ */
    window.addEventListener('load', () => {
        setTimeout(() => {
            window.Auth.init().catch(e => console.error('Auth init error', e));
        }, 300);
    });
    
    console.log('✅ auth.js loaded');
})();
