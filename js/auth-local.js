// js/auth-local.js
const Auth = {
    STORAGE_KEY: 'foodDist_user',

    // مستخدمون محليون (يمكنك تعديلهم)
    localUsers: [
        { username: 'admin', password: '123456', fullName: 'مدير النظام', role: 'admin', repId: null },
        { username: 'مندوب1', password: '123456', fullName: 'أحمد محمود', role: 'rep', repId: '1' },
        { username: 'مندوب2', password: '123456', fullName: 'خالد عمرو', role: 'rep', repId: '2' }
    ],

    getUser() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    },

    setUser(user) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
    },

    async login(username, password) {
        const user = this.localUsers.find(u => u.username === username && u.password === password);
        if (!user) {
            return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
        }

        const userData = {
            id: user.repId || 'admin',
            username: user.username,
            name: user.fullName,
            role: user.role,
            repId: user.repId || null,
            loginTime: new Date().toLocaleString('ar-EG'),
            avatar: user.fullName.charAt(0).toUpperCase(),
            permissions: user.role === 'admin' ? ['all'] : ['pos', 'customers', 'orders', 'collections']
        };

        this.setUser(userData);
        const redirectUrl = userData.role === 'admin' ? 'dashboard.html' : 'rep-dashboard.html';
        return { success: true, user: userData, redirectUrl };
    },

    logout() {
        localStorage.removeItem(this.STORAGE_KEY);
    },

    isAuthenticated() {
        return !!this.getUser();
    },

    getRedirectUrl(role) {
        return role === 'admin' ? 'dashboard.html' : 'rep-dashboard.html';
    },

    requireAuth(redirectUrl = 'index.html') {
        if (!this.isAuthenticated()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    },

    requireRole(allowedRoles, redirectUrl = 'index.html') {
        const user = this.getUser();
        if (!user) {
            window.location.href = redirectUrl;
            return false;
        }
        if (!allowedRoles.includes(user.role)) {
            window.location.href = this.getRedirectUrl(user.role);
            return false;
        }
        return true;
    },

    redirectIfAuth() {
        const user = this.getUser();
        if (user) {
            window.location.href = this.getRedirectUrl(user.role);
            return true;
        }
        return false;
    },

    getRepId() {
        const user = this.getUser();
        return user?.repId || user?.id || null;
    }
};

window.Auth = Auth;
