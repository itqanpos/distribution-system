const InvoiceService = {
  async createSaleInvoice(invoiceData) {
    if (!invoiceData) throw new Error('بيانات الفاتورة مفقودة');
    if (!invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
      throw new Error('الفاتورة لا تحتوي على أي عناصر');
    }

    for (const item of invoiceData.items) {
      if (!item.productId) throw new Error(`معرّف المنتج مفقود: ${item.productName || 'غير معروف'}`);
      if (!item.quantity || item.quantity <= 0) throw new Error(`الكمية غير صالحة للمنتج: ${item.productName || item.productId}`);
      if (item.price === undefined || item.price === null || item.price < 0) throw new Error(`السعر غير صالح للمنتج: ${item.productName || item.productId}`);
    }

    if (invoiceData.total === undefined || invoiceData.total < 0) {
      throw new Error('إجمالي الفاتورة غير صالح');
    }

    const payload = {
      ...invoiceData,
      cash_paid: invoiceData.cash_paid || 0,
      transfer_paid: invoiceData.transfer_paid || 0,
      used_customer_balance: invoiceData.used_customer_balance || 0
    };

    // إذا كنا نعدل فاتورة، نمرر original_invoice_id
    if (invoiceData.original_invoice_id) {
      payload.original_invoice_id = invoiceData.original_invoice_id;
    }

    try {
      const result = await window.DB.createSaleInvoice(payload);
      return result;
    } catch (error) {
      console.error('❌ InvoiceService.createSaleInvoice فشل:', error);
      throw error;
    }
  },

  async getInvoices(filters = {}) {
    return await window.DB.getInvoices();
  },

  async getInvoicesLight() {
    return await window.DB.getInvoicesLight();
  },

  async getInvoiceById(id) {
    return await window.DB.getInvoiceById(id);
  },

  async voidInvoice(id) {
    const user = await window.App.getCurrentUser();
    const tenantId = user?.tenant_id;
    if (!tenantId) throw new Error('لا يوجد مستأجر');
    const { error } = await window.supabase
      .from('invoices')
      .update({ status: 'voided' })
      .eq('id', id)
      .eq('tenant_id', tenantId);
    if (error) throw error;
    if (window.localDB?.ready) {
      await window.localDB.delete('invoices', id).catch(() => {});
    }
  }
};

window.InvoiceService = InvoiceService;
