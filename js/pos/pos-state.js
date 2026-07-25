/* =============================================
   pos-state.js - إدارة حالة النظام
   الوظيفة: دوال إدارة السلة والعملاء والخصومات،
   حفظ واستعادة السلة ومسودة الدفع، توليد أرقام
   الفواتير المحلية، تسجيل النشاط.
   ============================================= */
'use strict';

(function() {
    const POS = window.POS;

    /**
     * _resetCart - تفريغ السلة وإعادة تعيين جميع القيم المرتبطة
     * تُستدعى بعد إتمام البيع أو تعليق الفاتورة
     */
    POS._resetCart = function() {
        POS.state.cart = [];
        POS.state.selectedCustomerId = null;
        POS.state.discountValue = 0;
        POS.state.discountType = 'amount';
        POS.state.usedBalance = 0;
        POS.state.editingInv = null;
        POS.state.resumedInvoiceId = null;

        // إعادة تعيين حقول الإدخال في الواجهة
        if (POS.el.discountValue) POS.el.discountValue.value = 0;
        if (POS.el.discountType) POS.el.discountType.value = 'amount';
        if (POS.el.customerSearchInput) {
            POS.el.customerSearchInput.value = '';
            POS._updateCustDisplay();
        }
        if (POS.el.profitDisplay) POS.el.profitDisplay.style.display = 'none';

        POS._renderCart();
        POS._resetCartRender();
        localStorage.removeItem('pos_cart');
    };

    /**
     * _getCust - جلب كائن العميل المحدد حالياً من الكاش
     * @returns {object|null} كائن العميل أو null
     */
    POS._getCust = function() {
        if (!POS.state.selectedCustomerId) return null;
        return POS.cache.custs.get(POS.state.selectedCustomerId);
    };

    /**
     * _calcTotals - حساب المجموع الفرعي والخصم والصافي
     * تُستخدم في كل مرة تتغير فيها السلة أو الخصم
     * @returns {{sub: number, disc: number, net: number}}
     */
    POS._calcTotals = function() {
        let sub = 0;
        for (const item of POS.state.cart) {
            sub += U.round(item.price * item.quantity, 2);
        }
        sub = U.round(sub, 2);

        let disc = 0;
        if (POS.state.discountType === 'amount') {
            disc = Math.min(POS.state.discountValue, sub);
        } else {
            disc = U.round(sub * POS.state.discountValue / 100, 2);
        }

        const net = U.round(sub - disc, 2);

        // تحديث الحالة
        POS.state.subtotal = sub;
        POS.state.discount = disc;
        POS.state.net = net;

        return { sub, disc, net };
    };

    /**
     * _updateTotals - تحديث عرض الإجماليات في الواجهة
     * تُستدعى بعد _calcTotals أو عند تغيير السلة
     */
    POS._updateTotals = function() {
        const { sub, net } = POS._calcTotals();

        if (POS.el.subtotal) POS.el.subtotal.textContent = U.fmtMoney(sub);
        if (POS.el.netTotal) POS.el.netTotal.textContent = U.fmtMoney(net);

        // عدد الأصناف الفريدة
        if (POS.el.itemTypesCount) POS.el.itemTypesCount.textContent = POS.state.cart.length;

        // إجمالي القطع (مع مراعاة عامل التحويل)
        let pcs = 0;
        for (const item of POS.state.cart) {
            pcs += item.quantity * (item.factor || 1);
        }
        if (POS.el.totalPieces) POS.el.totalPieces.textContent = Math.round(pcs);

        // عرض الربح المتوقع (للمسؤول فقط)
        if (POS.el.profitDisplay) {
            if (POS.state.currentUser?.role === 'admin' && POS.state.cart.length > 0) {
                let totalCost = 0;
                for (const item of POS.state.cart) {
                    totalCost += (item.cost || 0) * item.quantity;
                }
                const profit = sub - totalCost;
                POS.el.profitDisplay.style.display = 'block';
                POS.el.profitDisplay.textContent = `الربح المتوقع: ${U.fmtMoney(profit)}`;
            } else {
                POS.el.profitDisplay.style.display = 'none';
            }
        }
    };

    /**
     * _saveCart - حفظ حالة السلة الحالية في localStorage
     * تُستدعى عند كل تغيير في السلة أو العميل أو الخصم
     */
    POS._saveCart = function() {
        const state = {
            cart: POS.state.cart,
            cust: POS.state.selectedCustomerId,
            discType: POS.state.discountType,
            discVal: POS.state.discountValue,
            editingInv: POS.state.editingInv,
            usedBalance: POS.state.usedBalance,
            resumedInvoiceId: POS.state.resumedInvoiceId,
            ts: Date.now()
        };

        if (POS.state.cart.length || state.editingInv) {
            localStorage.setItem('pos_cart', JSON.stringify(state));
        } else {
            localStorage.removeItem('pos_cart');
        }
    };

    /**
     * _restoreCart - استعادة السلة المحفوظة (إن وجدت ولم تنته صلاحيتها)
     * تُستدعى عند تحميل الصفحة
     */
    POS._restoreCart = function() {
        const s = localStorage.getItem('pos_cart');
        if (!s) return;

        try {
            const d = JSON.parse(s);

            // صلاحية السلة: ساعتان
            if (d.ts && Date.now() - d.ts > 2 * 3600000) {
                localStorage.removeItem('pos_cart');
                return;
            }

            POS.state.cart = d.cart || [];
            POS.state.selectedCustomerId = d.cust || null;
            POS.state.discountType = d.discType || 'amount';
            POS.state.discountValue = d.discVal || 0;
            POS.state.editingInv = d.editingInv || null;
            POS.state.usedBalance = d.usedBalance || 0;
            POS.state.resumedInvoiceId = d.resumedInvoiceId || null;

            POS._renderCart();

            // استعادة اسم العميل في حقل البحث
            if (d.cust) {
                const c = POS.cache.custs.get(String(d.cust));
                if (c) {
                    POS.el.customerSearchInput.value = c.name || '';
                    POS._updateCustDisplay();
                }
            }
        } catch (e) {
            localStorage.removeItem('pos_cart');
        }
    };

    /**
     * _savePaymentDraft - حفظ مسودة الدفع (تشمل تفاصيل نافذة الدفع)
     * تُستدعى عند إخفاء الصفحة أو قبل مغادرتها
     */
    POS._savePaymentDraft = function() {
        if (!POS.state.cart.length) return;

        const draft = {
            cart: POS.state.cart,
            customerId: POS.state.selectedCustomerId,
            discountValue: POS.state.discountValue,
            discountType: POS.state.discountType,
            usedBalance: POS.state.usedBalance,
            editingInv: POS.state.editingInv,
            resumedInvoiceId: POS.state.resumedInvoiceId,
            paymentMethod: POS.el.paymentMethod?.value,
            paymentNotes: POS.el.paymentNotes?.value,
            cashAmount: POS.el.cashAmount?.value,
            transferAmount: POS.el.transferAmount?.value,
            modalOpen: POS.el.paymentModal?.classList.contains('open')
        };

        localStorage.setItem('payment_draft', JSON.stringify(draft));
    };

    /**
     * _restorePaymentDraft - استعادة مسودة الدفع وعرضها للمستخدم
     * تُستدعى عند تحميل الصفحة، تسأل المستخدم إذا كان يريد الاستئناف
     */
    POS._restorePaymentDraft = function() {
        const raw = localStorage.getItem('payment_draft');
        if (!raw) return;

        try {
            const d = JSON.parse(raw);
            if (d.cart?.length && confirm('توجد فاتورة غير مكتملة. هل تريد استئنافها؟')) {
                setTimeout(async () => {
                    if (!POS.state.products.length) await POS._loadData();

                    POS.state.cart = d.cart;
                    POS.state.selectedCustomerId = d.customerId;
                    POS.state.discountValue = d.discountValue || 0;
                    POS.state.discountType = d.discountType || 'amount';
                    POS.state.usedBalance = d.usedBalance || 0;
                    POS.state.editingInv = d.editingInv;
                    POS.state.resumedInvoiceId = d.resumedInvoiceId;

                    POS._renderCart();

                    if (d.customerId) {
                        const c = POS.cache.custs.get(String(d.customerId));
                        if (c) {
                            POS.el.customerSearchInput.value = c.name || '';
                            POS._updateCustDisplay();
                        }
                    }

                    // إعادة فتح نافذة الدفع إذا كانت مفتوحة سابقاً
                    if (d.modalOpen) {
                        setTimeout(() => {
                            POS._openPayment();
                            if (d.paymentMethod) POS.el.paymentMethod.value = d.paymentMethod;
                            if (d.paymentNotes) POS.el.paymentNotes.value = d.paymentNotes;
                            if (d.cashAmount) POS.el.cashAmount.value = d.cashAmount;
                            if (d.transferAmount) POS.el.transferAmount.value = d.transferAmount;
                            POS._togglePaymentFields();
                            POS._previewPayment();
                        }, 500);
                    }
                }, 100);
            } else {
                localStorage.removeItem('payment_draft');
            }
        } catch (e) {
            localStorage.removeItem('payment_draft');
        }
    };

    /**
     * _localInvNum - توليد رقم فاتورة محلي (عند عدم الاتصال بالخادم)
     * الصيغة: السنة-رقم تسلسلي (مثال: 24-0001)
     * @returns {string} رقم الفاتورة
     */
    POS._localInvNum = function() {
        const y = new Date().getFullYear().toString().slice(-2);
        const k = `inv_counter_${y}`;
        let n = (parseInt(localStorage.getItem(k) || '0', 10) + 1);
        localStorage.setItem(k, String(n));
        return y + '-' + String(n).padStart(4, '0');
    };

    /**
     * _logActivity - تسجيل نشاط في سجل النشاطات
     * @param {string} action - الإجراء (مثل 'حذف صنف')
     * @param {string} details - التفاصيل
     */
    POS._logActivity = function(action, details) {
        POS.state._activityLog.push({
            action: action,
            details: details,
            user: POS.state.currentUser?.fullName || 'مستخدم',
            time: new Date().toISOString()
        });
    };

})();
