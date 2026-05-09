/* =============================================
   products.js - المنتجات (إصدار موحَّد)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        formatDate: (dateStr) => {
            if (!dateStr) return '';
            try { return new Date(dateStr).toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric' }); }
            catch (e) { return dateStr; }
        },
        getToday: () => new Date().toISOString().split('T')[0],
        isDBReady: () => !!(window.DB && window.supabase && typeof DB.getProducts === 'function'),
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
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown'),
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
        this.el.userProfileBtn?.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));

        // القائمة الجانبية مع الطبقة الداكنة
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

            // معالجة الوحدات المخزنة كنص
            this.products = this.products.map(p => {
                if (typeof p.units === 'string') {
                    try { p.units = JSON.parse(p.units); } catch (e) { p.units = []; }
                }
                return p;
            });

            // بيانات افتراضية للاختبار
            if (!this.products.length && !Utils.isDBReady() && !Utils.hasLocalDB()) {
                this.products = [
                    { id: '1', name: 'بيبسي', category: 'مشروبات',
                      units: [{ name: 'كرتونة', price: 240, cost: 200, minPrice: 0, maxPrice: 0, stock: 5, factor: 1 },
                              { name: 'علبة', price: 10, cost: 8.33, minPrice: 0, maxPrice: 0, stock: 0, factor: 24 }] }
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

    updateStats() {
        const total = this.products.length;
        let low = 0, out = 0;
        const categories = new Set();
        this.products.forEach(p => {
            if (p.category) categories.add(p.category);
            const stock = p.units?.[0]?.stock || 0;
            if (stock <= 0) out++;
            else if (stock <= (p.min_stock || 5)) low++;
        });
        this.el.totalProducts.textContent = total;
        this.el.lowStockCount.textContent = low;
        this.el.outOfStockCount.textContent = out;
        this.el.categoriesCount.textContent = categories.size;
    },

    populateCategories() {
        const cats = [...new Set(this.products.map(p => p.category).filter(Boolean))];
        this.el.categoryFilter.innerHTML = '<option value="all">كل التصنيفات</option>' +
            cats.map(c => `<option value="${c}">${c}</option>`).join('');
        if (this.el.categoriesList) {
            this.el.categoriesList.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
        }
    },

    formatStockDisplay(product) {
        const baseUnit = product.units?.[0];
        if (!baseUnit) return '0';
        const stock = baseUnit.stock || 0;
        const subUnit = product.units?.[1];
        if (!subUnit || subUnit.factor === 1) {
            return `${Math.floor(stock)} ${baseUnit.name}`;
        }
        const factor = subUnit.factor;
        const wholeUnits = Math.floor(stock);
        const remainder = Math.round((stock - wholeUnits) * factor);
        if (remainder === 0) return `${wholeUnits} ${baseUnit.name}`;
        if (wholeUnits === 0) return `${remainder} ${subUnit.name}`;
        return `${wholeUnits} ${baseUnit.name} و ${remainder} ${subUnit.name}`;
    },

    renderTable() {
        const term = this.el.searchInput.value.toLowerCase();
        const cat = this.el.categoryFilter.value;
        let filtered = this.products.filter(p => {
            return (p.name || '').toLowerCase().includes(term) &&
                   (cat === 'all' || p.category === cat);
        });
        filtered.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ar'));

        if (!filtered.length) {
            this.el.productsBody.innerHTML = '<tr><td colspan="6" class="empty-message">لا توجد منتجات</td></tr>';
            return;
        }
        this.el.productsBody.innerHTML = filtered.map(p => {
            const stockDisplay = this.formatStockDisplay(p);
            const baseStock = p.units?.[0]?.stock || 0;
            const min = p.min_stock || 5;
            const status = baseStock <= 0 ? '<span class="badge badge-danger">نفذ</span>' :
                           (baseStock <= min ? '<span class="badge badge-danger">منخفض</span>' :
                            '<span class="badge badge-success">متوفر</span>');
            const unitsText = (p.units || []).map(u => `${u.name} (${Utils.formatMoney(u.price)})`).join('، ');
            return `<tr>
                <td>${p.name}</td>
                <td>${p.category || '-'}</td>
                <td>${unitsText}</td>
                <td>${stockDisplay}</td>
                <td>${status}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" onclick="Products.editProduct('${p.id}')"></i>
                    <i class="fas fa-copy" onclick="Products.duplicateProduct('${p.id}')"></i>
                    <i class="fas fa-trash" onclick="Products.deleteProduct('${p.id}')"></i>
                </td>
            </tr>`;
        }).join('');
    },

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

    addUnitCard(unit = null, isBase = false) {
        const container = this.el.unitsContainer;
        if (container.children.length === 0) isBase = true;

        const card = document.createElement('div');
        card.className = `unit-card ${isBase ? 'is-base' : ''}`;

        const nameHTML = `<input type="text" class="unit-name-input" value="${unit?.name || (isBase ? 'كرتونة' : 'قطعة')}" placeholder="اسم الوحدة">`;
        const costHTML = isBase
            ? `<input type="number" class="unit-cost" value="${unit?.cost || 0}" step="0.01" min="0" onchange="Products.updatePricesFromBase()">`
            : `<input type="number" class="unit-cost" value="${unit?.cost || 0}" step="0.01" readonly>`;

        card.innerHTML = `
            <div class="unit-card-header">
                ${nameHTML}
                ${isBase ? '<span class="base-badge">★ أساسية</span>' : ''}
            </div>
            <div class="unit-card-body">
                <div class="unit-field"><label>سعر البيع</label><input type="number" class="unit-price" value="${unit?.price || 0}" step="0.01" min="0" ${isBase ? 'onchange="Products.updatePricesFromBase()"' : ''}></div>
                <div class="unit-field"><label>تكلفة الشراء</label>${costHTML}</div>
                <div class="unit-field"><label>الحد الأدنى</label><input type="number" class="unit-min-price" value="${unit?.minPrice || 0}" step="0.01" min="0"></div>
                <div class="unit-field"><label>الحد الأقصى</label><input type="number" class="unit-max-price" value="${unit?.maxPrice || 0}" step="0.01" min="0"></div>
                <div class="unit-field"><label>المخزون</label><input type="number" class="unit-stock" value="${unit?.stock || 0}" step="0.001" min="0" ${isBase ? 'onchange="Products.updateStockForSubUnits()"' : 'readonly'}></div>
                <div class="unit-field"><label>${isBase ? 'الكمية (1)' : 'عدد القطع في الأساسية'}</label><input type="number" class="unit-factor" value="${unit?.factor || 1}" step="1" min="1" ${isBase ? 'readonly' : 'onchange="Products.updatePriceFromFactor(this); Products.updateStockForSubUnits();"'}></div>
            </div>
            ${!isBase ? '<div class="unit-card-actions"><button type="button" onclick="this.closest(\'.unit-card\').remove(); Products.updatePricesFromBase(); Products.updateStockForSubUnits();"><i class="fas fa-trash"></i> حذف</button></div>' : ''}
        `;
        container.appendChild(card);

        if (!isBase) this.updateSingleUnitCost(card);
        this.updateStockForSubUnits();
    },

    updateStockForSubUnits() {
        const cards = [...this.el.unitsContainer.children];
        if (cards.length === 0) return;
        const baseStock = parseFloat(cards[0].querySelector('.unit-stock')?.value) || 0;
        cards.slice(1).forEach(card => {
            const quantity = parseFloat(card.querySelector('.unit-factor')?.value) || 1;
            const stockField = card.querySelector('.unit-stock');
            if (stockField) stockField.value = (baseStock * quantity).toFixed(3);
        });
    },

    updateSingleUnitCost(card) {
        const baseCard = this.el.unitsContainer.children[0];
        if (!baseCard || card === baseCard) return;
        const basePrice = parseFloat(baseCard.querySelector('.unit-price')?.value) || 0;
        const baseCost = parseFloat(baseCard.querySelector('.unit-cost')?.value) || 0;
        const quantity = parseFloat(card.querySelector('.unit-factor')?.value) || 1;
        if (card.querySelector('.unit-price')) card.querySelector('.unit-price').value = (basePrice / quantity).toFixed(2);
        if (card.querySelector('.unit-cost')) card.querySelector('.unit-cost').value = (baseCost / quantity).toFixed(2);
    },

    updatePriceFromFactor(input) {
        const card = input.closest('.unit-card');
        this.updateSingleUnitCost(card);
        this.updateStockForSubUnits();
    },

    updatePricesFromBase() {
        const cards = [...this.el.unitsContainer.children];
        if (cards.length === 0) return;
        const baseCard = cards[0];
        const basePrice = parseFloat(baseCard.querySelector('.unit-price')?.value) || 0;
        const baseCost = parseFloat(baseCard.querySelector('.unit-cost')?.value) || 0;
        cards.slice(1).forEach(card => {
            const quantity = parseFloat(card.querySelector('.unit-factor')?.value) || 1;
            if (card.querySelector('.unit-price')) card.querySelector('.unit-price').value = (basePrice / quantity).toFixed(2);
            if (card.querySelector('.unit-cost')) card.querySelector('.unit-cost').value = (baseCost / quantity).toFixed(2);
        });
        this.updateStockForSubUnits();
    },

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
            name, category: category || null, units, notes: notes || null, min_stock: 5
        };

        try {
            if (Utils.isDBReady()) await DB.saveProduct(product);
            else if (Utils.hasLocalDB()) await localDB.put('products', product);
            else {
                const local = JSON.parse(localStorage.getItem('products') || '[]');
                const idx = local.findIndex(p => p.id === product.id);
                if (idx >= 0) local[idx] = product; else local.push(product);
                localStorage.setItem('products', JSON.stringify(local));
            }
            this.closeModal();
            await this.loadData();
            this.showToast('تم حفظ المنتج بنجاح');
        } catch (err) {
            console.error(err);
            alert('فشل حفظ المنتج');
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
