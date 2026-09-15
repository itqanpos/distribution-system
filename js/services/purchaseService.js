/* =============================================
   purchaseService.js - Facade فوق DB لفواتير الشراء
   Version: 2.0.0

   المسؤوليات:
   - التحقق المحلي قبل الشبكة (fail-fast).
   - تطبيع حقول الشراء (حساب remaining من total - paid).
   - فرض النوع = 'purchase'.
   - ترجمة أكواد أخطاء RPC إلى رسائل عربية.

   ملاحظة معمارية:
   - لا يوجد جدول `purchases` منفصل — الشراء نوع من invoices.
   - voidPurchase يُفوَّض إلى DB.voidInvoice (نفس RPC الذرّي).
   ============================================= */
(function() {
    'use strict';

    const ERROR_MESSAGES = {
        'P0001': 'السجل غير موجود',
        'P0002': 'المخزون غير كافٍ',
        'P0003': 'هذه العملية تتطلب صلاحيات مدير',
        'P0004': 'بيانات غير صالحة',
        'P0005': 'عنصر غير صالح في الفاتورة',
        'P0006': 'عدم تطابق في الحسابات المالية',
        'NO_TENANT': 'لا يوجد مستأجر مرتبط بالحساب',
        '42501': 'ليس لديك صلاحية لهذه العملية',
        '23505': 'الفاتورة مسجلة مسبقاً',
        '23514': 'قيمة خارج النطاق المسموح',
        '23503': 'مرجع غير موجود'
    };

    function translateError(err) {
        const code = err?.code || '';
        if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
        console.error('[PurchaseService] Unmapped error:', err);
        return err?.message || 'فشل العملية';
    }

    function ensureDB() {
        if (!window.DB) {
            const e = new Error('System not ready');
            e.code = 'NO_DB';
            throw e;
        }
    }

    const PurchaseService = {
        /* ============================================
           التحقق المحلي
           ============================================ */
        _validate(purchaseData) {
            if (!purchaseData) throw new Error('بيانات فاتورة الشراء مفقودة');
            if (!Array.isArray(purchaseData.items) || !purchaseData.items.length) {
                throw new Error('فاتورة الشراء لا تحتوي على عناصر');
            }
            for (const item of purchaseData.items) {
                const pid = item.productId || item.product_id;
                const qty = Number(item.quantity);
                const price = Number(item.price);
                if (!pid) throw new Error('عنصر بدون معرّف منتج');
                if (!Number.isFinite(qty) || qty <= 0) {
                    throw new Error('الكمية يجب أن تكون أكبر من صفر');
                }
                if (!Number.isFinite(price) || price < 0) {
                    throw new Error('السعر لا يمكن أن يكون سالباً');
                }
            }

            const total = Number(purchaseData.total);
            const paid = Number(purchaseData.paid) || 0;
            const remaining = Math.max(0, total - paid);

            if (remaining > 0 && !purchaseData.supplier_id) {
                throw new Error('اختر مورداً لتسجيل الدين');
            }
            if (!Number.isFinite(total) || total < 0) {
                throw new Error('إجمالي الفاتورة غير صالح');
            }
            if (paid > total) {
                throw new Error('المدفوع يتجاوز إجمالي الفاتورة');
            }
        },

        /* ============================================
           تطبيع حقول الإدخال
           لا وجود لـ used_balance أو change في الشراء
           ============================================ */
        _normalize(purchaseData) {
            const total = Number(purchaseData.total) || 0;
            const paid = Number(purchaseData.paid) || 0;

            return {
                ...purchaseData,
                type: 'purchase',
                cash_paid: Number(purchaseData.cash_paid) || 0,
                transfer_paid: Number(purchaseData.transfer_paid) || 0,
                card_paid: Number(purchaseData.card_paid) || 0,
                used_balance: 0,
                paid,
                remaining: Math.max(0, total - paid),
                change_amount: 0,
                discount: Number(purchaseData.discount) || 0,
                subtotal: Number(purchaseData.subtotal) || 0,
                total
            };
        },

        /* ============================================
           إنشاء فاتورة شراء
           ============================================ */
        async createPurchaseInvoice(purchaseData) {
            ensureDB();
            this._validate(purchaseData);
            const payload = this._normalize(purchaseData);
            try {
                return await window.DB.createPurchaseInvoice(payload);
            } catch (error) {
                throw new Error(translateError(error));
            }
        },

        /* ============================================
           قراءة
           ============================================ */
        async getPurchases(force = false) {
            ensureDB();
            return window.DB.getPurchases(force);
        },

        async getPurchasesLight(force = false) {
            ensureDB();
            return window.DB.getPurchasesLight(force);
        },

        async getPurchaseById(id) {
            ensureDB();
            if (!id) throw new Error('معرّف فاتورة الشراء مطلوب');
            return window.DB.getPurchaseById(id);
        },

        /* ============================================
           إلغاء فاتورة شراء — يُفوَّض إلى DB.voidInvoice
           ============================================ */
        async voidPurchase(id) {
            ensureDB();
            if (!id) throw new Error('معرّف فاتورة الشراء مطلوب');
            try {
                return await window.DB.voidInvoice(id);
            } catch (error) {
                throw new Error(translateError(error));
            }
        }
    };

    window.PurchaseService = PurchaseService;
})();
