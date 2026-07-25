/* =============================================
   pos-events.js - ربط الأحداث والتفاعلات
   الوظيفة: ربط جميع أحداث المستخدم مع دوال
   المعالجة. يشمل القائمة الجانبية، البحث، السلة،
   الدفع، المودالات، اختصارات لوحة المفاتيح،
   وقراءة الباركود من الماسح الضوئي.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    /**
     * _bindEvents - ربط جميع أحداث النقر والإدخال
     * تُستدعى مرة واحدة عند تهيئة التطبيق
     */
    POS._bindEvents = function() {
        // دالة مساعدة لتبسيط ربط الأحداث
        const on = (id, event, handler) => {
            const el = POS.el[id];
            if (el) el.addEventListener(event, handler);
        };

        // ========== القائمة الجانبية ==========
        // فتح وإغلاق القائمة الجانبية
        on('menuToggle', 'click', () => {
            POS.el.sidebar?.classList.toggle('open');
            POS.el.sidebarOverlay?.classList.toggle('show');
        });
        // إغلاق القائمة عند النقر على الخلفية
        on('sidebarOverlay', 'click', () => {
            POS.el.sidebar?.classList.remove('open');
            POS.el.sidebarOverlay?.classList.remove('show');
        });
        // إغلاق القائمة عند النقر على أي رابط في القائمة
        document.querySelectorAll('.menu-item').forEach(link => {
            link.addEventListener('click', () => {
                POS.el.sidebar?.classList.remove('open');
                POS.el.sidebarOverlay?.classList.remove('show');
            });
        });

        // ========== القائمة المنسدلة "المزيد" ==========
        on('moreMenuBtn', 'click', (e) => {
            e.stopPropagation();
            POS.el.moreDropdown?.classList.toggle('show');
        });
        // إغلاق القائمة المنسدلة عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.nav-actions')) {
                POS.el.moreDropdown?.classList.remove('show');
            }
        });

        // ========== أزرار القائمة المنسدلة ==========
        on('returnSaleBtn', 'click', (e) => {
            e.preventDefault();
            POS.openReturn();
            POS.el.moreDropdown?.classList.remove('show');
        });
        on('holdInvoiceBtn', 'click', (e) => {
            e.preventDefault();
            POS.holdInvoice();
            POS.el.moreDropdown?.classList.remove('show');
        });
        on('heldInvoicesBtn', 'click', (e) => {
            e.preventDefault();
            POS.loadHeld();
            POS.el.moreDropdown?.classList.remove('show');
        });
        on('logoutBtn', 'click', async (e) => {
            e.preventDefault();
            const confirmed = await POS._confirmAction('هل أنت متأكد من تسجيل الخروج؟');
            if (confirmed && window.App) {
                App.logout();
            }
        });

        // ========== البيع السريع والبحث الصوتي ==========
        on('quickSaleToggle', 'click', () => {
            POS.state.quickSale = !POS.state.quickSale;
            UserPrefs.set('quickSale', POS.state.quickSale);
            POS.el.quickSaleToggle?.classList.toggle('active', POS.state.quickSale);
            U.showToast(POS.state.quickSale ? 'البيع السريع مفعّل' : 'البيع السريع معطّل');
        });
        on('speechSearchBtn', 'click', () => POS._startSpeechSearch());

        // ========== شبكة المنتجات (للأجهزة اللوحية) ==========
        on('tabletProductSearchInput', 'input', U.debounce(() => POS._filterTabletProducts(), 150));
        on('tabletBarcodeBtn', 'click', () => POS._scanBarcode());
        // النقر على بطاقة منتج في الشبكة
        if (POS.el.productGrid) {
            POS.el.productGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.product-card');
                if (card?.dataset.id) {
                    POS._openUnitModal(card.dataset.id);
                }
            });
        }

        // ========== البحث عن المنتجات (شريط البحث الرئيسي) ==========
        on('productSearchInput', 'input', U.debounce(() => POS._filterProducts(), 150));
        on('productSearchInput', 'keypress', (e) => {
            if (e.key === 'Enter') {
                const term = POS.el.productSearchInput?.value.trim();
                // البحث أولاً في كاش الباركود
                let found = POS.cache.barcode.get(term);
                if (!found) {
                    // البحث في قائمة المنتجات
                    found = POS.state.products.find(p => p.barcode === term || p.code === term);
                }
                if (found) {
                    if (found.units?.length === 1 || POS.state.quickSale) {
                        POS._quickAdd(found, found.units[0]);
                    } else {
                        POS._openUnitModal(found.id);
                    }
                }
            }
        });
        // النقر على عنصر في القائمة المنسدلة للمنتجات
        on('productDropdown', 'click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                POS._openUnitModal(item.dataset.id);
                POS._hideProdDropdown();
                POS.el.productSearchInput.value = '';
            }
        });
        // إغلاق القائمة المنسدلة عند النقر خارج منطقة البحث
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-header')) {
                POS._hideProdDropdown();
            }
        });
        on('barcodeScannerBtn', 'click', () => POS._scanBarcode());

        // ========== البحث عن العملاء ==========
        on('customerSearchInput', 'input', U.debounce(() => POS._filterCustomers(), 150));
        on('customerDropdown', 'click', (e) => {
            const item = e.target.closest('.dropdown-item');
            if (item?.dataset.id) {
                if (item.dataset.id === 'cash') {
                    POS.state.selectedCustomerId = null;
                    POS.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
                } else {
                    POS.state.selectedCustomerId = item.dataset.id;
                    const c = POS.cache.custs.get(item.dataset.id);
                    POS.el.customerSearchInput.value = c?.name || '';
                }
                POS._updateCustDisplay();
                POS._hideCustDropdown();
                POS._saveCart();
            }
        });
        // إغلاق القائمة المنسدلة للعملاء عند النقر خارجها
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.customer-box')) {
                POS._hideCustDropdown();
            }
        });

        // ========== الخصم ==========
        on('discountValue', 'input', () => {
            POS.state.discountValue = +POS.el.discountValue.value || 0;
            POS._updateTotals();
            POS._saveCart();
        });
        on('discountType', 'change', () => {
            POS.state.discountType = POS.el.discountType.value;
            POS._updateTotals();
            POS._saveCart();
        });

        // ========== زر الدفع ==========
        on('payBtn', 'click', () => POS._openPayment());

        // ========== نافذة الوحدة والكمية ==========
        on('addToCartBtn', 'click', () => POS._addToCart());
        on('closeUnitModalBtn', 'click', () => {
            POS._stopBarcodeScan();
            POS._closeModal('unitQuantityModal');
        });

        // ========== نافذة الدفع ==========
        on('confirmAndPrintBtn', 'click', (e) => {
            e.preventDefault();
            POS._completePayment();
        });
        on('closePaymentModalBtn', 'click', () => POS._closeModal('paymentModal'));
        on('paymentMethod', 'change', () => POS._togglePaymentFields());
        on('cashAmount', 'input', () => POS._previewPayment());
        on('transferAmount', 'input', () => POS._previewPayment());

        // ========== نافذة الفواتير المعلقة ==========
        on('closeHeldModalBtn', 'click', () => POS._closeModal('heldInvoicesModal'));

        // ========== نافذة الإيصال ==========
        on('closeReceiptModalBtn', 'click', () => POS._closeModal('receiptModal'));
        on('skipPrintBtn', 'click', () => POS._closeModal('receiptModal'));
        on('printReceiptBtn', 'click', () => POS._printReceipt());
        on('thermalPrintBtn', 'click', () => POS._printThermal());

        // ========== أحداث السلة (تغيير الكمية، السعر، الحذف) ==========
        if (POS.el.cartItemsContainer) {
            POS.el.cartItemsContainer.addEventListener('change', (e) => POS._onCartChange(e));
            POS.el.cartItemsContainer.addEventListener('click', (e) => POS._onCartClick(e));
        }

        // ========== أزرار اختيار الوحدة ==========
        if (POS.el.unitButtons && !POS.state._unitButtonsBound) {
            POS.el.unitButtons.addEventListener('click', (e) => {
                const btn = e.target.closest('.unit-btn');
                if (btn) {
                    POS._selectUnit(+btn.dataset.index);
                }
            });
            POS.state._unitButtonsBound = true;
        }

        // ========== نافذة تكرار المنتج ==========
        on('duplicateIncreaseBtn', 'click', () => {
            if (POS._duplicateCallback) {
                POS._duplicateCallback(true);
                POS._duplicateCallback = null;
            }
            POS._closeModal('duplicateProductModal');
        });
        on('duplicateCancelBtn', 'click', () => {
            if (POS._duplicateCallback) {
                POS._duplicateCallback(false);
                POS._duplicateCallback = null;
            }
            POS._closeModal('duplicateProductModal');
        });
    };

    /**
     * _bindKeyboardShortcuts - ربط اختصارات لوحة المفاتيح
     * F1: التركيز على حقل البحث عن العملاء
     * F2: التركيز على حقل البحث عن المنتجات
     * F4: فتح نافذة الدفع
     * F5: تعليق الفاتورة
     * Escape: إغلاق جميع المودالات
     */
    POS._bindKeyboardShortcuts = function() {
        document.addEventListener('keydown', (e) => {
            // تجاهل إذا كان المستخدم يكتب في حقل إدخال
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.key) {
                case 'F1':
                    e.preventDefault();
                    POS.el.customerSearchInput?.focus();
                    break;
                case 'F2':
                    e.preventDefault();
                    POS.el.productSearchInput?.focus();
                    break;
                case 'F4':
                    e.preventDefault();
                    if (POS.state.cart.length) POS._openPayment();
                    break;
                case 'F5':
                    e.preventDefault();
                    POS.holdInvoice();
                    break;
                case 'Escape':
                    POS._closeAllModals();
                    break;
            }
        });
    };

    /**
     * _setupBarcodeBuffer - إعداد قراءة الباركود من الماسح الضوئي (لوحة المفاتيح)
     * الماسحات الضوئية ترسل أحرفاً سريعة متبوعة بـ Enter.
     * نقوم بتجميع الأحرف في مخزن مؤقت وعند الضغط على Enter
     * نبحث عن الباركود إذا كان طوله > 5.
     */
    POS._setupBarcodeBuffer = function() {
        document.addEventListener('keydown', (e) => {
            // تجاهل إذا كان المستخدم يكتب في حقل إدخال
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            const now = Date.now();

            // عند الضغط على Enter، نبحث عن الباركود إذا كان المخزن يحتوي على نص كافٍ
            if (e.key === 'Enter') {
                if (POS.state._barcodeBuffer.length > 5) {
                    POS._searchBarcode(POS.state._barcodeBuffer);
                }
                POS.state._barcodeBuffer = '';
                POS.state._lastKeyTime = 0;
                return;
            }

            // إذا مر أكثر من 30 مللي ثانية بين الضغطات، نبدأ مخزنًا جديدًا
            if (POS.state._lastKeyTime && (now - POS.state._lastKeyTime > 30)) {
                POS.state._barcodeBuffer = '';
            }

            // تجميع الأحرف (الحروف والأرقام فقط)
            if (e.key.length === 1) {
                POS.state._lastKeyTime = now;
                POS.state._barcodeBuffer += e.key;

                // بعد 150 مللي ثانية من آخر ضغطة، إذا كان المخزن طويلاً نبحث تلقائياً
                clearTimeout(POS.state._barcodeTimer);
                POS.state._barcodeTimer = setTimeout(() => {
                    if (POS.state._barcodeBuffer.length > 5) {
                        POS._searchBarcode(POS.state._barcodeBuffer);
                    }
                    POS.state._barcodeBuffer = '';
                    POS.state._lastKeyTime = 0;
                }, 150);
            }
        });
    };

    /**
     * _filterTabletProducts - تصفية شبكة المنتجات في وضع التابلت
     * تُستدعى عند الكتابة في حقل البحث العلوي
     */
    POS._filterTabletProducts = function() {
        const term = (POS.el.tabletProductSearchInput?.value || '').trim().toLowerCase();
        if (!term) {
            POS._renderProductGrid();
            return;
        }
        const filtered = POS.state.products.filter(
            p => (p.name || '').toLowerCase().includes(term) ||
                 p.barcode === term ||
                 p.code === term
        );
        POS._renderProductGrid(filtered);
    };

    /**
     * _filterCustomers - تصفية العملاء في القائمة المنسدلة
     * تُستدعى عند الكتابة في حقل البحث عن العملاء
     */
    POS._filterCustomers = function() {
        const term = (POS.el.customerSearchInput?.value || '').trim().toLowerCase();
        const dd = POS.el.customerDropdown;
        if (!dd) return;

        let list = POS.state.customers;

        // تصفية العملاء حسب الاسم أو رقم الهاتف
        if (term && term !== CASH_CUSTOMER_LABEL.toLowerCase()) {
            list = list.filter(c =>
                (c.name || '').toLowerCase().includes(term) ||
                (c.phone && c.phone.includes(term))
            );
        }

        // إضافة خيار "نقدي (بدون عميل)" دائماً
        let html = `<div class="dropdown-item" data-id="cash">
            <div class="item-info"><h4>${CASH_CUSTOMER_LABEL}</h4></div>
        </div>`;

        // إضافة العملاء المطابقين
        list.forEach(c => {
            const bal = c.balance || 0;
            const col = bal > 0 ? U.cssVar('--success', '#10b981') :
                        bal < 0 ? U.cssVar('--danger', '#ef4444') :
                        U.cssVar('--text-muted', '#94a3b8');
            const sign = bal > 0 ? `له ${U.fmtMoney(bal)}` :
                         bal < 0 ? `عليه ${U.fmtMoney(-bal)}` :
                         'لا رصيد';
            html += `<div class="dropdown-item" data-id="${c.id}">
                <div class="item-info">
                    <h4>${U.escape(c.name)}</h4>
                    <small style="color:${col};">${sign}</small>
                </div>
                <div class="item-price">${c.phone || ''}</div>
            </div>`;
        });

        dd.innerHTML = html;
        dd.classList.add('show');
    };

    /**
     * _onCartChange - معالجة تغيير الكمية أو السعر في السلة
     * @param {Event} e - حدث التغيير
     */
    POS._onCartChange = function(e) {
        const target = e.target;

        // تغيير السعر (للمسؤول فقط)
        if (target.classList.contains('cart-price-input')) {
            if (!POS._canChangePrice()) {
                U.showToast('ليس لديك صلاحية لتغيير السعر', 'error');
                POS._renderCart();
                return;
            }
            const idx = +target.dataset.idx;
            const newPrice = +target.value;
            if (!isNaN(newPrice) && newPrice >= 0) {
                POS.state.cart[idx].price = newPrice;
            }
            POS._renderCart();
            POS._saveCart();
        }
        // تغيير الكمية
        else if (target.classList.contains('cart-qty-input')) {
            const idx = +target.dataset.idx;
            const newQty = +target.value;
            if (isNaN(newQty) || newQty <= 0) {
                POS.state.cart.splice(idx, 1);
                U.playBeep('remove');
            } else {
                POS.state.cart[idx].quantity = newQty;
            }
            POS._renderCart();
            POS._saveCart();
        }
        // تغيير الملاحظة
        else if (target.classList.contains('cart-note-input')) {
            const idx = +target.dataset.idx;
            POS.state.cart[idx].note = target.value;
            POS._saveCart();
        }
    };

    /**
     * _onCartClick - معالجة النقر على أيقونة الحذف في السلة
     * @param {Event} e - حدث النقر
     */
    POS._onCartClick = function(e) {
        const trashIcon = e.target.closest('.fa-trash');
        if (trashIcon) {
            const idx = +trashIcon.dataset.idx;
            const removedItem = POS.state.cart[idx];
            POS.state.cart.splice(idx, 1);
            U.playBeep('remove');
            POS._logActivity('حذف صنف', removedItem.productName);
            POS._renderCart();
            POS._saveCart();
        }
    };

})();
