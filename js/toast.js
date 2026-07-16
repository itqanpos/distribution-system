/* =============================================
   toast.js - Lightweight Toast Notifications
   ============================================= */
(function() {
    'use strict';

    const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const logger = {
        log: (...args) => IS_DEV && console.log(...args)
    };

    class Toast {
        constructor() {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.style.cssText = `
                position: fixed;
                top: calc(20px + env(safe-area-inset-top, 0px));
                left: 50%;
                transform: translateX(-50%);
                z-index: 10000;
                display: flex;
                flex-direction: column;
                gap: 8px;
                pointer-events: none;
                width: auto;
                max-width: 90vw;
            `;
            document.body.appendChild(this.container);
            this.maxToasts = 3; // الحد الأقصى للتنبيهات الظاهرة
            this.activeToasts = [];
        }

        show(message, type = 'info', duration = 4000) {
            // إزالة أقدم تنبيه إذا تجاوزنا الحد الأقصى
            while (this.activeToasts.length >= this.maxToasts) {
                const oldest = this.activeToasts.shift();
                if (oldest) this._removeToast(oldest);
            }

            const toast = document.createElement('div');
            const bg = type === 'error'   ? '#ef4444' :
                      type === 'success' ? '#10b981' :
                      type === 'warning' ? '#f59e0b' :
                      /* info/default */   '#3b82f6';

            toast.style.cssText = `
                background: ${bg};
                color: white;
                padding: 12px 24px;
                border-radius: 12px;
                font-family: 'Cairo', sans-serif;
                font-size: 14px;
                font-weight: 600;
                box-shadow: 0 10px 25px rgba(0,0,0,0.15);
                opacity: 0;
                transform: translateY(-20px);
                transition: all 0.3s ease;
                pointer-events: auto;
                direction: rtl;
                text-align: right;
                word-break: break-word;
                max-width: 100%;
                line-height: 1.4;
            `;
            toast.textContent = message;
            this.container.appendChild(toast);
            this.activeToasts.push(toast);

            // تنشيط الأنيميشن بعد إدراج العنصر في DOM
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            // إخفاء بعد المدة المحددة
            const timer = setTimeout(() => {
                this._removeToast(toast);
            }, duration);

            // تخزين المؤقت لإلغائه عند الحذف المبكر
            toast._timer = timer;
        }

        _removeToast(toast) {
            clearTimeout(toast._timer);
            const index = this.activeToasts.indexOf(toast);
            if (index !== -1) this.activeToasts.splice(index, 1);
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 300);
        }

        // دوال مختصرة للاستخدام المباشر
        error(msg, duration)   { this.show(msg, 'error', duration); }
        success(msg, duration) { this.show(msg, 'success', duration); }
        warning(msg, duration) { this.show(msg, 'warning', duration); }
        warn(msg, duration)    { this.show(msg, 'warning', duration); } // اسم بديل للتوافق
        info(msg, duration)    { this.show(msg, 'info', duration); }
    }

    window.Toast = new Toast();
    logger.log('✅ Toast system ready');
})();
