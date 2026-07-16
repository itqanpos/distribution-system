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
         * @returns {Promise<object|null>} كائن المستخدم أو null إذا لم يسجل الدخول
         */
        async getCurrentUser() {
            const client = window.supabaseClient;
            if (!client) {
                // بدون عميل Supabase، نحاول استعادة الجلسة من localStorage
                window.SessionStore.restoreSession();
                return window.SessionStore.user || null;
            }

            try {
                // 1. جلب الجلسة الحالية من Supabase
                const { data: { session } } = await client.auth.getSession();
                if (!session || !session.user) {
                    window.SessionStore.user = null;
                    return null;
                }

                // 2. جلب الملف الشخصي بدون استخدام علاقة tenants (لتجنب أخطاء الأقواس)
                const { data: profile, error } = await client
                    .from('profiles')
                    .select('*')                         // فقط بيانات profile
                    .eq('id', session.user.id)
                    .maybeSingle();

                if (error || !profile) {
                    window.SessionStore.user = null;
                    return null;
                }

                // 3. جلب خطة المتجر (tenants) بشكل منفصل إذا وُجد tenant_id
                let plan = undefined;
                if (profile.tenant_id) {
                    const { data: tenant } = await client
                        .from('tenants')
                        .select('plan')
                        .eq('id', profile.tenant_id)
                        .maybeSingle();
                    plan = tenant?.plan;
                }

                // 4. بناء كائن المستخدم
                const user = {
                    id: session.user.id,
                    email: session.user.email,
                    fullName: profile.full_name,
                    role: profile.role,
                    tenant_id: profile.tenant_id,
                    plan: plan
                };
                window.SessionStore.user = user;
                return user;
            } catch (error) {
                console.error('getCurrentUser failed', error);
                window.SessionStore.user = null;
                return null;
            }
        },

        async getTenantId() {
            return window.SessionStore.tenantId || (await this.getCurrentUser())?.tenant_id || null;
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

            // 1. مصادقة
            const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
            if (authError) throw authError;

            const userId = authData.user.id;

            // 2. جلب الملف الشخصي (مع معالجة الأخطاء)
            const { data: profile, error: profileError } = await client
                .from('profiles')
                .select('*')                   // بدون tenants(plan) المسبب للخطأ
                .eq('id', userId)
                .maybeSingle();

            if (profileError) {
                console.error('خطأ في جلب الملف الشخصي:', profileError);
                throw new Error('تعذر تحميل بيانات الحساب. حاول مرة أخرى.');
            }

            // 3. إذا لم يوجد ملف شخصي، ننشئ واحداً (للحسابات القديمة)
            if (!profile) {
                const { data: newProfile, error: insertError } = await client
                    .from('profiles')
                    .insert({ id: userId, full_name: email, role: 'admin' }) // admin افتراضي أكثر أماناً
                    .select()
                    .single();
                if (insertError) throw insertError;
                profile = newProfile || { id: userId, full_name: email, role: 'admin' };
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

            // 5. جلب الخطة بشكل منفصل إذا وُجد tenant_id
            let plan = undefined;
            if (profile.tenant_id) {
                const { data: tenant } = await client
                    .from('tenants')
                    .select('plan')
                    .eq('id', profile.tenant_id)
                    .maybeSingle();
                plan = tenant?.plan;
            }

            // 6. بناء معلومات المستخدم
            const userInfo = {
                id: userId,
                email: authData.user.email,
                fullName: profile.full_name || email,
                role: profile.role,
                tenant_id: profile.tenant_id,
                plan: plan
            };
            window.SessionStore.user = userInfo;

            // 7. تحديد صفحة التحويل
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

            // 4. تسجيل الدخول تلقائياً (إن لم يتطلب تأكيد البريد)
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
                try {
                    await client.auth.signOut();
                } catch (e) { /* تجاهل */ }
            }
            window.SessionStore.user = null;
            // إعادة التوجيه لصفحة الدخول
            if (!window.location.pathname.endsWith('index.html')) {
                window.location.href = './index.html';
            } else {
                window.location.reload();
            }
        },

        /**
         * يتطلب مصادقة (يُستخدم كحارس للصفحات)
         * @returns {Promise<boolean>} true إذا كان مسجلاً الدخول
         */
        async requireAuth() {
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
