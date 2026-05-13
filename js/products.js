/* =============================================
   products.js - المنتجات (إصدار متوافق مع SaaS)
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

const Products = {
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
            searchInput: document.getElementById('searchInput'),
            categoryFilter: document.getElementById('categoryFilter'),
            refreshBtn: document.getElementById('refreshBtn'),
            addProductBtn: document.getElementById('addProductBtn'),
            productsBody: document.getElementById('productsBody'),
            productModal: document.getElementById('productModal'),
            modalTitle: document.getElementById('modalTitle'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            cancelModalBtn: document.getElementById('cancelModalBtn'),
            productForm: document.getElementById('productForm'),
            productId: document.getElementById('productId'),
            productName: document.getElementById('productName'),
            category: document.getElementById('category'),
            unitsContainer: document.getElementById('unitsContainer'),
            addUnitBtn: document.getElementById('addUnitBtn'),
            notes: document.getElementById('notes'),
            totalProducts: document.getElementById('totalProducts'),
            lowStockCount: document.getElementById('lowStockCount'),
            outOfStockCount: document.getElementById('outOfStockCount'),
            categoriesCount: document.getElementById('categoriesCount'),
            categoriesList: document.getElementById('categoriesList'),
            toast: document.getElementById('toast')
        };
    },

    bindEvents() {
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

        this.el.logoutBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            if (window.App) App.logout();
            else window.location.href = './index.html';
        });

        this.el.searchInput?.addEventListener('input', () => this.renderTable());
        this.el.categoryFilter?.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn?.addEventListener('click', () => this.loadData());

        this.el.addProductBtn?.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn?.addEventListener('click', () => this.closeModal());
        this.el.productForm?.addEventListener('submit', (e) => { e.preventDefault(); this.saveProduct(); });

        this.el.addUnitBtn?.addEventListener('click', () => this.addUnitCard());
    },

    async loadData() {
        try {
            if (Utils.isDBReady()) {
                this.products = await DB.getProducts() || [];
            } else if (Utils.hasLocalDB()) {
                this.products = await localDB.getAll('products') || [];
            } else {
                this.products = [];
            }

            this.products = this.products.map(p => {
                if (typeof p.units === 'string') {
                    try { p.units = JSON.parse(p.units); } catch (e) { p.units = []; }
                }
                return p;
            });

            if (!this.products.length && !Utils.isDBReady() && !Utils.hasLocalDB()) {
                this.products = [
                    { id: '1', name: 'بيبسي', category: 'مشروبات',
                      units: [{ name: 'كرتونة', price: 240, cost: 200, stock: 5, factor: 1 },
                              { name: 'علبة', price: 10, cost: 8.33, stock: 0, factor: 24 }] }
                ];
            }

            this.updateStats();
            this.populateCategories();
            this.renderTable();
        } catch (err) {
            console.error('فشل تحميل المنتجات:', err);
            this.el.productsBody.innerHTML = '<tr><td colspan="6" class="empty-message">فشل تحميل المنتجات</td></tr>';
        }
    },

    updateStats() { /* بدون تغيير */ },
    populateCategories() { /* بدون تغيير */ },
    formatStockDisplay(product) { /* بدون تغيير */ },
    renderTable() { /* بدون تغيير */ },

    openModal(product = null) {
        this.editingId = product?.id || null;
        this.el.modalTitle.textContent = product ? 'تعديل منتج' : 'منتج جديد';
        this.el.productId.value = product?.id || '';
        this.el.productName.value = product?.name || '';
        this.el.category.value = product?.category || '';
        this.el.notes.value = product?.notes || '';
        this.el.unitsContainer.innerHTML = '';

        if (product?.units?.length) {
            product.units.forEach((u, i) => this.addUnitCard(u, i === 0));
        } else {
            this.addUnitCard({ name: 'كرتونة', price: 0, cost: 0, minPrice: 0, maxPrice: 0, stock: 0, factor: 1 }, true);
        }
        this.el.productModal.classList.add('open');
    },

    closeModal() {
        this.el.productModal.classList.remove('open');
    },

    addUnitCard(unit = null, isBase = false) { /* بدون تغيير */ },
    updateStockForSubUnits() { /* بدون تغيير */ },
    updateSingleUnitCost(card) { /* بدون تغيير */ },
    updatePriceFromFactor(input) { /* بدون تغيير */ },
    updatePricesFromBase() { /* بدون تغيير */ },

    showToast(msg) {
        const t = this.el.toast;
        if (!t) return;
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
    },

    async saveProduct() {
        const name = this.el.productName.value.trim();
        if (!name) { alert('اسم المنتج مطلوب'); return; }

        const category = this.el.category.value.trim();
        const notes = this.el.notes.value.trim();
        const unitCards = [...this.el.unitsContainer.children];
        const units = unitCards.map(card => ({
            name: card.querySelector('.unit-name-input')?.value.trim() || 'قطعة',
            price: parseFloat(card.querySelector('.unit-price')?.value) || 0,
            cost: parseFloat(card.querySelector('.unit-cost')?.value) || 0,
            minPrice: parseFloat(card.querySelector('.unit-min-price')?.value) || 0,
            maxPrice: parseFloat(card.querySelector('.unit-max-price')?.value) || 0,
            stock: parseFloat(card.querySelector('.unit-stock')?.value) || 0,
            factor: parseFloat(card.querySelector('.unit-factor')?.value) || 1
        }));

        const product = {
            id: this.editingId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()),
            name,
            category: category || null,
            units,
            notes: notes || null,
            min_stock: 5
        };

        try {
            // ✅ استخدام DB.saveProduct من supabase.js (الذي يتطلب tenant_id)
            if (Utils.isDBReady()) {
                await DB.saveProduct(product);
            } else if (Utils.hasLocalDB()) {
                await localDB.put('products', product);
            } else {
                const local = JSON.parse(localStorage.getItem('products') || '[]');
                const idx = local.findIndex(p => p.id === product.id);
                if (idx >= 0) local[idx] = product;
                else local.push(product);
                localStorage.setItem('products', JSON.stringify(local));
            }
            this.closeModal();
            await this.loadData();
            this.showToast('تم حفظ المنتج بنجاح');
        } catch (err) {
            console.error('❌ فشل حفظ المنتج:', err);
            alert('فشل حفظ المنتج: ' + (err.message || 'خطأ غير معروف'));
        }
    },

    editProduct(id) {
        const p = this.products.find(x => x.id === id);
        if (p) this.openModal(p);
    },

    duplicateProduct(id) {
        const p = this.products.find(x => x.id === id);
        if (p) this.openModal({ ...p, id: (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now()), name: p.name + ' (نسخة)' });
    },

    async deleteProduct(id) {
        if (!confirm('حذف المنتج؟')) return;
        try {
            if (Utils.isDBReady()) await DB.deleteProduct(id);
            else if (Utils.hasLocalDB()) await localDB.delete('products', id).catch(() => {});
            else {
                const local = JSON.parse(localStorage.getItem('products') || '[]');
                localStorage.setItem('products', JSON.stringify(local.filter(p => p.id !== id)));
            }
            await this.loadData();
            this.showToast('تم حذف المنتج');
        } catch (err) {
            console.error(err);
            alert('فشل حذف المنتج');
        }
    }
};

window.Products = Products;
document.addEventListener('DOMContentLoaded', () => Products.init());
