/* =============================================
   toast.js - Lightweight Toast Notifications
   ============================================= */
(function() {
    'use strict';
    class Toast {
        constructor() {
            this.container = document.createElement('div');
            this.container.id = 'toast-container';
            this.container.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                z-index: 10000; display: flex; flex-direction: column; gap: 8px;
                pointer-events: none; width: auto; max-width: 90vw;
            `;
            document.body.appendChild(this.container);
        }

        show(message, type = 'info', duration = 4000) {
            const toast = document.createElement('div');
            const bg = type === 'error' ? '#ef4444' : type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : '#3b82f6';
            toast.style.cssText = `
                background: ${bg}; color: white; padding: 12px 24px; border-radius: 12px;
                font-family: 'Cairo', sans-serif; font-size: 14px; font-weight: 600;
                box-shadow: 0 10px 25px rgba(0,0,0,0.1); opacity: 0; transform: translateY(-20px);
                transition: all 0.3s ease; pointer-events: auto; direction: rtl;
                white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            `;
            toast.textContent = message;
            this.container.appendChild(toast);

            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-20px)';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        error(msg)   { this.show(msg, 'error'); }
        success(msg) { this.show(msg, 'success'); }
        warning(msg) { this.show(msg, 'warning'); }
        info(msg)    { this.show(msg, 'info'); }
    }

    window.Toast = new Toast();
})();
