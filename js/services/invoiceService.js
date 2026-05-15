// js/services/invoiceService.js
// طبقة خدمة وسيطة للفواتير – نظام حسابي v2.2
// تستخدم DB.createSaleInvoice (التي تستدعي دالة الخادم)
// وتوفر تحققًا إضافيًا وتغليفًا موحدًا

const InvoiceService = {
  /**
   * إنشاء فاتورة مبيعات جديدة
   * @param {Object} invoiceData - بيانات الفاتورة كاملة
   * @returns {Promise<Object>} { success, invoice_id, invoice_number, ... }
   */
  async createSaleInvoice(invoiceData) {
    // --- التحقق الأولي الإجباري ---
    if (!invoiceData) {
      throw new Error('بيانات الفاتورة مفقودة');
    }
    if (!invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
      throw new Error('الفاتورة لا تحتوي على أي عناصر');
    }

    // التحقق من صحة كل عنصر
    for (const item of invoiceData.items) {
      if (!item.productId) {
        throw new Error(`معرّف المنتج مفقود: ${item.productName || 'غير معروف'}`);
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new Error(`الكمية غير صالحة للمنتج: ${item.productName || item.productId}`);
      }
      if (item.price === undefined || item.price === null || item.price < 0) {
        throw new Error(`السعر غير صالح للمنتج: ${item.productName || item.productId}`);
      }
    }

    // التحقق من القيم المالية
    if (invoiceData.total === undefined || invoiceData.total < 0) {
      throw new Error('إجمالي الفاتورة غير صالح');
    }

    // --- تجهيز البيانات الأساسية ---
    const payload = {
      ...invoiceData,
      // ضمان وجود الحقول المالية حتى لو لم تُرسل
      cash_paid: invoiceData.cash_paid || 0,
      transfer_paid: invoiceData.transfer_paid || 0,
      used_customer_balance: invoiceData.used_customer_balance || 0
    };

    try {
      // --- استدعاء دالة النواة (التي تستخدم RPC) ---
      const result = await window.DB.createSaleInvoice(payload);
      return result;
    } catch (error) {
      console.error('❌ InvoiceService.createSaleInvoice فشل:', error);
      throw error;
    }
  },

  /**
   * جلب قائمة الفواتير (كاملة)
   */
  async getInvoices(filters = {}) {
    return await window.DB.getInvoices();
  },

  /**
   * جلب قائمة الفواتير الخفيفة (للقوائم الطويلة)
   */
  async getInvoicesLight() {
    return await window.DB.getInvoicesLight();
  },

  /**
   * جلب فاتورة واحدة بالمعرّف
   * @param {string} id
   */
  async getInvoiceById(id) {
    return await window.DB.getInvoiceById(id);
  },

  /**
   * إلغاء/إبطال فاتورة
   * @param {string} id
   */
  async voidInvoice(id) {
    const tenantId = window.App.getCurrentUser()?.tenant_id;
    if (!tenantId) throw new Error('لا يوجد مستأجر');
    const { error } = await window.supabase
      .from('invoices')
      .update({ status: 'voided' })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    // إزالة من التخزين المحلي
    if (window.localDB?.ready) {
      await window.localDB.delete('invoices', id).catch(() => {});
    }
  }
};

window.InvoiceService = InvoiceService;
