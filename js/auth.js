// js/auth.js
(function() {
    const STORAGE_KEY = 'auth_user';
    const SESSION_KEY = 'auth_session';

    // مستخدم افتراضي (مدير)
    const DEFAULT_ADMIN = {
        id: 'admin',
        name: 'مدير النظام',
        role: 'admin',
        password: '123456',
        avatar: 'م'
    };

    // مستخدم مندوب تجريبي
    const DEFAULT_REP = {
        id: 'rep1',
        name: 'مندوب مبيعات',
        role: 'rep',
        password: '123456',
        avatar: 'م.م'
    };

    // قائمة المستخدمين المحليين (يمكن استبدالها بـ Firebase لاحقاً)
    let localUsers = [DEFAULT_ADMIN, DEFAULT_REP];

    window.Auth = {
        // تسجيل الدخول
        async login(username, password) {
            // تنظيف المدخلات
            username = username.trim();
            password = password.trim();

            // البحث في القائمة المحلية
            const user = localUsers.find(u => u.id === username && u.password === password);
            
            if (user) {
                const sessionUser = {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    avatar: user.avatar,
                    loginTime: new Date().toLocaleString('ar-EG')
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionUser));
                sessionStorage.setItem(SESSION_KEY, 'active');
                
                // إعادة التوجيه حسب الدور
                const redirectUrl = this.getRedirectUrl(user.role);
                return { success: true, redirectUrl, user: sessionUser };
            } else {
                return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
            }
        },

        // تسجيل الخروج
        logout() {
            localStorage.removeItem(STORAGE_KEY);
            sessionStorage.removeItem(SESSION_KEY);
            window.location.href = './index.html';
        },

        // الحصول على المستخدم الحالي
        getUser() {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        },

        // التحقق من تسجيل الدخول
        isAuthenticated() {
            return !!this.getUser();
        },

        // التأكد من وجود جلسة صالحة (توجيه إلى تسجيل الدخول إذا لزم)
        requireAuth() {
            if (!this.isAuthenticated()) {
                window.location.href = './index.html';
                return false;
            }
            return true;
        },

        // التحقق من صلاحية الدور
        hasRole(allowedRoles) {
            const user = this.getUser();
            return user && allowedRoles.includes(user.role);
        },

        requireRole(allowedRoles) {
            if (!this.hasRole(allowedRoles)) {
                alert('غير مصرح لك بالوصول إلى هذه الصفحة');
                window.location.href = './dashboard.html';
                return false;
            }
            return true;
        },

        // رابط إعادة التوجيه حسب الدور
        getRedirectUrl(role) {
            if (role === 'admin') return './dashboard.html';
            if (role === 'rep') return './pos.html';
            return './dashboard.html';
        },

        // --- دوال إدارة المستخدمين (للمسؤول) ---
        async getUsers() {
            // محلياً فقط، يمكن ربطها مع Firebase لاحقاً
            return localUsers.map(u => ({ id: u.id, name: u.name, role: u.role }));
        },

        async saveUser(user) {
            const existing = localUsers.findIndex(u => u.id === user.id);
            if (existing >= 0) {
                localUsers[existing] = { ...localUsers[existing], ...user };
            } else {
                localUsers.push({ ...user, password: user.password || '123456' });
            }
            return user;
        },

        async deleteUser(userId) {
            localUsers = localUsers.filter(u => u.id !== userId);
        }
    };

    console.log('✅ Auth module loaded');
})();
