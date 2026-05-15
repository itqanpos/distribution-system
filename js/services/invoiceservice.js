// js/services/invoiceService.js
// طبقة خدمة وسيطة للفواتير – نظام حسابي v2.1
// تستخدم دالة create_sale_invoice المخزنة على Supabase

const InvoiceService = {
  /**
   * إنشاء فاتورة مبيعات جديدة – باستخدام دالة الخادم
   * @param {Object} invoiceData - بيانات الفاتورة
   * @returns {Promise<Object>} { success, invoice_id, invoice_number, ... }
   */
  async createSaleInvoice(invoiceData) {
    // --- التحقق الأولي ---
    if (!invoiceData || !invoiceData.items || invoiceData.items.length === 0) {
      throw new Error('الفاتورة فارغة');
    }

    // --- تجهيز البيانات للدالة المخزنة ---
    // نرسل cash_paid و transfer_paid كحقول منفصلة لتستخدمها الدالة
    const payload = {
      ...invoiceData,
      // التأكد من أن الحقول المالية موجودة
      cash_paid: invoiceData.cash_paid || 0,
      transfer_paid: invoiceData.transfer_paid || 0,
      used_customer_balance: invoiceData.used_customer_balance || 0
    };

    try {
      // استدعاء دالة Supabase RPC
      const { data, error } = await window.supabase.rpc('create_sale_invoice', {
        p_data: payload
      });

      if (error) {
        console.error('❌ RPC create_sale_invoice error:', error);
        throw new Error(error.message || 'فشل الاتصال بالخادم');
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'فشل إنشاء الفاتورة');
      }

      // مزامنة IndexedDB بعد نجاح العملية (اختياري لكن مستحسن)
      if (window.localDB?.ready) {
        // يمكننا إعادة تحميل المنتجات من السحابة لتحديث المخزون محلياً
        // أو الاعتماد على إعادة التحميل من الصفحة
      }

      return data;
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
    const tenantId = window.App.getCurrentUser()?.tenant_id;
    if (!tenantId) throw new Error('لا يوجد مستأجر');
    const { data, error } = await window.supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', tenantId)
      .single();
    if (error) throw error;
    return data;
  },

  async voidInvoice(id) {
    const tenantId = window.App.getCurrentUser()?.tenant_id;
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
