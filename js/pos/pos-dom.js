/* =============================================
   pos-dom.js - التعامل مع واجهة المستخدم
   الوظيفة: ربط عناصر DOM، عرض شبكة المنتجات،
   عرض السلة، فتح وإغلاق المودالات، القوائم
   المنسدلة للبحث، تحديث واجهة العميل.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    /**
     * _cacheDOM - تخزين مراجع جميع عناصر DOM المهمة في POS.el
     * تُستدعى مرة واحدة عند تهيئة التطبيق لتحسين الأداء
     */
    POS._cacheDOM = function() {
        const ids = [
            // الشريط الجانبي والقائمة
            'menuToggle', 'sidebar', 'sidebarOverlay',
            'moreMenuBtn', 'moreDropdown',
            'holdInvoiceBtn', 'heldInvoicesBtn', 'logoutBtn', 'returnSaleBtn',

            // البحث عن المنتجات والعملاء
            'productSearchInput', 'customerSearchInput', 'customerBalanceDisplay',
            'productDropdown', 'customerDropdown', 'barcodeScannerBtn',

            // السلة والملخص
            'cartItemsContainer', 'discountValue', 'discountType',
            'itemTypesCount', 'totalPieces', 'subtotal', 'netTotal', 'payBtn',

            // نافذة اختيار الوحدة والكمية
            'unitQuantityModal', 'modalProductName', 'unitButtons',
            'selectedQuantity', 'selectedPrice', 'stockInfo',
            'addToCartBtn', 'closeUnitModalBtn', 'priceLimitMsg',

            // نافذة الدفع
            'paymentModal', 'paySubtotal', 'payDiscount', 'payNet',
            'currentBalance', 'paymentMethod', 'cashField', 'transferField',
            'cashAmount', 'transferAmount', 'remainingDisplay',
            'balanceAfterLabel', 'balanceAfter', 'paymentNotes',
            'confirmAndPrintBtn', 'closePaymentModalBtn',

            // الفواتير المعلقة
            'heldInvoicesModal', 'heldInvoicesList', 'closeHeldModalBtn',

            // الإيصال والطباعة
            'receiptModal', 'receiptPrintArea', 'printReceiptBtn',
            'thermalPrintBtn', 'skipPrintBtn', 'closeReceiptModalBtn',

            // بيانات المستخدم في الشريط الجانبي
            'sidebarAvatar', 'sidebarUserName',

            // شبكة المنتجات للأجهزة اللوحية
            'tabletProductSearchInput', 'productGrid', 'tabletBarcodeBtn',

            // عرض الربح والإحصائيات
            'profitDisplay', 'todaySales', 'todayCount',

            // نافذة تكرار المنتج
            'duplicateProductModal', 'duplicateProductMsg',
            'duplicateIncreaseBtn', 'duplicateCancelBtn',

            // أزرار إضافية
            'quickSaleToggle', 'speechSearchBtn'
        ];

        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) POS.el[id] = el;
        });
    };

    /**
     * _applySafeArea - تطبيق مسافات آمنة للأجهزة ذات الشق (Notch)
     * تُضيف padding-bottom لـ cart-footer لتجنب تداخل المحتوى
     */
    POS._applySafeArea = function() {
        const safeBottom = 'env(safe-area-inset-bottom, 0px)';
        const footer = document.querySelector('.cart-footer');
        if (footer) {
            footer.style.paddingBottom = `calc(10px + ${safeBottom})`;
        }
    };

    /**
     * _renderProductGrid - عرض شبكة المنتجات مع تحميل كسول (Lazy Loading)
     * تستخدم IntersectionObserver لتحميل دفعات من المنتجات أثناء التمرير
     * 
     * @param {Array} products - مصفوفة المنتجات المراد عرضها (افتراضيًا جميع المنتجات)
     */
    POS._renderProductGrid = function(products = POS.state.products) {
        const grid = POS.el.productGrid;
        if (!grid) return;

        // عرض رسالة إذا لم توجد منتجات
        if (!products || products.length === 0) {
            grid.innerHTML = `
                <div style="padding:30px;text-align:center;color:var(--text-secondary);grid-column:1/-1;">
                    <i class="fas fa-box-open" style="font-size:3rem;display:block;margin-bottom:12px;color:var(--text-muted);"></i>
                    <p style="font-size:1rem;font-weight:600;margin-bottom:6px;">لا توجد منتجات متاحة</p>
                    <p style="font-size:0.85rem;margin-bottom:16px;">
                        الرجاء إضافة منتجات من
                        <a href="./products.html" style="color:var(--primary);">صفحة المنتجات</a>
                        أو
                    </p>
                    <button id="retryLoadBtn" class="btn btn-primary" style="padding:8px 16px;font-size:0.9rem;">
                        <i class="fas fa-sync-alt"></i> إعادة المحاولة
                    </button>
                </div>`;
            // ربط زر إعادة المحاولة بدالة تحميل البيانات
            document.getElementById('retryLoadBtn')?.addEventListener('click', () => POS._loadData());
            return;
        }

        // إيقاف observer سابق إن وجد
        if (POS.state._observer) {
            POS.state._observer.disconnect();
            POS.state._observer = null;
        }

        // مسح المحتوى السابق
        grid.innerHTML = '';
        const fragment = document.createDocumentFragment();
        const cardsPerBatch = 20; // عدد البطاقات في كل دفعة
        let currentBatch = 0;

        /**
         * renderBatch - دالة داخلية لرسم دفعة من المنتجات
         */
        const renderBatch = () => {
            const start = currentBatch * cardsPerBatch;
            const end = Math.min(start + cardsPerBatch, products.length);

            for (let i = start; i < end; i++) {
                const product = products[i];
                const baseUnit = product.units?.[0] || {};
                const stock = POS.state.showStock ? (baseUnit.stock || 0) : null;
                const price = baseUnit.price || 0;

                // صورة المنتج (إن وجدت وإذا كان إظهار الصور مفعّلاً)
                const imgHtml = (POS.state.showImages && product.image_url)
                    ? `<img src="${U.escape(product.image_url)}" 
                           alt="${U.escape(product.name)}" 
                           style="width:60px;height:60px;object-fit:cover;border-radius:8px;margin-bottom:4px;">`
                    : '';

                // إنشاء بطاقة المنتج
                const card = document.createElement('div');
                card.className = 'product-card';
                card.dataset.id = product.id;
                card.innerHTML = `
                    ${imgHtml}
                    <div style="font-weight:700;font-size:0.9rem;margin-bottom:4px;">
                        ${U.escape(product.name)}
                    </div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);">
                        ${U.fmtMoney(price)}
                    </div>
                    ${POS.state.showStock ? `
                        <div style="font-size:0.7rem;color:${stock > 0 ? 'var(--success)' : 'var(--danger)'};">
                            ${stock > 0 ? 'المخزون: ' + stock : 'نفد'}
                        </div>
                    ` : ''}`;

                fragment.appendChild(card);
            }

            grid.appendChild(fragment);
            currentBatch++;

            // إذا تبقى المزيد من المنتجات، نضيف عنصر مراقبة للتحميل الكسول
            if (end < products.length) {
                const sentinel = document.createElement('div');
                sentinel.className = 'scroll-sentinel';
                sentinel.style.height = '10px';
                grid.appendChild(sentinel);

                POS.state._observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting) {
                        POS.state._observer.disconnect();
                        grid.removeChild(sentinel);
                        renderBatch();
                    }
                }, { root: grid, rootMargin: '100px' });

                POS.state._observer.observe(sentinel);
            }
        };

        // بدء رسم الدفعة الأولى
        renderBatch();
    };

    /**
     * _renderCart - عرض محتويات السلة في الواجهة
     * تُنشئ صفوف السلة مع إمكانية تعديل الكمية والسعر والملاحظات
     */
    POS._renderCart = function() {
        const container = POS.el.cartItemsContainer;
        if (!container) return;

        // إنشاء رأس السلة مرة واحدة فقط
        if (!POS.state._cartRendered) {
            container.innerHTML = `
                <div class="cart-header-row">
                    <span></span>
                    <span>الصنف</span>
                    <span>الكمية</span>
                    <span>السعر</span>
                    <span>الإجمالي</span>
                    <span>ملاحظة</span>
                    <span></span>
                </div>`;
            POS.state._cartRendered = true;
        }

        // حذف صفوف السلة القديمة
        const existingRows = container.querySelectorAll('.cart-item-row');
        existingRows.forEach(r => r.remove());

        // حذف رسالة "السلة فارغة" إن وجدت
        const emptyMsg = container.querySelector('.empty-cart-message');
        if (emptyMsg) emptyMsg.remove();

        // عرض رسالة إذا كانت السلة فارغة
        if (!POS.state.cart.length) {
            container.insertAdjacentHTML('beforeend', '<div class="empty-cart-message">السلة فارغة</div>');
            POS._updateTotals();
            return;
        }

        // بناء HTML الصفوف
        let rows = '';
        POS.state.cart.forEach((item, idx) => {
            rows += `
                <div class="cart-item-row" data-cart-idx="${idx}">
                    <div>
                        <i class="fas fa-grip-vertical cart-item-drag-handle" 
                           style="cursor:grab;margin-left:8px;color:var(--text-muted);"></i>
                    </div>
                    <div>
                        <span class="cart-item-name">${U.escape(item.productName)}</span><br>
                        <span class="cart-item-unit">${U.escape(item.unitName)}</span>
                    </div>
                    <div>
                        <input type="number" value="${item.quantity}" min="0.001" step="0.001" 
                               class="cart-qty-input" data-idx="${idx}">
                    </div>
                    <div>
                        <input type="number" value="${item.price}" step="0.01" 
                               class="cart-price-input" data-idx="${idx}">
                    </div>
                    <div>${U.fmtMoney(U.round(item.price * item.quantity, 2))}</div>
                    <div>
                        <input type="text" placeholder="ملاحظة" value="${U.escape(item.note || '')}" 
                               class="cart-note-input" data-idx="${idx}" style="width:60px;">
                    </div>
                    <div>
                        <i class="fas fa-trash" style="color:var(--danger);cursor:pointer;" data-idx="${idx}"></i>
                    </div>
                </div>`;
        });

        container.insertAdjacentHTML('beforeend', rows);
        POS._updateTotals();
    };

    /**
     * _resetCartRender - إعادة تعيين حالة رسم السلة
     * تُستدعى عند تفريغ السلة لإعادة إنشاء رأس السلة في المرة القادمة
     */
    POS._resetCartRender = function() {
        POS.state._cartRendered = false;
    };

    /**
     * _filterProducts - تصفية المنتجات في القائمة المنسدلة للبحث
     * تُستدعى عند كتابة المستخدم في حقل البحث عن المنتجات
     */
    POS._filterProducts = function() {
        const term = (POS.el.productSearchInput?.value || '').trim().toLowerCase();
        const dd = POS.el.productDropdown;
        if (!dd) return;

        // إخفاء القائمة إذا كان حقل البحث فارغاً
        if (!term) {
            dd.classList.remove('show');
            return;
        }

        // عرض رسالة إذا لم تكن هناك منتجات محملة
        if (!POS.state.products.length) {
            dd.innerHTML = '<div class="dropdown-item" style="color:var(--danger);text-align:center;">لا توجد منتجات محملة</div>';
            dd.classList.add('show');
            return;
        }

        // تصفية المنتجات حسب الاسم أو الباركود أو الكود
        const filtered = POS.state.products.filter(
            p => (p.name || '').toLowerCase().includes(term) ||
                 p.barcode === term ||
                 p.code === term
        );

        // عرض النتائج أو رسالة "لا نتائج"
        if (filtered.length) {
            dd.innerHTML = filtered.map(p => {
                const price = p.units?.[0]?.price || 0;
                return `<div class="dropdown-item" data-id="${p.id}">
                    <div class="item-info"><h4>${U.escape(p.name)}</h4></div>
                    <div class="item-price">${U.fmtMoney(price)}</div>
                </div>`;
            }).join('');
        } else {
            dd.innerHTML = '<div class="dropdown-item" style="color:var(--text-muted);">لا نتائج</div>';
        }

        dd.classList.add('show');
    };

    /**
     * _hideProdDropdown - إخفاء القائمة المنسدلة للمنتجات
     */
    POS._hideProdDropdown = function() {
        POS.el.productDropdown?.classList.remove('show');
    };

    /**
     * _hideCustDropdown - إخفاء القائمة المنسدلة للعملاء
     */
    POS._hideCustDropdown = function() {
        POS.el.customerDropdown?.classList.remove('show');
    };

    /**
     * _showModal - إظهار نافذة منبثقة
     * @param {string} id - معرف النافذة
     */
    POS._showModal = function(id) {
        const modal = POS.el[id];
        if (modal) modal.classList.add('open');
    };

    /**
     * _closeModal - إغلاق نافذة منبثقة
     * إذا كانت النافذة هي نافذة الوحدة، يتم إيقاف مسح الباركود
     * @param {string} id - معرف النافذة
     */
    POS._closeModal = function(id) {
        const modal = POS.el[id];
        if (modal) {
            modal.classList.remove('open');
            // إيقاف الكاميرا عند إغلاق نافذة الوحدة
            if (id === 'unitQuantityModal') {
                POS._stopBarcodeScan();
            }
        }
    };

    /**
     * _closeAllModals - إغلاق جميع النوافذ المنبثقة
     * تُستدعى عند الضغط على Escape
     */
    POS._closeAllModals = function() {
        ['paymentModal', 'unitQuantityModal', 'heldInvoicesModal', 'receiptModal', 'duplicateProductModal']
            .forEach(id => POS._closeModal(id));
    };

    /**
     * _updateCustDisplay - تحديث عرض رصيد العميل المحدد
     * تُظهر رصيد العميل (دائن/مدين) تحت حقل البحث عن العملاء
     */
    POS._updateCustDisplay = function() {
        const el = POS.el.customerBalanceDisplay;
        if (!el) return;

        // إخفاء الرصيد إذا لم يتم تحديد عميل
        if (!POS.state.selectedCustomerId) {
            el.innerHTML = '';
            el.className = 'customer-balance';
            return;
        }

        const customer = POS.cache.custs.get(POS.state.selectedCustomerId);
        if (customer) {
            const bal = customer.balance || 0;
            if (bal > 0) {
                el.innerHTML = `له ${U.fmtMoney(bal)}`;
                el.className = 'customer-balance positive';
            } else if (bal < 0) {
                el.innerHTML = `عليه ${U.fmtMoney(-bal)}`;
                el.className = 'customer-balance negative';
            } else {
                el.innerHTML = 'لا رصيد';
                el.className = 'customer-balance';
            }
        }
    };

})();
