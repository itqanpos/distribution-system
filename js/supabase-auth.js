/* =============================================
   supabase-auth.js - المصادقة والصلاحيات (محسّن)
   ============================================= */
(function() {
    'use strict';

    // ---------- انتظار توفر عميل Supabase ----------
    function whenClient() {
        return new Promise(resolve => {
            if (window.supabaseClient) return resolve(window.supabaseClient);
            const check = setInterval(() => {
                if (window.supabaseClient) {
                    clearInterval(check);
                    resolve(window.supabaseClient);
                }
            }, 100);
        });
    }

    // ---------- كائن التطبيق العام ----------
    window.App = {

        /**
         * جلب المستخدم الحالي مع التحقق من صحة الجلسة عبر الخادم
         * @returns {Promise<object|null>} كائن المستخدم أو null
         */
        async getCurrentUser() {
            const client = window.supabaseClient;

            // إذا لم يوجد عميل Supabase، نحاول الاستعادة من التخزين المحلي فقط
            if (!client) {
                window.SessionStore.restoreSession();
                return window.SessionStore.user || null;
            }

            // إجبار تحديث الجلسة قبل إعادة أي بيانات مخزّنة
            try {
                const { data: { session } } = await client.auth.getSession();
                if (!session || !session.user) {
                    window.SessionStore.user = null;
                    return null;
                }

                // جلب الملف الشخصي مع المتجر (ربط يساري لتضمين super_admin)
                const { data: profile, error } = await client
                    .from('profiles')
                    .select('*, tenants(plan)')  // left join تلقائي
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (error) {
                    console.error('خطأ في جلب الملف الشخصي:', error);
                    window.SessionStore.user = null;
                    return null;
                }

                if (!profile) {
                    // لا يوجد ملف شخصي – حساب غير مكتمل
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
                console.error('فشل getCurrentUser:', error);
                window.SessionStore.user = null;
                return null;
            }
        },

        async getTenantId() {
            const user = window.SessionStore.user || await this.getCurrentUser();
            return user?.tenant_id || null;
        },

        /**
         * تسجيل الدخول
         * @param {string} email
         * @param {string} password
         * @returns {Promise<object>} { success, redirectUrl, user }
         */
        async login(email, password) {
            if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');

            const client = await whenClient();

            // 1. المصادقة
            const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
            if (authError) throw authError;
            if (!authData.user) throw new Error('فشلت المصادقة');

            const userId = authData.user.id;

            // 2. جلب الملف الشخصي مع معالجة الأخطاء
            const { data: profile, error: profileError } = await client
                .from('profiles')
                .select('*, tenants(plan)')
                .eq('id', userId)
                .maybeSingle();

            if (profileError) {
                console.error('خطأ في جلب الملف الشخصي:', profileError);
                throw new Error('تعذر تحميل بيانات الحساب. حاول مرة أخرى.');
            }

            if (!profile) {
                // لا ملف شخصي ← الحساب غير مكتمل الإعداد
                throw new Error('الحساب غير مكتمل. الرجاء إتمام التسجيل أولاً.');
            }

            // 3. التأكد من وجود متجر (لغير المشرف العام)
            if (profile.role !== 'super_admin' && !profile.tenant_id) {
                const tenantName = `متجر ${profile.full_name || email}`;
                try {
                    const { data: newTenantId, error: tenantError } = await client.rpc('create_my_tenant', { p_tenant_name: tenantName });
                    if (tenantError) throw tenantError;
                    profile.tenant_id = newTenantId;
                    await client.from('profiles').update({ tenant_id: newTenantId }).eq('id', userId);
                } catch (tenantError) {
                    console.error('فشل إنشاء المتجر:', tenantError);
                    throw new Error('فشل إنشاء المتجر. يرجى المحاولة لاحقاً.');
                }
            }

            // 4. بناء كائن المستخدم
            const userInfo = {
                id: userId,
                email: authData.user.email,
                fullName: profile.full_name || email,
                role: profile.role,
                tenant_id: profile.tenant_id,
                plan: profile.tenants?.plan
            };
            window.SessionStore.user = userInfo;

            // 5. تحديد مسار إعادة التوجيه حسب الدور
            let redirectUrl = './dashboard.html';
            if (userInfo.role === 'rep') redirectUrl = './pos.html';
            else if (userInfo.role === 'super_admin') redirectUrl = './admin.html';

            return { success: true, redirectUrl, user: userInfo };
        },

        /**
         * إنشاء حساب جديد
         */
        async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') {
            if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');

            const client = await whenClient();

            // 1. إنشاء المستخدم
            const { data: authData, error: signUpError } = await client.auth.signUp({
                email,
                password,
                options: { data: { full_name: fullName, phone } }
            });
            if (signUpError) throw signUpError;
            if (!authData.user) throw new Error('فشل إنشاء المستخدم');

            // 2. إنشاء المتجر
            const tenantNameFinal = tenantName || `متجر ${fullName}`;
            let tenantId;
            try {
                const { data, error: tenantError } = await client.rpc('create_my_tenant', { p_tenant_name: tenantNameFinal });
                if (tenantError) throw tenantError;
                tenantId = data;
            } catch (tenantError) {
                // فشل إنشاء المتجر → نحذف المستخدم (تنظيف)
                console.error('فشل إنشاء المتجر – جارٍ حذف المستخدم:', tenantError);
                await client.auth.admin.deleteUser(authData.user.id).catch(() => {});
                throw new Error('فشل إنشاء المتجر. يرجى المحاولة لاحقاً.');
            }

            // 3. إنشاء/تحديث الملف الشخصي
            const { error: profileError } = await client.from('profiles').upsert({
                id: authData.user.id,
                full_name: fullName,
                role: role,
                phone: phone,
                tenant_id: tenantId
            }, { onConflict: 'id' });
            if (profileError) throw profileError;

            // 4. تسجيل الدخول التلقائي (إذا لم يتطلب تأكيد البريد)
            if (authData.session) {
                // الجلسة موجودة، يمكن المتابعة
                await client.auth.setSession(authData.session);
            } else {
                // البريد بحاجة للتأكيد – نبلغ المستخدم
                return { success: true, message: 'تم إنشاء الحساب. يرجى التحقق من بريدك الإلكتروني لتأكيد التسجيل.' };
            }

            return { success: true, message: 'تم إنشاء الحساب وتسجيل الدخول بنجاح.' };
        },

        /**
         * تسجيل الخروج
         */
        async logout() {
            const client = window.supabaseClient;
            if (client) {
                try { await client.auth.signOut(); } catch (e) { /* تجاهل */ }
            }
            window.SessionStore.user = null;
            // إعادة التوجيه إلى صفحة الدخول إذا لم نكن فيها
            if (!window.location.pathname.endsWith('index.html')) {
                window.location.href = './index.html';
            } else {
                window.location.reload();
            }
        },

        /**
         * حارس المصادقة للصفحات المحمية
         * @returns {Promise<boolean>} هل المستخدم مسجّل الدخول؟
         */
        async requireAuth() {
            // تحديث كامل للمستخدم
            const user = await this.getCurrentUser();
            if (!user) {
                this._redirectToLogin();
                return false;
            }
            // التحقق من حالة المتجر لغير المشرفين
            if (user.role !== 'super_admin' && user.tenant_id) {
                await this.checkTenantStatus(user.tenant_id);
            }
            return true;
        },

        _redirectToLogin() {
            if (!window.location.pathname.endsWith('index.html')) {
                window.location.href = './index.html';
            }
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

        /**
         * التحقق من صلاحية الدور
         * @param {string[]} allowedRoles الأدوار المسموحة
         * @returns {Promise<boolean>}
         */
        async requireRole(allowedRoles) {
            const user = window.SessionStore.user || await this.getCurrentUser();
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

        /**
         * تحديث عناصر واجهة المستخدم من بيانات الجلسة
         */
        initUserInterface() {
            // محاولة استعادة الجلسة إذا لم تكن محفوظة
            if (!window.SessionStore.user) {
                window.SessionStore.restoreSession();
            }
            const user = window.SessionStore.user;
            if (user) {
                const nameEl = document.getElementById('userName');
                const avatarEl = document.getElementById('userAvatar');
                const timeEl = document.getElementById('loginTime');
                if (nameEl) nameEl.textContent = user.fullName || user.email;
                if (avatarEl) avatarEl.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
                if (timeEl) timeEl.textContent = new Date().toLocaleString('ar-EG');
            }
        }
    };

    // ---------- مراقبة تغيرات حالة المصادقة ----------
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
