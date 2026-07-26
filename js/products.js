'use strict';

/**
 * كائن ProductsPage لإدارة صفحة المنتجات
 */
const ProductsPage = {
    products: [],
    currentView: 'grid',
    editingId: null,
    pendingDeleteId: null,

    /* ---------- التهيئة ---------- */
    init() {
        this._cacheDOM();
        this._bindEvents();
        this._loadProducts();
        this._updateSidebarUser();
    },

    _cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay', 'refreshBtn',
            'productsContainer', 'searchInput', 'addProductBtn',
            'productCount', 'productModal', 'modalTitle', 'productForm',
            'prodName', 'prodBarcode', 'prodCode',
            'prodUnitName', 'prodFactor', 'prodPrice', 'prodCost',
            'prodMinPrice', 'prodMaxPrice',
            'cancelBtn', 'closeModalBtn', 'saveBtn',
            'deleteModal', 'deleteMsg', 'confirmDeleteBtn', 'cancelDeleteBtn', 'closeDeleteModalBtn',
            'viewBtns'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) this[id] = el;
        });
        // الأزرار التي لها محددات خاصة
        this.viewBtns = document.querySelectorAll('.view-btn');
    },

    _bindEvents() {
        // القائمة الجانبية
        this.menuToggle.addEventListener('click', () => {
            this.sidebar.classList.toggle('open');
            this.sidebarOverlay.classList.toggle('show');
        });
        this.sidebarOverlay.addEventListener('click', () => {
            this.sidebar.classList.remove('open');
            this.sidebarOverlay.classList.remove('show');
        });

        // الإجراءات الرئيسية
        this.addProductBtn.addEventListener('click', () => this._openModal());
        this.refreshBtn.addEventListener('click', () => this._loadProducts());
        this.searchInput.addEventListener('input', () => this._renderProducts());

        // المودال
        this.closeModalBtn.addEventListener('click', () => this._closeModal());
        this.cancelBtn.addEventListener('click', () => this._closeModal());
        this.productForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._saveProduct();
        });

        // عرض شبكي / جدولي
        this.viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentView = btn.dataset.view;
                this.viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._renderProducts();
            });
        });

        // الحذف
        this.confirmDeleteBtn.addEventListener('click', () => this._deleteProduct());
        this.cancelDeleteBtn.addEventListener('click', () => this._closeDeleteModal());
        this.closeDeleteModalBtn.addEventListener('click', () => this._closeDeleteModal());

        // Escape لإغلاق المودال
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this._closeModal();
        });
    },

    /* ---------- تحميل البيانات ---------- */
    async _loadProducts() {
        try {
            const prods = await DB.getProducts(true) || [];
            this.products = prods;
            this._renderProducts();
            this.productCount.textContent = `${this.products.length} منتج`;
        } catch (e) {
            console.error(e);
            Toast.error('فشل تحميل المنتجات');
        }
    },

    /* ---------- عرض المنتجات ---------- */
    _renderProducts() {
        const term = this.searchInput.value.trim().toLowerCase();
        let filtered = this.products;
        if (term) {
            filtered = filtered.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.barcode || '').includes(term) ||
                (p.code || '').includes(term)
            );
        }

        if (this.currentView === 'grid') {
            this.productsContainer.className = 'products-grid';
            this.productsContainer.innerHTML = filtered.map(p => this._productCard(p)).join('');
        } else {
            this.productsContainer.className = 'products-grid table-view';
            this.productsContainer.innerHTML = this._productTable(filtered);
        }
        this._attachProductEvents();
    },

    _productCard(product) {
        const base = product.units?.[0] || {};
        const stock = base.stock || 0;
        let stockColor = 'var(--text-muted)';
        if (stock > 5) stockColor = 'var(--success)';
        else if (stock > 0) stockColor = 'var(--warning)';
        else stockColor = 'var(--danger)';

        return `
        <div class="product-card" data-id="${product.id}">
            <div class="card-actions">
                <button class="edit-btn" data-id="${product.id}" title="تعديل"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" data-id="${product.id}" title="حذف"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="card-image">
                ${product.image_url ? `<img src="${product.image_url}" alt="${this._esc(product.name)}">` : '<i class="fas fa-box"></i>'}
            </div>
            <div class="card-info">
                <h3>${this._esc(product.name)}</h3>
                <div class="price">${U.fmtMoney(base.price)}</div>
                <div class="unit">${base.name || 'وحدة'} | تحويل: ${base.factor || 1}</div>
                <div class="stock" style="color:${stockColor}">المخزون: ${stock}</div>
            </div>
        </div>`;
    },

    _productTable(list) {
        let html = `<table><thead><tr>
            <th>المنتج</th><th>الوحدة</th><th>السعر</th><th>المخزون</th><th>إجراءات</th>
        </tr></thead><tbody>`;
        list.forEach(p => {
            const base = p.units?.[0] || {};
            html += `<tr>
                <td>${this._esc(p.name)}</td>
                <td>${base.name || '-'}</td>
                <td>${U.fmtMoney(base.price)}</td>
                <td>${base.stock || 0}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" data-edit="${p.id}" title="تعديل"></i>
                    <i class="fas fa-trash-alt" data-delete="${p.id}" title="حذف"></i>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        return html;
    },

    _attachProductEvents() {
        // النقر على بطاقة المنتج للتعديل
        this.productsContainer.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this._editProduct(card.dataset.id);
            });
        });
        // أزرار التعديل والحذف في البطاقات
        this.productsContainer.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editProduct(btn.dataset.id);
            });
        });
        this.productsContainer.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDelete(btn.dataset.id);
            });
        });
        // أيقونات الجدول
        this.productsContainer.querySelectorAll('.fa-edit').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editProduct(icon.dataset.edit);
            });
        });
        this.productsContainer.querySelectorAll('.fa-trash-alt').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDelete(icon.dataset.delete);
            });
        });
    },

    /* ---------- إدارة المودال ---------- */
    _openModal(product = null) {
        this.editingId = product ? product.id : null;
        this.modalTitle.textContent = product ? 'تعديل المنتج' : 'إضافة منتج جديد';

        // تعبئة الحقول
        this.prodName.value = product ? (product.name || '') : '';
        this.prodBarcode.value = product ? (product.barcode || '') : '';
        this.prodCode.value = product ? (product.code || '') : '';

        const base = product?.units?.[0] || {};
        this.prodUnitName.value = base.name || '';
        this.prodFactor.value = base.factor || 1;
        this.prodPrice.value = base.price || '';
        this.prodCost.value = base.cost || '';
        this.prodMinPrice.value = base.minPrice || '';
        this.prodMaxPrice.value = base.maxPrice || '';

        this._clearErrors();
        this.productModal.classList.add('open');
    },

    _editProduct(id) {
        const product = this.products.find(p => p.id === id);
        if (product) this._openModal(product);
    },

    _closeModal() {
        this.productModal.classList.remove('open');
        this.editingId = null;
    },

    _clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => el.style.display = 'none');
    },

    /* ---------- حفظ المنتج ---------- */
    _validateForm() {
        let valid = true;
        const name = this.prodName.value.trim();
        const unitName = this.prodUnitName.value.trim();
        const price = this.prodPrice.value;

        if (!name) {
            document.getElementById('nameError').textContent = 'اسم المنتج مطلوب';
            document.getElementById('nameError').style.display = 'block';
            valid = false;
        }
        if (!unitName) {
            document.getElementById('unitError').textContent = 'اسم الوحدة مطلوب';
            document.getElementById('unitError').style.display = 'block';
            valid = false;
        }
        if (price === '' || parseFloat(price) < 0) {
            document.getElementById('priceError').textContent = 'سعر البيع مطلوب';
            document.getElementById('priceError').style.display = 'block';
            valid = false;
        }
        return valid;
    },

    async _saveProduct() {
        this._clearErrors();
        if (!this._validateForm()) return;

        const productData = {
            id: this.editingId || undefined,
            name: this.prodName.value.trim(),
            barcode: this.prodBarcode.value.trim() || undefined,
            code: this.prodCode.value.trim() || undefined,
            units: [{
                name: this.prodUnitName.value.trim(),
                price: parseFloat(this.prodPrice.value) || 0,
                cost: parseFloat(this.prodCost.value) || 0,
                factor: parseFloat(this.prodFactor.value) || 1,
                stock: this.editingId ? (this.products.find(p => p.id === this.editingId)?.units?.[0]?.stock || 0) : 0,
                minPrice: parseFloat(this.prodMinPrice.value) || 0,
                maxPrice: parseFloat(this.prodMaxPrice.value) || 0
            }]
        };

        try {
            await DB.saveProduct(productData);
            Toast.success('تم حفظ المنتج بنجاح');
            this._closeModal();
            await this._loadProducts();
        } catch (e) {
            console.error(e);
            Toast.error('فشل حفظ المنتج');
        }
    },

    /* ---------- حذف المنتج ---------- */
    _confirmDelete(id) {
        this.pendingDeleteId = id;
        const product = this.products.find(p => p.id === id);
        this.deleteMsg.textContent = `هل أنت متأكد من حذف "${product?.name || 'المنتج'}"؟ لا يمكن التراجع عن هذا الإجراء.`;
        this.deleteModal.classList.add('open');
    },

    _closeDeleteModal() {
        this.deleteModal.classList.remove('open');
        this.pendingDeleteId = null;
    },

    async _deleteProduct() {
        if (!this.pendingDeleteId) return;
        try {
            await DB.deleteProduct(this.pendingDeleteId);
            Toast.success('تم حذف المنتج');
            this._closeDeleteModal();
            await this._loadProducts();
        } catch (e) {
            console.error(e);
            Toast.error('فشل حذف المنتج');
        }
    },

    /* ---------- أدوات مساعدة ---------- */
    _esc(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str || ''));
        return div.innerHTML;
    },

    async _updateSidebarUser() {
        if (window.App?.getCurrentUser) {
            const user = await App.getCurrentUser();
            if (user) {
                const avatar = document.getElementById('sidebarAvatar');
                const nameEl = document.getElementById('sidebarUserName');
                if (avatar) avatar.textContent = (user.fullName || 'U')[0].toUpperCase();
                if (nameEl) nameEl.textContent = user.fullName || user.email;
            }
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ProductsPage.init());
