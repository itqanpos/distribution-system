/* =============================================
   modal.js - مربعات حوار احترافية (Modals) - محسّن
   ============================================= */
(function() {
    'use strict';

    // ---------- بيئة التطوير ----------
    const IS_DEV = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const logger = {
        log: (...args) => IS_DEV && console.log(...args),
        warn: (...args) => console.warn(...args)
    };

    // ---------- الأنماط ----------
    const style = document.createElement('style');
    style.textContent = `
        .hesaby-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); z-index: 99990;
            display: flex; align-items: center; justify-content: center;
            animation: hesaby-fade-in 0.2s ease;
            backdrop-filter: blur(4px);
        }
        .hesaby-modal-box {
            background: #1e293b; border-radius: 20px; padding: 28px;
            max-width: 400px; width: 90%; text-align: center;
            border: 1px solid rgba(255,255,255,0.08);
            box-shadow: 0 25px 60px rgba(0,0,0,0.5);
            animation: hesaby-scale-in 0.25s ease;
            direction: rtl;
        }
        @keyframes hesaby-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes hesaby-scale-in { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        .hesaby-modal-icon {
            width: 60px; height: 60px; margin: 0 auto 16px;
            border-radius: 50%; display: flex; align-items: center; justify-content: center;
            font-size: 28px;
        }
        .hesaby-modal-icon.warn { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .hesaby-modal-icon.info { background: rgba(59, 130, 246, 0.15); color: #3b82f6; }
        .hesaby-modal-icon.success { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
        .hesaby-modal-icon.error { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
        .hesaby-modal-box h3 { color: white; font-size: 1.1rem; margin-bottom: 8px; font-family: 'Cairo', sans-serif; }
        .hesaby-modal-box p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 24px; line-height: 1.6; font-family: 'Cairo', sans-serif; }
        .hesaby-modal-actions { display: flex; gap: 12px; justify-content: center; }
        .hesaby-modal-btn {
            flex: 1; padding: 12px 20px; border-radius: 12px; font-family: 'Cairo', sans-serif;
            font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: 0.2s; border: none;
        }
        .hesaby-modal-btn-cancel { background: #334155; color: #cbd5e1; }
        .hesaby-modal-btn-cancel:hover { background: #475569; }
        .hesaby-modal-btn-confirm { background: #ef4444; color: white; }
        .hesaby-modal-btn-confirm:hover { background: #dc2626; }
        .hesaby-modal-btn-primary { background: #3b82f6; color: white; }
        .hesaby-modal-btn-primary:hover { background: #2563eb; }
        .hesaby-modal-btn-success { background: #22c55e; color: white; }
        .hesaby-modal-btn-success:hover { background: #16a34a; }
        body.hesaby-modal-open { overflow: hidden; }
    `;
    document.head.appendChild(style);

    // ---------- دوال مساعدة ----------
    function getIconClass(icon) {
        if (typeof icon === 'string' && icon.startsWith('fa')) return icon;
        const map = {
            warn: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle',
            success: 'fas fa-check-circle',
            error: 'fas fa-times-circle'
        };
        return map[icon] || 'fas fa-info-circle';
    }

    function getIconStyleClass(icon) {
        if (typeof icon === 'string' && icon.startsWith('fa')) return 'info';
        return ['warn','info','success','error'].includes(icon) ? icon : 'info';
    }

    function getButtonClass(type) {
        const map = {
            danger: 'hesaby-modal-btn-confirm',
            primary: 'hesaby-modal-btn-primary',
            success: 'hesaby-modal-btn-success',
            warn: 'hesaby-modal-btn-confirm'
        };
        return map[type] || 'hesaby-modal-btn-primary';
    }

    // ---------- ModalConfirm العام ----------
    window.ModalConfirm = {
        show({
            title = 'تأكيد',
            message = 'هل أنت متأكد؟',
            icon = 'warn',
            confirmText = 'تأكيد',
            cancelText = 'إلغاء',
            type = 'danger',
            html = false,
            showCancel = true,
            onConfirm = null,
            onCancel = null
        } = {}) {
            return new Promise((resolve) => {
                // إزالة أي مودال سابق إن وُجد
                const existing = document.querySelector('.hesaby-modal-overlay');
                if (existing) existing.remove();

                const overlay = document.createElement('div');
                overlay.className = 'hesaby-modal-overlay';
                overlay.setAttribute('role', 'dialog');
                overlay.setAttribute('aria-modal', 'true');
                overlay.setAttribute('aria-labelledby', 'modal-title');

                const iconClass = getIconClass(icon);
                const iconStyle = getIconStyleClass(icon);
                const btnConfirmClass = getButtonClass(type);
                const messageHtml = html ? message : `<p>${message}</p>`;

                overlay.innerHTML = `
                    <div class="hesaby-modal-box">
                        <div class="hesaby-modal-icon ${iconStyle}"><i class="${iconClass}"></i></div>
                        <h3 id="modal-title">${title}</h3>
                        ${messageHtml}
                        <div class="hesaby-modal-actions">
                            ${showCancel ? `<button class="hesaby-modal-btn hesaby-modal-btn-cancel cancel-btn">${cancelText}</button>` : ''}
                            <button class="hesaby-modal-btn ${btnConfirmClass} confirm-btn">${confirmText}</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);
                document.body.classList.add('hesaby-modal-open');

                const confirmBtn = overlay.querySelector('.confirm-btn');
                if (confirmBtn) confirmBtn.focus();

                let closed = false;
                const close = async (result) => {
                    if (closed) return;
                    closed = true;

                    // دوال رجعية اختيارية
                    if (result && onConfirm) {
                        try { if (await onConfirm() === false) { closed = false; return; } } catch {}
                    } else if (!result && onCancel) {
                        try { await onCancel(); } catch {}
                    }

                    overlay.remove();
                    document.body.classList.remove('hesaby-modal-open');
                    document.removeEventListener('keydown', onKeyDown);
                    resolve(result);
                };

                if (confirmBtn) confirmBtn.onclick = () => close(true);
                const cancelBtn = overlay.querySelector('.cancel-btn');
                if (cancelBtn) cancelBtn.onclick = () => close(false);

                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) close(false);
                });

                function onKeyDown(e) {
                    if (e.key === 'Escape') {
                        close(false);
                    }
                }
                document.addEventListener('keydown', onKeyDown);
            });
        }
    };

    logger.log('✅ نظام مربعات الحوار (Modal) جاهز');
})();
