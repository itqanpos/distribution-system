/* =============================================
   auth.js - Authentication Layer
   Version: 5.3.0

   Changelog من v5.2.0:
   - [AUTH-1] getCurrentUser: عند خطأ عابر (شبكة/DB)
              نحتفظ بـ this.user السابق بدل تصفيره،
              مع fallback من JWT (session.user.app_metadata).
              _lastError يميّز الفشل العابر عن النهائي.
   - [AUTH-1b] requireAuth: 3 محاولات ثم logout({force:true})
               (كان محاولة واحدة + انتظار 500ms ثم redirect).
   - [AUTH-2] signup: signOut قبل throw عند فشل ربط المستأجر
             (كان يترك جلسة معلقة).
   - [AUTH-3] logout: signOut({scope:'global'}) → {scope:'local'}
             → تنبيه المستخدم عند الفشل الكامل.
   - [AUTH-7] _notify: dedup بواسطة _lastNotifiedKey
             (منع تنبيه مزدوج في login).
   - [AUTH-8] init: 20 محاولة حد أقصى لانتظار DB.
   ============================================= */
(function() {
    'use strict';

    const PREV_USER_KEY = 'hesaby_prev_user_id';
    const INIT_MAX_ATTEMPTS = 20;
    const INIT_RETRY_MS = 500;

    window.Auth = {
        user: null,
        _listeners: new Set(),
        _fetchingUser: null,
        _initDone: false,
        _wipingInProgress: false,
        _lastError: null,          // ✅ [AUTH-1] {type:'transient'|'definitive', ...}
        _lastNotifiedKey: undefined, // ✅ [AUTH-7]

        /* ============================================
           init
           ✅ [AUTH-8] حد أقصى للمحاولات
           ============================================ */
        async init(attempt = 0) {
            if (!window.DB?.client) {
                if (attempt >= INIT_MAX_ATTEMPTS) {
                    console.error('Auth init: DB never became ready');
                    return;
                }
                setTimeout(() => this.init(attempt + 1), INIT_RETRY_MS);
                return;
            }
            if (this._initDone) return;
            this._initDone = true;

            window.DB.client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT') {
                    this.user = null;
                    this._lastError = { type: 'definitive', reason: 'signed-out' };
                    this._notify(null);
                } else if (event === 'SIGNED_IN' && session) {
                    this.getCurrentUser().then(u => this._notify(u));
                }
            });

            await this.getCurrentUser();
        },

        /* ============================================
           _notify
           ✅ [AUTH-7] dedup بحسب user.id
           ============================================ */
        _notify(user) {
            const key = user?.id || null;
            if (this._lastNotifiedKey === key) return;
            this._lastNotifiedKey = key;

            this._listeners.forEach(fn => {
                try { fn(user); } catch (e) { console.error(e); }
            });
        },

        onChange(fn) {
            this._listeners.add(fn);
            if (this.user) {
                // ✅ [AUTH-7] سجّل التنبيه الأولي لمنع ازدواج لاحق
                this._lastNotifiedKey = this.user.id;
                try { fn(this.user); } catch (e) { console.error(e); }
            }
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
                        const exp = session.expires_at ? session.expires_at * 1000 : 0;
                        if (!exp || exp > Date.now() + 5000) return session;
                    }
                } catch { /* ignore transient errors */ }
                await new Promise(r => setTimeout(r, 100));
            }
            return null;
        },

        /* ============================================
           _userFromSession — fallback من JWT
           يُستخدم فقط عند فشل جلب profile (شبكة/DB).
           البيانات موقّعة بـ JWT، لذلك موثوقة.
           ============================================ */
        _userFromSession(session) {
            if (!session?.user) return null;
            const meta = session.user.user_metadata || {};
            const appMeta = session.user.app_metadata || {};
            const tenantId = appMeta.tenant_id || null;
            return {
                id: session.user.id,
                email: session.user.email,
                fullName: meta.full_name || session.user.email,
                role: appMeta.role || 'rep',
                tenant_id: tenantId,
                phone: meta.phone || null,
                _fromJwt: true
            };
        },

        /* ============================================
           getCurrentUser
           ✅ [AUTH-1] عند خطأ عابر نحتفظ بـ this.user
                       ونجرب fallback من JWT.
           ✅ [AUTH-FIX-1] كشف تغيير المستخدم → wipe
           ✅ [AUTH-FIX-6] يقبل tenant_id = null (signup مؤقتًا)
           ============================================ */
        async getCurrentUser() {
            if (!window.DB?.client) return null;
            if (this._fetchingUser) return this._fetchingUser;

            this._fetchingUser = (async () => {
                try {
                    const { data: { session } } = await window.DB.client.auth.getSession();
                    if (!session) {
                        this.user = null;
                        this._lastError = { type: 'definitive', reason: 'no-session' };
                        return null;
                    }

                    const { data: profile, error } = await window.DB.client
                        .from('profiles').select('*')
                        .eq('id', session.user.id).maybeSingle();

                    if (error && error.code !== 'PGRST116') {
                        console.error('Profile fetch error', error);

                        // ✅ [AUTH-1] خطأ عابر — حاول fallback من JWT
                        const fallback = this._userFromSession(session);
                        if (fallback?.tenant_id) {
                            console.warn('Using JWT fallback for user (profile fetch failed)');
                            this.user = fallback;
                            this._lastError = { type: 'transient', error };
                            return fallback;
                        }

                        // لا نُصفّر this.user — قد يكون من جلسة سابقة على نفس الصفحة
                        this._lastError = { type: 'transient', error };
                        return this.user;
                    }

                    if (!profile) {
                        console.warn('No profile for user', session.user.id);
                        this.user = null;
                        this._lastError = { type: 'definitive', reason: 'no-profile' };
                        return null;
                    }

                    if (profile.is_active === false) {
                        console.warn('User is inactive:', session.user.id);
                        this.user = null;
                        this._lastError = { type: 'definitive', reason: 'inactive' };
                        return null;
                    }

                    const newUser = {
                        id: session.user.id,
                        email: session.user.email,
                        fullName: profile.full_name || session.user.email,
                        role: profile.role,
                        // ⚠️ قد تكون null أثناء signup قبل create_my_tenant
                        tenant_id: profile.tenant_id,
                        phone: profile.phone
                    };

                    // ✅ [AUTH-FIX-1] كشف تغيير المستخدم على نفس الجهاز
                    const prevUserId = localStorage.getItem(PREV_USER_KEY);
                    if (prevUserId && prevUserId !== newUser.id && !this._wipingInProgress) {
                        this._wipingInProgress = true;
                        console.warn('🔄 User changed — wiping local data');
                        try {
                            await window.DB.wipeLocalData({ includePendingQueue: true });
                        } catch (e) {
                            console.error('wipeLocalData failed on user change', e);
                        } finally {
                            this._wipingInProgress = false;
                        }
                    }
                    localStorage.setItem(PREV_USER_KEY, newUser.id);

                    this.user = newUser;
                    this._lastError = null;
                    return this.user;
                } catch (e) {
                    console.error('getCurrentUser failed', e);
                    this._lastError = { type: 'transient', error: e };
                    // ✅ [AUTH-1] خطأ عابر — نُبقي this.user كما هو
                    return this.user;
                } finally {
                    this._fetchingUser = null;
                }
            })();

            return this._fetchingUser;
        },

        /* ============================================
           login
           ============================================ */
        async login(email, password) {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email || !password) throw new Error('يرجى إدخال البريد وكلمة المرور');

            const { error } = await window.DB.client.auth
                .signInWithPassword({ email, password });
            if (error) throw new Error(this._translateError(error));

            const user = await this.getCurrentUser();

            // رفض الدخول إن لم يوجد profile أو كان الحساب موقوفًا
            if (!user) {
                await window.DB.client.auth.signOut();
                throw new Error('حسابك موقوف أو غير مكتمل، تواصل مع الإدارة');
            }

            // ✅ [AUTH-7] _notify أصبح dedup — نداء صريح لن يضر
            this._notify(user);
            return { success: true, user, redirect: this.getRedirect(user) };
        },

        /* ============================================
           signup
           ✅ [AUTH-2] signOut قبل throw عند فشل ربط المستأجر
           ✅ [AUTH-FIX-4] فحص فشل إنشاء profile
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

            if (!authData.session) {
                throw new Error('يرجى تأكيد بريدك الإلكتروني أولاً ثم تسجيل الدخول');
            }

            // ✅ [AUTH-FIX-4] انتظر trigger handle_new_user مع فحص نهائي
            let profileFound = false;
            for (let i = 0; i < 10; i++) {
                const { data: p } = await window.DB.client
                    .from('profiles').select('id').eq('id', authData.user.id).maybeSingle();
                if (p) { profileFound = true; break; }
                await new Promise(r => setTimeout(r, 300));
            }
            if (!profileFound) {
                await window.DB.client.auth.signOut();
                throw new Error(
                    'لم يتم إنشاء ملف المستخدم. يرجى المحاولة مجددًا أو التواصل مع الدعم.'
                );
            }

            // إنشاء المتجر
            const tenantName = (storeName || `متجر ${fullName}`).trim();
            const { error: tenantError } = await window.DB.client.rpc(
                'create_my_tenant', { p_tenant_name: tenantName }
            );
            if (tenantError) {
                console.error('create_my_tenant failed', tenantError);
                await window.DB.client.auth.signOut();
                throw new Error('فشل إنشاء المتجر: ' + (tenantError.message || ''));
            }

            // أعد تحميل الجلسة لتحصل على app_metadata.tenant_id
            try { await window.DB.client.auth.refreshSession(); } catch (e) {
                console.warn('refreshSession after tenant creation failed', e);
            }

            // تأكد من أن profile الآن يحتوي tenant_id
            const { data: updatedProfile } = await window.DB.client
                .from('profiles').select('tenant_id, role').eq('id', authData.user.id).maybeSingle();

            if (!updatedProfile?.tenant_id) {
                // ✅ [AUTH-2] لا تترك جلسة معلّقة
                await window.DB.client.auth.signOut();
                throw new Error('تم إنشاء الحساب لكن ربط المستأجر لم يكتمل. أعد تسجيل الدخول.');
            }

            const user = await this.getCurrentUser();
            this._notify(user);
            return { success: true, user };
        },

        /* ============================================
           logout
           ✅ [AUTH-3] signOut(global) → signOut(local) → تنبيه
           ✅ [AUTH-FIX-2] _notify قبل _listeners.clear()
           ✅ [AUTH-FIX-3] رسالة تحذير دقيقة
           ✅ [AUTH-FIX-5] إرسال CLEAR_CACHE للـ SW
           ============================================ */
        async logout({ force = false } = {}) {
            if (!window.DB?.client) return;

            // 1) تحذير المستخدم من فقدان عمليات المزامنة المعلّقة
            if (!force) {
                try {
                    const pending = await window.DB.getPendingSyncCount();
                    if (pending > 0) {
                        const ok = confirm(
                            `لديك ${pending} عملية لم تُزامن بعد. ` +
                            `سيتم حذفها نهائيًا عند تسجيل الخروج. متابعة؟`
                        );
                        if (!ok) return;
                    }
                } catch { /* ignore */ }
            }

            // 2) امسح كاش Service Worker
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                try {
                    navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
                } catch (e) { console.warn('SW CLEAR_CACHE failed', e); }
            }

            // 3) ✅ [AUTH-3] إنهاء الجلسة — global أولاً ثم local
            let signOutOk = false;
            try {
                const { error } = await window.DB.client.auth.signOut({ scope: 'global' });
                if (!error) signOutOk = true;
                else console.warn('signOut(global) returned error', error);
            } catch (e) {
                console.warn('signOut(global) threw', e);
            }
            if (!signOutOk) {
                try {
                    await window.DB.client.auth.signOut({ scope: 'local' });
                    signOutOk = true;
                } catch (e2) {
                    console.error('signOut(local) also failed', e2);
                }
            }

            // 4) امسح البيانات المحلية (دائمًا، حتى لو فشل signOut)
            try {
                await window.DB.wipeLocalData({ includePendingQueue: true });
            } catch (e) {
                console.warn('wipe failed', e);
            }

            // 5) امسح علامة المستخدم السابق
            try { localStorage.removeItem(PREV_USER_KEY); } catch { /* ignore */ }

            // 6) ✅ [AUTH-FIX-2] _notify قبل clear
            this.user = null;
            this._lastError = { type: 'definitive', reason: 'logged-out' };
            this._notify(null);
            this._listeners.clear();

            // 7) ✅ [AUTH-3] تنبيه المستخدم عند الفشل الكامل
            if (!signOutOk) {
                try {
                    alert(
                        'تم الخروج محليًا، لكن تعذّر إبطال الجلسة على الخادم. ' +
                        'إذا ظهر تسجيل دخول تلقائي، أعد المحاولة مع اتصال أفضل.'
                    );
                } catch { /* ignore */ }
            }

            // 8) أعِد التوجيه إن لزم
            if (!location.pathname.includes('index.html') && location.pathname !== '/') {
                location.href = './index.html';
            }
        },

        /* ============================================
           requireAuth
           ✅ [AUTH-1b] 3 محاولات ثم logout({force:true})
           ============================================ */
        async requireAuth() {
            await this.waitForSession();

            const RETRIES = 3;
            const DELAY_MS = 400;

            for (let attempt = 0; attempt < RETRIES; attempt++) {
                const user = await this.getCurrentUser();
                if (user) return user;

                // فشل نهائي (لا session، لا profile، موقوف) → توقف فورًا
                if (this._lastError?.type === 'definitive') break;

                if (attempt < RETRIES - 1) {
                    await new Promise(r => setTimeout(r, DELAY_MS));
                }
            }

            // فشلت كل المحاولات
            await this.logout({ force: true });
            return null;
        },

        async requireRole(roles = []) {
            const user = await this.getCurrentUser();
            if (!user) return false;
            if (!roles.length) return true;
            return roles.includes(user.role);
        },

        getUser() {
            return this.user;
        },

        getRedirect(user) {
            if (!user) return './index.html';
            if (user.role === 'rep') return './pos.html';
            return './dashboard.html';
        },

        /* ============================================
           resetPassword
           ============================================ */
        async resetPassword(email) {
            if (!window.DB?.client) throw new Error('System not ready');
            if (!email) throw new Error('يرجى إدخال البريد الإلكتروني');
            const { error } = await window.DB.client.auth
                .resetPasswordForEmail(email, { redirectTo: location.origin });
            if (error) throw new Error(this._translateError(error));
            return { success: true };
        },

        /* ============================================
           changePassword
           ============================================ */
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
           _translateError
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
        setTimeout(() => {
            window.Auth.init().catch(e => console.error('Auth init error', e));
        }, 300);
    });
})();
