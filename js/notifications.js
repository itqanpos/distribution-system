/* =============================================
   notifications.js - الإشعارات (إصدار مُحسَّن)
   ============================================= */

'use strict';

const Notifications = {
    notifications: [],

    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadNotifications();
    },

    cacheElements() {
        this.el = {
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            notificationsList: document.getElementById('notificationsList'),
            markAllReadBtn: document.getElementById('markAllReadBtn'),
            toast: document.getElementById('toast')
        };
    },

    bindEvents() {
        this.el.userProfileBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));

        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay?.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                this.el.sidebar.classList.remove('open');
                this.el.sidebarOverlay?.classList.remove('show');
            });
        });

        this.el.logoutBtn?.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.markAllReadBtn?.addEventListener('click', () => this.markAllRead());
    },

    loadNotifications() {
        // بيانات افتراضية للإشعارات (يمكن ربطها مع API لاحقاً)
        this.notifications = [
            { id: 1, type: 'warning', title: 'مخزون منخفض', text: 'منتج "بيبسي" وصل للحد الأدنى', time: 'منذ 10 دقائق', unread: true },
            { id: 2, type: 'danger', title: 'فاتورة متأخرة', text: 'العميل "محمد" لديه فاتورة متأخرة بقيمة 500 ج.م', time: 'منذ 30 دقيقة', unread: true },
            { id: 3, type: 'success', title: 'دفعة مكتملة', text: 'تم تحصيل 1200 ج.م من العميل "أحمد"', time: 'منذ ساعة', unread: false },
            { id: 4, type: 'warning', title: 'طلب جديد', text: 'طلب جديد من العميل "علي"', time: 'منذ ساعتين', unread: true }
        ];
        this.renderNotifications();
    },

    renderNotifications() {
        if (!this.el.notificationsList) return;

        if (!this.notifications.length) {
            this.el.notificationsList.innerHTML = '<div class="empty-message"><i class="fas fa-bell-slash"></i> لا توجد إشعارات</div>';
            return;
        }

        const iconMap = {
            warning: { icon: 'fa-exclamation-triangle', bg: '#fef3c7', color: '#f59e0b' },
            danger: { icon: 'fa-times-circle', bg: '#fee2e2', color: '#ef4444' },
            success: { icon: 'fa-check-circle', bg: '#d1fae5', color: '#10b981' }
        };

        this.el.notificationsList.innerHTML = this.notifications.map(n => {
            const icon = iconMap[n.type] || { icon: 'fa-info-circle', bg: '#dbeafe', color: '#3b82f6' };
            return `
                <div class="notification-card ${n.unread ? 'unread' : ''} ${n.type}" onclick="Notifications.markRead(${n.id})">
                    <div class="notification-icon" style="background:${icon.bg}; color:${icon.color};"><i class="fas ${icon.icon}"></i></div>
                    <div class="notification-content">
                        <div class="notification-title">${n.title}</div>
                        <div class="notification-text">${n.text}</div>
                        <div class="notification-time">${n.time}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    markRead(id) {
        const notif = this.notifications.find(n => n.id === id);
        if (notif) notif.unread = false;
        this.renderNotifications();
    },

    markAllRead() {
        this.notifications.forEach(n => n.unread = false);
        this.renderNotifications();
        this.showToast('تم تعليم الكل كمقروء');
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    }
};

window.Notifications = Notifications;
document.addEventListener('DOMContentLoaded', () => Notifications.init());
