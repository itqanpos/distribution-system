'use strict';

const ProductsPage = {
    products: [],
    currentView: 'grid',
    editingId: null,

    init() {
        this._cacheDOM();
        this._bindEvents();
        this._loadProducts();
        this._updateSidebarUser();
    },

    _cacheDOM() {
        this.el = {
            container: document.getElementById('productsContainer'),
            searchInput: document.getElementById('searchInput'),
            addBtn: document.getElementById('addProductBtn'),
            refreshBtn: document.getElementById('refreshBtn'),
            countSpan: document.getElementById('productCount'),
            productModal: document.getElementById('productModal'),
            modalTitle: document.getElementById('modalTitle'),
            productForm: document.getElementById('productForm'),
            prodName: document.getElementById('prodName'),
            prodPrice: document.getElementById('prodPrice'),
            prodMinPrice: document.getElementById('prodMinPrice'),
            prodMaxPrice: document.getElementById('prodMaxPrice'),
            prodUnitName: document.getElementById('prodUnitName'),
            prodFactor: document.getElementById('prodFactor'),
            prodBarcode: document.getElementById('prodBarcode'),
            cancelBtn: document.getElementById('cancelBtn'),
            closeModalBtn: document.getElementById('closeModalBtn'),
            deleteModal: document.getElementById('deleteModal'),
            deleteMsg: document.getElementById('deleteMsg'),
            confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
            cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
            viewBtns: document.querySelectorAll('.view-btn'),
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay')
        };
    },

    _bindEvents() {
        this.el.addBtn.addEventListener('click', () => this._openModal());
        this.el.refreshBtn.addEventListener('click', () => this._loadProducts());
        this.el.searchInput.addEventListener('input', () => this._render());
        this.el.closeModalBtn.addEventListener('click', () => this._closeModal());
        this.el.cancelBtn.addEventListener('click', () => this._closeModal());
        this.el.productForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._saveProduct();
        });
        this.el.viewBtns.forEach(btn => btn.addEventListener('click', e => {
            this.currentView = e.currentTarget.dataset.view;
            this.el.viewBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this._render();
        }));
        this.el.confirmDeleteBtn.addEventListener('click', () => this._deleteProduct());
        this.el.cancelDeleteBtn.addEventListener('click', () => this._closeDeleteModal());

        this.el.menuToggle.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay.classList.toggle('show');
        });
        this.el.sidebarOverlay.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') this._closeModal();
        });
    },

    async _loadProducts() {
        try {
            const prods = await DB.getProducts(true) || [];
            this.products = prods;
            this._render();
            this.el.countSpan.textContent = `${this.products.length} منتج`;
        } catch (e) {
            console.error(e);
            Toast.error('فشل تحميل المنتجات');
        }
    },

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
        if (this.currentView === 'grid') {
            this.el.container.className = 'products-grid';
            this.el.container.innerHTML = filtered.map(p => this._cardHTML(p)).join('');
        } else {
            this.el.container.className = 'products-grid table-view';
            this.el.container.innerHTML = this._tableHTML(filtered);
        }
        this._attachProductEvents();
    },

    _cardHTML(p) {
        const base = p.units?.[0] || {};
        const stock = base.stock || 0;
        const price = base.price || 0;
        return `
            <div class="product-card" data-id="${p.id}">
                <i class="fas fa-trash-alt delete-icon" data-id="${p.id}" title="حذف"></i>
                <div style="text-align:center; margin-bottom:8px;">
                    ${p.image_url ? `<img src="${p.image_url}" style="width:60px;height:60px;object-fit:cover;border-radius:8px;">` : '<i class="fas fa-box" style="font-size:3rem;color:var(--text-muted);"></i>'}
                </div>
                <h4 style="margin-bottom:4px;">${this._esc(p.name)}</h4>
                <div style="font-size:0.9rem; color:var(--text-secondary);">${U.fmtMoney(price)}</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">${base.name || 'وحدة'}</div>
                <div style="font-size:0.7rem; color:${stock > 5 ? 'var(--success)' : stock > 0 ? 'var(--warning)' : 'var(--danger)'};">المخزون: ${stock}</div>
            </div>`;
    },

    _tableHTML(list) {
        let html = `<table><thead><tr><th>الاسم</th><th>الوحدة</th><th>السعر</th><th>المخزون</th><th>إجراءات</th></tr></thead><tbody>`;
        list.forEach(p => {
            const base = p.units?.[0] || {};
            html += `<tr class="product-row" data-id="${p.id}">
                <td>${this._esc(p.name)}</td>
                <td>${base.name || 'وحدة'}</td>
                <td>${U.fmtMoney(base.price)}</td>
                <td>${base.stock || 0}</td>
                <td>
                    <i class="fas fa-edit" style="color:var(--primary);cursor:pointer;margin-left:10px;" data-edit="${p.id}"></i>
                    <i class="fas fa-trash-alt" style="color:var(--danger);cursor:pointer;" data-delete="${p.id}"></i>
                </td>
            </tr>`;
        });
        html += '</tbody></table>';
        return html;
    },

    _attachProductEvents() {
        this.el.container.querySelectorAll('.product-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-icon')) return;
                this._editProduct(card.dataset.id);
            });
        });
        this.el.container.querySelectorAll('.delete-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDelete(icon.dataset.id);
            });
        });
        this.el.container.querySelectorAll('.fa-edit').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this._editProduct(icon.dataset.edit);
            });
        });
        this.el.container.querySelectorAll('.fa-trash-alt').forEach(icon => {
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this._confirmDelete(icon.dataset.delete);
            });
        });
    },

    _openModal(product = null) {
        this.editingId = product ? product.id : null;
        this.el.modalTitle.textContent = product ? 'تعديل المنتج' : 'إضافة منتج';
        this.el.prodName.value = product ? (product.name || '') : '';
        const base = product?.units?.[0] || {};
        this.el.prodPrice.value = base.price || '';
        this.el.prodMinPrice.value = base.minPrice || '';
        this.el.prodMaxPrice.value = base.maxPrice || '';
        this.el.prodUnitName.value = base.name || '';
        this.el.prodFactor.value = base.factor || 1;
        this.el.prodBarcode.value = product?.barcode || '';
        this._clearErrors();
        this.el.productModal.classList.add('open');
    },

    _editProduct(id) {
        const product = this.products.find(p => p.id === id);
        if (product) this._openModal(product);
    },

    _closeModal() {
        this.el.productModal.classList.remove('open');
        this.editingId = null;
    },

    _clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => el.style.display = 'none');
    },

    _validateForm() {
        let valid = true;
        if (!this.el.prodName.value.trim()) {
            document.getElementById('nameError').textContent = 'اسم المنتج مطلوب';
            document.getElementById('nameError').style.display = 'block';
            valid = false;
        }
        if (this.el.prodPrice.value === '' || parseFloat(this.el.prodPrice.value) < 0) {
            document.getElementById('priceError').textContent = 'سعر البيع مطلوب';
            document.getElementById('priceError').style.display = 'block';
            valid = false;
        }
        if (!this.el.prodUnitName.value.trim()) {
            document.getElementById('unitError').textContent = 'اسم الوحدة مطلوب';
            document.getElementById('unitError').style.display = 'block';
            valid = false;
        }
        return valid;
    },

    async _saveProduct() {
        this._clearErrors();
        if (!this._validateForm()) return;

        const product = {
            id: this.editingId || undefined,
            name: this.el.prodName.value.trim(),
            barcode: this.el.prodBarcode.value.trim() || undefined,
            units: [{
                name: this.el.prodUnitName.value.trim(),
                price: parseFloat(this.el.prodPrice.value) || 0,
                cost: 0,
                factor: parseFloat(this.el.prodFactor.value) || 1,
                stock: this.editingId ? (this.products.find(p => p.id === this.editingId)?.units?.[0]?.stock || 0) : 0,
                minPrice: parseFloat(this.el.prodMinPrice.value) || 0,
                maxPrice: parseFloat(this.el.prodMaxPrice.value) || 0
            }]
        };

        try {
            await DB.saveProduct(product);
            Toast.success('تم حفظ المنتج');
            this._closeModal();
            await this._loadProducts();
        } catch (e) {
            console.error(e);
            Toast.error('فشل حفظ المنتج');
        }
    },

    _confirmDelete(id) {
        this._pendingDeleteId = id;
        const product = this.products.find(p => p.id === id);
        this.el.deleteMsg.textContent = `هل أنت متأكد من حذف "${product?.name || 'المنتج'}"؟`;
        this.el.deleteModal.classList.add('open');
    },

    _closeDeleteModal() {
        this.el.deleteModal.classList.remove('open');
        this._pendingDeleteId = null;
    },

    async _deleteProduct() {
        if (!this._pendingDeleteId) return;
        try {
            await DB.deleteProduct(this._pendingDeleteId);
            Toast.success('تم حذف المنتج');
            this._closeDeleteModal();
            await this._loadProducts();
        } catch (e) {
            console.error(e);
            Toast.error('فشل حذف المنتج');
        }
    },

    _esc(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str || ''));
        return div.innerHTML;
    },

    async _updateSidebarUser() {
        if (window.App?.getCurrentUser) {
            const u = await App.getCurrentUser();
            if (u) {
                const avatar = document.getElementById('sidebarAvatar');
                const nameEl = document.getElementById('sidebarUserName');
                if (avatar) avatar.textContent = (u.fullName || 'U')[0].toUpperCase();
                if (nameEl) nameEl.textContent = u.fullName || u.email;
            }
        }
    }
};

window.addEventListener('DOMContentLoaded', () => ProductsPage.init());
