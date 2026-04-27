// js/sync.js - نظام المزامنة التلقائية
class SyncManager {
  constructor() {
    this.syncInProgress = false;
    this.listenToNetworkChanges();
  }

  listenToNetworkChanges() {
    window.addEventListener('online', () => {
      console.log('🌐 تم استعادة الاتصال بالإنترنت. بدء المزامنة...');
      this.syncAll();
    });
    
    window.addEventListener('offline', () => {
      console.log('🔴 تم فقدان الاتصال. سيتم تخزين البيانات محلياً.');
    });
  }

  isOnline() {
    return navigator.onLine;
  }

  async syncAll() {
    if (this.syncInProgress) return;
    this.syncInProgress = true;
    
    try {
      const queue = await window.localDB.getSyncQueue();
      if (!queue.length) {
        console.log('لا توجد عمليات معلقة للمزامنة');
        this.syncInProgress = false;
        return;
      }
      
      console.log(`جاري مزامنة ${queue.length} عمليات...`);
      
      for (const action of queue) {
        await this.processAction(action);
      }
      
      await window.localDB.clearSyncQueue();
      console.log('✅ تمت المزامنة بنجاح');
      
      // إشعار الصفحات بالتحديث
      this.notifyPages();
    } catch (error) {
      console.error('فشل المزامنة:', error);
    } finally {
      this.syncInProgress = false;
    }
  }

  async processAction(action) {
    if (!window.DB) return;
    
    const { type, table, data } = action;
    
    try {
      switch (type) {
        case 'INSERT':
        case 'UPDATE':
          if (table === 'products') await DB.saveProduct(data);
          else if (table === 'parties') await DB.saveParty(data);
          else if (table === 'invoices') await DB.saveInvoice(data);
          else if (table === 'purchases') await DB.savePurchase(data);
          else if (table === 'transactions') await DB.saveTransaction(data);
          break;
        case 'DELETE':
          if (table === 'products') await DB.deleteProduct(data.id);
          else if (table === 'parties') await DB.deleteParty(data.id);
          break;
      }
    } catch (err) {
      console.error(`فشل تنفيذ ${type} على ${table}:`, err);
    }
  }

  notifyPages() {
    // إرسال حدث مخصص لتحديث الصفحات المفتوحة
    window.dispatchEvent(new CustomEvent('dataSynced'));
  }
}

// تهيئة نظام المزامنة
window.syncManager = new SyncManager();
