// js/auth.js
// إدارة المصادقة والجلسات

const Auth = {
    STORAGE_KEY: 'foodDist_user',

    // الحصول على بيانات المستخدم الحالي
    getUser() {
        const data = sessionStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    },

    // حفظ بيانات المستخدم
    setUser(user) {
        sessionStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
    },

    // تسجيل الدخول
    login(username, password) {
        // في النسخة الحقيقية: استدعاء API
        // هنا نسمح بأي مدخلات للعرض التجريبي
        if (!username || !password) {
            return { success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' };
        }

        const now = new Date();
        const options = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true };
        const loginTime = now.toLocaleDateString('ar-EG', options);

        const user = {
            id: 1,
            username: username,
            name: username,
            role: username.toLowerCase() === 'admin' ? 'مدير النظام' : 'مستخدم',
            loginTime: loginTime,
            avatar: username.charAt(0).toUpperCase(),
            permissions: ['all']
        };

        this.setUser(user);
        return { success: true, user };
    },

    // تسجيل الخروج
    logout() {
        sessionStorage.removeItem(this.STORAGE_KEY);
    },

    // التحقق من تسجيل الدخول
    isAuthenticated() {
        return !!this.getUser();
    },

    // حماية الصفحات - توجيه إذا لم يكن مسجلاً
    requireAuth(redirectUrl = 'index.html') {
        if (!this.isAuthenticated()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    },

    // توجيه إذا كان مسجلاً بالفعل
    redirectIfAuth(redirectUrl = 'dashboard.html') {
        if (this.isAuthenticated()) {
            window.location.href = redirectUrl;
            return true;
        }
        return false;
    },

    // التحقق من الصلاحية
    hasPermission(permission) {
        const user = this.getUser();
        if (!user) return false;
        if (user.permissions.includes('all')) return true;
        return user.permissions.includes(permission);
    }
};

window.Auth = Auth;
