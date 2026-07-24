/* =============================================
   supabase-auth.js - المصادقة والصلاحيات (محسّن)
   ============================================= */
(function() {
    'use strict';

    // ========== حافظة الجلسة الاحتياطية (إذا لم تُعرف خارجياً) ==========
    if (!window.SessionStore) {
        window.SessionStore = {
            _key: 'hesaby_session',
            get user() {
                try {
                    const data = localStorage.getItem(this._key);
                    return data ? JSON.parse(data) : null;
                } catch { return null; }
            },
            set user(val) {
                try {
                    if (val) localStorage.setItem(this._key, JSON.stringify(val));
                    else localStorage.removeItem(this._key);
                } catch { /* مساحة التخزين ممتلئة */ }
            },
            get tenantId() {
                return this.user?.tenant_id || null;
            },
            restoreSession() {
                // لا يفعل شيء إضافي؛ المستخدم يُسترجع تلقائياً عبر getter
                return this.user;
            }
        };
    }

    // انتظار توفر supabaseClient
    function whenClient() {
        return new Promise(resolve => {
            if (window.supabaseClient) return resolve(window.supabaseClient);
            const check = setInterval(() => {
                if (window.supabaseClient) { clearInterval(check); resolve(window.supabaseClient); }
            }, 100);
        });
    }

    window.App = {
        state: {
            user: null
        },

        /**
         * جلب المستخدم الحالي (مع تحديث الجلسة)
         * @returns {Promise<object|null>} كائن المستخدم أو null إذا لم يسجل الدخول
         */
        async getCurrentUser() {
            const client = window.supabaseClient;
            
            // إذا لم يوجد عميل Supabase، اعتمد على الجلسة المحفوظة
            if (!client) {
                const cached = window.SessionStore.user;
                this.state.user = cached;
                return cached || null;
            }

            try {
                const { data: { session } } = await client.auth.getSession();
                if (!session || !session.user) {
                    this._clearUser();
                    return null;
                }

                const { data: profile, error } = await client
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (error || !profile) {
                    this._clearUser();
                    return null;
                }

                // جلب خطة المتجر بشكل منفصل
                let plan = undefined;
                if (profile.tenant_id) {
                    const { data: tenant } = await client
                        .from('tenants')
                        .select('plan')
                        .eq('id', profile.tenant_id)
                        .maybeSingle();
                    plan = tenant?.plan;
                }

                const user = {
                    id: session.user.id,
                    email: session.user.email,
                    fullName: profile.full_name,
                    role: profile.role,
                    tenant_id: profile.tenant_id,
                    plan: plan
                };

                this._setUser(user);
                return user;
            } catch (error) {
                console.error('getCurrentUser failed', error);
                this._clearUser();
                return null;
            }
        },

        async getTenantId() {
            const user = this.state.user || await this.getCurrentUser();
            return user?.tenant_id || null;
        },

        /**
         * تسجيل الدخول
         * @param {string} email
         * @param {string} password
         * @returns {Promise<object>} { success, redirectUrl, user }
         */
        async login(email, password) {
            if (!navigator.onLine) {
                throw new Error('لا يوجد اتصال بالإنترنت');
            }
            const client = await whenClient();

            const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
            if (authError) throw authError;

            const userId = authData.user.id;

            let { data: profile, error: profileError } = await client
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            if (profileError) {
                console.error('خطأ في جلب الملف الشخصي:', profileError);
                throw new Error('تعذر تحميل بيانات الحساب. حاول مرة أخرى.');
            }

            // إنشاء ملف شخصي تلقائي إذا لم يكن موجوداً
            if (!profile) {
                const { data: newProfile, error: insertError } = await client
                    .from('profiles')
                    .insert({ id: userId, full_name: email, role: 'admin' })
                    .select()
                    .single();
                if (insertError) throw insertError;
                profile = newProfile;
            }

            // إنشاء متجر إذا لم يكن مشرفاً عاماً ولا يملك متجراً
            if (profile.role !== 'super_admin' && !profile.tenant_id) {
                const tenantName = `متجر ${profile.full_name || email}`;
                try {
                    const result = await client.rpc('create_my_tenant', { p_tenant_name: tenantName });
                    if (result.error) throw result.error;
                    // قد تعيد الدالة القيمة مباشرة أو كائن { id }
                    const newTenantId = (result.data && typeof result.data === 'object') ? result.data.id : result.data;
                    if (newTenantId) {
                        profile.tenant_id = newTenantId;
                        await client.from('profiles').update({ tenant_id: newTenantId }).eq('id', userId);
                    }
                } catch (tenantError) {
                    console.error('فشل إنشاء المتجر', tenantError);
                    throw new Error('فشل إنشاء المتجر. يرجى المحاولة لاحقاً.');
                }
            }

            // جلب الخطة
            let plan = undefined;
            if (profile.tenant_id) {
                const { data: tenant } = await client
                    .from('tenants')
                    .select('plan')
                    .eq('id', profile.tenant_id)
                    .maybeSingle();
                plan = tenant?.plan;
            }

            const userInfo = {
                id: userId,
                email: authData.user.email,
                fullName: profile.full_name || email,
                role: profile.role,
                tenant_id: profile.tenant_id,
                plan: plan
            };

            this._setUser(userInfo);

            let redirectUrl = './dashboard.html';
            if (userInfo.role === 'rep') redirectUrl = './pos.html';
            else if (userInfo.role === 'super_admin') redirectUrl = './admin.html';

            return { success: true, redirectUrl, user: userInfo };
        },

        /**
         * إنشاء حساب جديد
         */
        async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') {
            if (!navigator.onLine) {
                throw new Error('لا يوجد اتصال بالإنترنت');
            }
            const client = await whenClient();

            const { data: authData, error: signUpError } = await client.auth.signUp({
                email, password,
                options: { data: { full_name: fullName, phone: phone } }
            });
            if (signUpError) throw signUpError;
            if (!authData.user) throw new Error('فشل إنشاء المستخدم');

            const tenantNameFinal = tenantName || `متجر ${fullName}`;
            const result = await client.rpc('create_my_tenant', { p_tenant_name: tenantNameFinal });
            if (result.error) throw result.error;
            const newTenantId = (result.data && typeof result.data === 'object') ? result.data.id : result.data;

            if (newTenantId) {
                await client.from('profiles').upsert({
                    id: authData.user.id,
                    full_name: fullName,
                    role: role,
                    phone: phone,
                    tenant_id: newTenantId
                }, { onConflict: 'id' });
            }

            if (authData.session) {
                await client.auth.setSession(authData.session);
                return { success: true, message: 'تم إنشاء الحساب وتسجيل الدخول بنجاح.' };
            } else {
                return { success: true, message: 'تم إنشاء الحساب. يرجى التحقق من بريدك الإلكتروني لتأكيد التسجيل.' };
            }
        },

        async logout() {
            const client = window.supabaseClient;
            if (client) {
                try { await client.auth.signOut(); } catch (e) { /* تجاهل */ }
            }
            this._clearUser();
            if (!window.location.pathname.endsWith('index.html')) {
                window.location.href = './index.html';
            } else {
                window.location.reload();
            }
        },

        async requireAuth() {
            const user = await this.getCurrentUser();
            if (!user) {
                this._redirectToLogin();
                return false;
            }
            if (user.role !== 'super_admin' && user.tenant_id) {
                await this.checkTenantStatus(user.tenant_id);
            }
            return true;
        },

        async requireRole(allowedRoles) {
            const user = this.state.user || await this.getCurrentUser();
            if (!user) {
                this._redirectToLogin();
                return false;
            }
            const userRole = (user.role || '').toLowerCase();
            const allowed = allowedRoles.map(r => r.toLowerCase());
            if (!allowed.includes(userRole)) {
                alert('غير مسموح لك بالوصول إلى هذه الصفحة');
                if (userRole === 'admin') window.location.href = './dashboard.html';
                else if (userRole === 'rep') window.location.href = './pos.html';
                else window.location.href = './index.html';
                return false;
            }
            return true;
        },

        async checkTenantStatus(tenantId) {
            const client = window.supabaseClient;
            if (!client) return;
            try {
                const { data: tenant, error } = await client
                    .from('tenants')
                    .select('plan')
                    .eq('id', tenantId)
                    .maybeSingle();
                if (error) throw error;
                if (tenant && tenant.plan === 'expired') {
                    alert('انتهت صلاحية الاشتراك. يرجى التجديد.');
                    window.location.href = './expired.html';
                }
            } catch (e) {
                console.warn('تعذر التحقق من حالة الاشتراك:', e);
            }
        },

        initUserInterface() {
            if (!this.state.user) {
                const cached = window.SessionStore.user;
                if (cached) this.state.user = cached;
            }
            // إذا لم يتوفر مستخدم، نحاول جلبه (غير متزامن لكن نملأ الحقول لاحقاً)
            if (!this.state.user) {
                this.getCurrentUser().then(user => {
                    if (user) this._fillUserUI(user);
                });
                return;
            }
            this._fillUserUI(this.state.user);
        },

        _fillUserUI(user) {
            const nameEl = document.getElementById('userName');
            const avatarEl = document.getElementById('userAvatar');
            const timeEl = document.getElementById('loginTime');
            if (nameEl) nameEl.textContent = user.fullName || user.email;
            if (avatarEl) avatarEl.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
            if (timeEl) timeEl.textContent = new Date().toLocaleString('ar-EG');
        },

        /* ---------- دوال داخلية ---------- */
        _setUser(user) {
            this.state.user = user;
            window.SessionStore.user = user;
        },

        _clearUser() {
            this.state.user = null;
            window.SessionStore.user = null;
        },

        _redirectToLogin() {
            if (!window.location.pathname.endsWith('index.html')) {
                window.location.href = './index.html';
            }
        }
    };

    // مراقبة تغيرات المصادقة
    window.addEventListener('load', () => {
        const client = window.supabaseClient;
        if (client) {
            client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
                    window.App._clearUser();
                } else if (event === 'SIGNED_IN' && session) {
                    window.App.getCurrentUser().catch(() => {});
                }
            });
        }
    });
})();
