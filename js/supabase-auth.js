/* =============================================
   supabase-auth.js - المصادقة والصلاحيات (مصحح)
   ============================================= */
(function() {
    'use strict';

    function whenClient() {
        return new Promise(resolve => {
            if (window.supabaseClient) return resolve(window.supabaseClient);
            const check = setInterval(() => {
                if (window.supabaseClient) { clearInterval(check); resolve(window.supabaseClient); }
            }, 100);
        });
    }

    window.App = {
        async getCurrentUser() {
            const client = window.supabaseClient;
            if (!client) {
                window.SessionStore.restoreSession();
                return window.SessionStore.user || null;
            }
            try {
                const { data: { session } } = await client.auth.getSession();
                if (!session || !session.user) {
                    window.SessionStore.user = null;
                    return null;
                }
                const { data: profile, error } = await client
                    .from('profiles')
                    .select('*')
                    .eq('id', session.user.id)
                    .maybeSingle();
                if (error || !profile) {
                    window.SessionStore.user = null;
                    return null;
                }
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
                window.SessionStore.user = user;
                return user;
            } catch (e) {
                console.error('getCurrentUser failed', e);
                window.SessionStore.user = null;
                return null;
            }
        },

        async getTenantId() {
            return window.SessionStore.tenantId || (await this.getCurrentUser())?.tenant_id || null;
        },

        async login(email, password) {
            if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
            const client = await whenClient();
            const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
            if (authError) throw authError;
            const userId = authData.user.id;
            const { data: profile, error: profileError } = await client
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .maybeSingle();
            if (profileError) throw new Error('تعذر تحميل بيانات الحساب');
            if (!profile) {
                const { data: newProfile, error: insertError } = await client
                    .from('profiles')
                    .insert({ id: userId, full_name: email, role: 'admin' })
                    .select()
                    .single();
                if (insertError) throw insertError;
                profile = newProfile;
            }
            if (profile.role !== 'super_admin' && !profile.tenant_id) {
                const tenantName = `متجر ${profile.full_name || email}`;
                try {
                    const { data: newTenantId, error: tenantError } = await client.rpc('create_my_tenant', { p_tenant_name: tenantName });
                    if (tenantError) throw tenantError;
                    profile.tenant_id = newTenantId;
                    await client.from('profiles').update({ tenant_id: newTenantId }).eq('id', userId);
                } catch (e) {
                    console.error('فشل إنشاء المتجر', e);
                    throw new Error('فشل إنشاء المتجر');
                }
            }
            let plan = undefined;
            if (profile.tenant_id) {
                const { data: tenant } = await client.from('tenants').select('plan').eq('id', profile.tenant_id).maybeSingle();
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
            window.SessionStore.user = userInfo;
            let redirectUrl = './dashboard.html';
            if (userInfo.role === 'rep') redirectUrl = './pos.html';
            else if (userInfo.role === 'super_admin') redirectUrl = './admin.html';
            return { success: true, redirectUrl, user: userInfo };
        },

        async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') {
            if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
            const client = await whenClient();
            const { data: authData, error: signUpError } = await client.auth.signUp({
                email, password,
                options: { data: { full_name: fullName, phone: phone } }
            });
            if (signUpError) throw signUpError;
            if (!authData.user) throw new Error('فشل إنشاء المستخدم');
            const tenantNameFinal = tenantName || `متجر ${fullName}`;
            const { data: tenantId, error: tenantError } = await client.rpc('create_my_tenant', { p_tenant_name: tenantNameFinal });
            if (tenantError) throw tenantError;
            await client.from('profiles').upsert({
                id: authData.user.id,
                full_name: fullName,
                role: role,
                phone: phone,
                tenant_id: tenantId
            }, { onConflict: 'id' });
            if (authData.session) {
                await client.auth.setSession(authData.session);
                return { success: true, message: 'تم إنشاء الحساب وتسجيل الدخول بنجاح.' };
            } else {
                return { success: true, message: 'تم إنشاء الحساب. يرجى التحقق من بريدك الإلكتروني.' };
            }
        },

        async logout() {
            const client = window.supabaseClient;
            if (client) {
                try { await client.auth.signOut(); } catch (e) {}
            }
            window.SessionStore.user = null;
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

        initUserInterface() {
            if (!window.SessionStore.user) window.SessionStore.restoreSession();
            const user = window.SessionStore.user;
            if (user) {
                const nameEl = document.getElementById('userName');
                const avatarEl = document.getElementById('userAvatar');
                const timeEl = document.getElementById('loginTime');
                if (nameEl) nameEl.textContent = user.fullName || user.email;
                if (avatarEl) avatarEl.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
                if (timeEl) timeEl.textContent = new Date().toLocaleString('en-US');
            }
        }
    };

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
