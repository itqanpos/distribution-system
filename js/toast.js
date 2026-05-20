/* =============================================
   toast.js - إشعارات احترافية (Toast Notifications)
   الإصدار 2.1 - حد أقصى، توافق مع pos.js
   ============================================= */
(function() {
    const MAX_VISIBLE = 3; // الحد الأقصى للإشعارات المرئية

    // حقن التنسيقات مرة واحدة
    if (!document.getElementById('hesaby-toast-styles')) {
        const style = document.createElement('style');
        style.id = 'hesaby-toast-styles';
        style.textContent = `
            .hesaby-toast-container {
                position: fixed; bottom: 30px; left: 50%; transform: translateX(-50%);
                z-index: 9999; display: flex; flex-direction: column; gap: 10px;
                align-items: center; pointer-events: none;
            }
            .hesaby-toast {
                pointer-events: auto;
                padding: 12px 24px; border-radius: 30px; font-family: 'Cairo', sans-serif;
                font-size: 0.85rem; font-weight: 600; color: white;
                box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                display: flex; align-items: center; gap: 10px;
                animation: hesaby-toast-in 0.3s ease-out;
                transition: opacity 0.3s, transform 0.3s;
                max-width: 90vw; backdrop-filter: blur(10px);
            }
            .hesaby-toast.removing { opacity: 0; transform: translateY(20px); }
            @keyframes hesaby-toast-in {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .hesaby-toast-success { background: rgba(16, 185, 129, 0.9); }
            .hesaby-toast-error { background: rgba(239, 68, 68, 0.9); }
            .hesaby-toast-info { background: rgba(59, 130, 246, 0.9); }
        `;
        document.head.appendChild(style);
    }

    // البحث عن حاوية موجودة (مثلاً #toast في pos.html) أو إنشاء واحدة
    let container = document.getElementById('toast');
    if (container && !container.classList.contains('hesaby-toast-container')) {
        // تحويل العنصر الموجود إلى حاوية
        container.className = 'hesaby-toast-container';
        container.id = 'hesaby-toast-container';
    } else if (!container) {
        container = document.createElement('div');
        container.className = 'hesaby-toast-container';
        document.body.appendChild(container);
    }

    const visibleToasts = [];

    function showToast(message, type = 'success', duration = 3000) {
        const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
        const toast = document.createElement('div');
        toast.className = `hesaby-toast hesaby-toast-${type}`;
        toast.innerHTML = `<i class="fas ${icons[type] || icons.info}"></i> ${message}`;
        container.appendChild(toast);
        visibleToasts.push(toast);

        // إزالة الأقدم إذا تجاوزنا الحد
        while (visibleToasts.length > MAX_VISIBLE) {
            const oldest = visibleToasts.shift();
            oldest.classList.add('removing');
            setTimeout(() => oldest.remove(), 300);
        }

        // إزالة تلقائية بعد المدة
        setTimeout(() => {
            toast.classList.add('removing');
            const index = visibleToasts.indexOf(toast);
            if (index > -1) visibleToasts.splice(index, 1);
            setTimeout(() => toast.remove(), 300);
        }, duration);
    }

    window.Toast = {
        success: (msg, dur) => showToast(msg, 'success', dur),
        error: (msg, dur) => showToast(msg, 'error', dur),
        info: (msg, dur) => showToast(msg, 'info', dur),
        setMaxVisible: (n) => {
            while (visibleToasts.length > n) {
                const oldest = visibleToasts.shift();
                oldest.classList.add('removing');
                setTimeout(() => oldest.remove(), 300);
            }
        }
    };
    console.log('✅ نظام الإشعارات (Toast) جاهز');
})();
