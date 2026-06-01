/* =============================================
   supabase-auth.js - المصادقة والصلاحيات (محسّن)
   ============================================= */
(function() {
    'use strict';

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
        /**
         * جلب المستخدم الحالي (مع تحديث الجلسة)
         * @returns {object|null} كائن المستخدم أو null إذا لم يسجل الدخول
         */
        async getCurrentUser() {
            const client = window.supabaseClient;
            if (!client) {
                // بدون عميل Supabase، نحاول استعادة الجلسة من localStorage
                return window.SessionStore.restoreSession() ? window.SessionStore.user : null;
            }

            // إذا كان لدينا مستخدم في الذاكرة، نتحقق من صحته عبر السيرفر
            if (window.SessionStore.user) {
                this._refreshSession().catch(() => {});
                return window.SessionStore.user;
            }

            try {
                const { data: { session } } = await client.auth.getSession();
                if (!session) {
                    window.SessionStore.user = null;
                    return null;
                }

                const { data: profile, error } = await client
                    .from('profiles')
                    .select('*, tenants!inner(plan)')
                    .eq('id', session.user.id)
                    .maybeSingle(); // استخدام maybeSingle لتجنب خطأ 406

                if (error || !profile) {
                    window.SessionStore.user = null;
                    return null;
                }

                const user = {
                    id: session.user.id,
                    email: session.user.email,
                    fullName: profile.full_name,
                    role: profile.role,
                    tenant_id: profile.tenant_id,
                    plan: profile.tenants?.plan
                };
                window.SessionStore.user = user;
                return user;
            } catch (error) {
                console.error('getCurrentUser failed', error);
                window.SessionStore.user = null;
                return null;
            }
        },

        async _refreshSession() {
            const client = window.supabaseClient;
            if (!client) return;
            try {
                const { data: { session } } = await client.auth.getSession();
                if (!session || !session.user || window.SessionStore.user?.id !== session.user.id) {
                    window.SessionStore.user = null;
                }
            } catch (e) {
                // فشل التجديد بصمت
            }
        },

        async getTenantId() {
            return window.SessionStore.tenantId || (await this.getCurrentUser())?.tenant_id || null;
        },

        /**
         * تسجيل الدخول
         * @param {string} email
         * @param {string} password
         * @returns {object} { success, redirectUrl, user }
         */
        async login(email, password) {
            if (!navigator.onLine) {
                throw new Error('لا يوجد اتصال بالإنترنت');
            }
            const client = await whenClient();

            // 1. مصادقة
            const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
            if (authError) throw authError;

            const userId = authData.user.id;

            // 2. جلب الملف الشخصي
            let { data: profile } = await client
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();

            // 3. إذا لم يوجد ملف شخصي، ننشئ واحداً
            if (!profile) {
                const { data: newProfile, error: insertError } = await client
                    .from('profiles')
                    .insert({ id: userId, full_name: email, role: 'rep' }) // دور افتراضي مندوب
                    .select()
                    .single();
                if (insertError) throw insertError;
                profile = newProfile || { id: userId, full_name: email, role: 'rep' };
            }

            // 4. إذا لم يكن super_admin وليس لديه tenant، أنشئ له متجراً
            if (profile.role !== 'super_admin' && !profile.tenant_id) {
                const tenantName = `متجر ${profile.full_name || email}`;
                try {
                    const { data: newTenantId, error: tenantError } = await client.rpc('create_my_tenant', { p_tenant_name: tenantName });
                    if (tenantError) throw tenantError;
                    profile.tenant_id = newTenantId;
                    // تحديث الملف الشخصي بالـ tenant_id
                    await client.from('profiles').update({ tenant_id: newTenantId }).eq('id', userId);
                } catch (tenantError) {
                    console.error('فشل إنشاء المتجر', tenantError);
                    throw new Error('فشل إنشاء المتجر. يرجى المحاولة لاحقاً.');
                }
            }

            const userInfo = {
                id: userId,
                email: authData.user.email,
                fullName: profile.full_name || email,
                role: profile.role,
                tenant_id: profile.tenant_id,
                plan: undefined
            };
            window.SessionStore.user = userInfo;

            // 5. تحديد صفحة التحويل
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

            // 1. إنشاء المستخدم
            const { data: authData, error: signUpError } = await client.auth.signUp({
                email, password,
                options: { data: { full_name: fullName, phone: phone } }
            });
            if (signUpError) throw signUpError;
            if (!authData.user) throw new Error('فشل إنشاء المستخدم');

            // 2. إنشاء المتجر
            const tenantNameFinal = tenantName || `متجر ${fullName}`;
            const { data: tenantId, error: tenantError } = await client.rpc('create_my_tenant', { p_tenant_name: tenantNameFinal });
            if (tenantError) throw tenantError;

            // 3. إنشاء الملف الشخصي مع tenant_id
            await client.from('profiles').upsert({
                id: authData.user.id,
                full_name: fullName,
                role: role,
                phone: phone,
                tenant_id: tenantId
            }, { onConflict: 'id' });

            // 4. تسجيل الدخول تلقائياً
            await client.auth.signInWithPassword({ email, password });

            return { success: true, message: 'تم إنشاء الحساب بنجاح.' };
        },

        async logout() {
            const client = window.supabaseClient;
            if (client) {
                try {
                    await client.auth.signOut();
                } catch (e) { /* تجاهل */ }
            }
            window.SessionStore.user = null;
            // إعادة التوجيه لصفحة الدخول
            if (window.location.pathname.indexOf('index.html') === -1) {
                window.location.href = './index.html';
            } else {
                window.location.reload();
            }
        },

        /**
         * يتطلب مصادقة (يُستخدم كحارس للصفحات)
         * @returns {boolean} true إذا كان مسجلاً الدخول
         */
        async requireAuth() {
            // إذا كان لدينا مستخدم مبدئياً، نعتمد عليه
            if (window.SessionStore.user) {
                // تحقق خلفي للتأكد من أن الجلسة لا تزال صالحة
                this.getCurrentUser().then(user => {
                    if (!user) this._redirectToLogin();
                    else if (user.role !== 'super_admin' && user.tenant_id) {
                        this.checkTenantStatus(user.tenant_id).catch(() => {});
                    }
                }).catch(() => {});
                return true;
            }

            try {
                const user = await this.getCurrentUser();
                if (!user) {
                    this._redirectToLogin();
                    return false;
                }
                if (user.role !== 'super_admin' && user.tenant_id) {
                    await this.checkTenantStatus(user.tenant_id);
                }
                return true;
            } catch (error) {
                console.error('requireAuth failed', error);
                this._redirectToLogin();
                return false;
            }
        },

        _redirectToLogin() {
            // لا تعيد التوجيه إذا كنا بالفعل في صفحة الدخول
            if (window.location.pathname.indexOf('index.html') === -1) {
                window.location.href = './index.html';
            }
        },

        async checkTenantStatus(tenantId) {
            const client = window.supabaseClient;
            if (!client) return;
            try {
                const { data: tenant } = await client
                    .from('tenants')
                    .select('plan')
                    .eq('id', tenantId)
                    .maybeSingle();
                if (tenant && tenant.plan === 'expired') {
                    alert('انتهت صلاحية الاشتراك. يرجى التجديد.');
                    window.location.href = './expired.html';
                }
            } catch (e) { /* فشل صامت */ }
        },

        /**
         * التحقق من صلاحية الدور
         * @param {string[]} allowedRoles الأدوار المسموحة
         * @returns {boolean}
         */
        async requireRole(allowedRoles) {
            let user = window.SessionStore.user || await this.getCurrentUser();
            if (!user) {
                this._redirectToLogin();
                return false;
            }
            const userRole = (user.role || '').toLowerCase();
            const allowed = allowedRoles.map(r => r.toLowerCase());
            if (!allowed.includes(userRole)) {
                alert('غير مسموح لك بالوصول إلى هذه الصفحة');
                // إعادة توجيه حسب الدور
                if (userRole === 'admin') window.location.href = './dashboard.html';
                else if (userRole === 'rep') window.location.href = './pos.html';
                else window.location.href = './index.html';
                return false;
            }
            return true;
        },

        /**
         * تحديث عناصر واجهة المستخدم من بيانات الجلسة
         */
        initUserInterface() {
            const user = window.SessionStore.user;
            // إذا لم يوجد مستخدم في الذاكرة، حاول استعادته
            if (!user) {
                window.SessionStore.restoreSession();
            }
            const currentUser = window.SessionStore.user;
            if (currentUser) {
                const nameEl = document.getElementById('userName');
                const avatarEl = document.getElementById('userAvatar');
                const timeEl = document.getElementById('loginTime');
                if (nameEl) nameEl.textContent = currentUser.fullName || currentUser.email;
                if (avatarEl) avatarEl.textContent = (currentUser.fullName || 'U').charAt(0).toUpperCase();
                if (timeEl) timeEl.textContent = new Date().toLocaleString('ar-EG'); // استخدام الوقت الحالي
            }
        }
    };

    // مراقبة تغيرات المصادقة
    window.addEventListener('load', () => {
        const client = window.supabaseClient;
        if (client) {
            client.auth.onAuthStateChange((event, session) => {
                if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
                    window.SessionStore.user = null;
                } else if (event === 'SIGNED_IN' && session) {
                    window.App.getCurrentUser().catch(() => {});
                }
            });
        }
    });
})();
