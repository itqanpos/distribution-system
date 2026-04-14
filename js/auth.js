// js/auth.js - إدارة المصادقة والجلسات باستخدام Firebase Authentication
const Auth = {
    STORAGE_KEY: 'foodDist_user',

    // الحصول على بيانات المستخدم الحالي من التخزين المحلي
    getUser() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        return data ? JSON.parse(data) : null;
    },

    // حفظ بيانات المستخدم في التخزين المحلي
    setUser(user) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(user));
    },

    // تسجيل الدخول باستخدام البريد الإلكتروني وكلمة المرور
    async login(email, password) {
        if (!email || !password) {
            return { success: false, message: 'البريد الإلكتروني وكلمة المرور مطلوبان' };
        }

        try {
            // محاولة تسجيل الدخول عبر Firebase Authentication
            const userCredential = await auth.signInWithEmailAndPassword(email, password);
            const firebaseUser = userCredential.user;

            // جلب بيانات المستخدم الإضافية من Firestore
            const userDoc = await db.collection('users').doc(firebaseUser.uid).get();
            
            let userData = {};
            if (userDoc.exists) {
                userData = userDoc.data();
            } else {
                // إذا لم تكن وثيقة المستخدم موجودة، ننشئ واحدة افتراضية
                // (يمكن تحديد الدور بناءً على البريد الإلكتروني أو تركه كـ admin)
                userData = {
                    fullName: email.split('@')[0],
                    role: email.includes('admin') ? 'admin' : 'rep',
                    repId: null,
                    status: 'active'
                };
                await db.collection('users').doc(firebaseUser.uid).set(userData);
            }

            // بناء كائن المستخدم للتطبيق
            const user = {
                uid: firebaseUser.uid,
                email: firebaseUser.email,
                name: userData.fullName || email,
                role: userData.role || 'admin',
                repId: userData.repId || null,
                loginTime: new Date().toLocaleString('ar-EG', {
                    year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: 'numeric', minute: 'numeric', hour12: true
                }),
                avatar: (userData.fullName || email).charAt(0).toUpperCase(),
                permissions: userData.role === 'admin' ? ['all'] : ['pos', 'customers', 'orders', 'collections']
            };

            // حفظ بيانات المستخدم محلياً
            this.setUser(user);

            // تحديد صفحة التوجيه بناءً على الدور
            const redirectUrl = user.role === 'admin' ? 'dashboard.html' : 'rep-dashboard.html';

            return { success: true, user, redirectUrl };

        } catch (error) {
            console.error('Login error:', error);
            // ترجمة بعض رسائل الخطأ الشائعة
            let message = 'فشل تسجيل الدخول';
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
                message = 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
            } else if (error.code === 'auth/invalid-email') {
                message = 'صيغة البريد الإلكتروني غير صالحة';
            } else if (error.code === 'auth/too-many-requests') {
                message = 'تم تجاوز عدد المحاولات. الرجاء المحاولة لاحقاً';
            }
            return { success: false, message };
        }
    },

    // تسجيل الخروج
    async logout() {
        try {
            await auth.signOut();
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            localStorage.removeItem(this.STORAGE_KEY);
        }
    },

    // التحقق من وجود جلسة نشطة
    isAuthenticated() {
        return !!this.getUser();
    },

    // الحصول على رابط التوجيه حسب الدور
    getRedirectUrl(role) {
        return role === 'admin' ? 'dashboard.html' : 'rep-dashboard.html';
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
        return user?.repId || user?.uid || null;
    },

    // تحديث بيانات المستخدم (محلياً وفي Firestore)
    async updateUser(updates) {
        const user = this.getUser();
        if (!user) return false;

        try {
            // تحديث Firestore
            await db.collection('users').doc(user.uid).update(updates);
            
            // تحديث البيانات المحلية
            Object.assign(user, updates);
            this.setUser(user);
            
            return true;
        } catch (error) {
            console.error('Update user error:', error);
            return false;
        }
    },

    // إعادة تحميل بيانات المستخدم من Firestore
    async refreshUser() {
        const user = this.getUser();
        if (!user) return null;

        try {
            const userDoc = await db.collection('users').doc(user.uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                const updatedUser = {
                    ...user,
                    name: userData.fullName || user.name,
                    role: userData.role || user.role,
                    repId: userData.repId || user.repId,
                    permissions: userData.role === 'admin' ? ['all'] : ['pos', 'customers', 'orders', 'collections']
                };
                this.setUser(updatedUser);
                return updatedUser;
            }
        } catch (error) {
            console.error('Refresh user error:', error);
        }
        return null;
    }
};

// تصدير الكائن للاستخدام العام
window.Auth = Auth;
