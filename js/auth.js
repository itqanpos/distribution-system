/* =============================================
   auth.js - Authentication
   Version: 4.1.0 (Fixed)
   
   Fixes:
   - [1] إزالة upsert profiles (يعتمد على trigger)
   - [2] لا يمنح admin افتراضياً عند فشل الجلب
   - [3] logout يمسح IndexedDB
   - [4] refreshSession بعد create_my_tenant
   - [5] debounce getCurrentUser
   - [6] offChange للمستمعين
   - [7] فحص is_active عند الدخول
   - [8] password reset/change
   ============================================= */
(function() {
    'use strict';

    window.Auth = {
        user: null,
        _listeners: new Set(),
        _fetchingUser: null,
        _initDone: false,

        async init() {
            if (!window.DB?.client) {
                setTimeout(() => this.init(), 500);
                return;
            }
            if (this._initDone) return;
            this._initDone = true;

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
            this._listeners.add(fn);
            if (this.user) fn(this.user);
            return () => this._listeners.delete(fn);
        },

        offChange(fn) { this._listeners.delete(fn); },

        async waitForSession(maxWait = 5000) {
            if (!window.DB?.client) return null;
            const start = Date.now();
            while (Date.now() - start < maxWait) {
                try {
                    const { data: { session } } = await window.DB.client.auth.getSession();
                    if (session) {
                        // تحقق من عدم انتهاء الجلسة
                        const exp = session.expires_at ? session.expires_at * 1000 : 0;
                        if (!exp || exp > Date.now() + 5000) return session;
                    }
                } catch {}
                await new Promise(r => setTimeout(r, 100));
            }
            return null;
        },

        /* ============================================
           getCurrentUser — ✅ [FIX #5] debounced
           ============================================ */
        async getCurrentUser() {
            if (!window.DB?.client) return null;
            if (this._fetchingUser) return this._fetchingUser;

            this._fetchingUser = (async () => {
                try {
                    const { data: { session } } = await window.DB.client.auth.getSession();
                    if (!session) { this.user = null; return null; }

                    const { data: profile, error } = await window.DB.client
                        .from('profiles').select('*')
                        .eq('id', session.user.id).maybeSingle();

                    if (error && error.code !== 'PGRST116') {
                        console.error('Profile fetch error', error);
                        // ✅ [FIX #2] لا نُعطي admin افتراضياً
                        return null;
                    }

                    if (!profile) {
                        // لا profile → المستخدم لم يكمل التسجيل
                        this.user = null;
                        return null;
                    }

                    // ✅ [FIX #7] فحص is_active
                    if (profile.is_active === false) {
                        console.warn('User inactive');
                        this.user = null;
                        return null;
                    }

                    this.user = {
                        id: session.user.id,
                        email: session.user.email,
                        fullName: profile.full_name || session.user.email,
                        role: profile.role,       // ← من profile فقط
                        tenant_id: profile.tenant_id,
                        phone: profile.phone
                    };
                    return this.user;
                } catch (e) {
                    console.error('getCurrentUser failed', e);
                    return null;
                } finally {
                    this._fetchingUser = null;
                }
            })();

            return this._fetchingUser;
        },

        /* ============================================
           Login
           ============================================ */
        async login(email, password) {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email || !password) throw new Error('يرجى إدخال البريد وكلمة المرور');

            const { error } = await window.DB.client.auth
                .signInWithPassword({ email, password });
            if (error) throw new Error(this._translateError(error));

            const user = await this.getCurrentUser();

            // ✅ [FIX #7] إن كان موقوفاً، اخرج فوراً
            if (!user) {
                await window.DB.client.auth.signOut();
                throw new Error('حسابك موقوف أو غير مكتمل، تواصل مع الإدارة');
            }

            this._notify(user);
            return { success: true, user, redirect: this.getRedirect(user) };
        },

        /* ============================================
           Signup — ✅ [FIX #1] بدون upsert profiles
           ============================================ */
        async signup(email, password, fullName, storeName, phone = '') {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email || !password || !fullName) throw new Error('يرجى إكمال البيانات المطلوبة');
            if (password.length < 6) throw new Error('كلمة المرور 6 أحرف على الأقل');

            const { data: authData, error: authError } = await window.DB.client.auth.signUp({
                email, password,
                options: { data: { full_name: fullName, phone } }
            });
            if (authError) throw new Error(this._translateError(authError));
            if (!authData.user) throw new Error('فشل إنشاء المستخدم');

            // إذا احتاج تأكيد بريد
            if (!authData.session) {
                throw new Error('يرجى تأكيد بريدك الإلكتروني أولاً ثم تسجيل الدخول');
            }

            // ✅ [FIX #1] trigger handle_new_user أنشأ profile مسبقاً
            // انتظر حتى يصل profile (trigger قد يتأخر قليلاً)
            let attempts = 0;
            while (attempts < 10) {
                const { data: p } = await window.DB.client
                    .from('profiles').select('id').eq('id', authData.user.id).maybeSingle();
                if (p) break;
                await new Promise(r => setTimeout(r, 300));
                attempts++;
            }

            // ✅ [FIX #1] إنشاء المتجر عبر RPC
            const tenantName = (storeName || `متجر ${fullName}`).trim();
            const { error: tenantError } = await window.DB.client.rpc(
                'create_my_tenant', { p_tenant_name: tenantName }
            );
            if (tenantError) {
                console.error('create_my_tenant failed', tenantError);
                throw new Error('فشل إنشاء المتجر: ' + (tenantError.message || ''));
            }

            // ✅ [FIX #4] أعد تحميل الجلسة لتحصل على app_metadata محدث
            try { await window.DB.client.auth.refreshSession(); } catch {}

            const user = await this.getCurrentUser();
            this._notify(user);
            return { success: true, user };
        },

        /* ============================================
           Logout — ✅ [FIX #3] يمسح IndexedDB
           ============================================ */
        async logout({ force = false } = {}) {
            if (!window.DB?.client) return;

            // تحذير إذا كانت هناك عمليات معلقة
            if (!force) {
                try {
                    const pending = await window.DB.getPendingSyncCount();
                    if (pending > 0) {
                        const ok = confirm(
                            `لديك ${pending} عملية لم تُزامن بعد. ` +
                            `سيتم الاحتفاظ بها للمستخدم الحالي فقط. هل تريد تسجيل الخروج؟`
                        );
                        if (!ok) return;
                    }
                } catch {}
            }

            try { await window.DB.client.auth.signOut(); } catch (e) { console.warn(e); }

            // ✅ [FIX #3] امسح البيانات المحلية (احتفظ بطابور المزامنة)
            try {
                await window.DB.wipeLocalData({ includePendingQueue: true });
            } catch (e) { console.warn('wipe failed', e); }

            this.user = null;
            this._listeners.clear();
            this._notify(null);

            if (!location.pathname.includes('index.html') && location.pathname !== '/') {
                location.href = './index.html';
            }
        },

        /* ============================================
           requireAuth / requireRole
           ============================================ */
        async requireAuth() {
            await this.waitForSession();
            const user = await this.getCurrentUser();
            if (!user) {
                await new Promise(r => setTimeout(r, 500));
                const retry = await this.getCurrentUser();
                if (!retry) {
                    if (!location.pathname.includes('index.html') && location.pathname !== '/') {
                        location.href = './index.html';
                    }
                    return null;
                }
                return retry;
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
           Password Reset / Change — ✅ [FIX #8]
           ============================================ */
        async resetPassword(email) {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email) throw new Error('يرجى إدخال البريد الإلكتروني');
            const { error } = await window.DB.client.auth
                .resetPasswordForEmail(email, { redirectTo: location.origin });
            if (error) throw new Error(this._translateError(error));
            return { success: true };
        },

        async changePassword(currentPassword, newPassword) {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!newPassword || newPassword.length < 6) {
                throw new Error('كلمة المرور الجديدة 6 أحرف على الأقل');
            }
            const user = await this.getCurrentUser();
            if (!user?.email) throw new Error('غير مسجل الدخول');

            // إعادة التحقق بكلمة المرور الحالية
            const { error: signInErr } = await window.DB.client.auth
                .signInWithPassword({ email: user.email, password: currentPassword });
            if (signInErr) throw new Error('كلمة المرور الحالية غير صحيحة');

            const { error } = await window.DB.client.auth.updateUser({ password: newPassword });
            if (error) throw new Error(this._translateError(error));
            return { success: true };
        },

        /* ============================================
           Error Translation — ✅ يعتمد على error.code
           ============================================ */
        _translateError(err) {
            const code = err?.code || '';
            const msg = err?.message || '';

            const byCode = {
                'invalid_credentials': 'بيانات الدخول غير صحيحة',
                'email_not_confirmed': 'يرجى تأكيد البريد الإلكتروني أولاً',
                'user_already_exists': 'البريد مسجل مسبقاً. جرّب تسجيل الدخول',
                'weak_password': 'كلمة المرور قصيرة جداً',
                'over_email_send_rate_limit': 'محاولات كثيرة، حاول لاحقاً',
                'over_request_rate_limit': 'محاولات كثيرة، حاول لاحقاً',
                'validation_failed': 'صيغة البيانات غير صحيحة'
            };
            if (byCode[code]) return byCode[code];

            // fallback للنص
            const byMsg = {
                'Invalid login credentials': 'بيانات الدخول غير صحيحة',
                'Email not confirmed': 'يرجى تأكيد البريد الإلكتروني أولاً',
                'User already registered': 'البريد مسجل مسبقاً. جرّب تسجيل الدخول',
                'Password should be at least 6 characters': 'كلمة المرور قصيرة جداً',
                'Email rate limit exceeded': 'محاولات كثيرة، حاول لاحقاً',
                'For security purposes, you can only request this after': 'لأسباب أمنية، حاول بعد قليل',
                'duplicate key value': 'هذا الحساب موجود مسبقاً'
            };
            for (const [k, v] of Object.entries(byMsg)) {
                if (msg.includes(k)) return v;
            }
            return msg || 'حدث خطأ غير متوقع';
        }
    };

    window.addEventListener('load', () => {
        setTimeout(() => window.Auth.init().catch(e => console.error('Auth init error', e)), 300);
    });
})();
