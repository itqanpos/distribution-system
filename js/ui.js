// js/ui.js - واجهة مستخدم متوافقة مع GitHub Pages
const UI = (function() {
    const pathSegments = window.location.pathname.split('/');
    const BASE_PATH = (pathSegments.length > 1 && pathSegments[1]) ? '/' + pathSegments[1] : '';
    
    return {
        async initPage(title) {
            if (!Auth.requireAuth()) return false;

            const user = Auth.getUser();
            const userNameEl = document.getElementById('userName');
            const loginTimeEl = document.getElementById('loginTime');
            const userAvatarEl = document.getElementById('userAvatar');
            if (userNameEl) userNameEl.textContent = user.name;
            if (loginTimeEl) loginTimeEl.textContent = `دخل النظام: ${user.loginTime || 'اليوم'}`;
            if (userAvatarEl) userAvatarEl.textContent = user.avatar || user.name.charAt(0);
            if (title) document.title = `${title} - نظام التوزيع الغذائي`;

            this.fixMenuLinks();
            this.highlightCurrentMenuItem();
            this.registerServiceWorker();
            return true;
        },

        fixMenuLinks() {
            // إصلاح روابط القائمة الجانبية لتشمل المسار الأساسي
            const base = BASE_PATH ? BASE_PATH + '/' : '';
            document.querySelectorAll('.menu-item[href]').forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('http') && !href.startsWith(base)) {
                    link.setAttribute('href', base + href);
                }
            });
        },

        registerServiceWorker() {
            if ('serviceWorker' in navigator) {
                const swPath = (BASE_PATH ? BASE_PATH : '') + '/service-worker.js';
                navigator.serviceWorker.register(swPath, { scope: BASE_PATH + '/' || './' })
                    .then(reg => console.log('SW registered'))
                    .catch(err => console.error('SW failed', err));
            }
        },

        highlightCurrentMenuItem() {
            const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
            document.querySelectorAll('.menu-item').forEach(item => {
                const href = item.getAttribute('href');
                if (href && href.includes(currentPage)) item.classList.add('active');
                else item.classList.remove('active');
            });
        },

        logout() {
            if (confirm('هل تريد تسجيل الخروج؟')) {
                Auth.logout();
                const base = BASE_PATH ? BASE_PATH + '/' : '';
                window.location.href = base + 'index.html';
            }
        },

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

        navigateTo(page) {
            const user = Auth.getUser();
            const base = BASE_PATH ? BASE_PATH + '/' : '';
            const routes = {
                'dashboard': base + 'dashboard.html',
                'sales': base + 'sales.html',
                'pos': base + (user && user.role === 'admin' ? 'pos.html' : 'rep-pos.html'),
                'invoices': base + 'invoices.html',
                'purchases': base + 'purchases.html',
                'cashbox': base + 'cashbox.html',
                'reports': base + 'reports.html',
                'accounting': base + 'accounting.html',
                'customers': base + 'customers.html',
                'reps': base + 'reps.html',
                'products': base + 'products.html',
                'settings': base + 'settings.html'
            };
            if (routes[page]) window.location.href = routes[page];
        }
    };
})();

window.UI = UI;
