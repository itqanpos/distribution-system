// js/ui.js
// مكونات واجهة المستخدم المشتركة

const UI = {
    // تهيئة الصفحة الأساسية (شريط التنقل، الشريط الجانبي، معلومات المستخدم)
    initPage(title) {
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
        
        return true;
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

    // إنشاء شريط التنقل (يمكن استخدامه في الصفحات التي لا تحتويه)
    renderNavbar() {
        const user = Auth.getUser();
        return `
            <nav class="navbar">
                <div class="logo">
                    <div class="logo-icon"><i class="fas fa-truck"></i></div>
                    <div class="logo-text">
                        <h2>نظام التوزيع الغذائي</h2>
                        <p>إدارة متكاملة للتوزيع والمبيعات</p>
                    </div>
                </div>
                <div class="user-info">
                    <div class="user-details">
                        <h4>${user.name}</h4>
                        <p>${user.loginTime}</p>
                    </div>
                    <div class="user-avatar">${user.avatar}</div>
                    <button class="logout-btn" onclick="UI.logout()"><i class="fas fa-sign-out-alt"></i> خروج</button>
                </div>
            </nav>
        `;
    },

    // إنشاء الشريط الجانبي
    renderSidebar() {
        return `
            <aside class="sidebar">
                <ul class="menu">
                    <div class="menu-section">القائمة الرئيسية</div>
                    <li><a class="menu-item" href="dashboard.html"><i class="fas fa-tachometer-alt"></i><span class="menu-text">لوحة التحكم</span></a></li>
                    <li><a class="menu-item" href="sales.html"><i class="fas fa-chart-line"></i><span class="menu-text">المبيعات</span></a></li>
                    <li><a class="menu-item" href="pos.html"><i class="fas fa-cash-register"></i><span class="menu-text">نقطة البيع</span></a></li>
                    <li><a class="menu-item" href="invoices.html"><i class="fas fa-file-invoice"></i><span class="menu-text">الفواتير</span></a></li>
                    <li><a class="menu-item" href="purchases.html"><i class="fas fa-shopping-cart"></i><span class="menu-text">المشتريات</span></a></li>
                    <li><a class="menu-item" href="cashbox.html"><i class="fas fa-cash-register"></i><span class="menu-text">الصندوق</span></a></li>
                    <li><a class="menu-item" href="reports.html"><i class="fas fa-chart-bar"></i><span class="menu-text">التقارير</span></a></li>
                    <li><a class="menu-item" href="accounting.html"><i class="fas fa-calculator"></i><span class="menu-text">المحاسبة</span></a></li>
                    <div class="menu-section">الإدارة</div>
                    <li><a class="menu-item" href="customers.html"><i class="fas fa-user-tie"></i><span class="menu-text">العملاء والموردين</span></a></li>
                    <li><a class="menu-item" href="reps.html"><i class="fas fa-users"></i><span class="menu-text">المندوبين</span></a></li>
                    <li><a class="menu-item" href="products.html"><i class="fas fa-boxes"></i><span class="menu-text">المنتجات</span></a></li>
                    <li><a class="menu-item" href="settings.html"><i class="fas fa-cog"></i><span class="menu-text">الإعدادات</span></a></li>
                </ul>
            </aside>
        `;
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
                <div class="loading">
                    <div class="spinner"></div>
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
    }
};

window.UI = UI;
