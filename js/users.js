/* =============================================
   users.js - Users Management Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ Permissions Map ============ */
    const ROLE_PERMISSIONS = {
        admin: {
            label: 'مدير',
            description: 'كل الصلاحيات',
            permissions: [
                { key: 'pos', label: 'نقطة البيع', allowed: true },
                { key: 'products', label: 'المنتجات', allowed: true },
                { key: 'customers', label: 'العملاء', allowed: true },
                { key: 'suppliers', label: 'الموردين', allowed: true },
                { key: 'invoices', label: 'الفواتير', allowed: true },
                { key: 'purchases', label: 'المشتريات', allowed: true },
                { key: 'returns', label: 'المرتجعات', allowed: true },
                { key: 'reports', label: 'التقارير', allowed: true },
                { key: 'cashbox', label: 'الصندوق', allowed: true },
                { key: 'accounting', label: 'المحاسبة', allowed: true },
                { key: 'users', label: 'المستخدمين', allowed: true },
                { key: 'settings', label: 'الإعدادات', allowed: true },
                { key: 'price_edit', label: 'تعديل الأسعار', allowed: true },
                { key: 'discount', label: 'منح خصم', allowed: true },
                { key: 'delete_invoice', label: 'حذف فاتورة', allowed: true },
                { key: 'view_profit', label: 'رؤية الأرباح', allowed: true }
            ]
        },
        rep: {
            label: 'مندوب',
            description: 'نقطة البيع فقط',
            permissions: [
                { key: 'pos', label: 'نقطة البيع', allowed: true },
                { key: 'products', label: 'المنتجات', allowed: false },
                { key: 'customers', label: 'العملاء', allowed: false },
                { key: 'suppliers', label: 'الموردين', allowed: false },
                { key: 'invoices', label: 'الفواتير', allowed: false },
                { key: 'purchases', label: 'المشتريات', allowed: false },
                { key: 'returns', label: 'المرتجعات', allowed: false },
                { key: 'reports', label: 'التقارير', allowed: false },
                { key: 'cashbox', label: 'الصندوق', allowed: false },
                { key: 'accounting', label: 'المحاسبة', allowed: false },
                { key: 'users', label: 'المستخدمين', allowed: false },
                { key: 'settings', label: 'الإعدادات', allowed: false },
                { key: 'price_edit', label: 'تعديل الأسعار', allowed: false },
                { key: 'discount', label: 'منح خصم', allowed: true },
                { key: 'delete_invoice', label: 'حذف فاتورة', allowed: false },
                { key: 'view_profit', label: 'رؤية الأرباح', allowed: false }
            ]
        }
    };

    /* ============ State ============ */
    const State = {
        users: [],
        filtered: [],
        currentUser: null,
        editingId: null,
        deletingId: null,
        viewingId: null,
        filters: {
            search: '',
            role: '',
            status: ''
        }
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Users init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (!window.DB?.client) {
            console.error('❌ Supabase غير محمّل');
            showToast('تعذر الاتصال بالخادم', 'error');
            return;
        }

        await new Promise(r => setTimeout(r, 300));

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;

            // ✅ التحقق من الصلاحية: فقط المدير يمكنه إدارة المستخدمين
            const role = (State.currentUser.role || '').toLowerCase();
            if (role !== 'admin' && role !== 'super_admin') {
                showToast('غير مصرح لك بالوصول لهذه الصفحة', 'error');
                setTimeout(() => {
                    window.location.href = './pos.html';
                }, 1500);
                return;
            }
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadUsers();
        hideLoadingBar();
        console.log('✅ Users ready');
    }

    /* ============================================
       Load Users
       ============================================ */
    async function loadUsers() {
        showSkeleton();
        try {
            // Fetch users from Supabase profiles table
            const client = window.DB?.client;
            if (!client) throw new Error('Supabase not available');

            const tenantId = State.currentUser?.tenant_id;

            let query = client
                .from('profiles')
                .select('*')
                .is('deleted_at', null)
                .order('created_at', { ascending: false });

            // فلترة حسب المستأجر (ما عدا super_admin)
            if (tenantId && State.currentUser.role !== 'super_admin') {
                query = query.eq('tenant_id', tenantId);
            }

            const { data, error } = await query;

            if (error) throw error;

            State.users = data || [];

            console.log('👥 Users:', State.users.length);

            renderSummary();
            applyFilters();
        } catch (e) {
            console.error('Load users error:', e);
            showToast('تعذر تحميل المستخدمين', 'error');
            showEmpty(true);
        } finally {
            hideSkeleton();
        }
    }

    /* ============================================
       Summary
       ============================================ */
    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const total = State.users.length;
        const admins = State.users.filter(u => u.role === 'admin').length;
        const reps = State.users.filter(u => u.role === 'rep').length;
        const activeCount = State.users.filter(u => u.is_active !== false).length;

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon blue">
                    <i class="fas fa-users"></i>
                </div>
                <div class="summary-card__info">
                    <label>إجمالي المستخدمين</label>
                    <span>${total}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon blue">
                    <i class="fas fa-user-tie"></i>
                </div>
                <div class="summary-card__info">
                    <label>المدراء</label>
                    <span>${admins}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green">
                    <i class="fas fa-user"></i>
                </div>
                <div class="summary-card__info">
                    <label>المندوبون</label>
                    <span>${reps}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon orange">
                    <i class="fas fa-check-circle"></i>
                </div>
                <div class="summary-card__info">
                    <label>حسابات نشطة</label>
                    <span>${activeCount}</span>
                </div>
            </div>
        `;
    }

    /* ============================================
       Filters
       ============================================ */
    function applyFilters() {
        let list = [...State.users];

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(u =>
                (u.full_name || '').toLowerCase().includes(term) ||
                (u.email || '').toLowerCase().includes(term) ||
                (u.phone || '').includes(term)
            );
        }

        if (State.filters.role) {
            list = list.filter(u => u.role === State.filters.role);
        }

        if (State.filters.status) {
            list = list.filter(u => {
                const isActive = u.is_active !== false;
                return State.filters.status === 'active' ? isActive : !isActive;
            });
        }

        State.filtered = list;
        renderUsers();
        updateCount();
    }

    function updateCount() {
        const el = $('#usersCount');
        if (el) {
            const total = State.filtered.length;
            el.textContent = total === 1 ? '1 مستخدم' : `${total} مستخدم`;
        }
    }

    /* ============================================
       Render Users
       ============================================ */
    function renderUsers() {
        const gridView = $('#usersGridView');
        const listView = $('#usersListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            showEmpty(true);
            return;
        }

        showEmpty(false);

        if (gridView) {
            gridView.innerHTML = State.filtered.map(u => renderUserCard(u)).join('');
            gridView.querySelectorAll('.user-item').forEach(el => {
                bindUserActions(el);
            });
        }

        if (listView) {
            listView.innerHTML = State.filtered.map(u => renderUserListItem(u)).join('');
            listView.querySelectorAll('.user-list-item').forEach(el => {
                bindUserActions(el);
            });
        }
    }

    function renderUserCard(user) {
        const role = (user.role || 'rep').toLowerCase();
        const roleInfo = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.rep;
        const isActive = user.is_active !== false;
        const initials = (user.full_name || user.email || '?').trim()[0].toUpperCase();
        const isMe = user.id === State.currentUser.id;

        return `
            <div class="user-item ${!isActive ? 'inactive' : ''}" data-id="${user.id}">
                <div class="user-item__actions">
                    <button class="icon-action" data-action="edit" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${!isMe ? `
                        <button class="icon-action danger" data-action="delete" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
                <div class="user-item__head">
                    <div class="user-item__avatar ${role === 'rep' ? 'rep' : ''}">
                        ${U.escape(initials)}
                    </div>
                    <div class="user-item__info">
                        <div class="user-item__name">${U.escape(user.full_name || 'بدون اسم')}</div>
                        <div class="user-item__email">${U.escape(user.email || '')}</div>
                    </div>
                </div>
                <div class="user-item__body">
                    <div class="user-item__field">
                        <label>الدور</label>
                        <span class="user-item__role ${role}">
                            <i class="fas fa-${role === 'admin' ? 'user-tie' : 'user'}"></i>
                            ${roleInfo.label}
                        </span>
                    </div>
                    <div class="user-item__field">
                        <label>الهاتف</label>
                        <span>${U.escape(user.phone || '—')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderUserListItem(user) {
        const role = (user.role || 'rep').toLowerCase();
        const roleInfo = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.rep;
        const isActive = user.is_active !== false;
        const initials = (user.full_name || user.email || '?').trim()[0].toUpperCase();

        return `
            <div class="user-list-item ${!isActive ? 'inactive' : ''}" data-id="${user.id}">
                <div class="user-list-item__avatar ${role === 'rep' ? 'rep' : ''}">
                    ${U.escape(initials)}
                </div>
                <div class="user-list-item__info">
                    <div class="user-list-item__name">${U.escape(user.full_name || 'بدون اسم')}</div>
                    <div class="user-list-item__email">${U.escape(user.email || '')}</div>
                </div>
                <div class="user-list-item__role ${role}">
                    ${roleInfo.label}
                </div>
            </div>
        `;
    }

    function bindUserActions(el) {
        const id = el.dataset.id;

        el.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;

            if (action === 'edit') {
                e.stopPropagation();
                openUserModal(id);
            } else if (action === 'delete') {
                e.stopPropagation();
                openDeleteConfirm(id);
            } else {
                openViewModal(id);
            }
        });
    }

    function showEmpty(show) {
        const el = $('#emptyState');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    /* ============================================
       Add / Edit User
       ============================================ */
    function openUserModal(id = null) {
        State.editingId = id;

        const title = $('#userModalTitle');
        const form = $('#userForm');
        if (form) form.reset();

        if (id) {
            const user = State.users.find(u => u.id === id);
            if (!user) return;

            if (title) title.textContent = 'تعديل بيانات المستخدم';
            $('#userId').value = id;
            $('#userFullName').value = user.full_name || '';
            $('#userEmail').value = user.email || '';
            $('#userPhone').value = user.phone || '';
            $('#userIsActive').checked = user.is_active !== false;
            setRole(user.role || 'rep');

            // إخفاء حقول كلمة المرور عند التعديل
            const passFields = $('#passwordFields');
            if (passFields) passFields.style.display = 'none';
            const emailInput = $('#userEmail');
            if (emailInput) emailInput.disabled = true;
        } else {
            if (title) title.textContent = 'إضافة مستخدم جديد';
            $('#userId').value = '';
            $('#userIsActive').checked = true;
            setRole('admin');

            // إظهار حقول كلمة المرور عند الإضافة
            const passFields = $('#passwordFields');
            if (passFields) passFields.style.display = 'block';
            const emailInput = $('#userEmail');
            if (emailInput) emailInput.disabled = false;
        }

        openModal('userModal');
        setTimeout(() => $('#userFullName')?.focus(), 200);
    }

    function setRole(role) {
        const r = (role || 'admin').toLowerCase();
        $('#userRole').value = r;

        // تحديث الأزرار
        $$('.role-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.role === r);
        });

        // تحديث عرض الصلاحيات
        renderPermissionsPreview(r);
    }

    function renderPermissionsPreview(role) {
        const container = $('#permissionsPreview');
        if (!container) return;

        const roleInfo = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.rep;

        container.innerHTML = `
            <div class="permissions-preview__title">
                <i class="fas fa-shield-alt"></i>
                صلاحيات ${roleInfo.label}:
            </div>
            <div class="permissions-list">
                ${roleInfo.permissions.map(p => `
                    <div class="permission-item ${p.allowed ? 'allowed' : 'denied'}">
                        <i class="fas fa-${p.allowed ? 'check-circle' : 'times-circle'}"></i>
                        <span>${p.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    /* ============================================
       Save User
       ============================================ */
    async function saveUser() {
        const fullName = $('#userFullName')?.value.trim();
        const email = $('#userEmail')?.value.trim();
        const phone = $('#userPhone')?.value.trim() || '';
        const role = $('#userRole')?.value || 'admin';
        const isActive = $('#userIsActive')?.checked !== false;

        if (!fullName) {
            showToast('الاسم الكامل مطلوب', 'warning');
            return;
        }
        if (!email || !email.includes('@')) {
            showToast('صيغة البريد الإلكتروني غير صحيحة', 'warning');
            return;
        }

        const btn = $('#saveUserBtn');
        if (btn) btn.disabled = true;

        try {
            const client = window.DB?.client;
            if (!client) throw new Error('Supabase not available');

            if (State.editingId) {
                // تحديث مستخدم موجود
                const updates = {
                    full_name: fullName,
                    phone: phone,
                    role: role,
                    is_active: isActive,
                    updated_at: new Date().toISOString()
                };

                const { error } = await client
                    .from('profiles')
                    .update(updates)
                    .eq('id', State.editingId);

                if (error) throw error;
                showToast('تم تحديث المستخدم بنجاح', 'success');

            } else {
                // إنشاء مستخدم جديد
                const password = $('#userPassword')?.value;
                const passwordConfirm = $('#userPasswordConfirm')?.value;

                if (!password || password.length < 6) {
                    showToast('كلمة المرور 6 أحرف على الأقل', 'warning');
                    btn.disabled = false;
                    return;
                }
                if (password !== passwordConfirm) {
                    showToast('كلمتا المرور غير متطابقتين', 'warning');
                    btn.disabled = false;
                    return;
                }

                // ✅ استخدام signUp مع بيانات إضافية
                const { data: authData, error: signUpError } = await client.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            full_name: fullName,
                            phone: phone,
                            role: role
                        }
                    }
                });

                if (signUpError) throw signUpError;
                if (!authData.user) throw new Error('فشل إنشاء المستخدم');

                // إنشاء profile
                const profile = {
                    id: authData.user.id,
                    tenant_id: State.currentUser.tenant_id,
                    full_name: fullName,
                    email: email,
                    phone: phone,
                    role: role,
                    is_active: isActive
                };

                const { error: profileError } = await client
                    .from('profiles')
                    .upsert(profile, { onConflict: 'id' });

                if (profileError) console.warn('Profile warning:', profileError);

                showToast('تم إضافة المستخدم بنجاح', 'success');
            }

            closeModal('userModal');
            await loadUsers();

        } catch (e) {
            console.error('Save user error:', e);
            showToast(e.message || 'فشل حفظ المستخدم', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       View User
       ============================================ */
    function openViewModal(id) {
        const user = State.users.find(u => u.id === id);
        if (!user) return;

        State.viewingId = id;

        const body = $('#viewUserBody');
        if (!body) return;

        const role = (user.role || 'rep').toLowerCase();
        const roleInfo = ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.rep;
        const isActive = user.is_active !== false;
        const initials = (user.full_name || user.email || '?').trim()[0].toUpperCase();

        body.innerHTML = `
            <div class="view-user__header">
                <div class="view-user__avatar ${role === 'rep' ? 'rep' : ''}">
                    ${U.escape(initials)}
                </div>
                <div class="view-user__title">
                    <h3>${U.escape(user.full_name || 'بدون اسم')}</h3>
                    <p>${U.escape(user.email || '')}</p>
                </div>
            </div>

            <div class="view-user__status ${isActive ? 'active' : 'inactive'}">
                <i class="fas fa-circle"></i>
                ${isActive ? 'حساب نشط' : 'حساب موقوف'}
            </div>

            <div class="view-user__grid">
                <div class="view-user__item">
                    <label>الدور</label>
                    <span>${roleInfo.label}</span>
                </div>
                <div class="view-user__item">
                    <label>الهاتف</label>
                    <span>${U.escape(user.phone || '—')}</span>
                </div>
                <div class="view-user__item">
                    <label>تاريخ الإنشاء</label>
                    <span>${U.date(user.created_at || new Date())}</span>
                </div>
                <div class="view-user__item">
                    <label>آخر تحديث</label>
                    <span>${U.date(user.updated_at || new Date())}</span>
                </div>
            </div>

            <div class="permissions-preview">
                <div class="permissions-preview__title">
                    <i class="fas fa-shield-alt"></i>
                    الصلاحيات:
                </div>
                <div class="permissions-list">
                    ${roleInfo.permissions.map(p => `
                        <div class="permission-item ${p.allowed ? 'allowed' : 'denied'}">
                            <i class="fas fa-${p.allowed ? 'check-circle' : 'times-circle'}"></i>
                            <span>${p.label}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        // Bind buttons
        const editBtn = $('#viewEditBtn');
        if (editBtn) {
            const newBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newBtn, editBtn);
            newBtn.addEventListener('click', () => {
                closeModal('viewUserModal');
                setTimeout(() => openUserModal(id), 200);
            });
        }

        const closeBtn = $('#closeViewBtn');
        if (closeBtn) {
            const newBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newBtn, closeBtn);
            newBtn.addEventListener('click', () => closeModal('viewUserModal'));
        }

        openModal('viewUserModal');
    }

    /* ============================================
       Delete User
       ============================================ */
    function openDeleteConfirm(id) {
        const user = State.users.find(u => u.id === id);
        if (!user) return;

        // منع حذف النفس
        if (id === State.currentUser.id) {
            showToast('لا يمكنك حذف حسابك الخاص', 'warning');
            return;
        }

        State.deletingId = id;
        const nameEl = $('#deleteUserName');
        if (nameEl) nameEl.textContent = user.full_name || user.email || '';

        openModal('confirmDeleteModal');
    }

    async function confirmDelete() {
        if (!State.deletingId) return;

        const btn = $('#confirmDeleteBtn');
        if (btn) btn.disabled = true;

        try {
            const client = window.DB?.client;
            if (!client) throw new Error('Supabase not available');

            // حذف ناعم من profiles
            const { error } = await client
                .from('profiles')
                .update({ 
                    deleted_at: new Date().toISOString(),
                    is_active: false
                })
                .eq('id', State.deletingId);

            if (error) throw error;

            showToast('تم حذف المستخدم بنجاح', 'success');
            closeModal('confirmDeleteModal');
            State.deletingId = null;

            await loadUsers();

        } catch (e) {
            console.error('Delete user error:', e);
            showToast('فشل حذف المستخدم', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       UI Helpers
       ============================================ */
    function updateUserUI() {
        const avatar = $('#userAvatar');
        const name = $('#sidebarUserName');
        if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
        if (name) name.textContent = State.currentUser.fullName || 'مدير';
    }

    function updateConnStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('is-offline', !online);
        const status = $('#connStatus');
        if (status) {
            status.textContent = online ? 'متصل' : 'غير متصل';
            status.style.color = online ? 'var(--success)' : 'var(--danger)';
        }
    }

    function updateThemeIcon() {
        const btn = $('#themeBtn');
        if (!btn) return;
        const isDark = document.documentElement.dataset.theme === 'dark';
        btn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#usersGridView');
        const listView = $('#usersListView');
        const empty = $('#emptyState');

        if (skeleton) {
            skeleton.innerHTML = Array(6).fill(`
                <div class="skeleton-card">
                    <div style="display:flex;gap:14px;margin-bottom:16px;">
                        <div style="width:56px;height:56px;background:var(--bg-sunken);border-radius:50%;"></div>
                        <div style="flex:1;">
                            <div style="height:16px;background:var(--bg-sunken);border-radius:6px;margin-bottom:8px;"></div>
                            <div style="height:12px;background:var(--bg-sunken);border-radius:6px;width:70%;"></div>
                        </div>
                    </div>
                    <div style="height:40px;background:var(--bg-sunken);border-radius:10px;"></div>
                </div>
            `).join('');
            skeleton.style.display = 'grid';
        }
        if (gridView) gridView.style.display = 'none';
        if (listView) listView.style.display = 'none';
        if (empty) empty.style.display = 'none';
    }

    function hideSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#usersGridView');
        const listView = $('#usersListView');
        if (skeleton) skeleton.style.display = 'none';
        if (gridView) gridView.style.display = '';
        if (listView) listView.style.display = '';
    }

    function hideLoadingBar() {
        const bar = $('#loading-bar');
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        }
    }

    /* ============================================
       Toast
       ============================================ */
    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }

        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 12px 22px;
            background: ${colors[type] || colors.info};
            color: #fff;
            border-radius: 999px;
            font-weight: 700;
            font-size: 14px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
