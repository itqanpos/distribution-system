// js/auth.js - إدارة المصادقة والجلسات مع دعم GitHub Pages
const REPO_PATH = window.location.pathname.split('/')[1] || '';
const STORAGE_PREFIX = REPO_PATH ? `foodDist_${REPO_PATH}_` : 'foodDist_';

const Auth = {
    STORAGE_KEY: STORAGE_PREFIX + 'user',

    getUser() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    },

    setUser(user) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
    },

    async login(username, password) {
        if (!username || !password) {
            return { success: false, message: 'اسم المستخدم وكلمة المرور مطلوبان' };
        }

        const users = await Storage.getUsers();
        const user = users.find(u => u.username === username && u.password === password);

        let userData;
        if (user) {
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
            // مستخدم افتراضي للتجربة
            let role = 'admin';
            let fullName = username;
            let repId = null;
            if (username.toLowerCase().includes('مندوب') || username.toLowerCase().includes('rep')) {
                role = 'rep';
                const reps = await Storage.getReps();
                const matchingRep = reps.find(r => r.name.includes(username) || username.includes(r.name));
                if (matchingRep) {
                    repId = matchingRep.id;
                    fullName = matchingRep.name;
                }
            }
            userData = {
                id: Date.now(),
                username: username,
                name: fullName,
                role: role,
                repId: repId,
                loginTime: new Date().toLocaleString('ar-EG'),
                avatar: fullName.charAt(0).toUpperCase(),
                permissions: role === 'admin' ? ['all'] : ['pos', 'customers', 'orders', 'collections']
            };
        }

        this.setUser(userData);
        const redirectUrl = this.getRedirectUrl(userData.role);
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
