/* =============================================
   الإعدادات - حسابي (إصدار متقدم مع طابعة)
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
            // الشركة
            companyName: document.getElementById('companyName'),
            companyPhone: document.getElementById('companyPhone'),
            companyAddress: document.getElementById('companyAddress'),
            // مالية
            currency: document.getElementById('currency'),
            openingBalance: document.getElementById('openingBalance'),
            minStock: document.getElementById('minStock'),
            // طباعة أساسية
            footerMessage: document.getElementById('footerMessage'),
            printCopies: document.getElementById('printCopies'),
            // طباعة متقدمة
            fontSize: document.getElementById('fontSize'),
            paperWidth: document.getElementById('paperWidth'),
            receiptTemplate: document.getElementById('receiptTemplate'),
            printerType: document.getElementById('printerType'),
            connectPrinterBtn: document.getElementById('connectPrinterBtn'),
            connectUsbPrinterBtn: document.getElementById('connectUsbPrinterBtn'),
            printerStatus: document.getElementById('printerStatus'),
            // حفظ
            saveSettingsBtn: document.getElementById('saveSettingsBtn'),
            // مستخدمين
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

        // ربط الطابعات
        this.el.connectPrinterBtn.addEventListener('click', () => this.connectBluetoothPrinter());
        this.el.connectUsbPrinterBtn.addEventListener('click', () => this.connectUsbPrinter());

        // المستخدمين
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
            const p = this.currentSettings.printing || {};
            const f = this.currentSettings.financial || {};
            const c = this.currentSettings.company || {};

            this.el.companyName.value = c.name || '';
            this.el.companyPhone.value = c.phone || '';
            this.el.companyAddress.value = c.address || '';
            this.el.currency.value = f.currency || 'ج.م';
            this.el.openingBalance.value = f.opening_cash_balance || 0;
            this.el.minStock.value = this.currentSettings.min_stock || 5;
            this.el.footerMessage.value = p.footer_message || '';
            this.el.printCopies.value = p.copies || 1;
            this.el.fontSize.value = p.font_size || 13;
            this.el.paperWidth.value = p.paper_width || 42;
            this.el.receiptTemplate.value = p.template || 'default';
            this.el.printerType.value = p.printer_type || 'bluetooth';

            // عرض حالة الطابعة إن كانت قد حفظت
            if (p.printer_name) {
                this.showPrinterStatus(`الطابعة المفضلة: ${p.printer_name}`, 'connected');
            }
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
                footer_message: this.el.footerMessage.value.trim(),
                copies: parseInt(this.el.printCopies.value) || 1,
                font_size: parseInt(this.el.fontSize.value) || 13,
                paper_width: parseInt(this.el.paperWidth.value) || 42,
                template: this.el.receiptTemplate.value,
                printer_type: this.el.printerType.value,
                // الاحتفاظ باسم الطابعة إن كانت قد حفظت سابقاً
                printer_name: this.currentSettings.printing?.printer_name || null
            },
            min_stock: parseInt(this.el.minStock.value) || 5
        };

        try {
            if (this.isDBReady) {
                await DB.saveSettings(settings);
                this.currentSettings = settings;
                alert('تم حفظ جميع الإعدادات بنجاح');
            } else {
                localStorage.setItem('app_settings', JSON.stringify(settings));
                alert('تم حفظ الإعدادات محلياً (وضع الاختبار)');
            }
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الإعدادات: ' + err.message);
        }
    },

    // ========== ربط الطابعات (Web Bluetooth و WebUSB) ==========
    async connectBluetoothPrinter() {
        if (!navigator.bluetooth) {
            this.showPrinterStatus('متصفحك لا يدعم Bluetooth. استخدم Chrome على أندرويد/ويندوز.', 'error');
            return;
        }
        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'] // خدمة طباعة شائعة
            });
            this.showPrinterStatus(`تم ربط الطابعة: ${device.name}`, 'connected');
            // حفظ اسم الطابعة مؤقتاً (سيُحفظ مع الإعدادات عند الضغط على حفظ)
            if (!this.currentSettings.printing) this.currentSettings.printing = {};
            this.currentSettings.printing.printer_name = device.name;
            // تنبيه المستخدم بضرورة حفظ الإعدادات
            alert('تم ربط الطابعة بنجاح. اضغط "حفظ جميع الإعدادات" لتخزينها.');
        } catch (error) {
            console.error(error);
            this.showPrinterStatus('فشل ربط الطابعة: ' + error.message, 'error');
        }
    },

    async connectUsbPrinter() {
        if (!navigator.usb) {
            this.showPrinterStatus('متصفحك لا يدعم USB. استخدم Chrome على سطح المكتب.', 'error');
            return;
        }
        try {
            const device = await navigator.usb.requestDevice({ filters: [] });
            await device.open();
            await device.selectConfiguration(1);
            await device.claimInterface(0);
            this.showPrinterStatus(`تم ربط طابعة USB: ${device.productName || 'غير معروف'}`, 'connected');
            if (!this.currentSettings.printing) this.currentSettings.printing = {};
            this.currentSettings.printing.printer_name = device.productName || 'طابعة USB';
            alert('تم ربط الطابعة بنجاح. اضغط "حفظ جميع الإعدادات" لتخزينها.');
        } catch (error) {
            console.error(error);
            this.showPrinterStatus('فشل ربط طابعة USB: ' + error.message, 'error');
        }
    },

    showPrinterStatus(message, type) {
        const el = this.el.printerStatus;
        el.textContent = message;
        el.className = 'printer-status ' + type;
    },

    // ========== إدارة المستخدمين (كما هي دون تغيير) ==========
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
        if (!fullName || !email || !password) { alert('جميع الحقول مطلوبة'); return; }
        try {
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
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (error) throw error;
            alert('تم حذف المستخدم من القائمة (قد تحتاج حذف الحساب من لوحة التحكم)');
            await this.loadUsers();
        } catch (err) {
            console.error(err);
            alert('فشل حذف المستخدم: ' + err.message);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => Settings.init());
