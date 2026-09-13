/* =============================================
   inventory.js - Inventory Page Logic
   ============================================= */
(function() {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => [...document.querySelectorAll(s)];

    const State = {
        products: [],
        filtered: [],
        currentUser: null,
        selectedProduct: null,
        selectedUnit: null,
        filters: { search: '', stock: '', sort: 'name' }
    };

    async function init() {
        console.log('🚀 Inventory init...');

        let attempts = 0;
        while (!window.DB?.client && attempts < 50) {
            await new Promise(r => setTimeout(r, 100));
            attempts++;
        }
        if (!window.DB?.client) return;
        await new Promise(r => setTimeout(r, 300));

        try {
            State.currentUser = await Auth.requireAuth();
            if (!State.currentUser) return;
        } catch (e) { return; }

        updateUserUI();
        updateConnStatus();
        initTheme();
        bindEvents();

        await loadProducts();
        hideLoadingBar();
    }

    async function loadProducts() {
        showSkeleton();
        try {
            State.products = await DB.getProducts(true) || [];
            renderSummary();
            applyFilters();
        } catch (e) {
            showToast('تعذر تحميل البيانات', 'error');
        } finally {
            hideSkeleton();
        }
    }

    function renderSummary() {
        const container = $('#summaryCards');
        if (!container) return;

        const totalProducts = State.products.length;
        const outOfStock = State.products.filter(p => (p.units?.[0]?.stock || 0) <= 0).length;
        const lowStock = State.products.filter(p => {
            const s = p.units?.[0]?.stock || 0;
            return s > 0 && s <= 5;
        }).length;

        let totalValue = 0;
        State.products.forEach(p => {
            const base = p.units?.[0] || {};
            totalValue += (base.stock || 0) * (base.cost || 0);
        });

        container.innerHTML = `
            <div class="summary-card">
                <div class="summary-card__icon blue"><i class="fas fa-boxes"></i></div>
                <div class="summary-card__info">
                    <label>إجمالي المنتجات</label>
                    <span>${totalProducts}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon green"><i class="fas fa-coins"></i></div>
                <div class="summary-card__info">
                    <label>قيمة المخزون</label>
                    <span>${U.money(totalValue)}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon orange"><i class="fas fa-exclamation-triangle"></i></div>
                <div class="summary-card__info">
                    <label>منخفض (≤5)</label>
                    <span>${lowStock}</span>
                </div>
            </div>
            <div class="summary-card">
                <div class="summary-card__icon red"><i class="fas fa-times-circle"></i></div>
                <div class="summary-card__info">
                    <label>نفذ</label>
                    <span>${outOfStock}</span>
                </div>
            </div>
        `;
    }

    function applyFilters() {
        let list = [...State.products];

        if (State.filters.search) {
            const term = State.filters.search.toLowerCase();
            list = list.filter(p =>
                (p.name || '').toLowerCase().includes(term) ||
                (p.barcode || '').includes(term) ||
                (p.code || '').includes(term)
            );
        }

        if (State.filters.stock) {
            list = list.filter(p => {
                const stock = p.units?.[0]?.stock || 0;
                if (State.filters.stock === 'out') return stock <= 0;
                if (State.filters.stock === 'low') return stock > 0 && stock <= 5;
                if (State.filters.stock === 'in') return stock > 5;
                return true;
            });
        }

        const sort = State.filters.sort;
        list.sort((a, b) => {
            const stockA = a.units?.[0]?.stock || 0;
            const stockB = b.units?.[0]?.stock || 0;
            const valueA = stockA * (a.units?.[0]?.cost || 0);
            const valueB = stockB * (b.units?.[0]?.cost || 0);

            if (sort === 'name') return (a.name || '').localeCompare(b.name || '', 'ar');
            if (sort === 'stock') return stockA - stockB;
            if (sort === 'stock-desc') return stockB - stockA;
            if (sort === 'value') return valueA - valueB;
            if (sort === 'value-desc') return valueB - valueA;
            return 0;
        });

        State.filtered = list;
        render();
        updateCount();
    }

    function updateCount() {
        const el = $('#inventoryCount');
        if (el) el.textContent = State.filtered.length === 1 ? '1 منتج' : `${State.filtered.length} منتج`;
    }

    function render() {
        const gridView = $('#inventoryGridView');
        const listView = $('#inventoryListView');

        if (!State.filtered.length) {
            if (gridView) gridView.innerHTML = '';
            if (listView) listView.innerHTML = '';
            $('#emptyState').style.display = 'block';
            return;
        }

        $('#emptyState').style.display = 'none';

        if (gridView) {
            gridView.innerHTML = State.filtered.map(p => renderCard(p)).join('');
            gridView.querySelectorAll('.inv-item').forEach(el => {
                el.addEventListener('click', () => openAdjustModal(el.dataset.id));
            });
        }
        if (listView) {
            listView.innerHTML = State.filtered.map(p => renderListItem(p)).join('');
            listView.querySelectorAll('.inv-list-item').forEach(el => {
                el.addEventListener('click', () => openAdjustModal(el.dataset.id));
            });
        }
    }

    function getStockInfo(stock) {
        if (stock <= 0) return { class: 'out', label: 'نفذ' };
        if (stock <= 5) return { class: 'low', label: 'منخفض' };
        return { class: 'in', label: 'جيد' };
    }

    function renderCard(p) {
        const base = p.units?.[0] || { stock: 0, cost: 0, price: 0, name: 'وحدة' };
        const stock = base.stock || 0;
        const info = getStockInfo(stock);
        const value = stock * (base.cost || 0);

        return `
            <div class="inv-item" data-id="${p.id}">
                <div class="inv-item__head">
                    <div class="inv-item__icon"><i class="fas fa-cube"></i></div>
                    <div class="inv-item__title">
                        <div class="inv-item__name">${U.escape(p.name)}</div>
                        <div class="inv-item__category">${U.escape(p.category || 'بدون تصنيف')}</div>
                    </div>
                </div>
                <div class="inv-item__stock-row">
                    <div class="inv-item__stock">
                        <div class="inv-item__stock-value">${stock}</div>
                        <div class="inv-item__stock-label">${U.escape(base.name || 'وحدة')}</div>
                    </div>
                    <div class="inv-item__badge ${info.class}">${info.label}</div>
                </div>
                <div class="inv-item__value">
                    <label>القيمة الإجمالية</label>
                    <strong>${U.money(value)}</strong>
                </div>
            </div>
        `;
    }

    function renderListItem(p) {
        const base = p.units?.[0] || { stock: 0, name: 'وحدة' };
        const stock = base.stock || 0;
        const info = getStockInfo(stock);

        return `
            <div class="inv-list-item" data-id="${p.id}">
                <div class="inv-list-item__icon"><i class="fas fa-cube"></i></div>
                <div class="inv-list-item__info">
                    <div class="inv-list-item__name">${U.escape(p.name)}</div>
                    <div class="inv-list-item__meta">${U.escape(base.name || 'وحدة')}</div>
                </div>
                <div class="inv-list-item__right">
                    <div class="inv-list-item__stock">${stock}</div>
                    <div class="inv-list-item__badge ${info.class}">${info.label}</div>
                </div>
            </div>
        `;
    }

    /* ============================================
       Adjust Modal
       ============================================ */
    function openAdjustModal(productId = null) {
        State.selectedProduct = null;
        State.selectedUnit = null;

        $('#adjustProductId').value = '';
        $('#adjustProductSearch').value = '';
        $('#selectedAdjustProduct').style.display = 'none';
        $('#adjustUnitGroup').style.display = 'none';
        $('#adjustFields').style.display = 'none';
        $('#adjustReasonGroup').style.display = 'none';
        $('#adjustNotesGroup').style.display = 'none';
        $('#confirmAdjustBtn').disabled = true;

        if (productId) {
            const p = State.products.find(x => x.id === productId);
            if (p) selectAdjustProduct(p);
        }

        openModal('adjustModal');
        if (!productId) setTimeout(() => $('#adjustProductSearch')?.focus(), 200);
    }

    function filterAdjustProducts(term) {
        const dd = $('#adjustProductDropdown');
        if (!dd) return;

        if (!term) { dd.classList.remove('show'); return; }

        const t = term.toLowerCase();
        const list = State.products.filter(p =>
            (p.name || '').toLowerCase().includes(t) ||
            (p.barcode || '').includes(term) ||
            (p.code || '').includes(term)
        ).slice(0, 15);

        if (!list.length) {
            dd.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px;">لا توجد نتائج</div>`;
        } else {
            dd.innerHTML = list.map(p => {
                const base = p.units?.[0] || { stock: 0 };
                return `
                    <div class="product-option" data-id="${p.id}">
                        <div class="product-option__name">${U.escape(p.name)}</div>
                        <div class="product-option__meta">المخزون: ${base.stock || 0} ${base.name || ''}</div>
                    </div>
                `;
            }).join('');
        }

        dd.classList.add('show');
        dd.querySelectorAll('.product-option').forEach(el => {
            el.addEventListener('click', () => {
                const p = State.products.find(x => x.id === el.dataset.id);
                if (p) {
                    selectAdjustProduct(p);
                    dd.classList.remove('show');
                }
            });
        });
    }

    function selectAdjustProduct(product) {
        State.selectedProduct = product;
        State.selectedUnit = product.units?.[0] || null;

        $('#adjustProductSearch').value = product.name;

        // Show selected info
        const info = $('#selectedAdjustProduct');
        info.innerHTML = `
            <strong>${U.escape(product.name)}</strong>
            <button type="button" id="clearAdjustProduct"><i class="fas fa-times"></i></button>
        `;
        info.style.display = 'flex';

        $('#clearAdjustProduct')?.addEventListener('click', () => {
            State.selectedProduct = null;
            State.selectedUnit = null;
            $('#adjustProductSearch').value = '';
            info.style.display = 'none';
            $('#adjustUnitGroup').style.display = 'none';
            $('#adjustFields').style.display = 'none';
            $('#adjustReasonGroup').style.display = 'none';
            $('#adjustNotesGroup').style.display = 'none';
            $('#confirmAdjustBtn').disabled = true;
        });

        // Render unit chips
        const units = product.units || [];
        $('#adjustUnitChips').innerHTML = units.map((u, i) =>
            `<button type="button" class="unit-chip ${i === 0 ? 'active' : ''}" data-index="${i}">${U.escape(u.name)}</button>`
        ).join('');
        $('#adjustUnitChips').querySelectorAll('.unit-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = +btn.dataset.index;
                State.selectedUnit = units[idx];
                $('#adjustUnitChips').querySelectorAll('.unit-chip').forEach((b, i) => b.classList.toggle('active', i === idx));
                updateAdjustFields();
            });
        });

        $('#adjustUnitGroup').style.display = 'block';
        $('#adjustFields').style.display = 'grid';
        $('#adjustReasonGroup').style.display = 'block';
        $('#adjustNotesGroup').style.display = 'block';
        $('#confirmAdjustBtn').disabled = false;

        updateAdjustFields();
    }

    function updateAdjustFields() {
        const u = State.selectedUnit;
        if (!u) return;
        const stock = u.stock || 0;
        $('#currentStock').value = `${stock} ${u.name}`;
        $('#newStock').value = stock;
        setTimeout(() => $('#newStock')?.select(), 100);
    }

    async function confirmAdjust() {
        const product = State.selectedProduct;
        const unit = State.selectedUnit;
        if (!product || !unit) return;

        const newStock = +$('#newStock').value || 0;
        const oldStock = unit.stock || 0;
        const reason = $('#adjustReason').value;
        const notes = $('#adjustNotes').value.trim();

        if (newStock === oldStock) {
            showToast('لا يوجد تغيير', 'info');
            return;
        }

        const btn = $('#confirmAdjustBtn');
        if (btn) btn.disabled = true;

        try {
            // Update stock
            const productIndex = State.products.findIndex(p => p.id === product.id);
            if (productIndex !== -1) {
                const baseUnit = State.products[productIndex].units[0];
                // ✅ إذا الوحدة المختارة هي الأساسية → عدل مباشرة
                // إذا كانت ثانوية → احسب معامل التحويل
                if (unit === baseUnit) {
                    baseUnit.stock = newStock;
                } else {
                    // تحويل من الوحدة الثانوية إلى الأساسية
                    const factor = unit.factor || 1;
                    // لكن إذا كان هذا هو المخزون الثانوي المطلوب، فلا معنى
                    // عملياً: نسجل الرصيد كـ "كمية الوحدة الأساسية" = newStock * factor
                    baseUnit.stock = newStock * factor;
                }
                // في كلا الحالتين، نسجل الرصيد الجديد على الوحدة المختارة أيضاً
                unit.stock = newStock;
            }

            const updatedProduct = State.products[productIndex];
            await DB.saveProduct(updatedProduct);

            showToast(`تم تحديث المخزون من ${oldStock} إلى ${newStock}`, 'success');
            closeModal('adjustModal');

            // Reload
            await loadProducts();

        } catch (e) {
            console.error('Adjust error:', e);
            showToast(e.message || 'فشل حفظ التسوية', 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    /* ============================================
       Helpers
       ============================================ */
    function updateUserUI() {
        if (State.currentUser) {
            const avatar = $('#userAvatar');
            const name = $('#sidebarUserName');
            if (avatar) avatar.textContent = (State.currentUser.fullName || 'U')[0].toUpperCase();
            if (name) name.textContent = State.currentUser.fullName || 'مدير';
        }
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

    function openModal(id) { document.getElementById(id)?.classList.add('open'); }
    function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

    function showSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#inventoryGridView');
        const listView = $('#inventoryListView');

        if (skeleton) {
            skeleton.innerHTML = Array(6).fill(`
                <div class="skeleton-card">
                    <div style="display:flex;gap:12px;margin-bottom:16px;">
                        <div style="width:48px;height:48px;background:var(--bg-sunken);border-radius:12px;"></div>
                        <div style="flex:1;">
                            <div style="height:16px;background:var(--bg-sunken);border-radius:6px;margin-bottom:8px;"></div>
                            <div style="height:12px;background:var(--bg-sunken);border-radius:6px;width:50%;"></div>
                        </div>
                    </div>
                    <div style="height:60px;background:var(--bg-sunken);border-radius:10px;"></div>
                </div>
            `).join('');
            skeleton.style.display = 'grid';
        }
        if (gridView) gridView.style.display = 'none';
        if (listView) listView.style.display = 'none';
    }

    function hideSkeleton() {
        const skeleton = $('#skeletonGrid');
        const gridView = $('#inventoryGridView');
        const listView = $('#inventoryListView');
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

    function showToast(msg, type = 'info') {
        let stack = $('#toastStack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'toastStack';
            stack.className = 'toast-stack';
            document.body.appendChild(stack);
        }
        const icons = { success: 'check-circle', error: 'times-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        const colors = { success: '#10b981', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
        const toast = document.createElement('div');
        toast.style.cssText = `
            padding: 12px 22px; background: ${colors[type] || colors.info}; color: #fff;
            border-radius: 999px; font-weight: 700; font-size: 14px;
            box-shadow: 0 12px 32px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 10px;
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

    function bindEvents() {
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

        $('#themeBtn')?.addEventListener('click', () => {
            const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            document.documentElement.dataset.theme = next;
            U.ls.set('theme', next);
            updateThemeIcon();
        });

        $('#logoutBtn')?.addEventListener('click', async (e) => {
            e.preventDefault();
            if (!confirm('تسجيل الخروج؟')) return;
            await Auth.logout();
        });

        $('#refreshBtn')?.addEventListener('click', async () => {
            showToast('جاري التحديث...', 'info');
            DB.clearCache();
            await loadProducts();
            showToast('تم التحديث', 'success');
        });

        $('#adjustBtn')?.addEventListener('click', () => openAdjustModal());
        $('#adjustMainBtn')?.addEventListener('click', () => openAdjustModal());

        $('#searchInput')?.addEventListener('input', U.debounce((e) => {
            State.filters.search = e.target.value.trim();
            const clearBtn = $('#clearSearchBtn');
            if (clearBtn) clearBtn.style.display = e.target.value ? 'grid' : 'none';
            applyFilters();
        }, 200));

        $('#clearSearchBtn')?.addEventListener('click', () => {
            $('#searchInput').value = '';
            State.filters.search = '';
            $('#clearSearchBtn').style.display = 'none';
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

        $('#adjustProductSearch')?.addEventListener('input', U.debounce((e) => {
            filterAdjustProducts(e.target.value.trim());
        }, 150));

        $('#confirmAdjustBtn')?.addEventListener('click', confirmAdjust);

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#adjustProductSearch') && !e.target.closest('#adjustProductDropdown')) {
                $('#adjustProductDropdown')?.classList.remove('show');
            }
        });

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

        window.addEventListener('online', () => { updateConnStatus(); showToast('عاد الاتصال', 'success'); });
        window.addEventListener('offline', () => { updateConnStatus(); showToast('انقطع الاتصال', 'warning'); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
