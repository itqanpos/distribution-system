// js/ui.js - واجهة المستخدم المشتركة
const UI = {
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

        this.highlightCurrentMenuItem();
        this.registerServiceWorker();
        return true;
    },

    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./service-worker.js', { scope: './' })
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
            window.location.href = 'index.html';
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
    }
};

window.UI = UI;
