// js/services/purchaseService.js
// طبقة خدمة وسيطة للمشتريات – نظام حسابي v2.2
// تستخدم DB.createPurchaseInvoice (التي تستدعي دالة الخادم)

const PurchaseService = {
  /**
   * إنشاء فاتورة مشتريات جديدة
   * @param {Object} purchaseData - بيانات الفاتورة كاملة
   * @returns {Promise<Object>} { success, invoice_id, invoice_number, ... }
   */
  async createPurchaseInvoice(purchaseData) {
    // --- التحقق الأولي الإجباري ---
    if (!purchaseData) {
      throw new Error('بيانات فاتورة المشتريات مفقودة');
    }
    if (!purchaseData.items || !Array.isArray(purchaseData.items) || purchaseData.items.length === 0) {
      throw new Error('الفاتورة لا تحتوي على أي عناصر');
    }
    if (!purchaseData.supplier_id) {
      throw new Error('يجب اختيار المورد');
    }

    // التحقق من صحة كل عنصر
    for (const item of purchaseData.items) {
      if (!item.productId) {
        throw new Error(`معرّف المنتج مفقود: ${item.productName || 'غير معروف'}`);
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new Error(`الكمية غير صالحة للمنتج: ${item.productName || item.productId}`);
      }
      if (item.cost === undefined || item.cost < 0) {
        throw new Error(`سعر الشراء غير صالح للمنتج: ${item.productName || item.productId}`);
      }
    }

    // التحقق من القيم المالية
    if (purchaseData.total === undefined || purchaseData.total < 0) {
      throw new Error('إجمالي الفاتورة غير صالح');
    }

    // --- تجهيز البيانات ---
    const payload = {
      ...purchaseData,
      cash_paid: purchaseData.cash_paid || 0,
      transfer_paid: purchaseData.transfer_paid || 0
    };

    try {
      // --- استدعاء دالة النواة (التي تستخدم RPC) ---
      const result = await window.DB.createPurchaseInvoice(payload);
      return result;
    } catch (error) {
      console.error('❌ PurchaseService.createPurchaseInvoice فشل:', error);
      throw error;
    }
  },

  /**
   * جلب قائمة المشتريات (كاملة)
   */
  async getPurchases(filters = {}) {
    return await window.DB.getPurchases();
  },

  /**
   * جلب قائمة المشتريات الخفيفة
   */
  async getPurchasesLight() {
    return await window.DB.getPurchasesLight();
  },

  /**
   * جلب فاتورة شراء واحدة بالمعرّف
   * @param {string} id
   */
  async getPurchaseById(id) {
    return await window.DB.getPurchaseById(id);
  },

  /**
   * إلغاء/إبطال فاتورة شراء
   * @param {string} id
   */
  async voidPurchase(id) {
    const tenantId = window.App.getCurrentUser()?.tenant_id;
    if (!tenantId) throw new Error('لا يوجد مستأجر');
    const { error } = await window.supabase
      .from('purchases')
      .update({ status: 'voided' })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    if (window.localDB?.ready) {
      await window.localDB.delete('purchases', id).catch(() => {});
    }
  }
};

window.PurchaseService = PurchaseService;
