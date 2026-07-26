'use strict';

const ProductsPage = {
    products: [],
    currentView: 'grid',
    editingProductId: null,

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
            panel: document.getElementById('productPanel'),
            panelTitle: document.getElementById('panelTitle'),
            panelBody: document.getElementById('panelBody'),
            saveBtn: document.getElementById('saveProductBtn'),
            cancelBtn: document.getElementById('cancelPanelBtn'),
            closePanelBtn: document.getElementById('closePanelBtn'),
            deleteModal: document.getElementById('deleteModal'),
            deleteMsg: document.getElementById('deleteMsg'),
            confirmDeleteBtn: document.getElementById('confirmDeleteBtn'),
            cancelDeleteBtn: document.getElementById('cancelDeleteBtn'),
            viewBtns: document.querySelectorAll('.view-btn'),
            tabs: document.querySelectorAll('.tab'),
            menuToggle: document.getElementById('menuToggle'),
            sidebar: document.getElementById('sidebar'),
            sidebarOverlay: document.getElementById('sidebarOverlay')
        };
    },

    _bindEvents() {
        this.el.addBtn.addEventListener('click', () => this._openPanel());
        this.el.refreshBtn.addEventListener('click', () => this._loadProducts());
        this.el.searchInput.addEventListener('input', () => this._renderProducts());
        this.el.closePanelBtn.addEventListener('click', () => this._closePanel());
        this.el.cancelBtn.addEventListener('click', () => this._closePanel());
        this.el.saveBtn.addEventListener('click', () => this._saveProduct());
        this.el.viewBtns.forEach(btn => btn.addEventListener('click', e => {
            this.currentView = e.currentTarget.dataset.view;
            this.el.viewBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            this._renderProducts();
        }));
        this.el.tabs.forEach(tab => tab.addEventListener('click', e => this._switchTab(e.currentTarget.dataset.tab)));
        this.el.confirmDeleteBtn.addEventListener('click', () => this._deleteProduct());
        this.el.cancelDeleteBtn.addEventListener('click', () => this._closeModal('deleteModal'));
        // الشريط الجانبي
        this.el.menuToggle.addEventListener('click', () => {
            this.el.sidebar.classList.toggle('open');
            this.el.sidebarOverlay.classList.toggle('show');
        });
        this.el.sidebarOverlay.addEventListener('click', () => {
            this.el.sidebar.classList.remove('open');
            this.el.sidebarOverlay.classList.remove('show');
        });
        // اختصارات
        document.addEventListener('keydown', e => {
            if (e.ctrlKey && e.key === 'n') { e.preventDefault(); this._openPanel(); }
        });
    },

    async _loadProducts() {
        try {
            const prods = await DB.getProducts(true);
            this.products = prods || [];
            this._renderProducts();
            this.el.countSpan.textContent = `${this.products.length} منتج`;
        } catch (e) {
            console.error(e);
            Toast.error('فشل تحميل المنتجات');
        }
    },

    _renderProducts() {
        const term = this.el.searchInput.value.trim().toLowerCase();
        let filtered = this.products;
        if (term) {
            filtered = this.products.filter(p => p.name?.toLowerCase().includes(term) || p.barcode === term || p.code === term);
        }
        if (this.currentView === 'grid') {
            this.el.container.className = 'products-grid';
            this.el.container.innerHTML = filtered.map(p => this._productCard(p)).join('');
        } else {
            this.el.container.className = 'products-grid table-view';
            this.el.container.innerHTML = this._productTable(filtered);
        }
        // ربط الأحداث
        this.el.container.querySelectorAll('.product-card, .product-row').forEach(el => {
            el.addEventListener('click', () => this._openPanel(el.dataset.id));
        });
        this.el.container.querySelectorAll('.delete-product').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                this._confirmDelete(btn.dataset.id, btn.dataset.name);
            });
        });
    },

    _productCard(p) {
        const base = p.units?.[0] || {};
        const stock = base.stock || 0;
        const stockColor = stock > 5 ? 'var(--success)' : stock > 0 ? 'var(--warning)' : 'var(--danger)';
        return `
        <div class="product-card" data-id="${p.id}">
            ${p.image_url ? `<img src="${p.image_url}" alt="${p.name}">` : '<div class="no-image"><i class="fas fa-box"></i></div>'}
            <div class="card-body">
                <h4>${p.name}</h4>
                <span class="price">${U.fmtMoney(base.price)}</span>
                <div class="stock" style="color:${stockColor}">${stock}</div>
            </div>
            <button class="btn-icon delete-product" data-id="${p.id}" data-name="${p.name}"><i class="fas fa-trash"></i></button>
        </div>`;
    },

    _productTable(list) {
        let html = `<table><thead><tr>
            <th>الصورة</th><th>الاسم</th><th>الكود</th><th>السعر</th><th>المخزون</th><th>إجراءات</th>
        </tr></thead><tbody>`;
        list.forEach(p => {
            const base = p.units?.[0] || {};
            const stock = base.stock || 0;
            html += `<tr class="product-row" data-id="${p.id}">
                <td>${p.image_url ? `<img src="${p.image_url}" width="40" height="40" style="object-fit:cover;border-radius:6px">` : ''}</td>
                <td>${p.name}</td>
                <td>${p.code || '-'}</td>
                <td>${U.fmtMoney(base.price)}</td>
                <td>${stock}</td>
                <td><button class="btn-icon delete-product" data-id="${p.id}" data-name="${p.name}"><i class="fas fa-trash"></i></button></td>
            </tr>`;
        });
        html += '</tbody></table>';
        return html;
    },

    _openPanel(id = null) {
        this.editingProductId = id;
        const product = id ? this.products.find(p => p.id === id) : null;
        this.el.panelTitle.textContent = product ? 'تعديل المنتج' : 'إضافة منتج';
        // بناء محتوى التبويب النشط (أساسي)
        this._buildBasicTab(product);
        this.el.panel.classList.add('open');
    },

    _buildBasicTab(product) {
        this.el.panelBody.innerHTML = `
            <div class="form-group"><label>اسم المنتج</label><input type="text" id="prodName" value="${product?.name || ''}"></div>
            <div class="form-group"><label>الكود</label><input type="text" id="prodCode" value="${product?.code || ''}"></div>
            <div class="form-group"><label>الباركود</label><input type="text" id="prodBarcode" value="${product?.barcode || ''}"></div>
            <div class="form-group"><label>السعر الأساسي</label><input type="number" id="prodPrice" value="${product?.units?.[0]?.price || ''}" step="0.01"></div>
            <div class="form-group"><label>المخزون</label><input type="number" id="prodStock" value="${product?.units?.[0]?.stock || ''}"></div>
        `;
    },

    async _saveProduct() {
        const name = document.getElementById('prodName')?.value.trim();
        if (!name) return Toast.error('الاسم مطلوب');
        const product = {
            id: this.editingProductId || undefined,
            name,
            code: document.getElementById('prodCode')?.value || undefined,
            barcode: document.getElementById('prodBarcode')?.value || undefined,
            units: [{
                name: 'وحدة',
                price: +document.getElementById('prodPrice')?.value || 0,
                cost: 0,
                factor: 1,
                stock: +document.getElementById('prodStock')?.value || 0
            }]
        };
        try {
            await DB.saveProduct(product);
            Toast.success('تم حفظ المنتج');
            this._closePanel();
            this._loadProducts();
        } catch (e) {
            Toast.error('فشل الحفظ');
        }
    },

    _confirmDelete(id, name) {
        this._pendingDeleteId = id;
        this.el.deleteMsg.textContent = `حذف "${name}"؟`;
        this._openModal('deleteModal');
    },

    async _deleteProduct() {
        if (!this._pendingDeleteId) return;
        try {
            await DB.deleteProduct(this._pendingDeleteId);
            Toast.success('تم الحذف');
            this._closeModal('deleteModal');
            this._loadProducts();
        } catch (e) {
            Toast.error('فشل الحذف');
        }
    },

    _closePanel() {
        this.el.panel.classList.remove('open');
        this.editingProductId = null;
    },

    _openModal(id) { document.getElementById(id).classList.add('open'); },
    _closeModal(id) { document.getElementById(id).classList.remove('open'); },

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
