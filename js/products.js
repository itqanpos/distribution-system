'use strict';

// كائن مساعد محلي (حتى لو لم يحمل pos-core.js)
const _U = {
    fmtMoney: (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ج.م',
    escape: (s) => { const div = document.createElement('div'); div.appendChild(document.createTextNode(s || '')); return div.innerHTML; }
};

const ProductsPage = {
    products: [],
    currentView: 'grid',
    editingId: null,
    pendingDeleteId: null,

    // مراجع DOM
    el: {},

    init() {
        // انتظار تحميل DOM بالكامل
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this._boot());
        } else {
            this._boot();
        }
    },

    _boot() {
        this._cacheDOM();
        this._bindEvents();
        this._loadProducts();
        this._updateSidebarUser();
    },

    /* ----- تخزين مراجع DOM ----- */
    _cacheDOM() {
        const ids = [
            'menuToggle', 'sidebar', 'sidebarOverlay', 'refreshBtn',
            'productsContainer', 'searchInput', 'addProductBtn', 'productCount',
            'productModal', 'modalTitle', 'productForm',
            'prodName', 'prodBarcode', 'prodCode',
            'prodUnitName', 'prodFactor', 'prodPrice', 'prodCost',
            'prodMinPrice', 'prodMaxPrice',
            'cancelBtn', 'closeModalBtn', 'saveBtn',
            'deleteModal', 'deleteMsg', 'confirmDeleteBtn', 'cancelDeleteBtn', 'closeDeleteModalBtn'
        ];
        ids.forEach(id => {
            this.el[id] = document.getElementById(id);
        });
        this.el.viewBtns = document.querySelectorAll('.view-btn');
    },

    /* ----- ربط الأحداث ----- */
    _bindEvents() {
        // القائمة الجانبية
        this.el.menuToggle?.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay.classList.toggle('show');
        });
        this.el.sidebarOverlay?.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });

        this.el.addProductBtn?.addEventListener('click', () => this._openModal());
        this.el.refreshBtn?.addEventListener('click', () => this._loadProducts());
        this.el.searchInput?.addEventListener('input', () => this._render());

        // المودال
        this.el.closeModalBtn?.addEventListener('click', () => this._closeModal());
        this.el.cancelBtn?.addEventListener('click', () => this._closeModal());
        this.el.productForm?.addEventListener('submit', (e) => {
            e.preventDefault();
            this._saveProduct();
        });

        // أزرار العرض
        this.el.viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentView = btn.dataset.view;
                this.el.viewBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._render();
            });
        });

        // الحذف
        this.el.confirmDeleteBtn?.addEventListener('click', () => this._deleteProduct());
        this.el.cancelDeleteBtn?.addEventListener('click', () => this._closeDeleteModal());
        this.el.closeDeleteModalBtn?.addEventListener('click', () => this._closeDeleteModal());

        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeModal(); });
    },

    /* ----- تحميل المنتجات ----- */
    async _loadProducts() {
        try {
            // استخدام DB العام من supabase-db.js
            const prods = await DB.getProducts(true) || [];
            this.products = prods;
            this._render();
            this.el.productCount.textContent = `${this.products.length} منتج`;
        } catch (e) {
            console.error('فشل تحميل المنتجات:', e);
            Toast?.error('فشل تحميل المنتجات');
        }
    },

    /* ----- عرض المنتجات ----- */
    _render() {
        const term = this.el.searchInput.value.trim().toLowerCase();
        let filtered = this.products;
        if (term) {
            filtered = filtered.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.barcode || '').includes(term) ||
                (p.code || '').includes(term)
            );
        }

        const container = this.el.productsContainer;
        if (this.currentView === 'grid') {
            container.className = 'products-grid';
            container.innerHTML = filtered.map(p => this._card(p)).join('');
        } else {
            container.className = 'products-grid table-view';
            container.innerHTML = this._table(filtered);
        }
        this._attachItemEvents();
    },

    _card(p) {
        const base = p.units?.[0] || {};
        const stock = base.stock || 0;
        let stockColor = 'var(--text-muted)';
        if (stock > 5) stockColor = 'var(--success)';
        else if (stock > 0) stockColor = 'var(--warning)';
        else stockColor = 'var(--danger)';

        return `
        <div class="product-card" data-id="${p.id}">
            <div class="card-actions">
                <button class="edit-btn" data-id="${p.id}"><i class="fas fa-edit"></i></button>
                <button class="delete-btn" data-id="${p.id}"><i class="fas fa-trash-alt"></i></button>
            </div>
            <div class="card-image">
                ${p.image_url ? `<img src="${p.image_url}" alt="${_U.escape(p.name)}">` : '<i class="fas fa-box"></i>'}
            </div>
            <div class="card-info">
                <h3>${_U.escape(p.name)}</h3>
                <div class="price">${_U.fmtMoney(base.price)}</div>
                <div class="unit">${base.name || 'وحدة'} | تحويل: ${base.factor || 1}</div>
                <div class="stock" style="color:${stockColor}">المخزون: ${stock}</div>
            </div>
        </div>`;
    },

    _table(list) {
        let html = `<table><thead><tr><th>المنتج</th><th>الوحدة</th><th>السعر</th><th>المخزون</th><th>إجراءات</th></tr></thead><tbody>`;
        list.forEach(p => {
            const base = p.units?.[0] || {};
            html += `<tr>
                <td>${_U.escape(p.name)}</td>
                <td>${base.name || '-'}</td>
                <td>${_U.fmtMoney(base.price)}</td>
                <td>${base.stock || 0}</td>
                <td class="action-icons">
                    <i class="fas fa-edit" data-edit="${p.id}"></i>
                    <i class="fas fa-trash-alt" data-delete="${p.id}"></i>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        return html;
    },

    _attachItemEvents() {
        // النقر على بطاقة (للتعديل)
        this.el.productsContainer.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                this._editProduct(card.dataset.id);
            });
        });
        // أزرار البطاقة
        this.el.productsContainer.querySelectorAll('.edit-btn').forEach(b => {
            b.addEventListener('click', (e) => { e.stopPropagation(); this._editProduct(b.dataset.id); });
        });
        this.el.productsContainer.querySelectorAll('.delete-btn').forEach(b => {
            b.addEventListener('click', (e) => { e.stopPropagation(); this._confirmDelete(b.dataset.id); });
        });
        // أيقونات الجدول
        this.el.productsContainer.querySelectorAll('.fa-edit').forEach(i => {
            i.addEventListener('click', (e) => { e.stopPropagation(); this._editProduct(i.dataset.edit); });
        });
        this.el.productsContainer.querySelectorAll('.fa-trash-alt').forEach(i => {
            i.addEventListener('click', (e) => { e.stopPropagation(); this._confirmDelete(i.dataset.delete); });
        });
    },

    /* ----- فتح / إغلاق المودال ----- */
    _openModal(product = null) {
        this.editingId = product ? product.id : null;
        this.el.modalTitle.textContent = product ? 'تعديل المنتج' : 'إضافة منتج جديد';
        this.el.prodName.value = product?.name || '';
        this.el.prodBarcode.value = product?.barcode || '';
        this.el.prodCode.value = product?.code || '';
        const base = product?.units?.[0] || {};
        this.el.prodUnitName.value = base.name || '';
        this.el.prodFactor.value = base.factor || 1;
        this.el.prodPrice.value = base.price || '';
        this.el.prodCost.value = base.cost || '';
        this.el.prodMinPrice.value = base.minPrice || '';
        this.el.prodMaxPrice.value = base.maxPrice || '';
        this._clearErrors();
        this.el.productModal.classList.add('open');
    },

    _editProduct(id) {
        const p = this.products.find(p => p.id === id);
        if (p) this._openModal(p);
    },

    _closeModal() {
        this.el.productModal.classList.remove('open');
        this.editingId = null;
    },

    _clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => el.style.display = 'none');
    },

    /* ----- حفظ المنتج ----- */
    _validate() {
        let valid = true;
        const name = this.el.prodName.value.trim();
        const unit = this.el.prodUnitName.value.trim();
        const price = this.el.prodPrice.value;

        if (!name) {
            document.getElementById('nameError').textContent = 'اسم المنتج مطلوب';
            document.getElementById('nameError').style.display = 'block';
            valid = false;
        }
        if (!unit) {
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
        if (!this._validate()) return;

        const productData = {
            id: this.editingId || undefined,
            name: this.el.prodName.value.trim(),
            barcode: this.el.prodBarcode.value.trim() || undefined,
            code: this.el.prodCode.value.trim() || undefined,
            units: [{
                name: this.el.prodUnitName.value.trim(),
                price: parseFloat(this.el.prodPrice.value) || 0,
                cost: parseFloat(this.el.prodCost.value) || 0,
                factor: parseFloat(this.el.prodFactor.value) || 1,
                stock: this.editingId ? (this.products.find(p => p.id === this.editingId)?.units?.[0]?.stock || 0) : 0,
                minPrice: parseFloat(this.el.prodMinPrice.value) || 0,
                maxPrice: parseFloat(this.el.prodMaxPrice.value) || 0
            }]
        };

        try {
            await DB.saveProduct(productData);
            Toast?.success('تم حفظ المنتج بنجاح');
            this._closeModal();
            await this._loadProducts();
        } catch (e) {
            console.error(e);
            Toast?.error('فشل حفظ المنتج');
        }
    },

    /* ----- حذف ----- */
    _confirmDelete(id) {
        this.pendingDeleteId = id;
        const p = this.products.find(p => p.id === id);
        this.el.deleteMsg.textContent = `هل أنت متأكد من حذف "${p?.name || 'المنتج'}"؟`;
        this.el.deleteModal.classList.add('open');
    },
    _closeDeleteModal() {
        this.el.deleteModal.classList.remove('open');
        this.pendingDeleteId = null;
    },
    async _deleteProduct() {
        if (!this.pendingDeleteId) return;
        try {
            await DB.deleteProduct(this.pendingDeleteId);
            Toast?.success('تم حذف المنتج');
            this._closeDeleteModal();
            await this._loadProducts();
        } catch (e) {
            console.error(e);
            Toast?.error('فشل حذف المنتج');
        }
    },

    /* ----- مستخدم الشريط الجانبي ----- */
    async _updateSidebarUser() {
        if (window.App?.getCurrentUser) {
            const user = await App.getCurrentUser();
            if (user) {
                const av = document.getElementById('sidebarAvatar');
                const nm = document.getElementById('sidebarUserName');
                if (av) av.textContent = (user.fullName || 'U')[0].toUpperCase();
                if (nm) nm.textContent = user.fullName || user.email;
            }
        }
    }
};

// تشغيل
ProductsPage.init();
