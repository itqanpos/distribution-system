/* =============================================
   settings.js - الإعدادات (إصدار مُحسَّن)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (v) => Number(v||0).toLocaleString('ar-EG', {minimumFractionDigits:2}) + ' ج.م',
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase),
        hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
    };
}

const Settings = {
    users: [],
    editingUserId: null,

    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadSettings();
        this.loadUsers();
    },

    cacheElements() {
        this.el = {
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            // الإعدادات العامة
            companyName: document.getElementById('companyName'),
            companyPhone: document.getElementById('companyPhone'),
            companyAddress: document.getElementById('companyAddress'),
            currency: document.getElementById('currency'),
            openingBalance: document.getElementById('openingBalance'),
            minStock: document.getElementById('minStock'),
            footerMessage: document.getElementById('footerMessage'),
            printCopies: document.getElementById('printCopies'),
            receiptTemplate: document.getElementById('receiptTemplate'),
            fontSize: document.getElementById('fontSize'),
            paperWidth: document.getElementById('paperWidth'),
            printerType: document.getElementById('printerType'),
            saveAllSettingsBtn: document.getElementById('saveAllSettingsBtn'),
            connectPrinterBtn: document.getElementById('connectPrinterBtn'),
            connectUsbBtn: document.getElementById('connectUsbBtn'),
            printerStatus: document.getElementById('printerStatus'),
            // المستخدمين
            addUserBtn: document.getElementById('addUserBtn'),
            usersBody: document.getElementById('usersBody'),
            userModal: document.getElementById('userModal'),
            userModalTitle: document.getElementById('userModalTitle'),
            closeUserModalBtn: document.getElementById('closeUserModalBtn'),
            cancelUserModalBtn: document.getElementById('cancelUserModalBtn'),
            userForm: document.getElementById('userForm'),
            userId: document.getElementById('userId'),
            userFullName: document.getElementById('userFullName'),
            userEmail: document.getElementById('userEmail'),
            userPassword: document.getElementById('userPassword'),
            userRole: document.getElementById('userRole'),
            toast: document.getElementById('toast')
        };
    },

    bindEvents() {
        // القائمة
        this.el.userProfileBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay?.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });
        this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        // حفظ الإعدادات
        this.el.saveAllSettingsBtn?.addEventListener('click', () => this.saveAllSettings());

        // الطابعة
        this.el.connectPrinterBtn?.addEventListener('click', () => this.connectPrinter('bluetooth'));
        this.el.connectUsbBtn?.addEventListener('click', () => this.connectPrinter('usb'));

        // المستخدمين
        this.el.addUserBtn?.addEventListener('click', () => this.openUserModal());
        this.el.closeUserModalBtn?.addEventListener('click', () => this.closeUserModal());
        this.el.cancelUserModalBtn?.addEventListener('click', () => this.closeUserModal());
        this.el.userForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveUser(); });
    },

    async loadSettings() {
        try {
            let settings = {};
            if (Utils.isDBReady()) {
                settings = await DB.getSettings().catch(() => ({}));
            } else if (Utils.hasLocalDB()) {
                const s = await localDB.getById('settings', 'main').catch(() => null);
                settings = s?.data || {};
            } else {
                const saved = localStorage.getItem('app_settings');
                settings = saved ? JSON.parse(saved) : {};
            }

            // تعبئة الحقول
            this.el.companyName.value = settings?.company?.name || '';
            this.el.companyPhone.value = settings?.company?.phone || '';
            this.el.companyAddress.value = settings?.company?.address || '';
            this.el.currency.value = settings?.financial?.currency || 'ج.م';
            this.el.openingBalance.value = settings?.financial?.opening_cash_balance || 0;
            this.el.minStock.value = settings?.inventory?.min_stock || 5;
            this.el.footerMessage.value = settings?.print?.footer_message || '';
            this.el.printCopies.value = settings?.print?.copies || 1;
            this.el.receiptTemplate.value = settings?.print?.template || 'default';
            this.el.fontSize.value = settings?.print?.font_size || 13;
            this.el.paperWidth.value = settings?.print?.paper_width || 42;
            this.el.printerType.value = settings?.print?.printer_type || 'bluetooth';
        } catch (err) {
            console.error('فشل تحميل الإعدادات:', err);
        }
    },

    async saveAllSettings() {
        const settings = {
            company: {
                name: this.el.companyName.value.trim(),
                phone: this.el.companyPhone.value.trim(),
                address: this.el.companyAddress.value.trim()
            },
            financial: {
                currency: this.el.currency.value.trim() || 'ج.م',
                opening_cash_balance: parseFloat(this.el.openingBalance.value) || 0
            },
            inventory: {
                min_stock: parseInt(this.el.minStock.value) || 5
            },
            print: {
                footer_message: this.el.footerMessage.value.trim(),
                copies: parseInt(this.el.printCopies.value) || 1,
                template: this.el.receiptTemplate.value,
                font_size: parseInt(this.el.fontSize.value) || 13,
                paper_width: parseInt(this.el.paperWidth.value) || 42,
                printer_type: this.el.printerType.value
            }
        };

        try {
            if (Utils.isDBReady()) {
                await DB.saveSettings(settings);
            } else if (Utils.hasLocalDB()) {
                await localDB.put('settings', { id: 'main', data: settings });
            } else {
                localStorage.setItem('app_settings', JSON.stringify(settings));
            }
            this.showToast('تم حفظ الإعدادات بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الإعدادات');
        }
    },

    connectPrinter(type) {
        this.el.printerStatus.innerHTML = `<span style="color:var(--warning);">⏳ جاري البحث عن طابعة ${type === 'bluetooth' ? 'بلوتوث' : 'USB'}...</span>`;
        setTimeout(() => {
            this.el.printerStatus.innerHTML = '<span style="color:var(--secondary);">✅ تم الربط بنجاح (محاكاة)</span>';
        }, 1500);
    },

    // ========== إدارة المستخدمين ==========
    async loadUsers() {
        try {
            if (Utils.isDBReady()) {
                this.users = await DB.getUsers?.() || [];
            } else if (Utils.hasLocalDB()) {
                this.users = await localDB.getAll('users') || [];
            } else {
                this.users = [{ id: '1', full_name: 'مدير النظام', email: 'admin@test.com', role: 'admin' }];
            }
            this.renderUsers();
        } catch (err) {
            console.error('فشل تحميل المستخدمين:', err);
        }
    },

    renderUsers() {
        if (!this.el.usersBody) return;
        if (!this.users.length) {
            this.el.usersBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--gray-400);">لا يوجد مستخدمون</td></tr>';
            return;
        }
        this.el.usersBody.innerHTML = this.users.map(u => `
            <tr>
                <td>${u.full_name || ''}</td>
                <td>${u.email || ''}</td>
                <td>${u.role === 'admin' ? 'مدير' : 'مندوب'}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" onclick="Settings.editUser('${u.id}')"></i>
                    ${u.role !== 'admin' ? `<i class="fas fa-trash" style="color:var(--danger);" onclick="Settings.deleteUser('${u.id}')"></i>` : ''}
                </td>
            </tr>
        `).join('');
    },

    openUserModal(user = null) {
        this.editingUserId = user?.id || null;
        this.el.userModalTitle.textContent = user ? 'تعديل مستخدم' : 'إضافة مستخدم';
        this.el.userId.value = user?.id || '';
        this.el.userFullName.value = user?.full_name || '';
        this.el.userEmail.value = user?.email || '';
        this.el.userPassword.value = '';
        this.el.userRole.value = user?.role || 'admin';
        this.el.userModal.classList.add('open');
    },

    closeUserModal() {
        this.el.userModal.classList.remove('open');
    },

    async saveUser() {
        const full_name = this.el.userFullName.value.trim();
        const email = this.el.userEmail.value.trim();
        const password = this.el.userPassword.value;
        const role = this.el.userRole.value;

        if (!full_name || !email) return alert('الاسم والبريد مطلوبان');
        if (!this.editingUserId && !password) return alert('كلمة المرور مطلوبة');

        const userData = {
            id: this.editingUserId || (crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now()),
            full_name, email, role,
            ...(password ? { password } : {})
        };

        try {
            if (Utils.isDBReady()) {
                await DB.saveUser(userData);
            } else if (Utils.hasLocalDB()) {
                await localDB.put('users', userData);
            } else {
                const local = JSON.parse(localStorage.getItem('users') || '[]');
                const idx = local.findIndex(u => u.id === userData.id);
                if (idx >= 0) local[idx] = userData;
                else local.push(userData);
                localStorage.setItem('users', JSON.stringify(local));
            }
            this.closeUserModal();
            await this.loadUsers();
            this.showToast('تم حفظ المستخدم');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ المستخدم');
        }
    },

    editUser(id) {
        const user = this.users.find(u => u.id === id);
        if (user) this.openUserModal(user);
    },

    async deleteUser(id) {
        if (!confirm('حذف المستخدم؟')) return;
        try {
            if (Utils.isDBReady()) await DB.deleteUser(id);
            else if (Utils.hasLocalDB()) await localDB.delete('users', id);
            else {
                const local = JSON.parse(localStorage.getItem('users') || '[]');
                localStorage.setItem('users', JSON.stringify(local.filter(u => u.id !== id)));
            }
            await this.loadUsers();
            this.showToast('تم حذف المستخدم');
        } catch (err) { console.error(err); }
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._t);
        this._t = setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.Settings = Settings;
document.addEventListener('DOMContentLoaded', () => Settings.init());
