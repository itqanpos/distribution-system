/* =============================================
   modal.js - مربعات حوار احترافية (Modals)
   ============================================= */
(function() {
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
        .hesaby-modal-box h3 { color: white; font-size: 1.1rem; margin-bottom: 8px; }
        .hesaby-modal-box p { color: #94a3b8; font-size: 0.9rem; margin-bottom: 24px; line-height: 1.6; }
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
    `;
    document.head.appendChild(style);

    window.ModalConfirm = {
        show({ title = 'تأكيد', message = 'هل أنت متأكد؟', icon = 'warn', confirmText = 'تأكيد', cancelText = 'إلغاء', type = 'danger' }) {
            return new Promise((resolve) => {
                const overlay = document.createElement('div');
                overlay.className = 'hesaby-modal-overlay';
                
                const btnConfirmClass = type === 'primary' ? 'hesaby-modal-btn-primary' : 'hesaby-modal-btn-confirm';
                
                overlay.innerHTML = `
                    <div class="hesaby-modal-box">
                        <div class="hesaby-modal-icon ${icon}"><i class="fas fa-${icon === 'warn' ? 'exclamation-triangle' : 'info-circle'}"></i></div>
                        <h3>${title}</h3>
                        <p>${message}</p>
                        <div class="hesaby-modal-actions">
                            <button class="hesaby-modal-btn hesaby-modal-btn-cancel cancel-btn">${cancelText}</button>
                            <button class="hesaby-modal-btn ${btnConfirmClass} confirm-btn">${confirmText}</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(overlay);

                const close = (result) => {
                    overlay.remove();
                    resolve(result);
                };

                overlay.querySelector('.cancel-btn').onclick = () => close(false);
                overlay.querySelector('.confirm-btn').onclick = () => close(true);
                overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
            });
        }
    };
    console.log('✅ نظام مربعات الحوار (Modal) جاهز');
})();
