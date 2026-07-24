'use strict';
import { U } from './utils.js';

export function _setupAutoTheme() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (e) => {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };
    apply(mq);
    mq.addEventListener('change', apply);
}

export function _setupErrorMonitoring(POS) {
    window.addEventListener('error', (event) => {
        console.error('Global Error:', event.error);
        POS._logErrorToServer(event.error);
    });
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled Rejection:', event.reason);
        POS._logErrorToServer(event.reason);
    });
}

export async function _logErrorToServer(POS, error) {
    try {
        if (window.supabaseClient) {
            await window.supabaseClient.from('system_logs').insert({
                message: error?.message || 'unknown',
                stack: error?.stack || '',
                timestamp: new Date().toISOString(),
                tenant_id: POS.state.currentUser?.tenant_id
            });
        }
    } catch (e) { /* silent */ }
}

export async function _sidebarUser(POS) {
    if (window.App?.getCurrentUser) {
        try {
            const u = await window.App.getCurrentUser();
            POS.state.currentUser = u;
            if (u) {
                if (POS.el.sidebarAvatar) POS.el.sidebarAvatar.textContent = (u.fullName || 'U')[0].toUpperCase();
                if (POS.el.sidebarUserName) POS.el.sidebarUserName.textContent = u.fullName || u.email || 'Manager';
            }
        } catch (e) { /* silent */ }
    }
}
