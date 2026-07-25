/* =============================================
   pos-init.js - تهيئة التطبيق والإعدادات
   الوظيفة: تطبيق تفضيلات المستخدم، السمة التلقائية،
   تحميل بيانات المستخدم للشريط الجانبي، تفعيل
   السحب والإفلات، تسجيل Service Worker.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    /**
     * _applyUserPrefs - تطبيق تفضيلات المستخدم
     * تقرأ الإعدادات المخزنة (مثل حجم الخط) وتطبقها على الواجهة.
     * تُستدعى عند تهيئة التطبيق.
     */
    POS._applyUserPrefs = function() {
        // تطبيق حجم الخط المخصص
        if (POS.state.fontSize && POS.state.fontSize !== 14) {
            document.documentElement.style.fontSize = POS.state.fontSize + 'px';
        }
    };

    /**
     * _setupAutoTheme - إعداد السمة التلقائية (داكن/فاتح)
     * تستمع لتغيرات إعدادات النظام (prefers-color-scheme)
     * وتطبق سمة داكنة أو فاتحة تلقائياً.
     */
    POS._setupAutoTheme = function() {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        /**
         * applyTheme - تطبيق السمة بناءً على حالة media query
         * @param {MediaQueryListEvent} e - حدث التغيير
         */
        const applyTheme = (e) => {
            document.documentElement.setAttribute(
                'data-theme',
                e.matches ? 'dark' : 'light'
            );
        };

        // تطبيق السمة الحالية فوراً
        applyTheme(mediaQuery);

        // الاستماع للتغييرات المستقبلية (عندما يغير المستخدم إعدادات النظام)
        mediaQuery.addEventListener('change', applyTheme);
    };

    /**
     * _sidebarUser - تحميل بيانات المستخدم وعرضها في الشريط الجانبي
     * تجلب معلومات المستخدم الحالي من App.getCurrentUser()
     * وتعرض الاسم والصورة الرمزية (أول حرف من الاسم).
     * تُخزن بيانات المستخدم في POS.state.currentUser.
     */
    POS._sidebarUser = async function() {
        // التحقق من توفر دالة جلب المستخدم
        if (typeof window.App?.getCurrentUser !== 'function') {
            console.warn('⚠️ App.getCurrentUser غير متوفرة');
            return;
        }

        try {
            const user = await window.App.getCurrentUser();
            POS.state.currentUser = user;

            if (user) {
                // تحديث الصورة الرمزية في الشريط الجانبي (أول حرف من الاسم)
                if (POS.el.sidebarAvatar) {
                    const initial = (user.fullName || user.email || 'U').charAt(0).toUpperCase();
                    POS.el.sidebarAvatar.textContent = initial;
                }

                // تحديث اسم المستخدم في الشريط الجانبي
                if (POS.el.sidebarUserName) {
                    POS.el.sidebarUserName.textContent = user.fullName || user.email || 'مدير النظام';
                }
            }
        } catch (e) {
            console.warn('⚠️ فشل تحميل بيانات المستخدم للشريط الجانبي:', e.message);
        }
    };

    /**
     * _enableDragDrop - تفعيل السحب والإفلات لعناصر السلة
     * تستخدم مكتبة SortableJS إذا كانت محملة.
     * تسمح للمستخدم بإعادة ترتيب العناصر في السلة عبر السحب.
     * عند انتهاء السحب، تُحدَّث حالة السلة وتُحفظ تلقائياً.
     */
    POS._enableDragDrop = function() {
        // التحقق من وجود الحاوية والمكتبة
        if (!POS.el.cartItemsContainer) return;
        if (typeof Sortable === 'undefined') {
            console.warn('⚠️ مكتبة SortableJS غير محملة - تعطيل السحب والإفلات');
            return;
        }

        // إنشاء كائن Sortable على حاوية السلة
        new Sortable(POS.el.cartItemsContainer, {
            handle: '.cart-item-drag-handle',  // المقبض الذي يمسكه المستخدم للسحب
            animation: 150,                    // مدة الحركة بالمللي ثانية
            onEnd: () => {
                // بعد انتهاء السحب، نقرأ الترتيب الجديد من DOM
                const rows = [...POS.el.cartItemsContainer.querySelectorAll('.cart-item-row')];
                const newCart = [];

                rows.forEach(row => {
                    const idx = +row.dataset.cartIdx;
                    if (!isNaN(idx) && POS.state.cart[idx]) {
                        newCart.push(POS.state.cart[idx]);
                    }
                });

                // تحديث حالة السلة بالترتيب الجديد
                POS.state.cart = newCart;
                POS._renderCart();
                POS._saveCart();
            }
        });
    };

    /**
     * _setupServiceWorker - تسجيل Service Worker للتطبيق التقدمي (PWA)
     * يُمكّن دعم العمل بدون اتصال، التثبيت على الشاشة الرئيسية،
     * والتخزين المؤقت للموارد.
     */
    POS._setupServiceWorker = function() {
        // التحقق من دعم المتصفح لـ Service Worker
        if (!('serviceWorker' in navigator)) {
            console.warn('⚠️ المتصفح لا يدعم Service Worker');
            return;
        }

        // تسجيل Service Worker بعد تحميل الصفحة بالكامل
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./service-worker.js')
                .then(registration => {
                    console.log('✅ Service Worker مسجل بنجاح، النطاق:', registration.scope);

                    // الاستماع لتحديثات Service Worker
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    // تحديث متاح - يمكن إعلام المستخدم
                                    console.log('🔄 تحديث جديد متاح للتطبيق');
                                    U.showToast('تحديث جديد متاح. سيتم التطبيق عند إعادة التحميل.', 'info');
                                }
                            });
                        }
                    });
                })
                .catch(err => {
                    console.warn('⚠️ فشل تسجيل Service Worker:', err.message);
                });
        });
    };

})();
