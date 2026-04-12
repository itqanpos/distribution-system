// js/ui.js
// مكونات واجهة المستخدم المشتركة

const UI = {
    // تهيئة الصفحة الأساسية (شريط التنقل، الشريط الجانبي، معلومات المستخدم)
    async initPage(title) {
        // التحقق من المصادقة
        if (!Auth.requireAuth()) return false;

        const user = Auth.getUser();
        
        // تحديث معلومات المستخدم في شريط التنقل
        const userNameEl = document.getElementById('userName');
        const loginTimeEl = document.getElementById('loginTime');
        const userAvatarEl = document.getElementById('userAvatar');
        
        if (userNameEl) userNameEl.textContent = user.name;
        if (loginTimeEl) loginTimeEl.textContent = `دخل النظام: ${user.loginTime || 'اليوم'}`;
        if (userAvatarEl) userAvatarEl.textContent = user.avatar || user.name.charAt(0);

        // تعيين عنوان الصفحة
        if (title) {
            document.title = `${title} - نظام التوزيع الغذائي`;
        }

        // تحديد العنصر النشط في القائمة الجانبية (بناءً على اسم الصفحة)
        this.highlightCurrentMenuItem();
        
        // تسجيل Service Worker للعمل Offline
        this.registerServiceWorker();
        
        return true;
    },

    // تسجيل Service Worker
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('service-worker.js')
                .then(reg => console.log('Service Worker registered'))
                .catch(err => console.log('Service Worker failed', err));
        }
    },

    // تحديد رابط القائمة النشط
    highlightCurrentMenuItem() {
        const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
        const menuItems = document.querySelectorAll('.menu-item');
        menuItems.forEach(item => {
            const href = item.getAttribute('href');
            if (href && href.includes(currentPage)) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    },

    // تسجيل الخروج
    logout() {
        Utils.confirmAction('هل تريد تسجيل الخروج؟', () => {
            Auth.logout();
            window.location.href = 'index.html';
        });
    },

    // عرض رسالة تحميل
    showLoading(containerId, message = 'جاري التحميل...') {
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = `
                <div class="loading" style="text-align:center; padding:40px;">
                    <div class="spinner" style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid var(--secondary); border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 15px;"></div>
                    <p>${message}</p>
                </div>
            `;
        }
    },

    // إظهار/إخفاء مودال
    toggleModal(modalId, show = true) {
        const modal = document.getElementById(modalId);
        if (modal) {
            modal.style.display = show ? 'flex' : 'none';
        }
    },

    // ملء قائمة منسدلة (select)
    populateSelect(selectId, options, valueField = 'id', textField = 'name', emptyOption = '-- اختر --') {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        select.innerHTML = emptyOption ? `<option value="">${emptyOption}</option>` : '';
        options.forEach(opt => {
            const option = document.createElement('option');
            option.value = opt[valueField];
            option.textContent = opt[textField];
            select.appendChild(option);
        });
    },

    // التنقل بين الصفحات مع مراعاة الدور
    navigateTo(page) {
        const user = Auth.getUser();
        const basePath = user && user.role === 'admin' ? '' : 'rep-';
        
        const routes = {
            'dashboard': basePath + 'dashboard.html',
            'pos': basePath + 'pos.html',
            'customers': basePath + 'customers.html',
            'orders': basePath + 'orders.html',
            'collections': basePath + 'collections.html',
            'sales': 'sales.html',
            'invoices': 'invoices.html',
            'purchases': 'purchases.html',
            'cashbox': 'cashbox.html',
            'reports': 'reports.html',
            'accounting': 'accounting.html',
            'reps': 'reps.html',
            'products': 'products.html',
            'settings': 'settings.html'
        };
        
        if (routes[page]) {
            window.location.href = routes[page];
        }
    }
};

// إضافة animation للـ spinner
const style = document.createElement('style');
style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style);

window.UI = UI;
