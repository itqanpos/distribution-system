/* =============================================
   invoiceService.js - Facade فوق DB للفواتير (sale/return_sale)
   Version: 2.0.0

   المسؤوليات:
   - التحقق المحلي قبل الشبكة (fail-fast).
   - تطبيع أسماء الحقول (used_customer_balance → used_balance).
   - فرض النوع = 'sale'.
   - ترجمة أكواد أخطاء RPC إلى رسائل عربية.

   لا يستخدم:
   - window.App (غير موجود).
   - window.supabase (العميل مُغلَّق داخل db.js).
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
        console.error('[InvoiceService] Unmapped error:', err);
        return err?.message || 'فشل العملية';
    }

    function ensureDB() {
        if (!window.DB) {
            const e = new Error('System not ready');
            e.code = 'NO_DB';
            throw e;
        }
    }

    const InvoiceService = {
        /* ============================================
           التحقق المحلي
           ============================================ */
        _validate(invoiceData) {
            if (!invoiceData) throw new Error('بيانات الفاتورة مفقودة');
            if (!Array.isArray(invoiceData.items) || !invoiceData.items.length) {
                throw new Error('الفاتورة لا تحتوي على عناصر');
            }
            for (const item of invoiceData.items) {
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

            const total = Number(invoiceData.total);
            const remaining = Number(invoiceData.remaining) || 0;
            if (remaining > 0 && !invoiceData.customer_id) {
                throw new Error('اختر عميلاً لتسجيل الدين');
            }
            if (!Number.isFinite(total) || total < 0) {
                throw new Error('إجمالي الفاتورة غير صالح');
            }
        },

        /* ============================================
           تطبيع حقول الإدخال
           ============================================ */
        _normalize(invoiceData) {
            const usedBalance = Number(
                invoiceData.used_balance ?? invoiceData.used_customer_balance
            ) || 0;

            return {
                ...invoiceData,
                type: 'sale',
                cash_paid: Number(invoiceData.cash_paid) || 0,
                transfer_paid: Number(invoiceData.transfer_paid) || 0,
                card_paid: Number(invoiceData.card_paid) || 0,
                used_balance: usedBalance,
                paid: Number(invoiceData.paid) || 0,
                remaining: Number(invoiceData.remaining) || 0,
                change_amount: Number(invoiceData.change_amount) || 0,
                discount: Number(invoiceData.discount) || 0,
                subtotal: Number(invoiceData.subtotal) || 0,
                total: Number(invoiceData.total) || 0
            };
        },

        /* ============================================
           إنشاء فاتورة بيع
           ============================================ */
        async createSaleInvoice(invoiceData) {
            ensureDB();
            this._validate(invoiceData);
            const payload = this._normalize(invoiceData);
            try {
                return await window.DB.createSaleInvoice(payload);
            } catch (error) {
                throw new Error(translateError(error));
            }
        },

        /* ============================================
           قراءة
           ============================================ */
        async getInvoices(force = false) {
            ensureDB();
            return window.DB.getInvoices(force);
        },

        async getInvoicesLight(force = false) {
            ensureDB();
            return window.DB.getInvoicesLight(force);
        },

        async getInvoiceById(id) {
            ensureDB();
            if (!id) throw new Error('معرّف الفاتورة مطلوب');
            return window.DB.getInvoiceById(id);
        },

        /* ============================================
           إلغاء فاتورة
           ============================================ */
        async voidInvoice(id) {
            ensureDB();
            if (!id) throw new Error('معرّف الفاتورة مطلوب');
            try {
                return await window.DB.voidInvoice(id);
            } catch (error) {
                throw new Error(translateError(error));
            }
        }
    };

    window.InvoiceService = InvoiceService;
})();
