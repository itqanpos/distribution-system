// js/auth.js - إدارة المصادقة والجلسات مع دعم الأدوار

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
    async login(username, password) {
        if (!username || !password) {
            return { success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' };
        }

        // البحث عن المستخدم في قاعدة البيانات
        const users = await Storage.getUsers();
        const user = users.find(u => u.username === username && u.password === password);

        let userData;
        
        if (user) {
            // مستخدم موجود مسبقاً في النظام
            userData = {
                id: user.id,
                username: user.username,
                name: user.fullName,
                role: user.role,
                repId: user.repId || null,
                loginTime: new Date().toLocaleString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true }),
                avatar: user.fullName.charAt(0).toUpperCase(),
                permissions: user.role === 'admin' ? ['all'] : ['pos', 'customers', 'orders', 'collections']
            };
        } else {
            // للتجربة: إذا لم يكن المستخدم موجوداً، ننشئ حساباً افتراضياً بناءً على اسم المستخدم
            let role = 'admin';
            let fullName = username;
            let repId = null;

            if (username.toLowerCase().includes('مندوب') || username.toLowerCase().includes('rep')) {
                role = 'rep';
                fullName = username;
                // البحث عن مندوب بنفس الاسم وربطه
                const reps = await Storage.getReps();
                const matchingRep = reps.find(r => r.name.includes(username) || username.includes(r.name));
                if (matchingRep) {
                    repId = matchingRep.id;
                    fullName = matchingRep.name;
                }
            } else if (username.toLowerCase().includes('admin') || username === 'مدير النظام') {
                role = 'admin';
                fullName = 'مدير النظام';
            }

            userData = {
                id: Date.now(),
                username: username,
                name: fullName,
                role: role,
                repId: repId,
                loginTime: new Date().toLocaleString('ar-EG', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true }),
                avatar: fullName.charAt(0).toUpperCase(),
                permissions: role === 'admin' ? ['all'] : ['pos', 'customers', 'orders', 'collections']
            };
        }

        this.setUser(userData);
        
        const redirectUrl = this.getRedirectUrl(userData.role);
        return { success: true, user: userData, redirectUrl };
    },

    // الحصول على رابط التوجيه حسب الدور
    getRedirectUrl(role) {
        return role === 'admin' ? 'dashboard.html' : 'rep-dashboard.html';
    },

    // التوجيه بعد تسجيل الدخول
    redirectAfterLogin(role) {
        window.location.href = this.getRedirectUrl(role);
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

    // التحقق من أن المستخدم لديه الدور المطلوب
    requireRole(allowedRoles, redirectUrl = 'index.html') {
        const user = this.getUser();
        if (!user) {
            window.location.href = redirectUrl;
            return false;
        }
        if (!allowedRoles.includes(user.role)) {
            // توجيه إلى الصفحة المناسبة لدوره
            window.location.href = this.getRedirectUrl(user.role);
            return false;
        }
        return true;
    },

    // توجيه إذا كان مسجلاً بالفعل
    redirectIfAuth() {
        const user = this.getUser();
        if (user) {
            window.location.href = this.getRedirectUrl(user.role);
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
    },

    // الحصول على معرف المندوب المرتبط بالمستخدم
    getRepId() {
        const user = this.getUser();
        return user?.repId || user?.id || null;
    }
};

window.Auth = Auth;
