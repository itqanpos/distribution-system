/* =============================================
   products.js - Products Page Logic
   v2.0 - With Min/Max Price Support
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    /* ============ State ============ */
    const State = {
        products: [],
        filtered: [],
        categories: [],
        currentUser: null,
        editingId: null,
        deletingId: null,
        unitDeleteIndex: -1,
        filters: {
            search: '',
            category: '',
            stock: '',
            sort: 'name'
        }
    };

    /* ============================================
       Init
       ============================================ */
    async function init() {
        console.log('🚀 Products init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }

        if (!window.DB?.client) {
            console.error('❌ Supabase غير محمّل');
            showToast('تعذر الاتصال بالخادم', 'error');
            return;
        }

        await new Promise(r => setTimeout(r, 300));

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadProducts();
        hideLoadingBar();
        console.log('✅ Products ready');
    }

    /* ============================================
       Load Products
       ============================================ */
    async function loadProducts() {
        showSkeleton();
        try {
            State.products = await DB.getProducts(true) || [];
            extractCategories();
            applyFilters();
            updateCount();
        } catch (e) {
            console.error('Load error:', e);
            showToast('تعذر تحميل المنتجات', 'error');
            showEmpty(true);
        } finally {
            hideSkeleton();
        }
    }

    function extractCategories() {
        const cats = new Set();
        State.products.forEach(p => {
            if (p.category) cats.add(p.category);
        });
        State.categories = [...cats].sort();

        const filter = $('#categoryFilter');
        if (filter) {
            filter.innerHTML = '<option value="">كل التصنيفات</option>' +
                State.categories.map(c => `<option value="${U.escape(c)}">${U.escape(c)}</option>`).join('');
        }

        const datalist = $('#categoryList');
        if (datalist) {
            datalist.innerHTML = State.categories.map(c => `<option value="${U.escape(c)}">`).join('');
        }
    }

    /* ============================================
       Filters & Sorting
       ============================================ */
    function applyFilters() {
        let list = [...State.products];

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.code || '').toLowerCase().includes(term) ||
                (p.barcode || '').includes(term)
            );
        }

        if (State.filters.category) {
            list = list.filter(p => p.category === State.filters.category);
        }

        if (State.filters.stock) {
            list = list.filter(p => {
                const stock = p.units?.[0]?.stock || 0;
                if (State.filters.stock === 'in') return stock > 5;
                if (State.filters.stock === 'low') return stock > 0 && stock <= 5;
                if (State.filters.stock === 'out') return stock <= 0;
                return true;
            });
        }

        const sort = State.filters.sort;
        list.sort((a, b) => {
            if (sort === 'name') return (a.name || '').localeCompare(b.name || '', 'ar');
            if (sort === 'name-desc') return (b.name || '').localeCompare(a.name || '', 'ar');
            if (sort === 'price') return (a.units?.[0]?.price || 0) - (b.units?.[0]?.price || 0);
            if (sort === 'price-desc') return (b.units?.[0]?.price || 0) - (a.units?.[0]?.price || 0);
            if (sort === 'stock') return (a.units?.[0]?.stock || 0) - (b.units?.[0]?.stock || 0);
            if (sort === 'recent') return (b.created_at || '').localeCompare(a.created_at || '');
            return 0;
        });

        State.filtered = list;
        renderProducts();
        updateCount();
    }

    function updateCount() {
        const el = $('#productsCount');
        if (el) {
            const total = State.products.length;
            const shown = State.filtered.length;
            el.textContent = shown === total
                ? `${total} منتج`
                : `${shown} من ${total} منتج`;
        }
    }

    /* ============================================
       Render Products
       ============================================ */
    function renderProducts() {
        const gridView = $('#productsGridView');
        const listView = $('#productsListView');
        const empty = $('#emptyState');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            showEmpty(true);
            return;
        }

        showEmpty(false);

        if (gridView) {
            gridView.innerHTML = State.filtered.map(p => renderProductCard(p)).join('');
            gridView.querySelectorAll('.product-item').forEach(el => bindProductCardActions(el));
        }

        if (listView) {
            listView.innerHTML = State.filtered.map(p => renderProductListItem(p)).join('');
            listView.querySelectorAll('.product-list-item').forEach(el => bindProductCardActions(el));
        }
    }

    function renderProductCard(p) {
        const base = p.units?.[0] || { price: 0, stock: 0, name: 'وحدة' };
        const stock = base.stock || 0;
        const stockInfo = getStockInfo(stock);

        return `
            <div class="product-item" data-id="${p.id}">
                <div class="product-item__actions">
                    <button class="icon-action" data-action="edit" title="تعديل">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-action danger" data-action="delete" title="حذف">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="product-item__head">
                    <div class="product-item__icon">
                        <i class="fas fa-cube"></i>
                    </div>
                    <div class="product-item__title">
                        <div class="product-item__name">${U.escape(p.name)}</div>
                        <div class="product-item__category">${U.escape(p.category || 'بدون تصنيف')}</div>
                    </div>
                </div>
                <div class="product-item__body">
                    <div class="product-item__price">
                        ${U.moneyRaw(base.price)} <small>ج.م</small>
                    </div>
                    <div class="product-item__stock ${stockInfo.class}">
                        ${stockInfo.label}
                    </div>
                </div>
            </div>
        `;
    }

    function renderProductListItem(p) {
        const base = p.units?.[0] || { price: 0, stock: 0, name: 'وحدة' };
        const stock = base.stock || 0;
        const stockInfo = getStockInfo(stock);

        return `
            <div class="product-list-item" data-id="${p.id}">
                <div class="product-list-item__icon">
                    <i class="fas fa-cube"></i>
                </div>
                <div class="product-list-item__info">
                    <div class="product-list-item__name">${U.escape(p.name)}</div>
                    <div class="product-list-item__meta">
                        <span>${U.escape(p.category || 'بدون تصنيف')}</span>
                        ${p.barcode ? `<span>· ${U.escape(p.barcode)}</span>` : ''}
                    </div>
                </div>
                <div class="product-list-item__right">
                    <div class="product-list-item__price">${U.moneyRaw(base.price)} ج.م</div>
                    <div class="product-list-item__stock ${stockInfo.class}">
                        ${stockInfo.label}
                    </div>
                </div>
            </div>
        `;
    }

    function getStockInfo(stock) {
        if (stock <= 0) return { class: 'out', label: 'نفذ' };
        if (stock <= 5) return { class: 'low', label: `منخفض: ${stock}` };
        return { class: 'in', label: `متوفر: ${stock}` };
    }

    function bindProductCardActions(el) {
        const id = el.dataset.id;

        el.addEventListener('click', (e) => {
            const action = e.target.closest('[data-action]')?.dataset.action;

            if (action === 'edit') {
                e.stopPropagation();
                openProductModal(id);
            } else if (action === 'delete') {
                e.stopPropagation();
                openDeleteConfirm(id);
            } else {
                openViewModal(id);
            }
        });
    }

    /* ============================================
       Product Modal (Add/Edit)
       ============================================ */
    function openProductModal(id = null) {
        State.editingId = id;

        const title = $('#modalTitle');
        if (title) title.textContent = id ? 'تعديل المنتج' : 'إضافة منتج جديد';

        const form = $('#productForm');
        if (form) form.reset();

        const unitsContainer = $('#unitsContainer');
        if (unitsContainer) unitsContainer.innerHTML = '';

        if (id) {
            const product = State.products.find(p => p.id === id);
            if (!product) return;

            $('#productId').value = id;
            $('#productName').value = product.name || '';
            $('#productCode').value = product.code || '';
            $('#productBarcode').value = product.barcode || '';
            $('#productCategory').value = product.category || '';
            $('#productDescription').value = product.description || '';

            (product.units || []).forEach(u => addUnitToForm(u));
        } else {
            $('#productId').value = '';
            addUnitToForm({ 
                name: 'قطعة', 
                price: 0, 
                cost: 0, 
                stock: 0, 
                factor: 1, 
                minPrice: 0, 
                maxPrice: 0,
                isBase: true 
            });
        }

        openModal('productModal');
        setTimeout(() => $('#productName')?.focus(), 200);
    }

    /* ============================================
       Add Unit to Form (with min/max price)
       ============================================ */
    function addUnitToForm(unit = {}) {
        const container = $('#unitsContainer');
        if (!container) return;

        const index = container.children.length;
        const isBase = index === 0;

        const div = document.createElement('div');
        div.className = 'unit-card';
        div.dataset.index = index;
        if (unit.id) div.dataset.unitId = unit.id;

        div.innerHTML = `
            <div class="unit-card__header">
                ${isBase 
                    ? '<span class="unit-card__badge">الوحدة الأساسية</span>'
                    : `<span style="font-weight:800;font-size:12px;color:var(--text-muted);">وحدة #${index + 1}</span>`}
                ${!isBase ? `
                    <button type="button" class="unit-card__remove" data-remove="${index}">
                        <i class="fas fa-times"></i>
                    </button>
                ` : ''}
            </div>
            <div class="unit-card__grid">
                <div class="form-group full">
                    <label>اسم الوحدة *</label>
                    <input type="text" class="unit-name" value="${U.escape(unit.name || '')}" placeholder="مثال: قطعة، علبة، كرتونة" required>
                </div>
                <div class="form-group">
                    <label>سعر البيع *</label>
                    <input type="number" class="unit-price" value="${unit.price || 0}" min="0" step="0.01" inputmode="decimal" required>
                </div>
                <div class="form-group">
                    <label>سعر التكلفة</label>
                    <input type="number" class="unit-cost" value="${unit.cost || 0}" min="0" step="0.01" inputmode="decimal">
                </div>
                <div class="form-group">
                    <label>الرصيد (المخزون)</label>
                    <input type="number" class="unit-stock" value="${unit.stock || 0}" step="0.01" inputmode="decimal">
                </div>
                <div class="form-group">
                    <label>معامل التحويل ${!isBase ? '*' : ''}</label>
                    <input type="number" class="unit-factor" value="${unit.factor || 1}" min="0.001" step="0.001" inputmode="decimal" ${isBase ? 'readonly' : ''}>
                </div>
                ${!isBase ? `
                    <div class="form-group">
                        <label>الباركود</label>
                        <input type="text" class="unit-barcode" value="${U.escape(unit.barcode || '')}" placeholder="اختياري">
                    </div>
                ` : ''}
                <!-- ✅ حقول السعر الأدنى والأقصى -->
                <div class="form-group">
                    <label>
                        <i class="fas fa-arrow-down price-range-icon"></i>
                        السعر الأدنى
                    </label>
                    <input type="number" class="unit-min-price" value="${unit.minPrice || 0}" min="0" step="0.01" inputmode="decimal" placeholder="0 = بدون حد">
                </div>
                <div class="form-group">
                    <label>
                        <i class="fas fa-arrow-up price-range-icon"></i>
                        السعر الأقصى
                    </label>
                    <input type="number" class="unit-max-price" value="${unit.maxPrice || 0}" min="0" step="0.01" inputmode="decimal" placeholder="0 = بدون حد">
                </div>
            </div>
        `;

        container.appendChild(div);

        // Bind remove
        const removeBtn = div.querySelector('[data-remove]');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                State.unitDeleteIndex = index;
                openModal('confirmUnitDeleteModal');
            });
        }

        // Bind price changes to update hint
        const priceInput = div.querySelector('.unit-price');
        const minInput = div.querySelector('.unit-min-price');
        const maxInput = div.querySelector('.unit-max-price');

        const updateHint = () => {
            let hint = div.querySelector('.unit-price-range-hint');
            
            const price = +priceInput?.value || 0;
            const min = +minInput?.value || 0;
            const max = +maxInput?.value || 0;
            
            const hasLimits = min > 0 || max > 0;
            
            if (hasLimits) {
                if (!hint) {
                    hint = document.createElement('div');
                    hint.className = 'unit-price-range-hint';
                    div.querySelector('.unit-card__grid').appendChild(hint);
                }
                hint.innerHTML = `
                    <i class="fas fa-info-circle"></i>
                    نطاق السعر المسموح: ${min > 0 ? min : 0} - ${max > 0 ? max : '∞'} ج.م
                `;
            } else if (hint) {
                hint.remove();
            }
        };

        priceInput?.addEventListener('input', updateHint);
        minInput?.addEventListener('input', updateHint);
        maxInput?.addEventListener('input', updateHint);

        // Initial hint
        updateHint();
    }

    function removeUnitFromForm(index) {
        const container = $('#unitsContainer');
        if (!container) return;

        const cards = container.querySelectorAll('.unit-card');
        if (cards.length <= 1) {
            showToast('يجب أن يكون هناك وحدة واحدة على الأقل', 'warning');
            return;
        }

        cards[index]?.remove();
        reindexUnits();
    }

    function reindexUnits() {
        const container = $('#unitsContainer');
        if (!container) return;

        const cards = container.querySelectorAll('.unit-card');
        cards.forEach((card, i) => {
            card.dataset.index = i;
            const badge = card.querySelector('.unit-card__badge');
            const headerSpan = card.querySelector('.unit-card__header > span:not(.unit-card__badge)');
            
            if (i === 0) {
                if (!badge) {
                    const badgeEl = document.createElement('span');
                    badgeEl.className = 'unit-card__badge';
                    badgeEl.textContent = 'الوحدة الأساسية';
                    card.querySelector('.unit-card__header').prepend(badgeEl);
                }
                if (headerSpan) headerSpan.remove();
                const removeBtn = card.querySelector('.unit-card__remove');
                if (removeBtn) removeBtn.remove();
                
                const factorInput = card.querySelector('.unit-factor');
                if (factorInput) {
                    factorInput.value = 1;
                    factorInput.readOnly = true;
                }
            } else {
                if (badge) badge.remove();
                if (!headerSpan) {
                    const span = document.createElement('span');
                    span.style.cssText = 'font-weight:800;font-size:12px;color:var(--text-muted);';
                    span.textContent = `وحدة #${i + 1}`;
                    card.querySelector('.unit-card__header').prepend(span);
                } else {
                    headerSpan.textContent = `وحدة #${i + 1}`;
                }
                
                const factorInput = card.querySelector('.unit-factor');
                if (factorInput) factorInput.readOnly = false;
            }
        });
    }

    /* ============================================
       Save Product
       ============================================ */
    async function saveProduct() {
        const name = $('#productName')?.value.trim();
        if (!name) {
            showToast('اسم المنتج مطلوب', 'warning');
            return;
        }

        const unitCards = $$('#unitsContainer .unit-card');
        if (!unitCards.length) {
            showToast('يجب إضافة وحدة واحدة على الأقل', 'warning');
            return;
        }

        const units = [];
        let valid = true;

        for (let i = 0; i < unitCards.length; i++) {
            const card = unitCards[i];
            const unitName = card.querySelector('.unit-name')?.value.trim();
            const unitPrice = +card.querySelector('.unit-price')?.value || 0;
            const unitCost = +card.querySelector('.unit-cost')?.value || 0;
            const unitStock = +card.querySelector('.unit-stock')?.value || 0;
            const unitFactor = +card.querySelector('.unit-factor')?.value || 1;
            const unitBarcode = card.querySelector('.unit-barcode')?.value.trim() || '';
            const unitMinPrice = +card.querySelector('.unit-min-price')?.value || 0;
            const unitMaxPrice = +card.querySelector('.unit-max-price')?.value || 0;

            // التحقق من اسم الوحدة
            if (!unitName) {
                showToast(`اسم الوحدة ${i + 1} مطلوب`, 'warning');
                valid = false;
                break;
            }

            // التحقق من السعر
            if (unitPrice < 0) {
                showToast(`سعر الوحدة ${i + 1} غير صالح`, 'warning');
                valid = false;
                break;
            }

            // ✅ التحقق من النطاق السعري
            if (unitMaxPrice > 0 && unitMinPrice > 0 && unitMinPrice > unitMaxPrice) {
                showToast(`في الوحدة ${i + 1}: السعر الأدنى أكبر من الأقصى`, 'warning');
                valid = false;
                break;
            }

            if (unitPrice < unitMinPrice && unitMinPrice > 0) {
                showToast(`في الوحدة ${i + 1}: سعر البيع أقل من الحد الأدنى`, 'warning');
                valid = false;
                break;
            }

            if (unitMaxPrice > 0 && unitPrice > unitMaxPrice) {
                showToast(`في الوحدة ${i + 1}: سعر البيع أعلى من الحد الأقصى`, 'warning');
                valid = false;
                break;
            }

            units.push({
                id: card.dataset.unitId || U.uuid(),
                name: unitName,
                price: unitPrice,
                cost: unitCost,
                stock: unitStock,
                factor: unitFactor,
                barcode: unitBarcode,
                minPrice: unitMinPrice,
                maxPrice: unitMaxPrice,
                isBase: i === 0
            });
        }

        if (!valid) return;

        const saveBtn = $('#saveProductBtn');
        if (saveBtn) saveBtn.disabled = true;

        try {
            const productData = {
                id: State.editingId || undefined,
                name,
                code: $('#productCode')?.value.trim() || '',
                barcode: $('#productBarcode')?.value.trim() || '',
                category: $('#productCategory')?.value.trim() || '',
                description: $('#productDescription')?.value.trim() || '',
                units
            };

            console.log('💾 Saving product:', productData);

            await DB.saveProduct(productData);

            showToast(State.editingId ? 'تم تحديث المنتج' : 'تم إضافة المنتج', 'success');
            closeModal('productModal');

            await loadProducts();

        } catch (e) {
            console.error('Save error:', e);
            showToast(e.message || 'فشل حفظ المنتج', 'error');
        } finally {
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    /* ============================================
       View Product
       ============================================ */
    function openViewModal(id) {
        const product = State.products.find(p => p.id === id);
        if (!product) return;

        const body = $('#viewProductBody');
        if (!body) return;

        const units = product.units || [];

        body.innerHTML = `
            <div class="view-product__header">
                <div class="view-product__icon"><i class="fas fa-cube"></i></div>
                <div class="view-product__title">
                    <h3>${U.escape(product.name)}</h3>
                    <p>${U.escape(product.category || 'بدون تصنيف')}</p>
                </div>
            </div>

            <div class="view-product__grid">
                ${product.code ? `
                    <div class="view-product__item">
                        <label>كود المنتج</label>
                        <span>${U.escape(product.code)}</span>
                    </div>
                ` : ''}
                ${product.barcode ? `
                    <div class="view-product__item">
                        <label>الباركود</label>
                        <span>${U.escape(product.barcode)}</span>
                    </div>
                ` : ''}
                <div class="view-product__item">
                    <label>عدد الوحدات</label>
                    <span>${units.length}</span>
                </div>
                <div class="view-product__item">
                    <label>إجمالي المخزون</label>
                    <span>${units[0]?.stock || 0} ${units[0]?.name || ''}</span>
                </div>
            </div>

            ${product.description ? `
                <div style="background:var(--bg-sunken);padding:12px;border-radius:10px;margin-bottom:16px;">
                    <label style="display:block;font-size:11px;font-weight:700;color:var(--text-muted);margin-bottom:4px;">الوصف</label>
                    <p style="font-size:13px;font-weight:600;color:var(--text);">${U.escape(product.description)}</p>
                </div>
            ` : ''}

            <div class="view-product__units-title">الوحدات والأسعار</div>
            <div class="view-product__units">
                ${units.map(u => {
                    const hasPriceLimits = (u.minPrice > 0) || (u.maxPrice > 0);
                    const priceRange = hasPriceLimits
                        ? `${u.minPrice || 0} - ${u.maxPrice > 0 ? u.maxPrice : '∞'}`
                        : '';
                    
                    return `
                        <div class="view-product__unit">
                            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                                <span class="view-product__unit-name">${U.escape(u.name)}</span>
                                ${u.isBase || u === units[0] ? '<span class="view-product__unit-badge">أساسية</span>' : ''}
                            </div>
                            <span class="view-product__unit-price">${U.moneyRaw(u.price)} ج.م</span>
                            <span class="view-product__unit-stock">تكلفة: ${U.moneyRaw(u.cost || 0)}</span>
                            ${hasPriceLimits ? `
                                <span class="view-product__unit-stock" style="color:var(--primary);font-weight:800;">
                                    <i class="fas fa-tags" style="font-size:10px;"></i> ${priceRange} ج.م
                                </span>
                            ` : ''}
                            <span class="view-product__unit-stock">معامل: ${u.factor || 1}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        const editBtn = $('#editFromViewBtn');
        if (editBtn) {
            const newBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newBtn, editBtn);

            newBtn.addEventListener('click', () => {
                closeModal('viewProductModal');
                setTimeout(() => openProductModal(id), 200);
            });
        }

        const closeBtn = $('#closeViewBtn');
        if (closeBtn) {
            const newBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newBtn, closeBtn);
            newBtn.addEventListener('click', () => closeModal('viewProductModal'));
        }

        openModal('viewProductModal');
    }

    /* ============================================
       Delete Product
       ============================================ */
    function openDeleteConfirm(id) {
        const product = State.products.find(p => p.id === id);
        if (!product) return;

        State.deletingId = id;

        const nameEl = $('#deleteProductName');
        if (nameEl) nameEl.textContent = product.name;

        openModal('confirmDeleteModal');
    }

    async function confirmDelete() {
        if (!State.deletingId) return;

        const btn = $('#confirmDeleteBtn');
        if (btn) btn.disabled = true;

        try {
            await DB.deleteProduct(State.deletingId);
            showToast('تم حذف المنتج', 'success');
            closeModal('confirmDeleteModal');
            State.deletingId = null;
            await loadProducts();
        } catch (e) {
            console.error('Delete error:', e);
            showToast('فشل حذف المنتج', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Export CSV
       ============================================ */
    function exportProducts() {
        if (!State.products.length) {
            showToast('لا توجد منتجات للتصدير', 'info');
            return;
        }

        const rows = [
            ['الاسم', 'الكود', 'الباركود', 'التصنيف', 'سعر البيع', 'التكلفة', 'المخزون', 'الوحدة', 'السعر الأدنى', 'السعر الأقصى']
        ];

        State.products.forEach(p => {
            const base = p.units?.[0] || {};
            rows.push([
                p.name || '',
                p.code || '',
                p.barcode || '',
                p.category || '',
                base.price || 0,
                base.cost || 0,
                base.stock || 0,
                base.name || '',
                base.minPrice || 0,
                base.maxPrice || 0
            ]);
        });

        const csv = rows.map(row =>
            row.map(cell => {
                const s = String(cell ?? '');
                return (s.includes(',') || s.includes('"') || s.includes('\n'))
                    ? '"' + s.replace(/"/g, '""') + '"'
                    : s;
            }).join(',')
        ).join('\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products-${U.today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        showToast('تم التصدير بنجاح', 'success');
    }

    /* ============================================
       UI Helpers
       ============================================ */
    function updateUserUI() {
        const avatar = $('#userAvatar');
        const name = $('#sidebarUserName');

        if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
        if (name) name.textContent = State.currentUser.fullName || 'مدير';
    }

    function updateConnStatus() {
        const online = navigator.onLine;
        document.body.classList.toggle('is-offline', !online);
        const status = $('#connStatus');
        if (status) {
            status.textContent = online ? 'متصل' : 'غير متصل';
            status.style.color = online ? 'var(--success)' : 'var(--danger)';
        }
    }

    function updateThemeIcon() {
        const btn = $('#themeBtn');
        if (!btn) return;
        const isDark = document.documentElement.dataset.theme === 'dark';
        btn.querySelector('i').className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    function openModal(id) {
        document.getElementById(id)?.classList.add('open');
    }
    function closeModal(id) {
        document.getElementById(id)?.classList.remove('open');
    }

    function showEmpty(show) {
        const el = $('#emptyState');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#productsGridView');
        const listView = $('#productsListView');
        const empty = $('#emptyState');

        if (skeleton) {
            skeleton.innerHTML = Array(6).fill(`
                <div class="skeleton-card">
                    <div style="display:flex;gap:12px;margin-bottom:16px;">
                        <div style="width:48px;height:48px;background:var(--bg-sunken);border-radius:12px;"></div>
                        <div style="flex:1;">
                            <div style="height:16px;background:var(--bg-sunken);border-radius:6px;margin-bottom:8px;"></div>
                            <div style="height:12px;background:var(--bg-sunken);border-radius:6px;width:60%;"></div>
                        </div>
                    </div>
                    <div style="height:20px;background:var(--bg-sunken);border-radius:6px;width:40%;"></div>
                </div>
            `).join('');
            skeleton.style.display = 'grid';
        }
        if (gridView) gridView.style.display = 'none';
        if (listView) listView.style.display = 'none';
        if (empty) empty.style.display = 'none';
    }

    function hideSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#productsGridView');
        const listView = $('#productsListView');

        if (skeleton) skeleton.style.display = 'none';
        if (gridView) gridView.style.display = '';
        if (listView) listView.style.display = '';
    }

    function hideLoadingBar() {
        const bar = $('#loading-bar');
        if (bar) {
            bar.style.width = '100%';
            setTimeout(() => { bar.style.width = '0%'; }, 300);
        }
    }

    /* ============================================
       Toast
       ============================================ */
    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }

        const icons = {
            success: 'check-circle',
            error: 'times-circle',
            warning: 'exclamation-triangle',
            info: 'info-circle'
        };
        const colors = {
            success: '#10b981',
            error: '#ef4444',
            warning: '#f59e0b',
            info: '#3b82f6'
        };

        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 12px 22px;
            background: ${colors[type] || colors.info};
            color: #fff;
            border-radius: 999px;
            font-weight: 700;
            font-size: 14px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
            display: flex;
            align-items: center;
            gap: 10px;
            pointer-events: auto;
        `;
        toast.innerHTML = `<i class="fas fa-${icons[type]}"></i> <span>${U.escape(msg)}</span>`;
        stack.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 2500);
    }

    /* ============================================
       Events
       ============================================ */
    function bindEvents() {
        // Sidebar
        $('#menuBtn')?.addEventListener('click', () => {
            $('#sidebar')?.classList.add('open');
            $('#sidebarOverlay')?.classList.add('show');
        });
        $('#sidebarOverlay')?.addEventListener('click', () => {
            $('#sidebar')?.classList.remove('open');
            $('#sidebarOverlay')?.classList.remove('show');
        });
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                $('#sidebar')?.classList.remove('open');
                $('#sidebarOverlay')?.classList.remove('show');
            });
        });

        // Theme
        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        // Logout
        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        // Refresh
        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            DB.clearCache();
            await loadProducts();
            showToast('تم التحديث', 'success');
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportProducts);

        // Add product
        $('#addProductBtn')?.addEventListener('click', () => openProductModal());
        $('#fabAddBtn')?.addEventListener('click', () => openProductModal());

        // Search
        $('#searchInput')?.addEventListener('input', U.debounce((e) => {
            State.filters.search = e.target.value.trim();
            const clearBtn = $('#clearSearchBtn');
            if (clearBtn) clearBtn.style.display = e.target.value ? 'grid' : 'none';
            applyFilters();
        }, 200));

        $('#clearSearchBtn')?.addEventListener('click', () => {
            const input = $('#searchInput');
            if (input) input.value = '';
            State.filters.search = '';
            $('#clearSearchBtn').style.display = 'none';
            applyFilters();
        });

        // Filters
        $('#categoryFilter')?.addEventListener('change', (e) => {
            State.filters.category = e.target.value;
            applyFilters();
        });
        $('#stockFilter')?.addEventListener('change', (e) => {
            State.filters.stock = e.target.value;
            applyFilters();
        });
        $('#sortFilter')?.addEventListener('change', (e) => {
            State.filters.sort = e.target.value;
            applyFilters();
        });

        // Save product
        $('#saveProductBtn')?.addEventListener('click', saveProduct);

        // Add unit
        $('#addUnitBtn')?.addEventListener('click', () => {
            addUnitToForm({ name: '', price: 0, cost: 0, stock: 0, factor: 1, minPrice: 0, maxPrice: 0 });
        });

        // Confirm delete
        $('#confirmDeleteBtn')?.addEventListener('click', confirmDelete);

        // Confirm unit delete
        $('#confirmUnitDeleteBtn')?.addEventListener('click', () => {
            if (State.unitDeleteIndex >= 0) {
                removeUnitFromForm(State.unitDeleteIndex);
                State.unitDeleteIndex = -1;
            }
            closeModal('confirmUnitDeleteModal');
        });

        // Close modals
        document.querySelectorAll('[data-close]').forEach(btn => {
            btn.addEventListener('click', () => closeModal(btn.dataset.close));
        });
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('open');
            });
        });

        // Connection
        window.addEventListener('online', () => {
            updateConnStatus();
            showToast('عاد الاتصال', 'success');
            loadProducts();
        });
        window.addEventListener('offline', () => {
            updateConnStatus();
            showToast('انقطع الاتصال', 'warning');
        });

        // ESC to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
            }
        });
    }

    /* ============================================
       Start
       ============================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
