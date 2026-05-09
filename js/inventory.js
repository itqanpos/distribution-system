/* =============================================
   inventory.js - حركات المخزون (إصدار مُحسَّن)
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

const Inventory = {
    movements: [],
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
            typeFilter: document.getElementById('typeFilter'),
            refreshBtn: document.getElementById('refreshBtn'),
            movementsBody: document.getElementById('movementsBody'),
            newMovementBtn: document.getElementById('newMovementBtn'),
            movementModal: document.getElementById('movementModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelModalBtn: document.getElementById('cancelModalBtn'),
            movementForm: document.getElementById('movementForm'),
            movementId: document.getElementById('movementId'),
            movementType: document.getElementById('movementType'),
            movementDate: document.getElementById('movementDate'),
            movementProduct: document.getElementById('movementProduct'),
            movementQuantity: document.getElementById('movementQuantity'),
            movementReason: document.getElementById('movementReason'),
            productList: document.getElementById('productList'),
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
        this.el.typeFilter?.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () => this.loadData());

        this.el.newMovementBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.movementForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveMovement(); });
    },

    async loadData() {
        try {
            if (Utils.isDBReady()) {
                this.movements = await DB.getInventoryMovements?.() || [];
                this.products = await DB.getProducts() || [];
            } else if (Utils.hasLocalDB()) {
                this.movements = await localDB.getAll('inventory_movements') || [];
                this.products = await localDB.getAll('products') || [];
            } else {
                this.movements = [];
                this.products = [];
            }
            this.populateProductList();
            this.updateStats();
            this.renderTable();
        } catch (err) {
            console.error('فشل تحميل حركات المخزون:', err);
        }
    },

    populateProductList() {
        if (!this.el.productList) return;
        this.el.productList.innerHTML = this.products.map(p =>
            `<option value="${p.name}">${p.name}</option>`
        ).join('');
    },

    updateStats() {
        const inMovements = this.movements.filter(m => m.type === 'in');
        const outMovements = this.movements.filter(m => m.type === 'out');
        const totalIn = inMovements.reduce((s, m) => s + (m.quantity || 0), 0);
        const totalOut = outMovements.reduce((s, m) => s + (m.quantity || 0), 0);

        if (this.el.statsGrid) {
            this.el.statsGrid.innerHTML = `
                <div class="stat-card"><div class="stat-icon" style="color:#16a34a;"><i class="fas fa-arrow-down"></i></div><div class="stat-content"><div class="stat-title">إجمالي الوارد</div><div class="stat-value">${totalIn}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#ef4444;"><i class="fas fa-arrow-up"></i></div><div class="stat-content"><div class="stat-title">إجمالي الصادر</div><div class="stat-value">${totalOut}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#3b82f6;"><i class="fas fa-boxes"></i></div><div class="stat-content"><div class="stat-title">عدد المنتجات</div><div class="stat-value">${this.products.length}</div></div></div>
                <div class="stat-card"><div class="stat-icon" style="color:#f59e0b;"><i class="fas fa-exchange-alt"></i></div><div class="stat-content"><div class="stat-title">عدد الحركات</div><div class="stat-value">${this.movements.length}</div></div></div>
            `;
        }
    },

    renderTable() {
        const term = this.el.searchInput?.value.trim().toLowerCase() || '';
        const type = this.el.typeFilter?.value || 'all';

        let filtered = this.movements.filter(m => {
            const matchSearch = !term || (m.product_name || '').includes(term);
            const matchType = type === 'all' || m.type === type;
            return matchSearch && matchType;
        });

        filtered.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        if (!filtered.length) {
            this.el.movementsBody.innerHTML = '<tr><td colspan="5" class="empty-message">لا توجد حركات</td></tr>';
            return;
        }

        const typeLabel = (type) => {
            const map = { in: 'وارد', out: 'صادر', transfer: 'تحويل', adjustment: 'جرد' };
            return map[type] || type;
        };

        this.el.movementsBody.innerHTML = filtered.map(m => `
            <tr>
                <td>${Utils.formatDate(m.date)}</td>
                <td>${m.product_name || '-'}</td>
                <td>${typeLabel(m.type)}</td>
                <td>${m.quantity || 0}</td>
                <td>${m.reason || '-'}</td>
            </tr>
        `).join('');
    },

    openModal(movement = null) {
        this.editingId = movement?.id || null;
        this.el.modalTitle.textContent = movement ? 'تعديل حركة' : 'حركة جديدة';
        this.el.movementId.value = movement?.id || '';
        this.el.movementType.value = movement?.type || 'in';
        this.el.movementDate.value = movement?.date || Utils.getToday();
        this.el.movementProduct.value = movement?.product_name || '';
        this.el.movementQuantity.value = movement?.quantity || '';
        this.el.movementReason.value = movement?.reason || '';
        this.el.movementModal.classList.add('open');
    },

    closeModal() {
        this.el.movementModal.classList.remove('open');
    },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    },

    async saveMovement() {
        const productName = this.el.movementProduct?.value.trim();
        const quantity = parseFloat(this.el.movementQuantity?.value) || 0;
        if (!productName || quantity <= 0) { alert('المنتج والكمية مطلوبان'); return; }

        const movement = {
            id: this.editingId || (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
            date: this.el.movementDate?.value || Utils.getToday(),
            type: this.el.movementType?.value || 'in',
            product_name: productName,
            quantity,
            reason: this.el.movementReason?.value.trim()
        };

        try {
            if (Utils.isDBReady()) await DB.saveInventoryMovement?.(movement);
            else if (Utils.hasLocalDB()) await localDB.put('inventory_movements', movement);

            // تحديث المخزون
            const product = this.products.find(p => p.name === productName);
            if (product && product.units?.length) {
                if (movement.type === 'in') product.units[0].stock += quantity;
                else if (movement.type === 'out') product.units[0].stock -= quantity;
                if (Utils.isDBReady()) await DB.saveProduct(product);
                else if (Utils.hasLocalDB()) await localDB.put('products', product);
            }

            this.closeModal();
            await this.loadData();
            this.showToast('تم حفظ الحركة بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ الحركة');
        }
    }
};

window.Inventory = Inventory;
document.addEventListener('DOMContentLoaded', () => Inventory.init());
