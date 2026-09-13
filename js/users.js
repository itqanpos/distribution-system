/* =============================================
   users.js - Users Management Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ State ============ */
    const State = {
        users: [],
        filtered: [],
        currentUser: null,
        editingId: null,
        deletingId: null,
        viewingId: null,
        resettingId: null,
        filters: {
            search: '',
            role: '',
            status: '',
            sort: 'name'
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

            // التحقق من الصلاحيات - فقط admin يستطيع إدارة المستخدمين
            if (State.currentUser.role !== 'admin' && State.currentUser.role !== 'super_admin') {
                showToast('غير مصرح لك بالوصول لهذه الصفحة', 'error');
                setTimeout(() => location.href = './dashboard.html', 1500);
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
            const client = window.DB.client;
            if (!client) throw new Error('Supabase client غير متوفر');

            // جلب جميع المستخدمين من جدول profiles
            const { data, error } = await client
                .from('profiles')
                .select('*')
                .is('deleted_at', null)
                .order('full_name');

            if (error) throw error;

            State.users = (data || []).map(u => ({
                id: u.id,
                fullName: u.full_name || u.email || 'بدون اسم',
                email: u.email || '',
                phone: u.phone || '',
                role: u.role || 'rep',
                tenant_id: u.tenant_id,
                isActive: u.is_active !== false, // default true
                createdAt: u.created_at || new Date().toISOString()
            }));

            console.log('👥 Users:', State.users.length);

            renderSummary();
            applyFilters();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل المستخدمين: ' + e.message, 'error');
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
        const admins = State.users.filter(u => u.role === 'admin' || u.role === 'super_admin').length;
        const reps = State.users.filter(u => u.role === 'rep').length;
        const active = State.users.filter(u => u.isActive).length;
        const inactive = total - active;

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
                <div class="summary-card__icon purple">
                    <i class="fas fa-user-shield"></i>
                </div>
                <div class="summary-card__info">
                    <label>المديرون</label>
                    <span>${admins}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green">
                    <i class="fas fa-user-check"></i>
                </div>
                <div class="summary-card__info">
                    <label>نشط</label>
                    <span>${active}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon red">
                    <i class="fas fa-user-slash"></i>
                </div>
                <div class="summary-card__info">
                    <label>معطل</label>
                    <span>${inactive}</span>
                </div>
            </div>
        `;
    }

    /* ============================================
       Filters
       ============================================ */
    function applyFilters() {
        let list = [...State.users];

        // Search
        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(u =>
                (u.fullName || '').toLowerCase().includes(term) ||
                (u.email || '').toLowerCase().includes(term) ||
                (u.phone || '').includes(term)
            );
        }

        // Role
        if (State.filters.role) {
            if (State.filters.role === 'admin') {
                list = list.filter(u => u.role === 'admin' || u.role === 'super_admin');
            } else {
                list = list.filter(u => u.role === State.filters.role);
            }
        }

        // Status
        if (State.filters.status) {
            if (State.filters.status === 'active') {
                list = list.filter(u => u.isActive);
            } else if (State.filters.status === 'inactive') {
                list = list.filter(u => !u.isActive);
            }
        }

        // Sort
        const sort = State.filters.sort;
        list.sort((a, b) => {
            if (sort === 'name') return (a.fullName || '').localeCompare(b.fullName || '', 'ar');
            if (sort === 'name-desc') return (b.fullName || '').localeCompare(a.fullName || '', 'ar');
            if (sort === 'recent') return new Date(b.createdAt) - new Date(a.createdAt);
            if (sort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
            return 0;
        });

        State.filtered = list;
        renderUsers();
        updateCount();
    }

    function updateCount() {
        const el = $('#usersCount');
        if (el) {
            el.textContent = State.filtered.length === 1 ? '1 مستخدم' : `${State.filtered.length} مستخدم`;
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
            gridView.querySelectorAll('.user-item').forEach(el => bindUserActions(el));
        }

        if (listView) {
            listView.innerHTML = State.filtered.map(u => renderUserListItem(u)).join('');
            listView.querySelectorAll('.user-list-item').forEach(el => bindUserActions(el));
        }
    }

    function renderUserCard(user) {
        const initials = getInitials(user.fullName);
        const roleClass = user.role === 'admin' || user.role === 'super_admin' ? 'admin' : (user.role === 'super_admin' ? 'super_admin' : 'rep');
        const roleLabel = getRoleLabel(user.role);
        const isMe = user.id === State.currentUser.id;
        const avatarClass = user.role === 'rep' ? 'rep' : '';

        return `
            <div class="user-item ${!user.isActive ? 'inactive' : ''}" data-id="${user.id}">
                <div class="user-item__actions">
                    ${isMe ? '' : `
                        <button class="icon-action" data-action="edit" title="تعديل">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="icon-action danger" data-action="delete" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    `}
                </div>
                <div class="user-item__head">
                    <div class="user-item__avatar ${avatarClass}">
                        ${U.escape(initials)}
                        <span class="user-item__status-dot ${user.isActive ? 'active' : 'inactive'}"></span>
                    </div>
                    <div class="user-item__title">
                        <div class="user-item__name">
                            ${U.escape(user.fullName)}
                            ${isMe ? '<span style="color:var(--primary);font-size:11px;">(أنت)</span>' : ''}
                        </div>
                        <div class="user-item__email">${U.escape(user.email)}</div>
                    </div>
                </div>
                <div class="user-item__body">
                    <div class="user-item__field">
                        <label>الدور</label>
                        <span class="user-item__role ${roleClass}">${roleLabel}</span>
                    </div>
                    <div class="user-item__field">
                        <label>الحالة</label>
                        <span style="color:${user.isActive ? 'var(--success)' : 'var(--text-muted)'};">
                            ${user.isActive ? 'نشط' : 'معطل'}
                        </span>
                    </div>
                    <div class="user-item__field">
                        <label>الهاتف</label>
                        <span>${U.escape(user.phone || '-')}</span>
                    </div>
                </div>
            </div>
        `;
    }

    function renderUserListItem(user) {
        const initials = getInitials(user.fullName);
        const avatarClass = user.role === 'rep' ? 'rep' : '';

        return `
            <div class="user-list-item ${!user.isActive ? 'inactive' : ''}" data-id="${user.id}">
                <div class="user-list-item__avatar ${avatarClass}">
                    ${U.escape(initials)}
                </div>
                <div class="user-list-item__info">
                    <div class="user-list-item__name">${U.escape(user.fullName)}</div>
                    <div class="user-list-item__email">${U.escape(user.email)}</div>
                </div>
                <span class="user-item__role ${user.role === 'rep' ? 'rep' : 'admin'}">
                    ${getRoleLabel(user.role)}
                </span>
            </div>
        `;
    }

    function getInitials(name) {
        if (!name) return 'U';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name[0].toUpperCase();
    }

    function getRoleLabel(role) {
        return {
            'admin': 'مدير',
            'rep': 'مندوب',
            'super_admin': 'مدير عام'
        }[role] || 'مستخدم';
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
       Add/Edit User
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
            $('#userName').value = user.fullName || '';
            $('#userEmail').value = user.email || '';
            $('#userPhone').value = user.phone || '';
            $('#userRole').value = user.role || 'rep';
            $('#userStatus').value = user.isActive ? 'active' : 'inactive';

            setRoleUI(user.role || 'rep');
            setStatusUI(user.isActive ? 'active' : 'inactive');

            // إخفاء حقل كلمة المرور عند التعديل
            $('#passwordGroup').style.display = 'none';
            $('#userEmail').setAttribute('disabled', 'disabled');
            $('#emailHint').innerHTML = `
                <i class="fas fa-lock"></i>
                <span>لا يمكن تغيير البريد الإلكتروني</span>
            `;

            // عرض حقل الحالة
            $('#statusGroup').style.display = 'block';

            // منع تعديل حسابك الخاص (الدور)
            if (id === State.currentUser.id) {
                $$('.role-btn').forEach(btn => {
                    btn.disabled = true;
                    btn.style.opacity = '0.5';
                    btn.style.cursor = 'not-allowed';
                });
                $('#statusGroup').style.display = 'none';
            }
        } else {
            if (title) title.textContent = 'إضافة مستخدم جديد';
            $('#userId').value = '';
            $('#userRole').value = 'admin';
            $('#userStatus').value = 'active';
            setRoleUI('admin');
            setStatusUI('active');

            // إظهار حقل كلمة المرور
            $('#passwordGroup').style.display = 'block';
            $('#userEmail').removeAttribute('disabled');
            $('#emailHint').innerHTML = `
                <i class="fas fa-info-circle"></i>
                <span>يُستخدم لتسجيل الدخول</span>
            `;
            $('#statusGroup').style.display = 'none';

            // تفعيل كل الأزرار
            $$('.role-btn').forEach(btn => {
                btn.disabled = false;
                btn.style.opacity = '1';
                btn.style.cursor = 'pointer';
            });
        }

        openModal('userModal');
        setTimeout(() => $('#userName')?.focus(), 200);
    }

    function setRoleUI(role) {
        $('#userRole').value = role;
        $$('.role-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.role === role);
        });
    }

    function setStatusUI(status) {
        $('#userStatus').value = status;
        $$('.status-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.status === status);
        });
    }

    /* ============================================
       Save User
       ============================================ */
    async function saveUser() {
        const id = $('#userId').value;
        const isEdit = !!id;

        const fullName = $('#userName').value.trim();
        const email = $('#userEmail').value.trim();
        const phone = $('#userPhone').value.trim();
        const password = $('#userPassword').value;
        const role = $('#userRole').value;
        const status = $('#userStatus').value;

        // Validation
        if (!fullName) {
            showToast('الاسم الكامل مطلوب', 'warning');
            return;
        }
        if (!email || !email.includes('@')) {
            showToast('البريد الإلكتروني غير صحيح', 'warning');
            return;
        }
        if (!isEdit && (!password || password.length < 6)) {
            showToast('كلمة المرور 6 أحرف على الأقل', 'warning');
            return;
        }

        const btn = $('#saveUserBtn');
        if (btn) btn.disabled = true;

        try {
            const client = window.DB.client;

            if (isEdit) {
                // ============ التعديل ============
                const updates = {
                    full_name: fullName,
                    phone: phone || null,
                    role: role,
                    is_active: status === 'active'
                };

                const { error } = await client
                    .from('profiles')
                    .update(updates)
                    .eq('id', id);

                if (error) throw error;

                showToast('تم تحديث بيانات المستخدم', 'success');
            } else {
                // ============ الإضافة ============
                // 1. إنشاء مستخدم Auth
                const { data: signUpData, error: signUpError } = await client.auth.signUp({
                    email,
                    password,
                    options: {
                        data: {
                            full_name: fullName,
                            phone: phone
                        }
                    }
                });

                if (signUpError) throw signUpError;
                if (!signUpData.user) throw new Error('فشل إنشاء الحساب');

                // 2. إنشاء profile
                const { error: profileError } = await client
                    .from('profiles')
                    .upsert({
                        id: signUpData.user.id,
                        full_name: fullName,
                        email: email,
                        phone: phone || null,
                        role: role,
                        tenant_id: State.currentUser.tenant_id,
                        is_active: true
                    }, { onConflict: 'id' });

                if (profileError) {
                    console.error('Profile error:', profileError);
                    // محاولة حذف المستخدم من Auth إذا فشل إنشاء البروفايل
                    throw new Error('فشل إنشاء الملف الشخصي');
                }

                showToast('تم إضافة المستخدم بنجاح', 'success');
            }

            closeModal('userModal');
            await loadUsers();

        } catch (e) {
            console.error('Save error:', e);
            let errorMsg = e.message || 'فشل حفظ البيانات';

            // ترجمة رسائل الخطأ الشائعة
            if (errorMsg.includes('already registered') || errorMsg.includes('already been registered')) {
                errorMsg = 'البريد الإلكتروني مسجل مسبقاً';
            } else if (errorMsg.includes('Invalid email')) {
                errorMsg = 'البريد الإلكتروني غير صحيح';
            } else if (errorMsg.includes('Password should be at least')) {
                errorMsg = 'كلمة المرور قصيرة جداً';
            }

            showToast(errorMsg, 'error');
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

        const initials = getInitials(user.fullName);
        const avatarClass = user.role === 'rep' ? 'rep' : '';
        const roleLabel = getRoleLabel(user.role);
        const isMe = user.id === State.currentUser.id;

        body.innerHTML = `
            <div class="view-user__header">
                <div class="view-user__avatar ${avatarClass}">
                    ${U.escape(initials)}
                    <span class="view-user__status-dot ${user.isActive ? 'active' : 'inactive'}"></span>
                </div>
                <div class="view-user__title">
                    <h3>
                        ${U.escape(user.fullName)}
                        ${isMe ? '<span style="color:var(--primary);font-size:13px;">(أنت)</span>' : ''}
                    </h3>
                    <p>${U.escape(user.email)}</p>
                    <span class="user-item__role ${user.role === 'rep' ? 'rep' : (user.role === 'super_admin' ? 'super_admin' : 'admin')}">
                        ${roleLabel}
                    </span>
                </div>
            </div>

            <div class="view-user__grid">
                <div class="view-user__item">
                    <label>رقم الهاتف</label>
                    <span>${U.escape(user.phone || 'غير محدد')}</span>
                </div>
                <div class="view-user__item">
                    <label>الحالة</label>
                    <span style="color:${user.isActive ? 'var(--success)' : 'var(--danger)'};">
                        ${user.isActive ? 'نشط' : 'معطل'}
                    </span>
                </div>
                <div class="view-user__item">
                    <label>تاريخ الإضافة</label>
                    <span>${U.date(user.createdAt)}</span>
                </div>
                <div class="view-user__item">
                    <label>معرف المستخدم</label>
                    <span style="font-size:11px;">${U.escape(user.id.substring(0, 8))}...</span>
                </div>
            </div>
        `;

        // Update buttons
        const editBtn = $('#editUserBtn');
        const resetBtn = $('#resetPasswordBtn');

        if (isMe) {
            if (editBtn) editBtn.style.display = 'none';
            if (resetBtn) resetBtn.style.display = 'none';
        } else {
            if (editBtn) {
                editBtn.style.display = 'inline-flex';
                const newEditBtn = editBtn.cloneNode(true);
                editBtn.parentNode.replaceChild(newEditBtn, editBtn);
                newEditBtn.addEventListener('click', () => {
                    closeModal('viewUserModal');
                    setTimeout(() => openUserModal(id), 200);
                });
            }

            if (resetBtn) {
                resetBtn.style.display = 'inline-flex';
                const newResetBtn = resetBtn.cloneNode(true);
                resetBtn.parentNode.replaceChild(newResetBtn, resetBtn);
                newResetBtn.addEventListener('click', () => {
                    closeModal('viewUserModal');
                    setTimeout(() => openResetPasswordModal(id), 200);
                });
            }
        }

        openModal('viewUserModal');
    }

    /* ============================================
       Delete User
       ============================================ */
    function openDeleteConfirm(id) {
        const user = State.users.find(u => u.id === id);
        if (!user) return;

        if (id === State.currentUser.id) {
            showToast('لا يمكنك حذف حسابك الخاص', 'warning');
            return;
        }

        State.deletingId = id;
        const nameEl = $('#deleteUserName');
        if (nameEl) nameEl.textContent = user.fullName;

        openModal('confirmDeleteModal');
    }

    async function confirmDelete() {
        if (!State.deletingId) return;

        if (State.deletingId === State.currentUser.id) {
            showToast('لا يمكنك حذف حسابك الخاص', 'warning');
            closeModal('confirmDeleteModal');
            return;
        }

        const btn = $('#confirmDeleteBtn');
        if (btn) btn.disabled = true;

        try {
            const client = window.DB.client;

            // Soft delete: تحديث deleted_at في profiles
            const { error } = await client
                .from('profiles')
                .update({
                    deleted_at: new Date().toISOString(),
                    is_active: false
                })
                .eq('id', State.deletingId);

            if (error) throw error;

            // محاولة حذف المستخدم من Auth (اختياري - قد يفشل بسبب الصلاحيات)
            try {
                // هذا يتطلب service_role key، لذا قد لا يعمل
                // سنتخطاه ونعتمد على Soft delete
            } catch (e) {
                console.warn('Auth deletion not allowed');
            }

            showToast('تم حذف المستخدم', 'success');
            closeModal('confirmDeleteModal');
            State.deletingId = null;
            await loadUsers();

        } catch (e) {
            console.error('Delete error:', e);
            showToast('فشل حذف المستخدم: ' + e.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Reset Password
       ============================================ */
    function openResetPasswordModal(id) {
        const user = State.users.find(u => u.id === id);
        if (!user) return;

        State.resettingId = id;

        $('#resetUserId').value = id;
        $('#resetInfo').innerHTML = `
            <i class="fas fa-key"></i>
            <div>
                <strong>${U.escape(user.fullName)}</strong>
                <small>${U.escape(user.email)}</small>
            </div>
        `;

        $('#newPassword').value = '';
        $('#confirmNewPassword').value = '';
        $('#passwordStrength').style.display = 'none';

        openModal('resetPasswordModal');
        setTimeout(() => $('#newPassword')?.focus(), 200);
    }

    async function confirmResetPassword() {
        const id = $('#resetUserId').value;
        const newPassword = $('#newPassword').value;
        const confirmPassword = $('#confirmNewPassword').value;

        if (!id) {
            showToast('المستخدم غير محدد', 'warning');
            return;
        }

        if (!newPassword || newPassword.length < 6) {
            showToast('كلمة المرور 6 أحرف على الأقل', 'warning');
            return;
        }

        if (newPassword !== confirmPassword) {
            showToast('كلمتا المرور غير متطابقتين', 'warning');
            return;
        }

        const btn = $('#confirmResetBtn');
        if (btn) btn.disabled = true;

        try {
            const client = window.DB.client;

            // إرسال رابط إعادة تعيين كلمة المرور عبر البريد
            const user = State.users.find(u => u.id === id);
            if (!user) throw new Error('المستخدم غير موجود');

            // Supabase يرسل رابط إعادة تعيين عبر البريد
            const { error } = await client.auth.resetPasswordForEmail(user.email, {
                redirectTo: window.location.origin + '/reset-password.html'
            });

            if (error) throw error;

            showToast(`تم إرسال رابط إعادة التعيين إلى ${user.email}`, 'success');
            closeModal('resetPasswordModal');

        } catch (e) {
            console.error('Reset error:', e);
            showToast('فشل إعادة تعيين كلمة المرور: ' + e.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Password Strength
       ============================================ */
    function checkPasswordStrength(password) {
        if (!password) return { level: '', label: '' };

        let score = 0;
        if (password.length >= 6) score++;
        if (password.length >= 10) score++;
        if (/[A-Z]/.test(password)) score++;
        if (/[a-z]/.test(password)) score++;
        if (/[0-9]/.test(password)) score++;
        if (/[^A-Za-z0-9]/.test(password)) score++;

        if (score <= 2) return { level: 'weak', label: 'ضعيفة' };
        if (score <= 4) return { level: 'medium', label: 'متوسطة' };
        return { level: 'strong', label: 'قوية' };
    }

    /* ============================================
       Export
       ============================================ */
    function exportUsers() {
        if (!State.filtered.length) {
            showToast('لا يوجد مستخدمين للتصدير', 'info');
            return;
        }

        const rows = [['الاسم', 'البريد الإلكتروني', 'الهاتف', 'الدور', 'الحالة', 'تاريخ الإضافة']];
        State.filtered.forEach(u => {
            rows.push([
                u.fullName || '',
                u.email || '',
                u.phone || '',
                getRoleLabel(u.role),
                u.isActive ? 'نشط' : 'معطل',
                U.date(u.createdAt)
            ]);
        });

        const csv = rows.map(row =>
            row.map(cell => {
                const s = String(cell ?? '');
                return (s.includes(',') || s.includes('"')) ? '"' + s.replace(/"/g, '""') + '"' : s;
            }).join(',')
        ).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users-${U.today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('تم التصدير', 'success');
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
                    <div style="display:flex;gap:12px;margin-bottom:16px;">
                        <div style="width:52px;height:52px;background:var(--bg-sunken);border-radius:50%;"></div>
                        <div style="flex:1;">
                            <div style="height:16px;background:var(--bg-sunken);border-radius:6px;margin-bottom:8px;"></div>
                            <div style="height:12px;background:var(--bg-sunken);border-radius:6px;width:60%;"></div>
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
            display: flex;
            align-items: center;
            gap: 10px;
            pointer-events: auto;
            animation: slideUp 0.3s;
        `;
        toast.innerHTML = `<i class="fas fa-${icons[type]}"></i> <span>${U.escape(msg)}</span>`;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2800);
    }

    /* ============================================
       Events
       ============================================ */
    function bindEvents() {
        // Sidebar
        $('#menuBtn')?.addEventListener('click', () => {
            $('#sidebar')?.classList.add('open');
            $('#sidebarOverlay')?.classList.add('show');
        });
        $('#sidebarOverlay')?.addEventListener('click', () => {
            $('#sidebar')?.classList.remove('open');
            $('#sidebarOverlay')?.classList.remove('show');
        });
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                $('#sidebar')?.classList.remove('open');
                $('#sidebarOverlay')?.classList.remove('show');
            });
        });

        // Theme
        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        // Logout
        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        // Refresh
        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            await loadUsers();
            showToast('تم التحديث', 'success');
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportUsers);

        // Add user
        $('#addUserBtn')?.addEventListener('click', () => openUserModal());
        $('#fabAddBtn')?.addEventListener('click', () => openUserModal());

        // Search
        $('#searchInput')?.addEventListener('input', U.debounce((e) => {
            State.filters.search = e.target.value.trim();
            const clearBtn = $('#clearSearchBtn');
            if (clearBtn) clearBtn.style.display = e.target.value ? 'grid' : 'none';
            applyFilters();
        }, 200));

        $('#clearSearchBtn')?.addEventListener('click', () => {
            const input = $('#searchInput');
            if (input) input.value = '';
            State.filters.search = '';
            $('#clearSearchBtn').style.display = 'none';
            applyFilters();
        });

        // Filters
        $('#roleFilter')?.addEventListener('change', (e) => {
            State.filters.role = e.target.value;
            applyFilters();
        });
        $('#statusFilter')?.addEventListener('change', (e) => {
            State.filters.status = e.target.value;
            applyFilters();
        });
        $('#sortFilter')?.addEventListener('change', (e) => {
            State.filters.sort = e.target.value;
            applyFilters();
        });

        // Role selector
        $$('.role-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                setRoleUI(btn.dataset.role);
            });
        });

        // Status selector
        $$('.status-btn').forEach(btn => {
            btn.addEventListener('click', () => setStatusUI(btn.dataset.status));
        });

        // Toggle password visibility
        $('#togglePass')?.addEventListener('click', () => {
            const input = $('#userPassword');
            if (!input) return;
            const isPass = input.type === 'password';
            input.type = isPass ? 'text' : 'password';
            const icon = $('#togglePass').querySelector('i');
            icon.className = isPass ? 'fas fa-eye-slash' : 'fas fa-eye';
        });

        $('#toggleNewPass')?.addEventListener('click', () => {
            const input = $('#newPassword');
            if (!input) return;
            const isPass = input.type === 'password';
            input.type = isPass ? 'text' : 'password';
            const icon = $('#toggleNewPass').querySelector('i');
            icon.className = isPass ? 'fas fa-eye-slash' : 'fas fa-eye';
        });

        $('#toggleConfirmPass')?.addEventListener('click', () => {
            const input = $('#confirmNewPassword');
            if (!input) return;
            const isPass = input.type === 'password';
            input.type = isPass ? 'text' : 'password';
            const icon = $('#toggleConfirmPass').querySelector('i');
            icon.className = isPass ? 'fas fa-eye-slash' : 'fas fa-eye';
        });

        // Password strength
        $('#newPassword')?.addEventListener('input', (e) => {
            const val = e.target.value;
            const strength = checkPasswordStrength(val);
            const strengthEl = $('#passwordStrength');
            const fill = $('#strengthFill');
            const label = $('#strengthLabel');

            if (!val) {
                strengthEl.style.display = 'none';
                return;
            }

            strengthEl.style.display = 'block';
            fill.className = `password-strength__fill ${strength.level}`;
            label.className = strength.level;
            label.textContent = `قوة كلمة المرور: ${strength.label}`;
        });

        // Save user
        $('#saveUserBtn')?.addEventListener('click', saveUser);

        // Confirm delete
        $('#confirmDeleteBtn')?.addEventListener('click', confirmDelete);

        // Confirm reset password
        $('#confirmResetBtn')?.addEventListener('click', confirmResetPassword);

        // Close modals
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        // ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
            }
        });

        // Connection
        window.addEventListener('online', () => {
            updateConnStatus();
            showToast('عاد الاتصال', 'success');
        });
        window.addEventListener('offline', () => {
            updateConnStatus();
            showToast('انقطع الاتصال', 'warning');
        });
    }

    /* ============================================
       Start
       ============================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
