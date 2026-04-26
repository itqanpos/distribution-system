/* =============================================
   الإعدادات - حسابي
   ============================================= */

'use strict';

const Settings = {
    isDBReady: false,
    currentSettings: {},
    users: [],

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
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            // حقول الإعدادات
            companyName: document.getElementById('companyName'),
            companyPhone: document.getElementById('companyPhone'),
            companyAddress: document.getElementById('companyAddress'),
            currency: document.getElementById('currency'),
            openingBalance: document.getElementById('openingBalance'),
            minStock: document.getElementById('minStock'),
            footerMessage: document.getElementById('footerMessage'),
            saveSettingsBtn: document.getElementById('saveSettingsBtn'),
            // المستخدمين
            usersBody: document.getElementById('usersBody'),
            addUserBtn: document.getElementById('addUserBtn'),
            userModal: document.getElementById('userModal'),
            closeUserModalBtn: document.getElementById('closeUserModalBtn'),
            cancelUserModalBtn: document.getElementById('cancelUserModalBtn'),
            userForm: document.getElementById('userForm'),
            userFullName: document.getElementById('userFullName'),
            userEmail: document.getElementById('userEmail'),
            userPassword: document.getElementById('userPassword'),
            userRole: document.getElementById('userRole')
        };
    },

    bindEvents() {
        this.el.userProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.userDropdown.classList.toggle('show');
        });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle.addEventListener('click', () => this.el.sidebar.classList.toggle('mobile-open'));
        this.el.logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        this.el.saveSettingsBtn.addEventListener('click', () => this.saveSettings());

        // إدارة المستخدمين
        this.el.addUserBtn.addEventListener('click', () => this.openUserModal());
        this.el.closeUserModalBtn.addEventListener('click', () => this.closeUserModal());
        this.el.cancelUserModalBtn.addEventListener('click', () => this.closeUserModal());
        this.el.userForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this.addUser();
        });
    },

    async loadSettings() {
        this.isDBReady = !!(window.DB && window.supabase);
        try {
            if (this.isDBReady) {
                this.currentSettings = await DB.getSettings();
            } else {
                this.currentSettings = {};
            }
            // تعبئة الحقول
            const company = this.currentSettings.company || {};
            const financial = this.currentSettings.financial || {};
            const printing = this.currentSettings.printing || {};

            this.el.companyName.value = company.name || '';
            this.el.companyPhone.value = company.phone || '';
            this.el.companyAddress.value = company.address || '';
            this.el.currency.value = financial.currency || 'ج.م';
            this.el.openingBalance.value = financial.opening_cash_balance || 0;
            this.el.minStock.value = this.currentSettings.min_stock || 5;
            this.el.footerMessage.value = printing.footer_message || '';
        } catch (err) {
            console.error('فشل تحميل الإعدادات', err);
        }
    },

    async saveSettings() {
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
            printing: {
                footer_message: this.el.footerMessage.value.trim()
            },
            min_stock: parseInt(this.el.minStock.value) || 5
        };

        try {
            if (this.isDBReady) {
                await DB.saveSettings(settings);
                this.currentSettings = settings;
                alert('تم حفظ الإعدادات بنجاح');
            } else {
                localStorage.setItem('app_settings', JSON.stringify(settings));
                alert('تم حفظ الإعدادات محلياً (وضع الاختبار)');
            }
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الإعدادات: ' + err.message);
        }
    },

    // ====================== إدارة المستخدمين ======================
    async loadUsers() {
        if (!this.isDBReady) {
            this.el.usersBody.innerHTML = '<tr><td colspan="4">قاعدة البيانات غير متصلة</td></tr>';
            return;
        }
        try {
            const { data: profiles, error } = await supabase
                .from('profiles')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.users = profiles || [];
            this.renderUsers();
        } catch (err) {
            console.error('فشل تحميل المستخدمين', err);
            this.el.usersBody.innerHTML = '<tr><td colspan="4">فشل التحميل</td></tr>';
        }
    },

    renderUsers() {
        if (!this.users.length) {
            this.el.usersBody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">لا يوجد مستخدمين</td></tr>';
            return;
        }
        this.el.usersBody.innerHTML = this.users.map(u => `
            <tr>
                <td>${u.full_name || '-'}</td>
                <td>${u.email || '-'}</td>
                <td><span class="badge-role ${u.role === 'admin' ? 'role-admin' : 'role-rep'}">${u.role === 'admin' ? 'مدير' : 'مندوب'}</span></td>
                <td>
                    <i class="fas fa-trash" style="color:var(--danger); cursor:pointer;" onclick="Settings.deleteUser('${u.id}')" title="حذف"></i>
                </td>
            </tr>
        `).join('');
    },

    openUserModal() {
        this.el.userForm.reset();
        this.el.userModal.style.display = 'flex';
    },

    closeUserModal() {
        this.el.userModal.style.display = 'none';
    },

    async addUser() {
        const fullName = this.el.userFullName.value.trim();
        const email = this.el.userEmail.value.trim();
        const password = this.el.userPassword.value;
        const role = this.el.userRole.value;

        if (!fullName || !email || !password) {
            alert('جميع الحقول مطلوبة');
            return;
        }

        try {
            // استخدام دالة signup من App (موجودة في supabase.js)
            const result = await App.signup(email, password, fullName, role);
            if (result.success) {
                alert('تم إضافة المستخدم بنجاح');
                this.closeUserModal();
                await this.loadUsers();
            } else {
                alert('فشل: ' + result.message);
            }
        } catch (err) {
            console.error(err);
            alert('حدث خطأ: ' + err.message);
        }
    },

    async deleteUser(id) {
        if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
        try {
            // حذف من profiles أولاً
            const { error: profileError } = await supabase.from('profiles').delete().eq('id', id);
            if (profileError) throw profileError;

            // حذف من auth (يتطلب صلاحيات admin - قد تحتاج لدالة edge function)
            // في البيئة الحالية قد لا نستطيع حذف المستخدم من auth مباشرة،
            // لذا نكتفي بحذف profile أو ننشئ وظيفة سحابية
            alert('تم حذف المستخدم من القائمة (قد تحتاج حذف الحساب من لوحة التحكم)');
            await this.loadUsers();
        } catch (err) {
            console.error(err);
            alert('فشل حذف المستخدم: ' + err.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Settings.init());
