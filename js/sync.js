/* =============================================
   sync.js - نظام المزامنة (نهائي 100%)
   ============================================= */
const SyncManager = {
    isSyncing: false,
    
    init() {
        window.addEventListener('online', () => {
            console.log('🌐 اتصال بالإنترنت – بدء المزامنة...');
            this.syncAll();
        });
        window.addEventListener('offline', () => {
            console.log('📡 وضع غير متصل – ستُحفظ البيانات محلياً');
        });
        // محاولة مزامنة أي شيء متبقي عند التحميل
        if (navigator.onLine) {
            setTimeout(() => this.syncAll(), 2000);
        }
        console.log('✅ نظام المزامنة جاهز');
    },
    
    async syncAll() {
        if (this.isSyncing) return;
        if (!window.localDB) {
            console.warn('localDB غير معرف، تخطي المزامنة');
            return;
        }
        
        this.isSyncing = true;
        
        try {
            await window.localDB._ensureReady();
            const queue = await window.localDB.getSyncQueue();
            
            if (!queue || !queue.length) {
                console.log('📭 طابور المزامنة فارغ');
                this.isSyncing = false;
                return;
            }
            
            console.log(`🔄 جاري مزامنة ${queue.length} عملية...`);
            
            let success = 0, failed = 0;
            
            for (const action of queue) {
                try {
                    await this._processAction(action);
                    success++;
                } catch (error) {
                    console.error(`فشلت العملية ${action.id}:`, error);
                    failed++;
                }
            }
            
            // حذف العمليات الناجحة فقط
            if (success > 0) {
                const all = await window.localDB.getSyncQueue();
                const remaining = all.filter(item => {
                    return queue.find(q => q.id === item.id && !item._processed);
                });
                await window.localDB.clearSyncQueue();
                for (const item of remaining) {
                    await window.localDB.put('sync_queue', item);
                }
            }
            
            console.log(`✅ مزامنة: ${success} نجحت, ${failed} فشلت`);
            
            if (success > 0) {
                window.dispatchEvent(new CustomEvent('sync-complete'));
            }
            
        } catch (error) {
            console.error('❌ فشل المزامنة:', error);
        } finally {
            this.isSyncing = false;
        }
    },
    
    async _processAction(action) {
        if (!window.DB) throw new Error('DB غير متوفر');
        
        const { type, table, data } = action;
        
        if (type === 'INSERT' || type === 'UPDATE') {
            switch (table) {
                case 'products': return await DB.saveProduct(data);
                case 'parties': return await DB.saveParty(data);
                case 'invoices': return await DB.saveInvoice(data);
                case 'purchases': return await DB.savePurchase(data);
                case 'transactions': return await DB.saveTransaction(data);
                case 'settings': return await DB.saveSettings(data);
                case 'returns': return await DB.saveReturn(data);
            }
        } else if (type === 'DELETE') {
            switch (table) {
                case 'products': return await DB.deleteProduct(data.id);
                case 'parties': return await DB.deleteParty(data.id);
            }
        }
        throw new Error(`عملية غير معروفة: ${type} على ${table}`);
    }
};

// التهيئة التلقائية
window.syncManager = SyncManager;
window.addEventListener('DOMContentLoaded', () => {
    if (window.localDB) {
        SyncManager.init();
    } else {
        // انتظار تحميل localDB ثم التهيئة
        const check = setInterval(() => {
            if (window.localDB) {
                clearInterval(check);
                SyncManager.init();
            }
        }, 100);
    }
});
