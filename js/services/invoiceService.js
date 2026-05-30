const InvoiceService = {
  async createSaleInvoice(invoiceData) {
    if (!invoiceData) throw new Error('بيانات الفاتورة مفقودة');
    if (!invoiceData.items || !invoiceData.items.length) throw new Error('الفاتورة لا تحتوي على عناصر');

    const payload = {
      ...invoiceData,
      cash_paid: invoiceData.cash_paid || 0,
      transfer_paid: invoiceData.transfer_paid || 0,
      used_customer_balance: invoiceData.used_customer_balance || 0
    };

    try {
      const result = await window.DB.createSaleInvoice(payload);
      return result;
    } catch (error) {
      console.error('InvoiceService.createSaleInvoice فشل:', error);
      throw error;
    }
  },

  async getInvoices() { return window.DB.getInvoices(); },
  async getInvoicesLight() { return window.DB.getInvoicesLight(); },
  async getInvoiceById(id) { return window.DB.getInvoiceById(id); },

  async voidInvoice(id) {
    const user = await window.App.getCurrentUser();
    if (!user?.tenant_id) throw new Error('لا يوجد مستأجر');
    const { error } = await window.supabase
      .from('invoices')
      .update({ status: 'voided' })
      .eq('id', id)
      .eq('tenant_id', user.tenant_id);
    if (error) throw error;
  }
};

window.InvoiceService = InvoiceService;
