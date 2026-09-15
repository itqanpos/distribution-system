/* =============================================
   products.js - Products Page Logic
   Version: 2.2.0

   Changelog من v2.1:
   - [PR-1] إصلاح حذف الوحدة — مرجع مباشر بدل index
   - [PR-2] UUID يُولَّد مرة واحدة في addUnitToForm
   - [PR-3] عملة من APP_CONFIG بدل hardcode
   - [PR-4] Auth.onChange — توجيه عند الخروج
   - [PR-5] refreshBtn محمي + رسالة نجاح دقيقة
   - [PR-6] showToast يفضّل window.Toast
   - [PR-7] exportProducts يستخدم State.filtered
   - [PR-8] translateError للأخطاء
   - [PR-9] فحص تكرار أسماء الوحدات
   - [PR-10] console gated by DEBUG
   - [PR-11] loadProducts بعد الحفظ لا يجبر السحابة
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    const DEBUG = window.APP_CONFIG?.DEBUG === true ||
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1';
    const log = (...a) => { if (DEBUG) console.log(...a); };
    const CURRENCY = (window.APP_CONFIG && window.APP_CONFIG.CURRENCY) || 'ج.م';

    const DB_ERROR_MESSAGES = {
        '23505': 'قيمة مكررة (قد يكون الباركود أو اسم الوحدة مستخدماً)',
        '23514': 'قيمة خارج النطاق المسموح',
        '23503': 'مرجع غير موجود',
        'P0001': 'السجل غير موجود',
        'P0003': 'هذه العملية تتطلب صلاحيات مدير',
        'P0004': 'بيانات غير صالحة',
        'NO_TENANT': 'لا يوجد مستأجر مرتبط بالحساب',
        '42501': 'ليس لديك صلاحية لهذه العملية'
    };

    function translateError(err) {
        const code = err?.code || '';
        if (DB_ERROR_MESSAGES[code]) return DB_ERROR_MESSAGES[code];
        return err?.message || 'فشل العملية';
    }

    /* ============================================
       State
       ============================================ */
    const State = {
        products: [],
        filtered: [],
        categories: [],
        currentUser: null,
        editingId: null,
        deletingId: null,
        pendingDeleteCard: null,   // ✅ [PR-1] مرجع مباشر بدل index
        _saving: false,
        _refreshing: false,
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
        log('🚀 Products init...');

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

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) {
            console.error('Auth failed:', e);
            return;
        }

        // ✅ [PR-4] مراقبة الجلسة
        Auth.onChange((u) => {
            if (!u && State.currentUser) {
                State.currentUser = null;
                location.replace('./index.html');
            } else if (u) {
                State.currentUser = u;
            }
        });

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadProducts();

        hideLoadingBar();
        log('✅ Products ready');
    }

    /* ============================================
       Load Products
       ============================================ */
    async function loadProducts(force = true) {
        showSkeleton();
        try {
            State.products = await DB.getProducts(force) || [];
            extractCategories();
            applyFilters();
            updateCount();
            log(`📦 Loaded ${State.products.length} products`);
            return true;
        } catch (e) {
            console.error('Load error:', e);
            showToast(translateError(e) || 'تعذر تحميل المنتجات', 'error');
            showEmpty(true);
            return false;
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
            const currentValue = filter.value;
            filter.innerHTML = '<option value="">كل التصنيفات</option>' +
                State.categories.map(c => `<option value="${U.escape(c)}">${U.escape(c)}</option>`).join('');
            if (currentValue) filter.value = currentValue;
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
                (p.barcode || '').includes(State.filters.search)
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
            if (sort === 'recent') return String(b.created_at || '').localeCompare(String(a.created_at || ''));
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
       Render
       ============================================ */
    function renderProducts() {
        const gridView = $('#productsGridView');
        const listView = $('#productsListView');

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

    // ✅ [PR-3] عملة من APP_CONFIG
    function renderProductCard(p) {
        const base = p.units?.[0] || { price: 0, stock: 0, name: 'وحدة' };
        const stock = base.stock || 0;
        const stockInfo = getStockInfo(stock);

        return `
            <div class="product-item" data-id="${U.escape(p.id)}">
                <div class="product-item__actions">
                    <button class="icon-action" data-action="edit" title="تعديل" type="button">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="icon-action danger" data-action="delete" title="حذف" type="button">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
                <div class="product-item__head">
                    <div class="product-item__icon">
                        <i class="fas fa-cube"></i>
                    </div>
                    <div class="product-item__title">
                        <div class="product-item__name">${U.escape(p.name || '')}</div>
                        <div class="product-item__category">${U.escape(p.category || 'بدون تصنيف')}</div>
                    </div>
                </div>
                <div class="product-item__body">
                    <div class="product-item__price">
                        ${U.moneyRaw(base.price)} <small>${U.escape(CURRENCY)}</small>
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
            <div class="product-list-item" data-id="${U.escape(p.id)}">
                <div class="product-list-item__icon">
                    <i class="fas fa-cube"></i>
                </div>
                <div class="product-list-item__info">
                    <div class="product-list-item__name">${U.escape(p.name || '')}</div>
                    <div class="product-list-item__meta">
                        <span>${U.escape(p.category || 'بدون تصنيف')}</span>
                        ${p.barcode ? `<span>· ${U.escape(p.barcode)}</span>` : ''}
                    </div>
                </div>
                <div class="product-list-item__right">
                    <div class="product-list-item__price">${U.moneyRaw(base.price)} ${U.escape(CURRENCY)}</div>
                    <div class="product-list-item__stock ${stockInfo.class}">
                        ${stockInfo.label}
                    </div>
                </div>
            </div>
        `;
    }

    function getStockInfo(stock) {
        if (stock <= 0) return { class: 'out', label: 'نفد' };
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

    function showEmpty(show) {
        const el = $('#emptyState');
        if (el) el.style.display = show ? 'block' : 'none';
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
            if (!product) {
                showToast('المنتج غير موجود', 'error');
                return;
            }

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
                maxPrice: 0
            });
        }

        openModal('productModal');
        setTimeout(() => $('#productName')?.focus(), 200);
    }

    /* ============================================
       Add Unit — ✅ [PR-1, PR-2]
       - UUID يُولَّد مرة واحدة ويُخزَّن في dataset
       - زر الحذف يحمل مرجعاً مباشراً للبطاقة
       ============================================ */
    function addUnitToForm(unit = {}) {
        const container = $('#unitsContainer');
        if (!container) return;

        const index = container.children.length;
        const isBase = index === 0;

        // ✅ [PR-2] UUID ثابت
        const unitId = unit.id || U.uuid();

        const div = document.createElement('div');
        div.className = 'unit-card';
        div.dataset.index = index;
        div.dataset.unitId = unitId;

        div.innerHTML = `
            <div class="unit-card__header">
                ${isBase
                    ? '<span class="unit-card__badge">الوحدة الأساسية</span>'
                    : `<span class="unit-card__index-label" style="font-weight:800;font-size:12px;color:var(--text-muted);">وحدة #${index + 1}</span>`}
                ${!isBase ? `
                    <button type="button" class="unit-card__remove" aria-label="حذف الوحدة">
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
                    <input type="number" class="unit-stock" value="${unit.stock || 0}" step="0.01" inputmode="decimal" ${!isBase ? 'readonly' : ''}>
                </div>
                <div class="form-group">
                    <label>معامل التحويل ${!isBase ? '*' : ''}</label>
                    <input type="number" class="unit-factor" value="${unit.factor || 1}" min="0.001" step="0.001" inputmode="decimal" ${isBase ? 'readonly' : ''}>
                </div>
                ${!isBase ? `
                    <div class="form-group">
                        <label>الباركود</label>
                        <input type="text" class="unit-barcode" value="${U.escape(unit.barcode || '')}" placeholder="اختياري" autocomplete="off">
                    </div>
                ` : ''}
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

        // ✅ [PR-1] زر الحذف — مرجع مباشر
        const removeBtn = div.querySelector('.unit-card__remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', () => {
                State.pendingDeleteCard = div;
                openModal('confirmUnitDeleteModal');
            });
        }

        // تحديث تلميح نطاق السعر
        const priceInput = div.querySelector('.unit-price');
        const minInput = div.querySelector('.unit-min-price');
        const maxInput = div.querySelector('.unit-max-price');

        const updateHint = () => {
            let hint = div.querySelector('.unit-price-range-hint');
            const min = +minInput?.value || 0;
            const max = +maxInput?.value || 0;
            const hasLimits = min > 0 || max > 0;

            if (hasLimits) {
                if (!hint) {
                    hint = document.createElement('div');
                    hint.className = 'unit-price-range-hint';
                    const grid = div.querySelector('.unit-card__grid');
                    if (grid) grid.appendChild(hint);
                }
                hint.innerHTML = `
                    <i class="fas fa-info-circle"></i>
                    نطاق السعر: ${min > 0 ? min : 0} - ${max > 0 ? max : '∞'} ${U.escape(CURRENCY)}
                `;
            } else if (hint) {
                hint.remove();
            }
        };

        priceInput?.addEventListener('input', updateHint);
        minInput?.addEventListener('input', updateHint);
        maxInput?.addEventListener('input', updateHint);

        updateHint();
    }

    function reindexUnits() {
        const container = $('#unitsContainer');
        if (!container) return;

        const cards = container.querySelectorAll('.unit-card');
        cards.forEach((card, i) => {
            card.dataset.index = i;
            const badge = card.querySelector('.unit-card__badge');
            const indexLabel = card.querySelector('.unit-card__index-label');
            const removeBtn = card.querySelector('.unit-card__remove');
            const header = card.querySelector('.unit-card__header');

            if (!header) return;

            if (i === 0) {
                // وحدة أساسية
                if (!badge) {
                    const b = document.createElement('span');
                    b.className = 'unit-card__badge';
                    b.textContent = 'الوحدة الأساسية';
                    header.prepend(b);
                }
                if (indexLabel) indexLabel.remove();
                if (removeBtn) removeBtn.remove();

                const factorInput = card.querySelector('.unit-factor');
                if (factorInput) {
                    factorInput.value = 1;
                    factorInput.readOnly = true;
                }

                const stockInput = card.querySelector('.unit-stock');
                if (stockInput) stockInput.readOnly = false;
            } else {
                // وحدة ثانوية
                if (badge) badge.remove();
                if (!indexLabel) {
                    const span = document.createElement('span');
                    span.className = 'unit-card__index-label';
                    span.style.cssText = 'font-weight:800;font-size:12px;color:var(--text-muted);';
                    span.textContent = `وحدة #${i + 1}`;
                    header.prepend(span);
                } else {
                    indexLabel.textContent = `وحدة #${i + 1}`;
                }

                // تأكد من وجود زر الحذف
                if (!removeBtn) {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = 'unit-card__remove';
                    btn.setAttribute('aria-label', 'حذف الوحدة');
                    btn.innerHTML = '<i class="fas fa-times"></i>';
                    btn.addEventListener('click', () => {
                        State.pendingDeleteCard = card;
                        openModal('confirmUnitDeleteModal');
                    });
                    header.appendChild(btn);
                }

                const factorInput = card.querySelector('.unit-factor');
                if (factorInput) factorInput.readOnly = false;

                const stockInput = card.querySelector('.unit-stock');
                if (stockInput) stockInput.readOnly = true;
            }
        });
    }

    /* ============================================
       Save Product
       ============================================ */
    async function saveProduct() {
        if (State._saving) return;

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
        const seenNames = new Set();
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

            if (!unitName) {
                showToast(`اسم الوحدة ${i + 1} مطلوب`, 'warning');
                valid = false;
                break;
            }

            // ✅ [PR-9] فحص تكرار الأسماء
            const nameKey = unitName.toLowerCase();
            if (seenNames.has(nameKey)) {
                showToast(`اسم الوحدة "${unitName}" مكرر`, 'warning');
                valid = false;
                break;
            }
            seenNames.add(nameKey);

            if (unitPrice < 0) {
                showToast(`سعر الوحدة ${i + 1} غير صالح`, 'warning');
                valid = false;
                break;
            }

            if (i > 0 && unitFactor <= 0) {
                showToast(`معامل التحويل للوحدة ${i + 1} يجب أن يكون أكبر من 0`, 'warning');
                valid = false;
                break;
            }

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
                id: card.dataset.unitId,   // ✅ [PR-2] مضمون
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

        State._saving = true;
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

            log('💾 Saving product:', productData);

            await DB.saveProduct(productData);

            showToast(State.editingId ? 'تم تحديث المنتج' : 'تم إضافة المنتج', 'success');
            closeModal('productModal');

            // ✅ [PR-11] loadProducts(false) — لا يجبر السحابة إن كان أوفلاين
            await loadProducts(false);

        } catch (e) {
            console.error('Save error:', e);
            showToast(translateError(e), 'error');
        } finally {
            State._saving = false;
            if (saveBtn) saveBtn.disabled = false;
        }
    }

    /* ============================================
       View Product
       ============================================ */
    function openViewModal(id) {
        const product = State.products.find(p => p.id === id);
        if (!product) {
            showToast('المنتج غير موجود', 'error');
            return;
        }

        const body = $('#viewProductBody');
        if (!body) return;

        const units = product.units || [];

        body.innerHTML = `
            <div class="view-product__header">
                <div class="view-product__icon"><i class="fas fa-cube"></i></div>
                <div class="view-product__title">
                    <h3>${U.escape(product.name || '')}</h3>
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
                    <label>المخزون الأساسي</label>
                    <span>${units[0]?.stock || 0} ${U.escape(units[0]?.name || '')}</span>
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
                                ${u.isBase ? '<span class="view-product__unit-badge">أساسية</span>' : ''}
                            </div>
                            <span class="view-product__unit-price">${U.moneyRaw(u.price)} ${U.escape(CURRENCY)}</span>
                            <span class="view-product__unit-stock">تكلفة: ${U.moneyRaw(u.cost || 0)}</span>
                            ${hasPriceLimits ? `
                                <span class="view-product__unit-stock" style="color:var(--primary);font-weight:800;">
                                    <i class="fas fa-tags" style="font-size:10px;"></i> ${priceRange} ${U.escape(CURRENCY)}
                                </span>
                            ` : ''}
                            ${!u.isBase ? `<span class="view-product__unit-stock">معامل: ${u.factor || 1}</span>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>
        `;

        // ربط أزرار footer (clone للتخلص من المستمعين القدامى)
        const editBtn = $('#editFromViewBtn');
        if (editBtn) {
            const newEditBtn = editBtn.cloneNode(true);
            editBtn.parentNode.replaceChild(newEditBtn, editBtn);
            newEditBtn.addEventListener('click', () => {
                closeModal('viewProductModal');
                setTimeout(() => openProductModal(id), 200);
            });
        }

        const closeBtn = $('#closeViewBtn');
        if (closeBtn) {
            const newCloseBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            newCloseBtn.addEventListener('click', () => closeModal('viewProductModal'));
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
            await loadProducts(false);
        } catch (e) {
            console.error('Delete error:', e);
            showToast(translateError(e), 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Export CSV — ✅ [PR-7] State.filtered
       ============================================ */
    function exportProducts() {
        if (!State.filtered.length) {
            showToast('لا توجد منتجات للتصدير', 'info');
            return;
        }

        const rows = [
            ['الاسم', 'الكود', 'الباركود', 'التصنيف', 'سعر البيع', 'التكلفة', 'المخزون', 'الوحدة', 'السعر الأدنى', 'السعر الأقصى']
        ];

        State.filtered.forEach(p => {
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
        ).join('\r\n');

        const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `products-${U.today()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);

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
        const icon = btn.querySelector('i');
        if (icon) icon.className = isDark ? 'fas fa-sun' : 'fas fa-moon';
    }

    function initTheme() {
        const theme = U.ls.get('theme', 'light');
        document.documentElement.dataset.theme = theme;
        updateThemeIcon();
    }

    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    /* ============================================
       Skeleton
       ============================================ */
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
       Toast — ✅ [PR-6] يفضل window.Toast
       ============================================ */
    function showToast(msg, type = 'info') {
        if (window.Toast && typeof window.Toast.show === 'function') {
            try { window.Toast.show(msg, type); return; } catch (e) { /* fallthrough */ }
        }

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

        // ✅ [PR-5] Refresh محمي
        const refreshBtn = $('#refreshBtn');
        refreshBtn?.addEventListener('click', async () => {
            if (State._refreshing) return;
            State._refreshing = true;
            refreshBtn.disabled = true;
            try {
                DB.clearCache();
                const ok = await loadProducts(true);
                if (ok) showToast('تم التحديث', 'success');
                else showToast('فشل التحديث، تحقق من الاتصال', 'error');
            } finally {
                State._refreshing = false;
                refreshBtn.disabled = false;
            }
        });

        // Export
        $('#exportBtn')?.addEventListener('click', exportProducts);

        // Add Product
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
            const clearBtn = $('#clearSearchBtn');
            if (clearBtn) clearBtn.style.display = 'none';
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

        // Save Product
        $('#saveProductBtn')?.addEventListener('click', saveProduct);

        // Add Unit
        $('#addUnitBtn')?.addEventListener('click', () => {
            addUnitToForm({
                name: '',
                price: 0,
                cost: 0,
                stock: 0,
                factor: 1,
                minPrice: 0,
                maxPrice: 0
            });
        });

        // Confirm Delete Product
        $('#confirmDeleteBtn')?.addEventListener('click', confirmDelete);

        // ✅ [PR-1] Confirm Delete Unit — مرجع مباشر
        $('#confirmUnitDeleteBtn')?.addEventListener('click', () => {
            const card = State.pendingDeleteCard;
            const container = $('#unitsContainer');

            if (card && container) {
                const cards = container.querySelectorAll('.unit-card');
                if (cards.length > 1) {
                    card.remove();
                    reindexUnits();
                } else {
                    showToast('يجب أن يكون هناك وحدة واحدة على الأقل', 'warning');
                }
            }

            State.pendingDeleteCard = null;
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

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.open').forEach(m => m.classList.remove('open'));
            }
        });

        // Connection
        window.addEventListener('online', () => {
            updateConnStatus();
            showToast('عاد الاتصال', 'success');
            loadProducts(true);
        });
        window.addEventListener('offline', () => {
            updateConnStatus();
            showToast('انقطع الاتصال', 'warning');
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
