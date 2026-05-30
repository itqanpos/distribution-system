/* =============================================
   supabase-auth.js - المصادقة والصلاحيات
   ============================================= */
(function() {
    'use strict';

    // ينتظر حتى تصبح supabaseClient متاحة
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
            if (!client) return null;

            if (window.SessionStore.user) {
                this._refreshSession().catch(() => {});
                return window.SessionStore.user;
            }

            try {
                const { data: { session } } = await client.auth.getSession();
                if (!session) { window.SessionStore.user = null; return null; }

                const { data: profile, error } = await client
                    .from('profiles')
                    .select('*, tenants!inner(plan)')
                    .eq('id', session.user.id)
                    .single();

                if (error || !profile) { window.SessionStore.user = null; return null; }

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
            const { data: { session } } = await client.auth.getSession();
            if (!session || !session.user || window.SessionStore.user?.id !== session.user.id) {
                window.SessionStore.user = null;
            }
        },

        async getTenantId() {
            return window.SessionStore.tenantId || (await this.getCurrentUser())?.tenant_id || null;
        },

        async login(email, password) {
            const client = await whenClient();
            const { data: authData, error: authError } = await client.auth.signInWithPassword({ email, password });
            if (authError) throw authError;

            const userId = authData.user.id;
            let { data: profile } = await client
                .from('profiles')
                .select('*')
                .eq('id', userId)
                .single();

            if (!profile) {
                const { data: newProfile, error: insertError } = await client
                    .from('profiles')
                    .insert({ id: userId, full_name: email, role: 'admin' })
                    .select()
                    .single();
                if (insertError) throw insertError;
                profile = newProfile || { id: userId, full_name: email, role: 'admin' };
            }

            if (profile.role !== 'super_admin' && !profile.tenant_id) {
                const tenantName = `متجر ${profile.full_name || email}`;
                const { data: newTenantId, error: tenantError } = await client.rpc('create_my_tenant', { p_tenant_name: tenantName });
                if (tenantError) throw new Error('فشل إنشاء المتجر');
                profile.tenant_id = newTenantId;
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

            let redirectUrl = './dashboard.html';
            if (userInfo.role === 'rep') redirectUrl = './pos.html';
            else if (userInfo.role === 'super_admin') redirectUrl = './admin.html';

            return { success: true, redirectUrl, user: userInfo };
        },

        async signup(email, password, fullName, role = 'admin', tenantName = '', phone = '') {
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
                id: authData.user.id, full_name: fullName, role: role, phone: phone, tenant_id: tenantId
            }, { onConflict: 'id' });

            await client.auth.signInWithPassword({ email, password });
            return { success: true, message: 'تم إنشاء الحساب بنجاح.' };
        },

        async logout() {
            const client = window.supabaseClient;
            if (client) await client.auth.signOut();
            window.SessionStore.user = null;
            window.location.href = './index.html';
        },

        async requireAuth() {
            if (window.SessionStore.user) {
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
                if (!user) { this._redirectToLogin(); return false; }
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
                    .single();
                if (tenant && tenant.plan === 'expired') {
                    window.location.href = './expired.html';
                }
            } catch (e) { /* skip */ }
        },

        async requireRole(allowedRoles) {
            let user = window.SessionStore.user || await this.getCurrentUser();
            if (!user) { this._redirectToLogin(); return false; }
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
            const session = JSON.parse(localStorage.getItem('app_session') || '{}');
            if (session && session.fullName) {
                const nameEl = document.getElementById('userName');
                const avatarEl = document.getElementById('userAvatar');
                const timeEl = document.getElementById('loginTime');
                if (nameEl) nameEl.textContent = session.fullName || session.email;
                if (avatarEl) avatarEl.textContent = (session.fullName || 'U').charAt(0).toUpperCase();
                if (timeEl) timeEl.textContent = session.loginTime || 'اليوم';
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
