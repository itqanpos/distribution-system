/* =============================================
   المنتجات - حسابي (الوحدة الأساسية هي الكبرى)
   ============================================= */

'use strict';

if (!window.Utils) {
    window.Utils = {
        formatMoney: (amount, currency = 'ج.م') => {
            return Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + currency;
        },
        getToday: () => new Date().toISOString().split('T')[0]
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
            userProfileBtn: document.getElementById('userProfileBtn'),
            userDropdown: document.getElementById('userDropdown')
        };
    },

    bindEvents() {
        this.el.userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); this.el.userDropdown.classList.toggle('show'); });
        document.addEventListener('click', () => this.el.userDropdown?.classList.remove('show'));
        this.el.menuToggle.addEventListener('click', () => this.el.sidebar.classList.toggle('mobile-open'));
        this.el.logoutBtn.addEventListener('click', (e) => { e.preventDefault(); if (window.App) App.logout(); else window.location.href = './index.html'; });

        this.el.searchInput.addEventListener('input', () => this.renderTable());
        this.el.categoryFilter.addEventListener('change', () => this.renderTable());
        this.el.refreshBtn.addEventListener('click', () => this.loadData());

        this.el.addProductBtn.addEventListener('click', () => this.openModal());
        this.el.closeModalBtn.addEventListener('click', () => this.closeModal());
        this.el.cancelModalBtn.addEventListener('click', () => this.closeModal());
        this.el.productForm.addEventListener('submit', (e) => { e.preventDefault(); this.saveProduct(); });

        this.el.addUnitBtn.addEventListener('click', () => this.addUnitCard());
    },

    async loadData() {
        try {
            if (window.DB) {
                this.products = await DB.getProducts();
            } else {
                this.products = [
                    { id: '1', name: 'منتج تجريبي', category: 'مشروبات',
                      units: [{ name: 'كرتونة', price: 240, cost: 200, minPrice: 0, maxPrice: 0, stock: 30, factor: 1 },
                              { name: 'زجاجة', price: 10, cost: 8.33, minPrice: 0, maxPrice: 0, stock: 720, factor: 24 }] }
                ];
            }
            this.updateStats();
            this.populateCategories();
            this.renderTable();
        } catch (err) {
            console.error(err);
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
        this.el.categoriesList.innerHTML = cats.map(c => `<option value="${c}">${c}</option>`).join('');
    },

    renderTable() {
        const term = this.el.searchInput.value.toLowerCase();
        const cat = this.el.categoryFilter.value;
        let filtered = this.products.filter(p => {
            return (p.name || '').toLowerCase().includes(term) &&
                   (cat === 'all' || p.category === cat);
        });
        filtered.sort((a, b) => a.name.localeCompare(b.name, 'ar'));

        if (!filtered.length) {
            this.el.productsBody.innerHTML = '<tr><td colspan="6" class="empty-message">لا توجد منتجات</td></tr>';
            return;
        }
        this.el.productsBody.innerHTML = filtered.map(p => {
            const stock = p.units?.[0]?.stock || 0;
            const min = p.min_stock || 5;
            const status = stock <= 0 ? '<span class="badge badge-danger">نفذ</span>' :
                           (stock <= min ? '<span class="badge badge-danger">منخفض</span>' :
                            '<span class="badge badge-success">متوفر</span>');
            const unitsText = (p.units || []).map(u => `${u.name} (${Utils.formatMoney(u.price)})`).join('، ');
            return `<tr>
                <td>${p.name}</td>
                <td>${p.category || '-'}</td>
                <td>${unitsText}</td>
                <td>${stock} ${p.units?.[0]?.name || ''}</td>
                <td>${status}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" onclick="Products.editProduct('${p.id}')"></i>
                    <i class="fas fa-copy" onclick="Products.duplicateProduct('${p.id}')"></i>
                    <i class="fas fa-trash" onclick="Products.deleteProduct('${p.id}')"></i>
                </td>
            </tr>`;
        }).join('');
    },

    // ========== إدارة المودال ==========
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
            // إنشاء وحدة أساسية أولى (يمكن تسميتها لاحقاً)
            this.addUnitCard({ name: 'كرتونة', price: 0, cost: 0, minPrice: 0, maxPrice: 0, stock: 0, factor: 1 }, true);
        }
        this.el.productModal.style.display = 'flex';
    },

    closeModal() {
        this.el.productModal.style.display = 'none';
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

        const quantityHTML = isBase
            ? `<input type="number" class="unit-factor" value="1" step="1" min="1" readonly style="background:#f1f5f9;">`
            : `<input type="number" class="unit-factor" value="${unit?.factor || 1}" step="1" min="1" onchange="Products.updatePriceFromFactor(this); Products.updateStockForSubUnits();">`;

        const stockHTML = isBase
            ? `<input type="number" class="unit-stock" value="${unit?.stock || 0}" step="0.001" min="0" onchange="Products.updateStockForSubUnits()">`
            : `<input type="number" class="unit-stock" value="${unit?.stock || 0}" step="0.001" readonly>`;

        card.innerHTML = `
            <div class="unit-card-header">
                ${nameHTML}
                ${isBase ? '<span class="base-badge">★ أساسية (الوحدة الكبرى)</span>' : ''}
            </div>
            <div class="unit-card-body">
                <div class="unit-field">
                    <label>سعر البيع</label>
                    <input type="number" class="unit-price" value="${unit?.price || 0}" step="0.01" min="0" ${isBase ? 'onchange="Products.updatePricesFromBase()"' : ''}>
                </div>
                <div class="unit-field">
                    <label>تكلفة الشراء</label>
                    ${costHTML}
                </div>
                <div class="unit-field">
                    <label>الحد الأدنى للسعر</label>
                    <input type="number" class="unit-min-price" value="${unit?.minPrice || 0}" step="0.01" min="0">
                </div>
                <div class="unit-field">
                    <label>الحد الأقصى للسعر</label>
                    <input type="number" class="unit-max-price" value="${unit?.maxPrice || 0}" step="0.01" min="0">
                </div>
                <div class="unit-field">
                    <label>المخزون</label>
                    ${stockHTML}
                </div>
                <div class="unit-field">
                    <label>${isBase ? 'الكمية (1)' : 'عدد القطع في الأساسية'}</label>
                    ${quantityHTML}
                </div>
            </div>
            <div class="unit-card-actions">
                ${!isBase ? '<button type="button" onclick="this.closest(\'.unit-card\').remove(); Products.updatePricesFromBase(); Products.updateStockForSubUnits();">🗑️ حذف</button>' : ''}
            </div>
        `;
        container.appendChild(card);

        if (!isBase) {
            this.updateSingleUnitCost(card);
        }
        // تحديث المخزون للوحدات الفرعية بعد الإضافة مباشرة
        this.updateStockForSubUnits();
    },

    // دالة جديدة: تحديث مخزون الوحدات الفرعية
    updateStockForSubUnits() {
        const cards = [...this.el.unitsContainer.children];
        if (cards.length === 0) return;
        const baseStock = parseFloat(cards[0].querySelector('.unit-stock')?.value) || 0;
        cards.slice(1).forEach(card => {
            const quantity = parseFloat(card.querySelector('.unit-factor')?.value) || 1;
            const stockField = card.querySelector('.unit-stock');
            if (stockField) {
                stockField.value = (baseStock * quantity).toFixed(3);
            }
        });
    },

    updateSingleUnitCost(card) {
        const baseCard = this.el.unitsContainer.children[0];
        if (!baseCard || card === baseCard) return;
        const basePrice = parseFloat(baseCard.querySelector('.unit-price')?.value) || 0;
        const baseCost = parseFloat(baseCard.querySelector('.unit-cost')?.value) || 0;
        const quantity = parseFloat(card.querySelector('.unit-factor')?.value) || 1;
        card.querySelector('.unit-price').value = (basePrice / quantity).toFixed(2);
        card.querySelector('.unit-cost').value = (baseCost / quantity).toFixed(2);
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
            card.querySelector('.unit-price').value = (basePrice / quantity).toFixed(2);
            card.querySelector('.unit-cost').value = (baseCost / quantity).toFixed(2);
        });
        this.updateStockForSubUnits();
    },

    // ========== حفظ المنتج ==========
    async saveProduct() {
        const name = this.el.productName.value.trim();
        if (!name) { alert('اسم المنتج مطلوب'); return; }

        const category = this.el.category.value.trim();
        const notes = this.el.notes.value.trim();
        const unitCards = [...this.el.unitsContainer.children];
        const units = unitCards.map((card, i) => ({
            name: card.querySelector('.unit-name-input').value.trim() || 'قطعة',
            price: parseFloat(card.querySelector('.unit-price').value) || 0,
            cost: parseFloat(card.querySelector('.unit-cost').value) || 0,
            minPrice: parseFloat(card.querySelector('.unit-min-price').value) || 0,
            maxPrice: parseFloat(card.querySelector('.unit-max-price').value) || 0,
            stock: parseFloat(card.querySelector('.unit-stock').value) || 0,
            factor: parseFloat(card.querySelector('.unit-factor').value) || 1
        }));

        const product = {
            id: this.editingId || crypto.randomUUID(),
            name,
            category: category || null,
            units,
            notes: notes || null,
            min_stock: 5
        };

        try {
            if (window.DB) {
                await DB.saveProduct(product);
            } else {
                const local = JSON.parse(localStorage.getItem('products') || '[]');
                const idx = local.findIndex(p => p.id === product.id);
                if (idx >= 0) local[idx] = product;
                else local.push(product);
                localStorage.setItem('products', JSON.stringify(local));
            }
            this.closeModal();
            await this.loadData();
        } catch (err) {
            console.error(err);
            alert('فشل حفظ المنتج');
        }
    },

    editProduct(id) {
        const product = this.products.find(p => p.id === id);
        if (product) this.openModal(product);
    },

    duplicateProduct(id) {
        const product = this.products.find(p => p.id === id);
        if (product) {
            const copy = { ...product, id: crypto.randomUUID(), name: product.name + ' (نسخة)' };
            this.openModal(copy);
        }
    },

    async deleteProduct(id) {
        if (!confirm('هل أنت متأكد من حذف هذا المنتج؟')) return;
        try {
            if (window.DB) await DB.deleteProduct(id);
            else {
                const local = JSON.parse(localStorage.getItem('products') || '[]');
                localStorage.setItem('products', JSON.stringify(local.filter(p => p.id !== id)));
            }
            await this.loadData();
        } catch (err) { alert('فشل حذف المنتج'); }
    }
};

window.Products = Products;
document.addEventListener('DOMContentLoaded', () => Products.init());
