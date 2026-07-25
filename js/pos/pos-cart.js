/* =============================================
   pos-cart.js - إدارة السلة وعمليات البيع والدفع
   الوظيفة: إضافة المنتجات للسلة، اختيار الوحدة
   والكمية، حساب الإجماليات والخصومات، نافذة الدفع،
   إتمام الدفع، تعليق واستئناف الفواتير، الإيصال.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    // ==================== إدارة السلة ====================

    /**
     * _openUnitModal - فتح نافذة اختيار الوحدة والكمية لمنتج محدد
     * تُستدعى عند النقر على منتج في الشبكة أو من نتائج البحث.
     * إذا كان المنتج له وحدة واحدة والبيع السريع مفعّل، تُضاف مباشرة.
     * @param {string|number} id - معرف المنتج
     */
    POS._openUnitModal = function(id) {
        const product = POS._getProductById(id);
        if (!product || !product.units?.length) {
            U.showToast('المنتج غير موجود أو لا يحتوي على وحدات', 'error');
            return;
        }

        // إذا كان البيع السريع مفعّلاً وللمنتج وحدة واحدة، أضف مباشرة
        if (product.units.length === 1 && POS.state.quickSale) {
            POS._quickAdd(product, product.units[0]);
            return;
        }

        // تعيين المنتج والوحدة المحددة
        POS.state.selectedProduct = product;
        POS.state.selectedUnit = product.units[0];

        // عرض اسم المنتج في النافذة
        POS.el.modalProductName.textContent = product.name;

        // بناء أزرار الوحدات
        POS.el.unitButtons.innerHTML = product.units.map((unit, i) =>
            `<button class="unit-btn ${i === 0 ? 'active' : ''}" data-index="${i}">
                ${U.escape(unit.name)}
            </button>`
        ).join('');

        POS._updateUnitInfo();
        POS._showModal('unitQuantityModal');
    };

    /**
     * _selectUnit - تحديد وحدة من أزرار الوحدات
     * @param {number} index - فهرس الوحدة المحددة
     */
    POS._selectUnit = function(index) {
        if (!POS.state.selectedProduct?.units) return;
        POS.state.selectedUnit = POS.state.selectedProduct.units[index];

        // تحديث تنسيق الأزرار (إضافة/إزالة الكلاس active)
        POS.el.unitButtons.querySelectorAll('.unit-btn').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
        });

        POS._updateUnitInfo();
    };

    /**
     * _updateUnitInfo - تحديث معلومات الوحدة في نافذة الوحدة والكمية
     * تعرض المخزون المتاح، السعر الافتراضي، حدود السعر، الكمية القصوى
     */
    POS._updateUnitInfo = function() {
        const product = POS.state.selectedProduct;
        const unit = POS.state.selectedUnit;
        if (!product || !unit) return;

        const baseUnit = product.units[0];
        const baseStock = baseUnit.stock || 0;
        const factor = unit.factor || 1;

        // حساب المخزون المتاح للوحدة المحددة
        const available = (unit.name === baseUnit.name)
            ? baseStock
            : Math.floor(baseStock / factor);
        const maxQty = Math.max(0, available);

        // عرض البيانات في الحقول
        POS.el.selectedPrice.value = unit.price || 0;
        POS.el.selectedQuantity.max = maxQty;
        POS.el.selectedQuantity.value = maxQty > 0 ? 1 : 0;
        POS.el.stockInfo.textContent = `المخزون المتاح: ${maxQty} ${unit.name}`;

        // عرض حدود السعر إن وجدت
        if (unit.minPrice || unit.maxPrice) {
            POS.el.priceLimitMsg.style.display = 'block';
            POS.el.priceLimitMsg.textContent =
                `السعر المسموح: ${U.fmtMoney(unit.minPrice || 0)} - ${unit.maxPrice ? U.fmtMoney(unit.maxPrice) : 'غير محدود'}`;
        } else {
            POS.el.priceLimitMsg.style.display = 'none';
        }
    };

    /**
     * _addToCart - إضافة المنتج المحدد إلى السلة
     * تتحقق من الكمية، السعر، حدود السعر، وتكرار المنتج
     */
    POS._addToCart = function() {
        if (POS.state.addingItem) return;
        POS.state.addingItem = true;

        try {
            const quantity = +POS.el.selectedQuantity?.value || 0;
            const maxQty = +POS.el.selectedQuantity?.max || 0;

            // التحقق من صحة الكمية
            if (quantity <= 0) {
                U.showToast('الرجاء إدخال كمية صحيحة', 'warning');
                return;
            }
            if (quantity > maxQty) {
                U.showToast('الكمية المطلوبة غير متوفرة في المخزون', 'error');
                return;
            }

            const unit = POS.state.selectedUnit;
            let price = +POS.el.selectedPrice?.value || 0;

            // إذا لم يكن لدى المستخدم صلاحية تغيير السعر، استخدم السعر الافتراضي
            if (!POS._canChangePrice()) {
                price = unit?.price || 0;
            }

            // التحقق من حدود السعر
            if (unit) {
                if (unit.minPrice > 0 && price < unit.minPrice) {
                    U.showToast(`السعر لا يمكن أن يقل عن ${U.fmtMoney(unit.minPrice)}`, 'error');
                    return;
                }
                if (unit.maxPrice > 0 && price > unit.maxPrice) {
                    U.showToast(`السعر لا يمكن أن يزيد عن ${U.fmtMoney(unit.maxPrice)}`, 'error');
                    return;
                }
            }

            const product = POS.state.selectedProduct;
            const unitName = unit?.name || 'وحدة';
            const cost = unit?.cost || 0;

            // التحقق من وجود المنتج مسبقاً في السلة (نفس المنتج ونفس الوحدة)
            const existingIndex = POS.state.cart.findIndex(
                item => item.productId === product.id && item.unitName === unitName
            );

            if (existingIndex !== -1) {
                // المنتج موجود مسبقاً - عرض نافذة التأكيد
                const existing = POS.state.cart[existingIndex];
                POS.el.duplicateProductMsg.textContent =
                    `${product.name} (${unitName}) موجود مسبقاً بالكمية ${existing.quantity}. هل تريد زيادة الكمية بمقدار ${quantity}؟`;

                POS._duplicateCallback = (confirmed) => {
                    if (confirmed) {
                        existing.quantity = U.round(existing.quantity + quantity, 3);
                        if (price && POS._canChangePrice()) existing.price = price;
                        POS._renderCart();
                        POS._saveCart();
                        U.playBeep('add');
                    }
                    POS.state.addingItem = false;
                    POS._closeModal('unitQuantityModal');
                };

                POS._showModal('duplicateProductModal');
                return;
            }

            // إضافة عنصر جديد إلى السلة
            POS.state.cart.push({
                productId: product.id,
                productName: product.name,
                unitName: unitName,
                quantity: quantity,
                price: price,
                cost: cost,
                factor: unit?.factor || 1,
                isBase: unit === product.units[0],
                note: ''
            });

            U.playBeep('add');
            POS._renderCart();
            POS._closeModal('unitQuantityModal');
            POS._saveCart();

            // إعادة التركيز على حقل البحث
            setTimeout(() => {
                POS.el.productSearchInput?.focus();
                POS.el.productSearchInput?.select();
            }, 100);

        } catch (e) {
            console.error('خطأ في إضافة المنتج للسلة:', e);
            U.showToast('حدث خطأ أثناء إضافة المنتج', 'error');
        } finally {
            POS.state.addingItem = false;
        }
    };

    /**
     * _quickAdd - إضافة سريعة للمنتج (للبيع السريع أو المسح بالباركود)
     * @param {object} product - المنتج
     * @param {object} unit - الوحدة
     */
    POS._quickAdd = function(product, unit) {
        const existing = POS.state.cart.find(
            item => item.productId === product.id && item.unitName === unit.name
        );

        if (existing) {
            existing.quantity = U.round(existing.quantity + 1, 3);
        } else {
            POS.state.cart.push({
                productId: product.id,
                productName: product.name,
                unitName: unit.name,
                quantity: 1,
                price: unit.price || 0,
                cost: unit.cost || 0,
                factor: unit.factor || 1,
                isBase: unit === product.units[0],
                note: ''
            });
        }

        U.playBeep('add');
        POS._renderCart();
        POS._saveCart();
        U.showToast(`تمت إضافة ${product.name}`, 'success');
    };

    // ==================== الدفع ====================

    /**
     * _openPayment - فتح نافذة الدفع مع عرض الإجماليات
     * تتحقق من أن السلة ليست فارغة أولاً
     */
    POS._openPayment = function() {
        if (!POS.state.cart.length) {
            U.showToast('السلة فارغة، أضف منتجات أولاً', 'warning');
            return;
        }

        const { sub, disc, net } = POS._calcTotals();
        const customer = POS._getCust();
        const balance = customer?.balance || 0;

        // عرض الإجماليات
        POS.el.paySubtotal.textContent = U.fmtMoney(sub);
        POS.el.payDiscount.textContent = U.fmtMoney(disc);
        POS.el.payNet.textContent = U.fmtMoney(net);

        // عرض رصيد العميل الحالي
        POS.el.currentBalance.textContent = U.fmtMoney(Math.abs(balance));
        POS.el.currentBalance.classList.toggle('text-success', balance >= 0);
        POS.el.currentBalance.classList.toggle('text-danger', balance < 0);

        // إعادة تعيين حقول الدفع
        POS.el.cashAmount.value = '';
        POS.el.transferAmount.value = '';
        POS.el.paymentMethod.value = 'cash';
        POS.el.paymentNotes.value = '';

        POS._togglePaymentFields();
        POS._previewPayment();
        POS._showModal('paymentModal');

        // تنبيه إذا كان العميل مديناً
        if (balance < 0) {
            U.showToast(`العميل مدين بمبلغ ${U.fmtMoney(-balance)}`, 'warning');
        }
    };

    /**
     * _togglePaymentFields - إظهار/إخفاء حقول الدفع حسب طريقة الدفع المختارة
     */
    POS._togglePaymentFields = function() {
        const method = POS.el.paymentMethod?.value || 'cash';

        // حقل النقدي: يظهر في النقدي والمختلط
        if (POS.el.cashField) {
            POS.el.cashField.style.display = (method === 'cash' || method === 'mixed') ? 'block' : 'none';
        }
        // حقل التحويل: يظهر في التحويل والمختلط
        if (POS.el.transferField) {
            POS.el.transferField.style.display = (method === 'transfer' || method === 'mixed') ? 'block' : 'none';
        }

        POS._previewPayment();
    };

    /**
     * _previewPayment - معاينة المدفوعات والمتبقي قبل تأكيد الدفع
     * تحسب المبلغ المدفوع، الفائض/المتبقي، والرصيد الجديد للعميل
     */
    POS._previewPayment = function() {
        const net = POS.state.net;
        const method = POS.el.paymentMethod?.value || 'cash';
        const customer = POS._getCust();
        const currentBalance = customer?.balance || 0;

        let cashAmount = 0;
        let transferAmount = 0;

        if (method === 'cash') {
            cashAmount = +POS.el.cashAmount?.value || 0;
        } else if (method === 'transfer') {
            transferAmount = +POS.el.transferAmount?.value || 0;
        } else if (method === 'mixed') {
            cashAmount = +POS.el.cashAmount?.value || 0;
            transferAmount = +POS.el.transferAmount?.value || 0;
        }

        // حساب الرصيد المستخدم من العميل (للمدفوعات غير الآجلة)
        let usedBalance = 0;
        if (method !== 'credit' && currentBalance > 0) {
            const remaining = Math.max(0, net - cashAmount - transferAmount);
            usedBalance = Math.min(currentBalance, remaining);
        }
        POS.state.usedBalance = usedBalance;

        const totalPaid = U.round(cashAmount + transferAmount + usedBalance, 2);
        const difference = U.round(totalPaid - net, 2);

        // حساب الرصيد الجديد للعميل
        const newBalance = currentBalance - usedBalance + (difference > 0 ? difference : 0);

        // عرض المتبقي/الفائض
        if (POS.el.remainingDisplay) {
            if (method === 'credit') {
                POS.el.remainingDisplay.textContent = `سيتم تسجيل ${U.fmtMoney(net)} كدين`;
            } else if (difference >= 0) {
                POS.el.remainingDisplay.textContent = `فائض: ${U.fmtMoney(difference)}`;
            } else {
                POS.el.remainingDisplay.textContent = `متبقي: ${U.fmtMoney(-difference)}`;
            }
        }

        // عرض الرصيد بعد الدفع (للعملاء غير النقديين)
        if (POS.el.balanceAfterLabel && POS.el.balanceAfter) {
            if (customer) {
                POS.el.balanceAfterLabel.textContent = newBalance >= 0 ? 'الرصيد بعد الدفع:' : 'الدين بعد الدفع:';
                POS.el.balanceAfter.textContent = U.fmtMoney(Math.abs(newBalance));
                POS.el.balanceAfter.classList.toggle('text-success', newBalance >= 0);
                POS.el.balanceAfter.classList.toggle('text-danger', newBalance < 0);
            }
        }
    };

    /**
     * _completePayment - إتمام عملية الدفع وحفظ الفاتورة
     * تتحقق من المخزون، تنشئ الفاتورة، وتحفظها في قاعدة البيانات
     */
    POS._completePayment = async function() {
        if (POS.state.busy) {
            U.showToast('جاري معالجة العملية، الرجاء الانتظار', 'warning');
            return;
        }

        POS.state.busy = true;
        if (POS.el.confirmAndPrintBtn) POS.el.confirmAndPrintBtn.disabled = true;

        try {
            const { sub, disc, net } = POS._calcTotals();
            const method = POS.el.paymentMethod?.value || 'cash';
            const customer = POS._getCust();
            const oldBalance = customer?.balance || 0;

            let cashAmount = 0;
            let transferAmount = 0;

            if (method === 'cash') cashAmount = +POS.el.cashAmount?.value || 0;
            else if (method === 'transfer') transferAmount = +POS.el.transferAmount?.value || 0;
            else if (method === 'mixed') {
                cashAmount = +POS.el.cashAmount?.value || 0;
                transferAmount = +POS.el.transferAmount?.value || 0;
            }

            const usedBalance = method === 'credit' ? 0 : (POS.state.usedBalance || 0);
            const totalPaid = method === 'credit' ? 0 : U.round(cashAmount + transferAmount + usedBalance, 2);
            const difference = method === 'credit' ? -net : U.round(totalPaid - net, 2);

            // تأكيدات للمستخدم
            if (difference > 0 && customer && !await POS._confirmAction(
                `سيتم إضافة ${U.fmtMoney(difference)} إلى رصيد ${customer.name}. متابعة؟`
            )) {
                POS.state.busy = false;
                if (POS.el.confirmAndPrintBtn) POS.el.confirmAndPrintBtn.disabled = false;
                return;
            }

            if (method === 'credit' && customer && !await POS._confirmAction(
                `سيتم تسجيل ${U.fmtMoney(net)} كدين على ${customer.name}. متابعة؟`
            )) {
                POS.state.busy = false;
                if (POS.el.confirmAndPrintBtn) POS.el.confirmAndPrintBtn.disabled = false;
                return;
            }

            // التحقق من المخزون
            const stockCheck = await POS._checkStock();
            if (!stockCheck.ok) {
                throw new Error(stockCheck.error || 'المخزون غير كافٍ');
            }

            // توليد رقم الفاتورة
            const invoiceNumber = POS.state.db
                ? await DB.generateInvoiceNumber()
                : POS._localInvNum();

            // بناء كائن الفاتورة
            const invoice = {
                id: U.uuid(),
                invoice_number: invoiceNumber,
                date: U.today(),
                customer_id: POS.state.selectedCustomerId || null,
                customer_name: customer?.name || CASH_CUSTOMER_STORED,
                items: POS.state.cart.map(item => ({ ...item, _tempId: undefined })),
                subtotal: sub,
                discount: disc,
                total: net,
                cash_paid: cashAmount,
                transfer_paid: transferAmount,
                used_customer_balance: usedBalance,
                paid: totalPaid,
                remaining: difference >= 0 ? 0 : -difference,
                customer_credit_added: difference > 0 ? difference : 0,
                change_amount: difference > 0 ? difference : 0,
                status: method === 'credit' ? 'credit' : (difference >= 0 ? 'paid' : 'partial'),
                notes: POS.el.paymentNotes?.value || '',
                tenant_id: POS.state.currentUser?.tenant_id,
                created_by: POS.state.currentUser?.id
            };

            // إضافة معرف الفاتورة الأصلية إذا كان تعديلاً
            if (POS.state.editingInv) {
                invoice.original_invoice_id = POS.state.editingInv;
            }

            // حفظ الفاتورة
            let result;
            if (navigator.onLine && POS.state.db) {
                result = POS.state.editingInv && DB.editSaleInvoice
                    ? await DB.editSaleInvoice(invoice)
                    : await DB.createSaleInvoice(invoice);
            } else {
                // حفظ محلي في وضع عدم الاتصال
                if (window.localDB?.ready) {
                    await window.localDB.put('offline_sales', { ...invoice, _offline: true });
                    POS.state._offlineSales.push({ ...invoice, _offline: true });
                    result = { success: true, invoice_number: invoice.invoice_number };
                } else {
                    throw new Error('لا يوجد اتصال ولا قاعدة بيانات محلية');
                }
            }

            if (!result?.success) {
                throw new Error(result?.error || 'فشل حفظ الفاتورة');
            }

            // حذف الفاتورة المعلقة إذا كانت مستأنفة
            if (POS.state.resumedInvoiceId && window.supabaseClient) {
                try {
                    await window.supabaseClient.from('invoices')
                        .delete().eq('id', POS.state.resumedInvoiceId);
                } catch (e) { /* تجاهل */ }
                POS.state.resumedInvoiceId = null;
            }

            // تحديث المخزون المحلي
            POS._updateLocalStock(stockCheck.products);

            // إغلاق نافذة الدفع وعرض الإيصال
            POS._closeModal('paymentModal');
            POS._showReceipt(
                { ...invoice, invoice_number: result.invoice_number || invoice.invoice_number },
                customer || { name: CASH_CUSTOMER_STORED, balance: 0 },
                POS.state.cart,
                { sub, disc, net },
                oldBalance,
                { cash: cashAmount, trans: transferAmount, used: usedBalance, diff: difference }
            );

            // إعادة تعيين السلة
            POS._resetCart();
            POS.state.editingInv = null;
            POS._resetCartRender();
            localStorage.removeItem('payment_draft');

            // تحديث شبكة المنتجات
            POS._renderProductGrid();

            U.playBeep('success');
            U.showToast('تم إتمام البيع بنجاح', 'success');

            // تسجيل النشاط
            POS._logActivity('إتمام بيع', `فاتورة ${result.invoice_number || invoice.invoice_number}`);

        } catch (e) {
            console.error('فشل إتمام الدفع:', e);
            U.showToast(e.message || 'فشل إتمام عملية البيع', 'error');
        } finally {
            POS.state.busy = false;
            if (POS.el.confirmAndPrintBtn) POS.el.confirmAndPrintBtn.disabled = false;
        }
    };

    // ==================== تعليق واستئناف الفواتير ====================

    /**
     * holdInvoice - تعليق الفاتورة الحالية
     * تحفظ السلة كفاتورة معلقة لاستكمالها لاحقاً
     */
    POS.holdInvoice = async function() {
        if (!POS.state.cart.length) {
            U.showToast('السلة فارغة، لا يوجد ما يمكن تعليقه', 'warning');
            return;
        }

        const { sub, disc, net } = POS._calcTotals();

        const invoice = {
            id: U.uuid(),
            invoice_number: POS.state.db ? await DB.generateInvoiceNumber() : POS._localInvNum(),
            type: 'sale',
            date: U.today(),
            customer_id: POS.state.selectedCustomerId || null,
            customer_name: POS._getCust()?.name || CASH_CUSTOMER_STORED,
            items: POS.state.cart.map(item => ({ ...item })),
            subtotal: sub,
            discount: disc,
            total: net,
            paid: 0,
            remaining: net,
            status: 'held',
            notes: 'معلقة',
            tenant_id: POS.state.currentUser?.tenant_id,
            created_by: POS.state.currentUser?.id
        };

        try {
            if (POS.state.db) {
                await DB.saveInvoice(invoice);
            } else if (U.localReady()) {
                await localDB.put('invoices', invoice);
            }
            U.showToast(`تم تعليق الفاتورة ${invoice.invoice_number}`, 'success');
            POS._resetCart();
        } catch (e) {
            console.error('فشل تعليق الفاتورة:', e);
            U.showToast('فشل تعليق الفاتورة', 'error');
        }
    };

    /**
     * loadHeld - تحميل وعرض الفواتير المعلقة
     */
    POS.loadHeld = async function() {
        let invoices = [];
        try {
            if (POS.state.db && DB.getHeldInvoices) {
                invoices = await DB.getHeldInvoices() || [];
            } else if (POS.state.db) {
                const allInvoices = await DB.getInvoices() || [];
                invoices = allInvoices.filter(i => i.type === 'sale' && i.status === 'held');
            } else if (U.localReady()) {
                const allInvoices = await localDB.getAll('invoices') || [];
                invoices = allInvoices.filter(i => i.type === 'sale' && i.status === 'held');
            }
        } catch (e) {
            console.error('فشل تحميل الفواتير المعلقة:', e);
        }

        const container = POS.el.heldInvoicesList;
        if (!container) return;

        if (!invoices.length) {
            container.innerHTML = '<p style="text-align:center;padding:20px;color:var(--text-muted);">لا توجد فواتير معلقة</p>';
        } else {
            container.innerHTML = invoices.map(inv => `
                <div class="held-invoice-item" data-id="${inv.id}"
                     style="padding:15px;border:1px solid ${U.cssVar('--border-light')};border-radius:12px;margin-bottom:10px;cursor:pointer;display:flex;justify-content:space-between;">
                    <div>
                        <strong>${U.escape(inv.invoice_number || inv.id?.substring(0, 8))}</strong><br>
                        ${U.escape(inv.customer_name || CASH_CUSTOMER_STORED)} - ${U.fmtMoney(inv.total)}<br>
                        <small style="color:var(--text-muted);">${U.fmtDate(inv.date)}</small>
                    </div>
                    <div><i class="fas fa-play"></i></div>
                </div>
            `).join('');

            // ربط النقر لاستئناف الفاتورة
            container.querySelectorAll('.held-invoice-item').forEach(el => {
                el.addEventListener('click', () => POS._resumeInvoice(el.dataset.id));
            });
        }

        POS._showModal('heldInvoicesModal');
    };

    /**
     * _resumeInvoice - استئناف فاتورة معلقة
     * @param {string} id - معرف الفاتورة
     */
    POS._resumeInvoice = async function(id) {
        let invoice;
        try {
            if (POS.state.db) {
                invoice = await DB.getInvoiceById(id);
            } else if (U.localReady()) {
                invoice = await localDB.getById('invoices', id);
            }
        } catch (e) {
            console.error('فشل تحميل الفاتورة:', e);
        }

        if (!invoice) {
            U.showToast('الفاتورة غير موجودة', 'error');
            return;
        }

        POS.state.resumedInvoiceId = id;

        try {
            if (POS.state.db && window.supabaseClient) {
                await window.supabaseClient.from('invoices')
                    .update({ status: 'resumed' }).eq('id', id);
            } else if (U.localReady()) {
                await localDB.put('invoices', { ...invoice, status: 'resumed' });
            }
        } catch (e) { /* تجاهل */ }

        const validItems = [];
        const missingItems = [];

        for (const item of (invoice.items || [])) {
            const product = POS._getProductById(item.productId);
            if (product) {
                validItems.push(item);
            } else {
                missingItems.push(item.productName || item.productId);
            }
        }

        POS.state.cart = validItems.map(item => ({ ...item }));
        POS.state.selectedCustomerId = invoice.customer_id || null;

        if (invoice.customer_id) {
            const customer = POS._getCustomerById(invoice.customer_id);
            if (customer) {
                POS.el.customerSearchInput.value = customer.name || '';
                POS._updateCustDisplay();
            }
        } else {
            POS.el.customerSearchInput.value = CASH_CUSTOMER_LABEL;
            POS._updateCustDisplay();
        }

        POS._renderCart();
        POS._closeModal('heldInvoicesModal');

        if (missingItems.length) {
            U.showToast(`تحذير: بعض الأصناف غير متوفرة: ${missingItems.join('، ')}`, 'warning');
        }

        U.showToast('تم استئناف الفاتورة', 'success');
    };

    // ==================== الإيصال ====================

    /**
     * _showReceipt - عرض نافذة الإيصال بعد إتمام البيع
     * @param {object} inv - بيانات الفاتورة
     * @param {object} cust - بيانات العميل
     * @param {Array} items - عناصر السلة
     * @param {object} totals - الإجماليات
     * @param {number} oldBal - الرصيد القديم
     * @param {object} pay - تفاصيل الدفع
     */
    POS._showReceipt = function(inv, cust, items, totals, oldBal, pay) {
        const settings = JSON.parse(localStorage.getItem('app_settings') || '{}');
        const companyName = settings?.company?.name || 'حسابي';
        const companyPhone = settings?.company?.phone || '';
        const footerMsg = settings?.print?.footer_message || 'شكراً لتعاملكم معنا';

        const fmt = (v) => Number(v || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

        const usedBalance = pay.used || 0;
        const difference = pay.diff || 0;
        const newBalance = (oldBal || 0) - usedBalance + difference;

        // بناء صفوف الأصناف
        let itemsHtml = '';
        for (const item of items) {
            const lineTotal = U.round(item.price * item.quantity, 2);
            itemsHtml += `
                <tr>
                    <td>${U.escape(item.productName)} - ${U.escape(item.unitName)}${item.note ? ` (${U.escape(item.note)})` : ''}</td>
                    <td style="text-align:center;">${item.quantity}</td>
                    <td style="text-align:center;">${fmt(item.price)}</td>
                    <td style="text-align:left;">${fmt(lineTotal)}</td>
                </tr>`;
        }

        const receiptHtml = `
        <div style="font-family:'Cairo',sans-serif;font-size:13px;line-height:1.5;direction:rtl;padding:10px;width:80mm;max-width:100%;margin:0 auto;background:white;">
            <div style="text-align:center;font-weight:bold;font-size:16px;">${U.escape(companyName)}</div>
            ${companyPhone ? `<div style="text-align:center;font-size:12px;">هاتف: ${U.escape(companyPhone)}</div>` : ''}
            <hr>
            <div style="display:flex;justify-content:space-between;">
                <span>العميل:</span><strong>${U.escape(cust?.name || 'نقدي')}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span>الفاتورة:</span><strong>${U.escape(inv.invoice_number || inv.id?.substring(0, 8))}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span>التاريخ:</span>${U.fmtDate(inv.date)}
            </div>
            <hr>
            <table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead>
                    <tr>
                        <th>الصنف</th>
                        <th style="text-align:center;">الكمية</th>
                        <th style="text-align:center;">السعر</th>
                        <th style="text-align:left;">الإجمالي</th>
                    </tr>
                </thead>
                <tbody>${itemsHtml}</tbody>
            </table>
            <hr>
            <div style="display:flex;justify-content:space-between;font-weight:bold;">
                <span>الإجمالي:</span>${fmt(totals.sub)}
            </div>
            ${totals.disc > 0 ? `
            <div style="display:flex;justify-content:space-between;">
                <span>الخصم:</span>${fmt(totals.disc)}
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;">
                <span>الصافي:</span>${fmt(totals.net)}
            </div>
            <hr>
            <div style="display:flex;justify-content:space-between;">
                <span>نقدي:</span>${fmt(pay.cash || 0)}
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span>تحويل:</span>${fmt(pay.trans || 0)}
            </div>
            ${usedBalance > 0 ? `
            <div style="display:flex;justify-content:space-between;">
                <span>من الرصيد:</span>${fmt(usedBalance)}
            </div>` : ''}
            <div style="display:flex;justify-content:space-between;font-weight:bold;">
                <span>المدفوع:</span>${fmt(U.round((pay.cash || 0) + (pay.trans || 0) + usedBalance, 2))}
            </div>
            ${difference > 0 ? `
            <div style="color:green;display:flex;justify-content:space-between;">
                <span>فائض:</span>${fmt(difference)}
            </div>` : ''}
            ${difference < 0 ? `
            <div style="color:red;display:flex;justify-content:space-between;">
                <span>متبقي:</span>${fmt(-difference)}
            </div>` : ''}
            <hr>
            <div style="text-align:center;font-size:11px;">${U.escape(footerMsg)}</div>
        </div>`;

        POS.el.receiptPrintArea.innerHTML = receiptHtml;
        POS._showModal('receiptModal');
    };

    /**
     * _canChangePrice - التحقق من صلاحية تغيير السعر
     * @returns {boolean}
     */
    POS._canChangePrice = function() {
        return POS.state.currentUser?.role === 'admin';
    };

    /**
     * _confirmAction - عرض نافذة تأكيد للمستخدم
     * @param {string} message - رسالة التأكيد
     * @returns {Promise<boolean>}
     */
    POS._confirmAction = async function(message) {
        if (window.ModalConfirm && typeof ModalConfirm.show === 'function') {
            return await ModalConfirm.show({
                title: 'تأكيد',
                message: message,
                icon: 'warn',
                confirmText: 'نعم',
                cancelText: 'لا'
            });
        }
        return confirm(message);
    };

})();
