/* =============================================
   settings.js - صفحة الإعدادات الكاملة
   يدعم جميع التبويبات: عام، إيصالات، فواتير،
   مظهر، مستخدمين، نسخ احتياطي، إشعارات، متقدم
   ============================================= */
'use strict';

const Settings = {
    state: {
        settings: {},
        users: [],
        currentUserId: null
    },

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadSettings();
        this.loadUsers();
        if (window.App) {
            App.requireAuth().then(auth => { if (!auth) return; });
            App.initUserInterface();
        }
        this.initSidebarUser();
    },

    cacheDOM() {
        this.el = {
            tabs: document.querySelectorAll('.settings-tab'),
            panels: document.querySelectorAll('.settings-panel'),
            // عام
            companyName: document.getElementById('companyName'),
            companyPhone: document.getElementById('companyPhone'),
            companyEmail: document.getElementById('companyEmail'),
            companyAddress: document.getElementById('companyAddress'),
            logoUrl: document.getElementById('logoUrl'),
            currency: document.getElementById('currency'),
            dateFormat: document.getElementById('dateFormat'),
            saveGeneral: document.getElementById('saveGeneral'),
            // إيصالات
            receiptWidth: document.getElementById('receiptWidth'),
            receiptFontSize: document.getElementById('receiptFontSize'),
            footerMessage: document.getElementById('footerMessage'),
            showBarcode: document.getElementById('showBarcode'),
            printCopies: document.getElementById('printCopies'),
            autoPrint: document.getElementById('autoPrint'),
            saveReceipt: document.getElementById('saveReceipt'),
            // فواتير
            invoicePrefix: document.getElementById('invoicePrefix'),
            showTax: document.getElementById('showTax'),
            taxRate: document.getElementById('taxRate'),
            allowDiscount: document.getElementById('allowDiscount'),
            saveInvoice: document.getElementById('saveInvoice'),
            // مظهر
            themeSelect: document.getElementById('themeSelect'),
            globalFontSize: document.getElementById('globalFontSize'),
            saveAppearance: document.getElementById('saveAppearance'),
            // مستخدمين
            usersList: document.getElementById('usersList'),
            addUserBtn: document.getElementById('addUserBtn'),
            userModal: document.getElementById('userModal'),
            userModalTitle: document.getElementById('userModalTitle'),
            editUserId: document.getElementById('editUserId'),
            userFullName: document.getElementById('userFullName'),
            userEmail: document.getElementById('userEmail'),
            userPassword: document.getElementById('userPassword'),
            userRole: document.getElementById('userRole'),
            saveUserBtn: document.getElementById('saveUserBtn'),
            cancelUserBtn: document.getElementById('cancelUserBtn'),
            // نسخ احتياطي
            exportData: document.getElementById('exportData'),
            importDataBtn: document.getElementById('importDataBtn'),
            importFile: document.getElementById('importFile'),
            // إشعارات
            enableNotifications: document.getElementById('enableNotifications'),
            notificationSound: document.getElementById('notificationSound'),
            saveNotifications: document.getElementById('saveNotifications'),
            // متقدم
            apiKey: document.getElementById('apiKey'),
            resetSystem: document.getElementById('resetSystem'),
            saveAdvanced: document.getElementById('saveAdvanced'),
            // مشترك
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            moreMenuBtn: document.getElementById('moreMenuBtn'),
            moreDropdown: document.getElementById('moreDropdown'),
            logoutBtn: document.getElementById('logoutBtn'),
            sidebarAvatar: document.getElementById('sidebarAvatar'),
            sidebarUserName: document.getElementById('sidebarUserName'),
            toast: document.getElementById('toast')
        };
    },

    bindEvents() {
        // تبويبات
        this.el.tabs.forEach(tab => tab.addEventListener('click', () => this.switchTab(tab.dataset.tab)));

        // حفظ كل قسم
        this.el.saveGeneral?.addEventListener('click', () => this.saveSection('general'));
        this.el.saveReceipt?.addEventListener('click', () => this.saveSection('receipt'));
        this.el.saveInvoice?.addEventListener('click', () => this.saveSection('invoice'));
        this.el.saveAppearance?.addEventListener('click', () => this.saveSection('appearance'));
        this.el.saveNotifications?.addEventListener('click', () => this.saveSection('notifications'));
        this.el.saveAdvanced?.addEventListener('click', () => this.saveSection('advanced'));

        // المستخدمين
        this.el.addUserBtn?.addEventListener('click', () => this.openUserModal());
        this.el.cancelUserBtn?.addEventListener('click', () => this.closeUserModal());
        this.el.saveUserBtn?.addEventListener('click', () => this.saveUser());
        this.el.userModal?.addEventListener('click', (e) => { if (e.target === this.el.userModal) this.closeUserModal(); });

        // نسخ احتياطي
        this.el.exportData?.addEventListener('click', () => this.exportAllData());
        this.el.importDataBtn?.addEventListener('click', () => this.el.importFile.click());
        this.el.importFile?.addEventListener('change', (e) => this.importAllData(e));

        // إعادة تعيين
        this.el.resetSystem?.addEventListener('click', () => this.resetSystem());

        // المظهر (تطبيق فوري)
        this.el.themeSelect?.addEventListener('change', () => this.applyTheme());

        // القائمة الجانبية
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });
        this.el.moreMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.el.moreDropdown?.classList.toggle('show');
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) this.el.moreDropdown?.classList.remove('show');
        });
    },

    async loadSettings() {
        try {
            let settings = {};
            if (window.DB && window.DB.getSettings) {
                settings = await DB.getSettings();
            } else {
                settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
            }
            this.state.settings = settings;
            this.populateFields(settings);
            this.applyTheme();
        } catch (e) {
            console.warn('فشل تحميل الإعدادات:', e);
        }
    },

    populateFields(s) {
        const setVal = (el, val) => { if (el) el.value = val || ''; };
        setVal(this.el.companyName, s.company?.name);
        setVal(this.el.companyPhone, s.company?.phone);
        setVal(this.el.companyEmail, s.company?.email);
        setVal(this.el.companyAddress, s.company?.address);
        setVal(this.el.logoUrl, s.company?.logoUrl);
        setVal(this.el.currency, s.company?.currency);
        setVal(this.el.dateFormat, s.company?.dateFormat || 'ar-EG');

        setVal(this.el.receiptWidth, s.print?.receipt_width || '80mm');
        setVal(this.el.receiptFontSize, s.print?.font_size || '12px');
        setVal(this.el.footerMessage, s.print?.footer_message);
        setVal(this.el.showBarcode, s.print?.show_barcode ? '1' : '0');
        setVal(this.el.printCopies, s.print?.copies || 1);
        setVal(this.el.autoPrint, s.print?.auto_print ? '1' : '0');

        setVal(this.el.invoicePrefix, s.invoice?.prefix);
        setVal(this.el.showTax, s.invoice?.show_tax ? '1' : '0');
        setVal(this.el.taxRate, s.invoice?.tax_rate);
        setVal(this.el.allowDiscount, s.invoice?.allow_discount ? '1' : '0');

        setVal(this.el.themeSelect, s.appearance?.theme || 'dark');
        setVal(this.el.globalFontSize, s.appearance?.font_size || '16px');

        setVal(this.el.enableNotifications, s.notifications?.enabled ? '1' : '0');
        setVal(this.el.notificationSound, s.notifications?.sound || 'default');

        setVal(this.el.apiKey, s.advanced?.api_key || '');
    },

    async saveSection(section) {
        try {
            const s = this.state.settings;

            switch (section) {
                case 'general':
                    s.company = {
                        name: this.el.companyName.value,
                        phone: this.el.companyPhone.value,
                        email: this.el.companyEmail.value,
                        address: this.el.companyAddress.value,
                        logoUrl: this.el.logoUrl.value,
                        currency: this.el.currency.value || 'ج.م',
                        dateFormat: this.el.dateFormat.value
                    };
                    break;
                case 'receipt':
                    s.print = {
                        receipt_width: this.el.receiptWidth.value,
                        font_size: this.el.receiptFontSize.value,
                        footer_message: this.el.footerMessage.value,
                        show_barcode: this.el.showBarcode.value === '1',
                        copies: parseInt(this.el.printCopies.value) || 1,
                        auto_print: this.el.autoPrint.value === '1'
                    };
                    break;
                case 'invoice':
                    s.invoice = {
                        prefix: this.el.invoicePrefix.value,
                        show_tax: this.el.showTax.value === '1',
                        tax_rate: parseFloat(this.el.taxRate.value) || 0,
                        allow_discount: this.el.allowDiscount.value === '1'
                    };
                    break;
                case 'appearance':
                    s.appearance = {
                        theme: this.el.themeSelect.value,
                        font_size: this.el.globalFontSize.value
                    };
                    this.applyTheme();
                    break;
                case 'notifications':
                    s.notifications = {
                        enabled: this.el.enableNotifications.value === '1',
                        sound: this.el.notificationSound.value
                    };
                    break;
                case 'advanced':
                    s.advanced = {
                        api_key: this.el.apiKey.value
                    };
                    break;
            }

            await this.persistSettings(s);
            this.showToast('تم حفظ الإعدادات', 'success');
        } catch (e) {
            console.error('فشل حفظ الإعدادات:', e);
            this.showToast('فشل حفظ الإعدادات', 'error');
        }
    },

    async persistSettings(s) {
        this.state.settings = s;
        localStorage.setItem('app_settings', JSON.stringify(s));
        if (window.DB && window.DB.saveSettings) {
            await DB.saveSettings(s);
        }
    },

    applyTheme() {
        const theme = this.el.themeSelect.value;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('app_theme', theme);
        if (theme === 'dark') {
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0f172a');
        } else {
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#ffffff');
        }
    },

    switchTab(tabId) {
        this.el.tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.tab === tabId));
        this.el.panels.forEach(panel => panel.classList.toggle('active', panel.id === `panel-${tabId}`));
    },

    // ========== إدارة المستخدمين ==========
    async loadUsers() {
        try {
            let profiles = [];
            if (window.supabase) {
                const tenantId = await App.getTenantId();
                if (tenantId) {
                    const { data, error } = await supabase.from('profiles').select('*').eq('tenant_id', tenantId);
                    if (!error) profiles = data;
                }
            } else {
                profiles = JSON.parse(localStorage.getItem('local_users') || '[]');
            }
            this.state.users = profiles;
            this.renderUsers();
        } catch (e) {
            console.warn('فشل تحميل المستخدمين:', e);
        }
    },

    renderUsers() {
        if (!this.el.usersList) return;
        const users = this.state.users;
        if (!users.length) {
            this.el.usersList.innerHTML = '<p style="color: var(--text-muted);">لا يوجد مستخدمين إضافيين.</p>';
            return;
        }
        this.el.usersList.innerHTML = users.map(u => `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg-surface); border:1px solid var(--border); border-radius:12px;">
                <div>
                    <strong>${u.full_name || u.email}</strong>
                    <div style="color:var(--text-muted); font-size:12px;">${u.role === 'admin' ? 'مدير' : 'مندوب'}</div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-outline" style="padding:6px 12px;" onclick="Settings.editUser('${u.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn-outline" style="padding:6px 12px; color:#dc2626;" onclick="Settings.deleteUser('${u.id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');
    },

    openUserModal(user = null) {
        this.el.userModal.classList.add('open');
        if (user) {
            this.el.userModalTitle.textContent = 'تعديل مستخدم';
            this.el.editUserId.value = user.id;
            this.el.userFullName.value = user.full_name || '';
            this.el.userEmail.value = user.email || '';
            this.el.userPassword.value = '';
            this.el.userRole.value = user.role || 'admin';
        } else {
            this.el.userModalTitle.textContent = 'إضافة مستخدم';
            this.el.editUserId.value = '';
            this.el.userFullName.value = '';
            this.el.userEmail.value = '';
            this.el.userPassword.value = '';
            this.el.userRole.value = 'admin';
        }
    },

    closeUserModal() {
        this.el.userModal.classList.remove('open');
    },

    async saveUser() {
        const id = this.el.editUserId.value;
        const fullName = this.el.userFullName.value.trim();
        const email = this.el.userEmail.value.trim();
        const password = this.el.userPassword.value.trim();
        const role = this.el.userRole.value;

        if (!fullName || !email) return this.showToast('الاسم والبريد مطلوبان', 'warn');
        if (!id && !password) return this.showToast('كلمة المرور مطلوبة', 'warn');

        try {
            if (window.supabase) {
                if (id) {
                    // تعديل
                    const { error } = await supabase.from('profiles').update({ full_name: fullName, role }).eq('id', id);
                    if (error) throw error;
                } else {
                    // إضافة - يحتاج لإنشاء مستخدم أولاً ثم إضافة بروفايل
                    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
                        email, password, email_confirm: true
                    });
                    if (authError) throw authError;
                    const tenantId = await App.getTenantId();
                    await supabase.from('profiles').insert({
                        id: authData.user.id,
                        full_name: fullName,
                        email,
                        role,
                        tenant_id: tenantId
                    });
                }
            } else {
                // محلي
                let users = JSON.parse(localStorage.getItem('local_users') || '[]');
                if (id) {
                    users = users.map(u => u.id === id ? { ...u, full_name: fullName, email, role } : u);
                } else {
                    users.push({ id: Utils.generateUUID(), full_name: fullName, email, role });
                }
                localStorage.setItem('local_users', JSON.stringify(users));
            }
            this.closeUserModal();
            await this.loadUsers();
            this.showToast('تم حفظ المستخدم', 'success');
        } catch (e) {
            console.error(e);
            this.showToast('فشل حفظ المستخدم: ' + e.message, 'error');
        }
    },

    editUser(id) {
        const user = this.state.users.find(u => u.id === id);
        if (user) this.openUserModal(user);
    },

    async deleteUser(id) {
        if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
        try {
            if (window.supabase) {
                const { error } = await supabase.from('profiles').delete().eq('id', id);
                if (error) throw error;
            } else {
                let users = JSON.parse(localStorage.getItem('local_users') || '[]');
                users = users.filter(u => u.id !== id);
                localStorage.setItem('local_users', JSON.stringify(users));
            }
            await this.loadUsers();
            this.showToast('تم حذف المستخدم', 'success');
        } catch (e) {
            this.showToast('فشل حذف المستخدم', 'error');
        }
    },

    // ========== نسخ احتياطي ==========
    async exportAllData() {
        try {
            const data = {
                settings: this.state.settings,
                users: this.state.users,
                products: await window.DB.getProducts(),
                parties: await window.DB.getParties(),
                invoices: await window.DB.getInvoices(),
                purchases: await window.DB.getPurchases(),
                exportDate: new Date().toISOString()
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `hesaby_backup_${new Date().toISOString().slice(0,10)}.json`;
            a.click();
            this.showToast('تم التصدير بنجاح', 'success');
        } catch (e) {
            console.error(e);
            this.showToast('فشل التصدير', 'error');
        }
    },

    async importAllData(event) {
        const file = event.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (!data.settings && !data.products) throw new Error('ملف غير صالح');

            if (data.settings) await this.persistSettings(data.settings);
            if (data.products) for (const p of data.products) await window.DB.saveProduct(p);
            if (data.parties) for (const p of data.parties) await window.DB.saveParty(p);
            if (data.invoices) for (const i of data.invoices) await window.DB.saveInvoice(i);
            if (data.purchases) for (const p of data.purchases) await window.DB.savePurchase(p);

            this.showToast('تم الاستيراد بنجاح', 'success');
            this.loadSettings();
        } catch (e) {
            console.error(e);
            this.showToast('فشل الاستيراد: ' + e.message, 'error');
        } finally {
            this.el.importFile.value = '';
        }
    },

    // ========== إعادة تعيين ==========
    resetSystem() {
        if (!confirm('هل أنت متأكد من إعادة تعيين كل البيانات؟ لا يمكن التراجع.')) return;
        localStorage.clear();
        if (window.DB) {
            ['products', 'parties', 'invoices', 'purchases'].forEach(async store => {
                if (window.localDB) await window.localDB.clear(store);
            });
        }
        this.showToast('تم إعادة التعيين', 'success');
        setTimeout(() => location.reload(), 1000);
    },

    // ========== أدوات مساعدة ==========
    initSidebarUser() {
        window.App?.getCurrentUser?.().then(user => {
            if (user) {
                if (this.el.sidebarAvatar) this.el.sidebarAvatar.textContent = (user.fullName || 'U').charAt(0).toUpperCase();
                if (this.el.sidebarUserName) this.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
            }
        }).catch(() => {});
    },

    showToast(msg, type = 'info') {
        if (window.Toast) {
            Toast[type]?.(msg) || Toast.info(msg);
            return;
        }
        const toast = this.el.toast;
        if (!toast) return alert(msg);
        toast.textContent = msg;
        toast.style.opacity = '1';
        toast.style.backgroundColor = type === 'error' ? '#dc2626' : type === 'success' ? '#10b981' : 'var(--bg-surface)';
        setTimeout(() => { toast.style.opacity = '0'; }, 3000);
    }
};

window.Settings = Settings;
window.addEventListener('DOMContentLoaded', () => Settings.init());
