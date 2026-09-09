/* =============================================
   customers.js - منطق صفحة العملاء والموردين
   ============================================= */
(async function() {
    'use strict';

    // عناصر DOM
    const loadingBar = document.getElementById('loading-bar');
    const refreshBtn = document.getElementById('refreshBtn');
    const menuToggle = document.getElementById('menuToggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebarOverlay');
    const sidebarAvatar = document.getElementById('sidebarAvatar');
    const sidebarUserName = document.getElementById('sidebarUserName');
    const searchInput = document.getElementById('searchInput');
    const typeFilter = document.getElementById('typeFilter');
    const tableBody = document.getElementById('tableBody');
    const cardsWrapper = document.getElementById('cardsWrapper');
    const emptyState = document.getElementById('emptyState');
    const addCustomerBtn = document.getElementById('addCustomerBtn');
    const partyModal = document.getElementById('partyModal');
    const modalTitle = document.getElementById('modalTitle');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const partyName = document.getElementById('partyName');
    const partyType = document.getElementById('partyType');
    const partyPhone = document.getElementById('partyPhone');
    const partyBalance = document.getElementById('partyBalance');
    const partyNotes = document.getElementById('partyNotes');
    const saveBtn = document.getElementById('saveBtn');

    let allParties = [];
    let editingId = null;

    // ========== دوال مساعدة ==========
    function debounce(fn, ms) {
        let t;
        return (...args) => {
            clearTimeout(t);
            t = setTimeout(() => fn(...args), ms);
        };
    }

    function safeToast(msg, type = 'error') {
        if (window.Toast && typeof window.Toast[type] === 'function') {
            window.Toast[type](msg);
        } else if (window.Toast && typeof window.Toast.show === 'function') {
            window.Toast.show(msg, type);
        } else {
            alert(msg);
        }
    }

    function formatCurrency(value) {
        return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م';
    }

    function showLoading() { loadingBar.style.width = '80%'; }
    function hideLoading() {
        loadingBar.style.width = '100%';
        setTimeout(() => { loadingBar.style.width = '0%'; }, 300);
    }

    function getTypeBadge(type) {
        return type === 'customer'
            ? '<span class="type-badge type-customer">عميل</span>'
            : '<span class="type-badge type-supplier">مورد</span>';
    }

    function getBalanceClass(balance) {
        if (balance > 0) return 'balance-positive';
        if (balance < 0) return 'balance-negative';
        return '';
    }

    function getBalanceLabel(balance) {
        if (balance > 0) return `دائن ${formatCurrency(balance)}`;
        if (balance < 0) return `مدين ${formatCurrency(-balance)}`;
        return 'لا رصيد';
    }

    // ========== ربط القائمة الجانبية ==========
    function bindSidebar() {
        menuToggle?.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('show');
        });
        sidebarOverlay?.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(item => {
            item.addEventListener('click', () => {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('show');
            });
        });
    }

    // ========== تحميل بيانات المستخدم ==========
    async function loadUserInfo() {
        if (!window.App?.getCurrentUser) return;
        try {
            const user = await App.getCurrentUser();
            if (user) {
                sidebarAvatar.textContent = (user.fullName || 'U')[0].toUpperCase();
                sidebarUserName.textContent = user.fullName || user.email || 'مدير';
            }
        } catch (e) { /* silent */ }
    }

    // ========== جلب الجهات ==========
    async function loadParties() {
        showLoading();
        try {
            allParties = await DB.getParties() || [];
            applyFilters();
        } catch (e) {
            console.error('فشل جلب الجهات:', e);
            safeToast('تعذر تحميل البيانات', 'error');
            showEmptyState(true);
        } finally {
            hideLoading();
        }
    }

    // ========== تطبيق الفلاتر ==========
    function applyFilters() {
        const searchTerm = searchInput.value.trim().toLowerCase();
        const type = typeFilter.value;

        let filtered = [...allParties];

        if (searchTerm) {
            filtered = filtered.filter(p =>
                (p.name || '').toLowerCase().includes(searchTerm) ||
                (p.phone || '').includes(searchTerm)
            );
        }
        if (type) filtered = filtered.filter(p => p.type === type);

        if (!filtered.length) {
            showEmptyState(true);
            tableBody.innerHTML = '';
            cardsWrapper.innerHTML = '';
            return;
        }
        showEmptyState(false);
        renderTable(filtered);
        renderCards(filtered);
    }

    function showEmptyState(show) {
        emptyState.style.display = show ? 'block' : 'none';
    }

    // ========== عرض الجدول ==========
    function renderTable(parties) {
        tableBody.innerHTML = parties.map(p => `
            <tr>
                <td>${p.name}</td>
                <td>${getTypeBadge(p.type)}</td>
                <td>${p.phone || '-'}</td>
                <td class="${getBalanceClass(p.balance)}">${getBalanceLabel(p.balance)}</td>
                <td>
                    <button class="btn-sm btn-outline edit-btn" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                    <button class="btn-sm btn-outline delete-btn" data-id="${p.id}"><i class="fas fa-trash" style="color: var(--danger);"></i></button>
                </td>
            </tr>
        `).join('');
        bindActions(tableBody);
    }

    // ========== عرض البطاقات ==========
    function renderCards(parties) {
        cardsWrapper.innerHTML = parties.map(p => `
            <div class="party-card">
                <div class="party-card-header">
                    <span class="value">${p.name}</span>
                    ${getTypeBadge(p.type)}
                </div>
                <div class="party-card-body">
                    <div><div class="label">الهاتف</div><div class="value">${p.phone || '-'}</div></div>
                    <div><div class="label">الرصيد</div><div class="value ${getBalanceClass(p.balance)}">${getBalanceLabel(p.balance)}</div></div>
                </div>
                <div class="party-card-footer">
                    <button class="btn-sm btn-outline edit-btn" data-id="${p.id}"><i class="fas fa-edit"></i> تعديل</button>
                    <button class="btn-sm btn-outline delete-btn" data-id="${p.id}"><i class="fas fa-trash"></i> حذف</button>
                </div>
            </div>
        `).join('');
        bindActions(cardsWrapper);
    }

    // ========== ربط أزرار الإجراءات ==========
    function bindActions(container) {
        container.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', () => openEditModal(btn.dataset.id));
        });
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', () => deleteParty(btn.dataset.id));
        });
    }

    // ========== فتح مودال الإضافة ==========
    function openAddModal() {
        editingId = null;
        modalTitle.textContent = 'إضافة جهة';
        partyName.value = '';
        partyType.value = 'customer';
        partyPhone.value = '';
        partyBalance.value = '0';
        partyNotes.value = '';
        partyModal.classList.add('open');
    }

    // ========== فتح مودال التعديل ==========
    function openEditModal(id) {
        const party = allParties.find(p => p.id === id);
        if (!party) return;
        editingId = id;
        modalTitle.textContent = 'تعديل جهة';
        partyName.value = party.name || '';
        partyType.value = party.type || 'customer';
        partyPhone.value = party.phone || '';
        partyBalance.value = party.balance || 0;
        partyNotes.value = party.notes || '';
        partyModal.classList.add('open');
    }

    // ========== حفظ (إضافة أو تعديل) ==========
    async function saveParty() {
        const name = partyName.value.trim();
        if (!name) {
            safeToast('الاسم مطلوب', 'warning');
            return;
        }
        const data = {
            id: editingId || undefined,
            name,
            type: partyType.value,
            phone: partyPhone.value.trim(),
            balance: +partyBalance.value || 0,
            notes: partyNotes.value.trim(),
            _operation: editingId ? 'UPDATE' : 'INSERT'
        };

        saveBtn.disabled = true;
        try {
            await DB.saveParty(data);
            safeToast(editingId ? 'تم التعديل' : 'تمت الإضافة', 'success');
            partyModal.classList.remove('open');
            await loadParties();
        } catch (e) {
            console.error(e);
            safeToast('فشل الحفظ', 'error');
        } finally {
            saveBtn.disabled = false;
        }
    }

    // ========== حذف جهة ==========
    async function deleteParty(id) {
        if (!confirm('هل أنت متأكد من الحذف؟')) return;
        try {
            await DB.deleteParty(id);
            safeToast('تم الحذف', 'success');
            await loadParties();
        } catch (e) {
            console.error(e);
            safeToast('فشل الحذف', 'error');
        }
    }

    // ========== إعداد Realtime ==========
    function setupRealtimeSync() {
        if (!window.supabaseClient) return;
        window.supabaseClient
            .channel('parties-updates')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'parties' }, () => {
                loadParties();
            })
            .subscribe();
    }

    // ========== التهيئة ==========
    async function init() {
        try {
            if (!window.App || !window.DB) {
                safeToast('النواة غير محملة', 'error');
                return;
            }
            const authorized = await App.requireAuth();
            if (!authorized) return;
            if (!App.requireRole || !(await App.requireRole(['admin']))) return;

            bindSidebar();
            await loadUserInfo();
            await loadParties();
            setupRealtimeSync();

            refreshBtn?.addEventListener('click', loadParties);
            searchInput?.addEventListener('input', debounce(applyFilters, 300));
            typeFilter?.addEventListener('change', applyFilters);
            addCustomerBtn?.addEventListener('click', openAddModal);
            saveBtn?.addEventListener('click', saveParty);
            closeModalBtn?.addEventListener('click', () => partyModal.classList.remove('open'));
            partyModal.addEventListener('click', (e) => {
                if (e.target === partyModal) partyModal.classList.remove('open');
            });
            window.addEventListener('online', loadParties);

        } catch (e) {
            console.error('فشل التهيئة:', e);
            safeToast('تعذر تحميل الصفحة', 'error');
        }
    }

    init();
})();
