const PurchaseService = {
  async createPurchaseInvoice(purchaseData) {
    if (!purchaseData) throw new Error('بيانات الفاتورة مفقودة');
    if (!purchaseData.items || !purchaseData.items.length) throw new Error('الفاتورة لا تحتوي على عناصر');

    const payload = {
      ...purchaseData,
      cash_paid: purchaseData.cash_paid || 0,
      transfer_paid: purchaseData.transfer_paid || 0
    };

    try {
      const result = await window.DB.createPurchaseInvoice(payload);
      return result;
    } catch (error) {
      console.error('PurchaseService.createPurchaseInvoice فشل:', error);
      throw error;
    }
  },

  async getPurchases() { return window.DB.getPurchases(); },
  async getPurchasesLight() { return window.DB.getPurchasesLight(); },
  async getPurchaseById(id) { return window.DB.getPurchaseById(id); },

  async voidPurchase(id) {
    const user = await window.App.getCurrentUser();
    if (!user?.tenant_id) throw new Error('لا يوجد مستأجر');
    const { error } = await window.supabase
      .from('purchases')
      .update({ status: 'voided' })
      .eq('id', id)
      .eq('tenant_id', user.tenant_id);
    if (error) throw error;
  }
};

window.PurchaseService = PurchaseService;
