/* =============================================
   orders.js - الطلبات (إصدار مُحسَّن)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return dateStr; }
        },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase),
        hasLocalDB: () => !!(window.localDB && typeof localDB.getAll === 'function')
    };
}

const Orders = {
    orders: [],
    customers: [],
    products: [],
    editingId: null,

    init() {
        this.cacheElements();
        this.bindEvents();
        if (window.App) {
            if (!App.requireAuth()) return;
            App.initUserInterface();
        }
        this.loadData();
    },

    cacheElements() {
        this.el = {
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay'),
            logoutBtn: document.getElementById('logoutBtn'),
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
            searchInput: document.getElementById('searchInput'),
            statusFilter: document.getElementById('statusFilter'),
            refreshBtn: document.getElementById('refreshBtn'),
            ordersBody: document.getElementById('ordersBody'),
            newOrderBtn: document.getElementById('newOrderBtn'),
            orderModal: document.getElementById('orderModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelModalBtn: document.getElementById('cancelModalBtn'),
            orderForm: document.getElementById('orderForm'),
            orderId: document.getElementById('orderId'),
            orderCustomer: document.getElementById('orderCustomer'),
            orderDate: document.getElementById('orderDate'),
            orderItemsContainer: document.getElementById('orderItemsContainer'),
            addOrderItemBtn: document.getElementById('addOrderItemBtn'),
            orderTotal: document.getElementById('orderTotal'),
            orderNotes: document.getElementById('orderNotes'),
            customerList: document.getElementById('customerList'),
            statsGrid: document.getElementById('statsGrid'),
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

        this.el.searchInput?.addEventListener('input', () => this.renderTable());
        this.el.statusFilter?.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () => this.loadData());

        this.el.newOrderBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.orderForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveOrder(); });
        this.el.addOrderItemBtn?.addEventListener('click', () => this.addOrderItem());
    },

    async loadData() {
        try {
            if (Utils.isDBReady()) {
                this.orders = await DB.getOrders?.() || [];
                this.customers = await DB.getParties('customer') || [];
                this.products = await DB.getProducts() || [];
            } else if (Utils.hasLocalDB()) {
                this.orders = await localDB.getAll('orders') || [];
                const allParties = await localDB.getAll('parties') || [];
                this.customers = allParties.filter(p => p.type === 'customer');
                this.products = await localDB.getAll('products') || [];
            } else {
                this.orders = [];
                this.customers = [];
                this.products = [];
            }
            this.populateCustomerList();
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error('فشل تحميل الطلبات:', err);
        }
    },

    populateCustomerList() {
        if (!this.el.customerList) return;
        this.el.customerList.innerHTML = this.customers.map(c =>
            `<option value="${c.name}">${c.name}</option>`
        ).join('');
    },

    updateStats() {
        const total = this.orders.length;
        const pending = this.orders.filter(o => o.status === 'pending').length;
        const completed = this.orders.filter(o => o.status === 'completed').length;
        const cancelled = this.orders.filter(o => o.status === 'cancelled').length;

        if (this.el.statsGrid) {
            this.el.statsGrid.innerHTML = `
                <div class="stat-card"><div class="stat-icon" style="color:#3b82f6;"><i class="fas fa-clipboard-list"></i></div><div class="stat-content"><div class="stat-title">إجمالي الطلبات</div><div class="stat-value">${total}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#f59e0b;"><i class="fas fa-clock"></i></div><div class="stat-content"><div class="stat-title">قيد الانتظار</div><div class="stat-value">${pending}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#16a34a;"><i class="fas fa-check-circle"></i></div><div class="stat-content"><div class="stat-title">مكتملة</div><div class="stat-value">${completed}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#ef4444;"><i class="fas fa-times-circle"></i></div><div class="stat-content"><div class="stat-title">ملغاة</div><div class="stat-value">${cancelled}</div></div></div>
            `;
        }
    },

    renderTable() {
        const term = this.el.searchInput?.value.trim().toLowerCase() || '';
        const status = this.el.statusFilter?.value || 'all';

        let filtered = this.orders.filter(o => {
            const matchSearch = !term || (o.id || '').includes(term) || (o.customer_name || '').includes(term);
            const matchStatus = status === 'all' || o.status === status;
            return matchSearch && matchStatus;
        });

        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!filtered.length) {
            this.el.ordersBody.innerHTML = '<tr><td colspan="6" class="empty-message">لا توجد طلبات</td></tr>';
            return;
        }

        const statusBadge = (status) => {
            const map = {
                pending: '<span class="badge badge-warning">قيد الانتظار</span>',
                processing: '<span class="badge badge-info">قيد التجهيز</span>',
                completed: '<span class="badge badge-success">مكتمل</span>',
                cancelled: '<span class="badge badge-danger">ملغي</span>'
            };
            return map[status] || status;
        };

        this.el.ordersBody.innerHTML = filtered.map(o => `
            <tr>
                <td>${(o.id || '').substring(0, 8)}</td>
                <td>${Utils.formatDate(o.date)}</td>
                <td>${o.customer_name || '-'}</td>
                <td>${Utils.formatMoney(o.total)}</td>
                <td>${statusBadge(o.status)}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" onclick="Orders.editOrder('${o.id}')"></i>
                    <i class="fas fa-check" onclick="Orders.markCompleted('${o.id}')"></i>
                </td>
            </tr>
        `).join('');
    },

    openModal(order = null) {
        this.editingId = order?.id || null;
        this.el.modalTitle.textContent = order ? 'تعديل طلب' : 'طلب جديد';
        this.el.orderId.value = order?.id || '';
        this.el.orderCustomer.value = order?.customer_name || '';
        this.el.orderDate.value = order?.date || Utils.getToday();
        this.el.orderNotes.value = order?.notes || '';
        this.el.orderItemsContainer.innerHTML = '';

        if (order?.items?.length) {
            order.items.forEach(item => this.addOrderItem(item));
        } else {
            this.addOrderItem();
        }
        this.updateTotal();
        this.el.orderModal.classList.add('open');
    },

    closeModal() {
        this.el.orderModal.classList.remove('open');
    },

    addOrderItem(item = null) {
        const div = document.createElement('div');
        div.className = 'order-item-row';
        div.innerHTML = `
            <input type="text" class="item-product" placeholder="اسم المنتج" value="${item?.productName || ''}" list="productDatalist" autocomplete="off">
            <input type="number" class="item-qty" placeholder="الكمية" value="${item?.quantity || 1}" min="0.001" step="0.001" oninput="Orders.updateTotal()">
            <button type="button" class="remove-btn" onclick="this.closest('.order-item-row').remove(); Orders.updateTotal();"><i class="fas fa-times"></i></button>
        `;
        this.el.orderItemsContainer.appendChild(div);
    },

    updateTotal() {
        let total = 0;
        this.el.orderItemsContainer.querySelectorAll('.order-item-row').forEach(row => {
            const qty = parseFloat(row.querySelector('.item-qty')?.value) || 0;
            // سعر افتراضي 0، يمكن تحسينه لاحقاً
            total += qty * 0;
        });
        this.el.orderTotal.textContent = Utils.formatMoney(total);
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    },

    async saveOrder() {
        const customerName = this.el.orderCustomer?.value.trim();
        if (!customerName) { alert('اسم العميل مطلوب'); return; }

        const items = [];
        this.el.orderItemsContainer.querySelectorAll('.order-item-row').forEach(row => {
            const productName = row.querySelector('.item-product')?.value.trim();
            const quantity = parseFloat(row.querySelector('.item-qty')?.value) || 0;
            if (productName && quantity > 0) items.push({ productName, quantity });
        });

        const order = {
            id: this.editingId || (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
            date: this.el.orderDate?.value || Utils.getToday(),
            customer_name: customerName,
            items,
            total: items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0),
            status: 'pending',
            notes: this.el.orderNotes?.value.trim()
        };

        try {
            if (Utils.isDBReady()) await DB.saveOrder?.(order);
            else if (Utils.hasLocalDB()) await localDB.put('orders', order);
            this.closeModal();
            await this.loadData();
            this.showToast('تم حفظ الطلب بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الطلب');
        }
    },

    editOrder(id) {
        const order = this.orders.find(o => o.id === id);
        if (order) this.openModal(order);
    },

    async markCompleted(id) {
        const order = this.orders.find(o => o.id === id);
        if (!order) return;
        order.status = 'completed';
        try {
            if (Utils.isDBReady()) await DB.saveOrder?.(order);
            else if (Utils.hasLocalDB()) await localDB.put('orders', order);
            this.showToast('تم تحديث حالة الطلب');
            this.renderTable();
        } catch (err) { console.error(err); }
    }
};

window.Orders = Orders;
document.addEventListener('DOMContentLoaded', () => Orders.init());
