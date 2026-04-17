// js/auth.js
(function() {
    const STORAGE_KEY = 'auth_user';
    const DEFAULT_ADMIN = { id: 'admin', name: 'System Admin', role: 'admin', password: '123456', avatar: 'A' };
    const DEFAULT_REP = { id: 'rep1', name: 'Sales Rep', role: 'rep', password: '123456', avatar: 'R' };
    let localUsers = [DEFAULT_ADMIN, DEFAULT_REP];

    window.Auth = {
        async login(username, password) {
            username = username.trim();
            password = password.trim();
            const user = localUsers.find(u => u.id === username && u.password === password);
            if (user) {
                const sessionUser = {
                    id: user.id,
                    name: user.name,
                    role: user.role,
                    avatar: user.avatar,
                    loginTime: new Date().toLocaleString('en-US')
                };
                localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionUser));
                return { success: true, redirectUrl: this.getRedirectUrl(user.role), user: sessionUser };
            }
            return { success: false, message: 'Invalid username or password' };
        },

        logout() {
            localStorage.removeItem(STORAGE_KEY);
            window.location.href = './index.html';
        },

        getUser() {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : null;
        },

        isAuthenticated() {
            return !!this.getUser();
        },

        requireAuth() {
            if (!this.isAuthenticated()) {
                window.location.href = './index.html';
                return false;
            }
            return true;
        },

        hasRole(allowedRoles) {
            const user = this.getUser();
            return user && allowedRoles.includes(user.role);
        },

        requireRole(allowedRoles) {
            if (!this.hasRole(allowedRoles)) {
                alert('Access denied');
                window.location.href = './dashboard.html';
                return false;
            }
            return true;
        },

        getRedirectUrl(role) {
            return role === 'admin' ? './dashboard.html' : './pos.html';
        },

        async getUsers() {
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
})();
