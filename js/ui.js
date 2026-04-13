// js/ui.js - واجهة مستخدم مشتركة مع السحب للتحديث والمزامنة التلقائية
const UI = (function() {
    // استخراج المسار الأساسي لـ GitHub Pages
    const pathSegments = window.location.pathname.split('/');
    const BASE_PATH = (pathSegments.length > 1 && pathSegments[1]) ? '/' + pathSegments[1] : '';
    
    // مراجع للمؤقتات
    let autoSyncInterval = null;
    let pullToRefreshInstance = null;

    return {
        // تهيئة الصفحة الأساسية
        async initPage(title, options = {}) {
            if (!Auth.requireAuth()) return false;

            const user = Auth.getUser();
            const userNameEl = document.getElementById('userName');
            const loginTimeEl = document.getElementById('loginTime');
            const userAvatarEl = document.getElementById('userAvatar');
            
            if (userNameEl) userNameEl.textContent = user.name;
            if (loginTimeEl) loginTimeEl.textContent = `دخل النظام: ${user.loginTime || 'اليوم'}`;
            if (userAvatarEl) userAvatarEl.textContent = user.avatar || user.name.charAt(0);
            if (title) document.title = `${title} - نظام التوزيع الغذائي`;

            this.fixMenuLinks();
            this.highlightCurrentMenuItem();
            this.registerServiceWorker();

            // إعداد السحب للتحديث إذا طلب ذلك
            if (options.enablePullToRefresh && options.refreshCallback) {
                this.enablePullToRefresh(options.refreshCallback);
            }

            // بدء المزامنة التلقائية إذا طلب ذلك
            if (options.autoSync && options.syncCallback) {
                this.startAutoSync(options.syncCallback, options.syncInterval || 30000);
            }

            return true;
        },

        // إصلاح روابط القائمة الجانبية لتشمل المسار الأساسي
        fixMenuLinks() {
            const base = BASE_PATH ? BASE_PATH + '/' : '';
            document.querySelectorAll('.menu-item[href]').forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('http') && !href.startsWith(base)) {
                    link.setAttribute('href', base + href);
                }
            });
        },

        // تسجيل Service Worker
        registerServiceWorker() {
            if ('serviceWorker' in navigator) {
                const swPath = (BASE_PATH ? BASE_PATH : '') + '/service-worker.js';
                navigator.serviceWorker.register(swPath, { scope: BASE_PATH + '/' || './' })
                    .then(reg => console.log('SW registered'))
                    .catch(err => console.error('SW failed', err));
            }
        },

        // تمييز عنصر القائمة النشط
        highlightCurrentMenuItem() {
            const currentPage = window.location.pathname.split('/').pop() || 'dashboard.html';
            document.querySelectorAll('.menu-item').forEach(item => {
                const href = item.getAttribute('href');
                if (href && href.includes(currentPage)) item.classList.add('active');
                else item.classList.remove('active');
            });
        },

        // تسجيل الخروج
        logout() {
            this.stopAutoSync();
            if (confirm('هل تريد تسجيل الخروج؟')) {
                Auth.logout();
                const base = BASE_PATH ? BASE_PATH + '/' : '';
                window.location.href = base + 'index.html';
            }
        },

        // ملء قائمة منسدلة
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
        },

        // التنقل بين الصفحات
        navigateTo(page) {
            const user = Auth.getUser();
            const base = BASE_PATH ? BASE_PATH + '/' : '';
            const routes = {
                'dashboard': base + 'dashboard.html',
                'sales': base + 'sales.html',
                'pos': base + (user && user.role === 'admin' ? 'pos.html' : 'rep-pos.html'),
                'invoices': base + 'invoices.html',
                'purchases': base + 'purchases.html',
                'cashbox': base + 'cashbox.html',
                'reports': base + 'reports.html',
                'accounting': base + 'accounting.html',
                'customers': base + 'customers.html',
                'reps': base + 'reps.html',
                'products': base + 'products.html',
                'settings': base + 'settings.html'
            };
            if (routes[page]) window.location.href = routes[page];
        },

        // ==================== السحب للتحديث ====================
        enablePullToRefresh(refreshCallback) {
            if (!refreshCallback) return;
            
            // إزالة المستمعات القديمة إذا وجدت
            this.disablePullToRefresh();
            
            let startY = 0;
            let pulling = false;
            const threshold = 80;
            let indicator = null;

            const createIndicator = () => {
                if (indicator) return;
                indicator = document.createElement('div');
                indicator.className = 'pull-refresh-indicator';
                indicator.style.cssText = `
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 0;
                    background: var(--secondary, #3498db);
                    color: white;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    overflow: hidden;
                    transition: height 0.2s;
                    z-index: 9999;
                    font-size: 14px;
                    gap: 8px;
                    box-shadow: 0 2px 5px rgba(0,0,0,0.1);
                `;
                indicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span>تحديث...</span>';
                document.body.appendChild(indicator);
            };

            const setIndicatorHeight = (h) => {
                if (indicator) indicator.style.height = h + 'px';
            };

            const startRefresh = async () => {
                if (!indicator) return;
                indicator.style.background = 'var(--success, #2ecc71)';
                indicator.innerHTML = '<i class="fas fa-spinner fa-spin"></i> <span>جاري التحديث...</span>';
                try {
                    await refreshCallback();
                } catch (e) {
                    console.error('Refresh failed:', e);
                }
                finishRefresh();
            };

            const finishRefresh = () => {
                if (!indicator) return;
                indicator.style.background = 'var(--secondary, #3498db)';
                indicator.innerHTML = '<i class="fas fa-check-circle"></i> <span>تم التحديث</span>';
                setTimeout(() => {
                    if (indicator) {
                        indicator.style.height = '0';
                        setTimeout(() => {
                            if (indicator) indicator.innerHTML = '<i class="fas fa-sync-alt fa-spin"></i> <span>تحديث...</span>';
                        }, 200);
                    }
                }, 500);
            };

            const handleTouchStart = (e) => {
                if (window.scrollY === 0) {
                    startY = e.touches[0].clientY;
                    pulling = true;
                    createIndicator();
                }
            };

            const handleTouchMove = (e) => {
                if (!pulling || window.scrollY > 0) {
                    pulling = false;
                    return;
                }
                const currentY = e.touches[0].clientY;
                const diff = currentY - startY;
                if (diff > 0) {
                    e.preventDefault();
                    setIndicatorHeight(Math.min(diff, 60));
                } else {
                    setIndicatorHeight(0);
                }
            };

            const handleTouchEnd = (e) => {
                if (!pulling) return;
                const currentY = e.changedTouches[0].clientY;
                const diff = currentY - startY;
                if (diff >= threshold && window.scrollY === 0) {
                    startRefresh();
                } else {
                    setIndicatorHeight(0);
                }
                pulling = false;
            };

            document.addEventListener('touchstart', handleTouchStart, { passive: false });
            document.addEventListener('touchmove', handleTouchMove, { passive: false });
            document.addEventListener('touchend', handleTouchEnd, { passive: false });

            // حفظ المراجع لإزالتها لاحقًا
            pullToRefreshInstance = {
                destroy: () => {
                    document.removeEventListener('touchstart', handleTouchStart);
                    document.removeEventListener('touchmove', handleTouchMove);
                    document.removeEventListener('touchend', handleTouchEnd);
                    if (indicator) {
                        indicator.remove();
                        indicator = null;
                    }
                },
                refresh: () => startRefresh()
            };

            return pullToRefreshInstance;
        },

        disablePullToRefresh() {
            if (pullToRefreshInstance) {
                pullToRefreshInstance.destroy();
                pullToRefreshInstance = null;
            }
        },

        // تشغيل التحديث يدويًا (من زر)
        manualRefresh() {
            if (pullToRefreshInstance) {
                pullToRefreshInstance.refresh();
            }
        },

        // ==================== المزامنة التلقائية ====================
        startAutoSync(callback, interval = 30000) {
            this.stopAutoSync();
            autoSyncInterval = setInterval(async () => {
                console.log('Auto-syncing...');
                try {
                    await callback();
                } catch (e) {
                    console.error('Auto-sync failed:', e);
                }
            }, interval);
        },

        stopAutoSync() {
            if (autoSyncInterval) {
                clearInterval(autoSyncInterval);
                autoSyncInterval = null;
            }
        },

        // ==================== دوال مساعدة ====================
        showLoading(containerId, message = 'جاري التحميل...') {
            const container = document.getElementById(containerId);
            if (container) {
                container.innerHTML = `
                    <div class="loading" style="text-align:center; padding:40px;">
                        <div class="spinner" style="width:40px; height:40px; border:4px solid #f3f3f3; border-top:4px solid var(--secondary); border-radius:50%; animation:spin 1s linear infinite; margin:0 auto 15px;"></div>
                        <p>${message}</p>
                    </div>
                `;
            }
        },

        toggleModal(modalId, show = true) {
            const modal = document.getElementById(modalId);
            if (modal) {
                modal.style.display = show ? 'flex' : 'none';
            }
        }
    };
})();

// إضافة animation للـ spinner
const style = document.createElement('style');
style.textContent = `@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`;
document.head.appendChild(style);

window.UI = UI;
