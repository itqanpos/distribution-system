/* =============================================
   settings.js - Settings Page Logic
   ============================================ */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    const SETTINGS_KEY = 'app_settings';

    /* ============ State ============ */
    const State = {
        currentUser: null,
        settings: {},
        activeTab: 'general',
        logoData: null,
        originalLogo: null,
        hasChanges: false
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Settings init...');

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
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadSettings();
        applySettingsToUI();
        updateAboutInfo();
        addSaveFooterBar();

        hideLoadingBar();
        console.log('✅ Settings ready');
    }

    /* ============================================
       Load / Save Settings
       ============================================ */
    async function loadSettings() {
        try {
            const saved = await DB.getSettings();
            State.settings = saved || {};
            console.log('📋 Loaded settings:', State.settings);
        } catch (e) {
            console.warn('Failed to load settings:', e);
            State.settings = {};
        }
    }

    function applySettingsToUI() {
        const s = State.settings;

        // General
        setVal('shopName', s.shopName || '');
        setVal('shopPhone', s.phone || '');
        setVal('shopEmail', s.email || '');
        setVal('taxNumber', s.taxNumber || '');
        setVal('shopAddress', s.address || '');
        setVal('currencySymbol', s.currency || 'ج.م');
        setVal('decimalPlaces', s.decimalPlaces || '2');

        // Logo
        if (s.logo) {
            State.originalLogo = s.logo;
            const preview = $('#logoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${s.logo}" alt="">`;
            }
            const removeBtn = $('#removeLogoBtn');
            if (removeBtn) removeBtn.style.display = 'inline-flex';
        }

        // Print
        setVal('paperSize', s.paperSize || '80mm');
        setVal('footerMessage', s.footerMessage || 'شكراً لتعاملكم معنا');
        setVal('printCopies', s.printCopies || 1);
        setChecked('printLogo', s.printLogo !== false);
        setChecked('printTaxNumber', s.printTaxNumber === true);
        setChecked('printItemDetails', s.printItemDetails !== false);

        // Tax
        setChecked('enableTax', s.enableTax === true);
        setVal('taxRate', s.taxRate || 14);
        setVal('taxType', s.taxType || 'exclusive');
        setVal('taxName', s.taxName || 'ضريبة القيمة المضافة');
        toggleTaxFields();

        // Appearance
        $$('.theme-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === (s.defaultTheme || 'light'));
        });
        $$('.color-option').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.color === (s.primaryColor || '#4f46e5'));
        });
    }

    function setVal(id, value) {
        const el = document.getElementById(id);
        if (el) el.value = value;
    }

    function setChecked(id, checked) {
        const el = document.getElementById(id);
        if (el) el.checked = !!checked;
    }

    function collectSettings() {
        return {
            // General
            shopName: getVal('shopName'),
            phone: getVal('shopPhone'),
            email: getVal('shopEmail'),
            taxNumber: getVal('taxNumber'),
            address: getVal('shopAddress'),
            currency: getVal('currencySymbol') || 'ج.م',
            decimalPlaces: getVal('decimalPlaces') || '2',
            logo: State.logoData || State.originalLogo || null,

            // Print
            paperSize: getVal('paperSize'),
            footerMessage: getVal('footerMessage'),
            printCopies: +getVal('printCopies') || 1,
            printLogo: getChecked('printLogo'),
            printTaxNumber: getChecked('printTaxNumber'),
            printItemDetails: getChecked('printItemDetails'),

            // Tax
            enableTax: getChecked('enableTax'),
            taxRate: +getVal('taxRate') || 0,
            taxType: getVal('taxType'),
            taxName: getVal('taxName'),

            // Appearance
            defaultTheme: getActiveTheme(),
            primaryColor: getActiveColor(),

            updatedAt: new Date().toISOString()
        };
    }

    function getVal(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    function getChecked(id) {
        const el = document.getElementById(id);
        return el ? el.checked : false;
    }

    function getActiveTheme() {
        return $('.theme-option.active')?.dataset.theme || 'light';
    }

    function getActiveColor() {
        return $('.color-option.active')?.dataset.color || '#4f46e5';
    }

    async function saveAllSettings(silent = false) {
        try {
            const settings = collectSettings();

            if (!silent) showToast('جاري الحفظ...', 'info');

            await DB.saveSettings(settings);
            U.ls.set('settings', settings);
            State.settings = settings;
            State.originalLogo = settings.logo;
            State.logoData = null;
            State.hasChanges = false;

            // تطبيق الوضع واللون
            applyTheme(settings.defaultTheme);
            applyPrimaryColor(settings.primaryColor);

            if (!silent) showToast('تم حفظ الإعدادات بنجاح', 'success');
            return true;
        } catch (e) {
            console.error('Save error:', e);
            if (!silent) showToast('فشل حفظ الإعدادات', 'error');
            return false;
        }
    }

    /* ============================================
       Theme & Color
       ============================================ */
    function applyTheme(theme) {
        if (!theme) return;
        document.documentElement.dataset.theme = theme;
        U.ls.set('theme', theme);
        updateThemeIcon();
    }

    function applyPrimaryColor(color) {
        if (!color) return;
        document.documentElement.style.setProperty('--primary', color);
        U.ls.set('primaryColor', color);
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();

        const color = U.ls.get('primaryColor');
        if (color) {
            document.documentElement.style.setProperty('--primary', color);
        }
    }

    function updateThemeIcon() {
        const btn = $('#themeBtn');
        if (!btn) return;
        const isDark = document.documentElement.dataset.theme === 'dark';
        btn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    /* ============================================
       Tabs Navigation
       ============================================ */
    function switchTab(tabName) {
        State.activeTab = tabName;

        $$('.settings-nav__btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabName);
        });

        $$('.settings-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tabContent === tabName);
        });

        // Scroll to top
        const container = $('.main-container');
        if (container) container.scrollTop = 0;
    }

    /* ============================================
       Logo Upload
       ============================================ */
    function handleLogoUpload(file) {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('يجب اختيار صورة', 'warning');
            return;
        }

        if (file.size > 1024 * 1024) { // 1MB
            showToast('حجم الصورة يجب أن يكون أقل من 1MB', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target.result;
            State.logoData = dataUrl;

            const preview = $('#logoPreview');
            if (preview) {
                preview.innerHTML = `<img src="${dataUrl}" alt="">`;
            }

            const removeBtn = $('#removeLogoBtn');
            if (removeBtn) removeBtn.style.display = 'inline-flex';

            markChanged();
            showToast('تم رفع الشعار - اضغط حفظ للتأكيد', 'info');
        };
        reader.readAsDataURL(file);
    }

    function removeLogo() {
        State.logoData = null;
        State.originalLogo = null;

        const preview = $('#logoPreview');
        if (preview) {
            preview.innerHTML = `<img src="./icons/icon-192x192.png" alt="">`;
        }

        const removeBtn = $('#removeLogoBtn');
        if (removeBtn) removeBtn.style.display = 'none';

        markChanged();
    }

    /* ============================================
       Tax Fields
       ============================================ */
    function toggleTaxFields() {
        const enabled = getChecked('enableTax');
        const fields = $('#taxFields');
        if (fields) fields.style.display = enabled ? 'block' : 'none';
    }

    /* ============================================
       Backup & Restore
       ============================================ */
    async function exportBackup() {
        try {
            showToast('جاري إنشاء النسخة...', 'info');

            const [products, parties, invoices] = await Promise.all([
                DB.getProducts(true).catch(() => []),
                DB.getParties(null, true).catch(() => []),
                DB.getInvoices(true).catch(() => [])
            ]);

            const backup = {
                version: '3.0.0',
                exportedAt: new Date().toISOString(),
                tenant_id: State.currentUser.tenant_id,
                user: {
                    id: State.currentUser.id,
                    email: State.currentUser.email,
                    fullName: State.currentUser.fullName
                },
                data: {
                    products,
                    parties,
                    invoices,
                    settings: State.settings
                },
                counts: {
                    products: products.length,
                    parties: parties.length,
                    invoices: invoices.length
                }
            };

            const json = JSON.stringify(backup, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `hesaby-backup-${U.today()}.json`;
            a.click();
            URL.revokeObjectURL(url);

            showToast('تم تصدير النسخة بنجاح', 'success');
        } catch (e) {
            console.error('Export error:', e);
            showToast('فشل تصدير النسخة', 'error');
        }
    }

    function importBackup(file) {
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            showToast('يجب اختيار ملف JSON', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const backup = JSON.parse(e.target.result);

                if (!backup.data) {
                    throw new Error('ملف النسخة غير صالح');
                }

                const counts = backup.counts || {
                    products: backup.data.products?.length || 0,
                    parties: backup.data.parties?.length || 0,
                    invoices: backup.data.invoices?.length || 0
                };

                const confirmed = confirm(
                    `سيتم استيراد:\n` +
                    `- ${counts.products} منتج\n` +
                    `- ${counts.parties} طرف\n` +
                    `- ${counts.invoices} فاتورة\n\n` +
                    `هل تريد المتابعة؟`
                );

                if (!confirmed) return;

                showToast('جاري الاستيراد...', 'info');

                // Save to localDB
                if (window.localDB?.ready) {
                    if (backup.data.products?.length) {
                        await window.localDB.putMany('products', backup.data.products);
                    }
                    if (backup.data.parties?.length) {
                        await window.localDB.putMany('parties', backup.data.parties);
                    }
                    if (backup.data.invoices?.length) {
                        await window.localDB.putMany('invoices', backup.data.invoices);
                    }
                }

                // Save settings
                if (backup.data.settings) {
                    await DB.saveSettings(backup.data.settings);
                    State.settings = backup.data.settings;
                    applySettingsToUI();
                }

                showToast('تم الاستيراد بنجاح، سيتم إعادة التحميل', 'success');
                setTimeout(() => location.reload(), 1500);

            } catch (err) {
                console.error('Import error:', err);
                showToast('فشل استيراد الملف: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    }

    async function clearLocalData() {
        const confirmed = confirm(
            '⚠️ تحذير!\n\n' +
            'سيتم حذف جميع البيانات المحلية (IndexedDB).\n' +
            'البيانات السحابية لن تتأثر.\n\n' +
            'هل أنت متأكد؟'
        );

        if (!confirmed) return;

        const doubleCheck = confirm('هل أنت متأكد تماماً؟ لا يمكن التراجع.');
        if (!doubleCheck) return;

        try {
            if (window.localDB?.ready) {
                const stores = ['products', 'parties', 'invoices', 'settings', 'transactions'];
                for (const store of stores) {
                    try {
                        await window.localDB.clear(store);
                    } catch (e) {
                        console.warn('Clear failed for', store);
                    }
                }
            }

            localStorage.removeItem('hesaby_posCart');
            localStorage.removeItem('hesaby_heldInvoices');
            localStorage.removeItem('payment_draft');

            showToast('تم حذف البيانات المحلية، سيتم إعادة التحميل', 'success');
            setTimeout(() => location.reload(), 1500);

        } catch (e) {
            console.error('Clear error:', e);
            showToast('فشل حذف البيانات', 'error');
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

        const connEl = $('#connectionStatus');
        if (connEl) {
            connEl.textContent = online ? 'متصل' : 'غير متصل';
            connEl.style.color = online ? 'var(--success)' : 'var(--danger)';
        }
    }

    function updateAboutInfo() {
        const versionEl = $('#appVersion');
        if (versionEl) versionEl.textContent = window.APP_CONFIG?.APP_VERSION || '3.0.0';

        const userNameEl = $('#currentUserName');
        if (userNameEl) userNameEl.textContent = State.currentUser.fullName || State.currentUser.email || '-';

        const tenantEl = $('#currentTenant');
        if (tenantEl) tenantEl.textContent = State.currentUser.tenant_id ? State.currentUser.tenant_id.substring(0, 8) + '...' : '-';
    }

    function markChanged() {
        State.hasChanges = true;
        const saveBar = $('#saveFooterBar');
        if (saveBar) saveBar.classList.remove('hidden');
    }

    function addSaveFooterBar() {
        // Add save footer bar if not exists
        if ($('#saveFooterBar')) return;

        const bar = document.createElement('div');
        bar.id = 'saveFooterBar';
        bar.className = 'save-footer-bar hidden';
        bar.innerHTML = `
            <button class="btn btn--ghost" id="resetChangesBtn">
                <i class="fas fa-undo"></i> إلغاء
            </button>
            <button class="btn btn--primary" id="saveChangesBtn">
                <i class="fas fa-save"></i> حفظ التغييرات
            </button>
        `;
        document.body.appendChild(bar);

        // Bind events
        $('#saveChangesBtn')?.addEventListener('click', async () => {
            const success = await saveAllSettings();
            if (success) {
                bar.classList.add('hidden');
            }
        });

        $('#resetChangesBtn')?.addEventListener('click', () => {
            if (!confirm('هل تريد إلغاء التغييرات؟')) return;
            applySettingsToUI();
            State.hasChanges = false;
            State.logoData = null;
            bar.classList.add('hidden');
        });
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
        }, 2500);
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

        // Theme toggle (global)
        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            applyTheme(next);
            // Update selector
            $$('.theme-option').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === next);
            });
            markChanged();
        });

        // Logout
        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        // Save buttons
        $('#saveAllBtn')?.addEventListener('click', () => saveAllSettings());
        $('#saveAllTopBtn')?.addEventListener('click', () => saveAllSettings());

        // Tabs
        $$('.settings-nav__btn').forEach(btn => {
            btn.addEventListener('click', () => switchTab(btn.dataset.tab));
        });

        // Logo upload
        $('#uploadLogoBtn')?.addEventListener('click', () => $('#logoInput')?.click());
        $('#logoInput')?.addEventListener('change', (e) => {
            handleLogoUpload(e.target.files?.[0]);
        });
        $('#removeLogoBtn')?.addEventListener('click', removeLogo);

        // Tax toggle
        $('#enableTax')?.addEventListener('change', () => {
            toggleTaxFields();
            markChanged();
        });

        // Theme selector
        $$('.theme-option').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.theme-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyTheme(btn.dataset.theme);
                markChanged();
            });
        });

        // Color selector
        $$('.color-option').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.color-option').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyPrimaryColor(btn.dataset.color);
                markChanged();
            });
        });

        // Backup
        $('#exportBackupBtn')?.addEventListener('click', exportBackup);
        $('#importBackupBtn')?.addEventListener('click', () => $('#importFileInput')?.click());
        $('#importFileInput')?.addEventListener('change', (e) => {
            importBackup(e.target.files?.[0]);
            e.target.value = '';
        });
        $('#clearLocalDataBtn')?.addEventListener('click', clearLocalData);

        // Mark changed on inputs
        document.querySelectorAll('.settings-card input, .settings-card select, .settings-card textarea').forEach(el => {
            el.addEventListener('input', markChanged);
            el.addEventListener('change', markChanged);
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

        // Ctrl+S to save
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveAllSettings();
            }
        });

        // Warn before leaving with unsaved changes
        window.addEventListener('beforeunload', (e) => {
            if (State.hasChanges) {
                e.preventDefault();
                e.returnValue = '';
            }
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
