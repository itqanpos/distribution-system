/* =============================================
   users.js - Users Management Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    const State = {
        users: [],
        filtered: [],
        currentUser: null,
        editingId: null,
        deletingId: null,
        filters: { search: '', role: '' }
    };

    async function init() {
        console.log('🚀 Users init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (!window.DB?.client) return;
        await new Promise(r => setTimeout(r, 300));

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
            // Only admins can access
            if (State.currentUser.role !== 'admin' && State.currentUser.role !== 'super_admin') {
                window.location.href = './dashboard.html';
                return;
            }
        } catch (e) { return; }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadUsers();
        hideLoadingBar();
    }

    async function loadUsers() {
        showSkeleton();
        try {
            const client = window.DB.client;
            const tenantId = State.currentUser.tenant_id;

            let query = client.from('profiles').select('*').is('deleted_at', null).order('full_name');
            if (tenantId) query = query.eq('tenant_id', tenantId);

            const { data, error } = await query;
            if (error) throw error;

            State.users = data || [];
            renderSummary();
            applyFilters();
        } catch (e) {
            console.error('Load users error:', e);
            showToast('تعذر تحميل المستخدمين', 'error');
        } finally {
            hideSkeleton();
        }
    }

    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const total = State.users.length;
        const admins = State.users.filter(u => u.role === 'admin').length;
        const reps = State.users.filter(u => u.role === 'rep').length;
        const active = State.users.filter(u => u.is_active !== false).length;

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon purple"><i class="fas fa-users"></i></div>
                <div class="summary-card__info">
                    <label>إجمالي المستخدمين</label>
                    <span>${total}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon blue"><i class="fas fa-user-tie"></i></div>
                <div class="summary-card__info">
                    <label>المديرين</label>
                    <span>${admins}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green"><i class="fas fa-user"></i></div>
                <div class="summary-card__info">
                    <label>المندوبين</label>
                    <span>${reps}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon orange"><i class="fas fa-check-circle"></i></div>
                <div class="summary-card__info">
                    <label>نشط</label>
                    <span>${active}</span>
                </div>
            </div>
        `;
    }

    function applyFilters() {
        let list = [...State.users];

        if (State.filters.search) {
            const t = State.filters.search.toLowerCase();
            list = list.filter(u =>
                (u.full_name || '').toLowerCase().includes(t) ||
                (u.email || '').toLowerCase().includes(t) ||
                (u.phone || '').includes(State.filters.search)
            );
        }

        if (State.filters.role) {
            list = list.filter(u => u.role === State.filters.role);
        }

        State.filtered = list;
        render();
        updateCount();
    }

    function updateCount() {
        const el = $('#usersCount');
        if (el) el.textContent = State.filtered.length === 1 ? '1 مستخدم' : `${State.filtered.length} مستخدم`;
    }

    function render() {
        const gridView = $('#usersGridView');
        const listView = $('#usersListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            $('#emptyState').style.display = 'block';
            return;
        }

        $('#emptyState').style.display = 'none';

        if (gridView) {
            gridView.innerHTML = State.filtered.map(u => renderCard(u)).join('');
            gridView.querySelectorAll('.user-item').forEach(el => bindActions(el));
        }
        if (listView) {
            listView.innerHTML = State.filtered.map(u => renderListItem(u)).join('');
            listView.querySelectorAll('.user-list-item').forEach(el => bindActions(el));
        }
    }

    function renderCard(u) {
        const isActive = u.is_active !== false;
        const isRep = u.role === 'rep';
        const initials = (u.full_name || u.email || '?').trim()[0].toUpperCase();
        const roleLabel = isRep ? 'مندوب' : 'مدير';
        const isCurrentUser = u.id === State.currentUser.id;

        return `
            <div class="user-item" data-id="${u.id}">
                <div class="user-item__status ${isActive ? 'active' : 'inactive'}">
                    ${isActive ? 'نشط' : 'معطل'}
                </div>
                <div class="user-item__actions">
                    <button class="icon-action" data-action="edit" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${!isCurrentUser ? `
                        <button class="icon-action danger" data-action="delete" title="حذف">
                            <i class="fas fa-trash"></i>
                        </button>
                    ` : ''}
                </div>
                <div class="user-item__head">
                    <div class="user-item__avatar ${isRep ? 'rep' : ''}">${U.escape(initials)}</div>
                    <div class="user-item__title">
                        <div class="user-item__name">${U.escape(u.full_name || 'بدون اسم')}</div>
                        <span class="user-item__role ${isRep ? 'rep' : ''}">${roleLabel}</span>
                    </div>
                </div>
                <div class="user-item__body">
                    ${u.email ? `<div class="user-item__field"><i class="fas fa-envelope"></i><span>${U.escape(u.email)}</span></div>` : ''}
                    ${u.phone ? `<div class="user-item__field"><i class="fas fa-phone"></i><span>${U.escape(u.phone)}</span></div>` : ''}
                </div>
            </div>
        `;
    }

    function renderListItem(u) {
        const isRep = u.role === 'rep';
        const initials = (u.full_name || u.email || '?').trim()[0].toUpperCase();
        const roleLabel = isRep ? 'مندوب' : 'مدير';

        return `
            <div class="user-list-item" data-id="${u.id}">
                <div class="user-list-item__avatar ${isRep ? 'rep' : ''}">${U.escape(initials)}</div>
                <div class="user-list-item__info">
                    <div class="user-list-item__name">${U.escape(u.full_name || 'بدون اسم')}</div>
                    <div class="user-list-item__meta">${U.escape(u.email || u.phone || '-')}</div>
                </div>
                <div class="user-list-item__role ${isRep ? 'rep' : ''}">${roleLabel}</div>
            </div>
        `;
    }

    function bindActions(el) {
        const id = el.dataset.id;
        el.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;
            if (action === 'edit') { e.stopPropagation(); openUserModal(id); }
            else if (action === 'delete') { e.stopPropagation(); openDeleteConfirm(id); }
        });
    }

    /* ============================================
       Add/Edit User
       ============================================ */
    function openUserModal(id = null) {
        State.editingId = id;
        const form = $('#userForm');
        if (form) form.reset();

        if (id) {
            const u = State.users.find(x => x.id === id);
            if (!u) return;
            $('#userModalTitle').textContent = 'تعديل مستخدم';
            $('#userId').value = id;
            $('#userFullName').value = u.full_name || '';
            $('#userEmail').value = u.email || '';
            $('#userPhone').value = u.phone || '';
            $('#userRole').value = u.role || 'rep';
            $('#userActive').checked = u.is_active !== false;

            // Hide password field on edit
            $('#passwordGroup').style.display = 'none';
            $('#userPassword').required = false;
            $('#userEmail').disabled = true; // Can't change email
        } else {
            $('#userModalTitle').textContent = 'إضافة مستخدم';
            $('#userId').value = '';
            $('#userPassword').required = true;
            $('#passwordGroup').style.display = 'block';
            $('#userEmail').disabled = false;
            $('#userRole').value = 'rep';
            $('#userActive').checked = true;
        }

        openModal('userModal');
        setTimeout(() => $('#userFullName')?.focus(), 200);
    }

    async function saveUser() {
        const fullName = $('#userFullName')?.value.trim();
        const email = $('#userEmail')?.value.trim();
        const password = $('#userPassword')?.value;
        const phone = $('#userPhone')?.value.trim() || '';
        const role = $('#userRole')?.value || 'rep';
        const isActive = $('#userActive')?.checked !== false;

        if (!fullName || !email) {
            showToast('الاسم والبريد مطلوبان', 'warning');
            return;
        }

        if (!State.editingId) {
            if (!password || password.length < 6) {
                showToast('كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'warning');
                return;
            }
        }

        const btn = $('#saveUserBtn');
        if (btn) btn.disabled = true;

        try {
            const client = window.DB.client;

            if (State.editingId) {
                // Update existing profile
                const { error } = await client
                    .from('profiles')
                    .update({
                        full_name: fullName,
                        phone,
                        role,
                        is_active: isActive
                    })
                    .eq('id', State.editingId);
                if (error) throw error;

                showToast('تم تحديث بيانات المستخدم', 'success');
            } else {
                // Create new user (needs signup)
                // Note: This should normally be done via Edge Function
                // For simplicity, we create auth user via signup and then profile
                const { data: authData, error: authError } = await client.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { full_name: fullName, phone }
                    }
                });

                if (authError) throw authError;
                if (!authData.user) throw new Error('فشل إنشاء المستخدم');

                // Create profile (Note: We're now signed in as the new user!)
                // We should immediately sign back in as admin
                // This is a limitation - in production use Edge Function

                showToast('تم إرسال دعوة للمستخدم', 'success');
            }

            closeModal('userModal');
            await loadUsers();
        } catch (e) {
            console.error('Save error:', e);
            showToast(e.message || 'فشل الحفظ', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Delete
       ============================================ */
    function openDeleteConfirm(id) {
        const u = State.users.find(x => x.id === id);
        if (!u) return;
        State.deletingId = id;
        $('#deleteUserName').textContent = u.full_name || u.email;
        openModal('confirmDeleteModal');
    }

    async function confirmDelete() {
        if (!State.deletingId) return;
        const btn = $('#confirmDeleteBtn');
        if (btn) btn.disabled = true;

        try {
            const client = window.DB.client;
            // Soft delete
            const { error } = await client
                .from('profiles')
                .update({
                    deleted_at: new Date().toISOString(),
                    is_active: false
                })
                .eq('id', State.deletingId);

            if (error) throw error;

            showToast('تم حذف المستخدم', 'success');
            closeModal('confirmDeleteModal');
            State.deletingId = null;
            await loadUsers();
        } catch (e) {
            console.error('Delete error:', e);
            showToast('فشل الحذف', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Helpers
       ============================================ */
    function updateUserUI() {
        if (State.currentUser) {
            const avatar = $('#userAvatar');
            const name = $('#sidebarUserName');
            if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
            if (name) name.textContent = State.currentUser.fullName || 'مدير';
        }
    }

    function updateConnStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('is-offline', !online);
        const status = $('#connStatus');
        if (status) {
            status.textContent = online ? 'متصل' : 'غير متصل';
            status
